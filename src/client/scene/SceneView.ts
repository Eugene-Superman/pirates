import { Container, Graphics, type Application } from 'pixi.js';
import {
  WEAPON_IDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isAfloat,
  isHostile,
  projectilePosition,
  signedDistanceToPolygon,
  type GameState,
  type Ship,
  type Unit,
  type WeaponId,
} from '../../game';
import type { Selection } from '../input/selection';
import { Camera3D, type CameraConfig, type Vec3 } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { CAMERA_MODES, CameraControl, type CameraMode } from './cameraControl';
import { DamageNumbers } from './effects/DamageNumbers';
import { FogClouds } from './effects/FogClouds';
import { FOG_LAYERS, createFogOfWar, type FogLayer, type FogOfWar, updateFogOfWar } from './effects/fogOfWar';
import { drawRangeRing } from './effects/rangeRings';
import { RepairEffect } from './effects/RepairEffect';
import { ShipFire } from './effects/ShipFire';
import { ShotEffects } from './effects/ShotEffects';
import { Sinking } from './effects/Sinking';
import { NAV_DEBUG, drawHulls, drawRoute, type NavDebug } from './effects/navDebug';
import { drawSelection, drawTargetLock } from './effects/targetLock';
import { drawTargetMarker } from './effects/targetMarker';
import { Trails } from './effects/Trails';
import { Wake } from './effects/Wake';
import { Wrecks } from './effects/Wrecks';
import { SEA_COLOR } from './effects/seaLook';
import { createSeaSurface, type SeaSurface, updateSeaSurface } from './effects/seaSurface';
import { drawChest, drawChestWater } from './models/chest3d';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { portPieces } from './models/port3d';
import { botShipTop, drawBotShip } from './models/botShip3d';
import { drawProjectile, drawProjectileShadow } from './models/projectile3d';
import { SPINE, drawSerpent, drawSerpentWater, type SpinePoint } from './models/serpent3d';
import { ShipSprite } from './models/ShipSprite';
import { drawTurtle, drawTurtleWater } from './models/turtle3d';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };
// The ship atlases (see ShipSprite) are rendered in Blender for exactly this camera.
// Changing the camera means re-rendering them from their source outside this repo

// The zoom levels the HUD offers range over these, as multiples of CAMERA.zoom
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
// How fast the camera reaches a new zoom: the share of the remaining difference closed per second
const ZOOM_EASE = 8;
const ZOOM_SNAP = 0.001; // pixels per unit: close enough to stop easing

// Range rings, one color per weapon
const RANGE_COLORS: Readonly<Record<WeaponId, number>> = { cannon: 0xffb347, harpoon: 0x7fe3ff };
// A unit is easier to pick than it looks: its hull's line, standing from the water up to its hit point bar, with `pad`
// screen pixels round it; the unit under the mouse last frame keeps `sticky` times that, so one the camera or its own
// speed carries along doesn't slip out from under the mouse
const PICK = { pad: 20, sticky: 1.7, far: 400 }; // screen pixels, a share, screen pixels beyond which none is looked at
// Ships and monsters this far beyond the ship's view range already leave a wake and lay a trail (a serpent's body), so
// both are there when they come into sight
const NEAR_MARGIN = 300; // world units
// For culling: an island's shallows reach 1.35 times as far out as its coast (island3d), and its hill and palms rise
// above it by up to ISLAND_MARGIN world units on the screen
const ISLAND_SHALLOWS = 1.35;
const ISLAND_MARGIN = 100;

const BORDER_COLOR = 0x0b3a52;
// Hit point bars over the units in sight: screen pixels, the same at every zoom. A red border marks a unit that attacks
// the player (an aggressive bot, or one fighting them)
const HP_BAR = { width: 36, height: 5, lift: 12 };
const HP_COLORS = { back: 0x0b1a22, high: 0x5ad15a, mid: 0xf2c84b, low: 0xe5533d, border: 0xffffff, hostile: 0xff3b2f };

/** Copies the kept on/off flags for these keys into a record of them: those that are true or false */
function readFlags<K extends string>(value: unknown, keys: readonly K[], into: Record<K, boolean>) {
  if (typeof value !== 'object' || value === null) return;
  for (const key of keys) {
    const flag: unknown = key in value ? Reflect.get(value, key) : undefined;
    if (typeof flag === 'boolean') into[key] = flag;
  }
}

/** Where a sea serpent's head is: its position is the middle of its body */
function head(serpent: Ship) {
  return {
    x: serpent.x + Math.cos(serpent.rotation) * serpent.hull.bow,
    y: serpent.y + Math.sin(serpent.rotation) * serpent.hull.bow,
  };
}

/** How high a unit stands, world units: the top of a ship's mast, a monster's height. Its hit point bar is over it */
function unitTop(unit: Unit) {
  return botShipTop(unit.shipClass.id) ?? unit.height;
}

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
// Decorations (wakes, foam) are view state: the scene owns and updates them itself.
export class SceneView {
  readonly container = new Container();
  private readonly scene = new Graphics();
  /** Islands nearer than the ship sprite: they must be drawn on top of it */
  private readonly front = new Graphics();
  /** Fire, smoke and shot effects above the ship, under the islands in front of it */
  private readonly fireLayer = new Graphics();
  /** Over everything in the scene, in screen pixels: the units' hit point bars, then the damage numbers */
  private readonly hpBars = new Graphics();
  private readonly damageNumbers = new DamageNumbers();
  private readonly wake = new Wake();
  private readonly fire = new ShipFire();
  private readonly sinking = new Sinking();
  private readonly shots = new ShotEffects();
  private readonly repair = new RepairEffect();
  private readonly trails = new Trails();
  private readonly wrecks = new Wrecks();
  /** Each serpent's body as last drawn, by id: a wreck keeps the pose it died in */
  private spines = new Map<number, SpinePoint[]>();
  private readonly selection: Selection;
  private readonly cameraControl = new CameraControl();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly camera: Camera3D;
  private readonly painter: Painter3D;
  private readonly seaSurface: SeaSurface;
  private readonly fog: FogOfWar;
  private readonly fogClouds: FogClouds;
  private readonly frontPainter: Painter3D;
  private readonly firePainter: Painter3D;
  private readonly shipSprite: ShipSprite;
  /** Zoom as a multiple of CAMERA.zoom; the camera eases towards it */
  private zoomLevel = 1;
  /** Whether the HUD outlines the camera's zone */
  private zoneOutlined = false;
  /** Which weapons' range rings are shown */
  private readonly ranges: Record<WeaponId, boolean> = { cannon: true, harpoon: true };
  /** Which parts of the fog are drawn. Hiding them changes only the picture: the ship still sees no farther */
  private readonly fogLayers: Record<FogLayer, boolean> = { mist: true, clouds: false };
  /** Debug drawings of what the game logic sees */
  private readonly debug: Record<NavDebug, boolean> = { route: false, hulls: false };

  constructor(app: Application, state: GameState, selection: Selection) {
    this.app = app;
    this.state = state;
    this.selection = selection;
    this.camera = new Camera3D(CAMERA);
    this.painter = new Painter3D(this.scene, this.camera);
    this.seaSurface = createSeaSurface();
    // The whole screen behind the scene is open sea: its flat color shows until the surface's maps have loaded
    app.renderer.background.color = SEA_COLOR;
    this.fog = createFogOfWar();
    this.fogClouds = new FogClouds();
    this.frontPainter = new Painter3D(this.front, this.camera);
    this.firePainter = new Painter3D(this.fireLayer, this.camera);
    this.shipSprite = new ShipSprite(state.ship.shipClass);

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;

    this.container.addChild(
      this.seaSurface.mesh,
      this.fog.mesh,
      this.fogClouds.container,
      this.wake.mesh,
      this.sinking.water,
      this.scene,
      this.shipSprite.sprite,
      this.shipSprite.waterMask,
      this.fireLayer,
      this.front,
      this.hpBars,
      this.damageNumbers.container,
    );
  }

  update(dt: number) {
    const { ship, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    // The other ships (the bots, sea monsters among them) near enough to come into sight soon
    const near = this.state.ships.filter(
      (other) => other !== ship && Math.hypot(other.x - ship.x, other.y - ship.y) < ship.viewRange + NEAR_MARGIN,
    );
    const stage = ship.damageStage;
    // Far ships' wakes would never be seen
    this.wake.update(time, [ship, ...near]);
    // Wrecks keep the serpent's body as last drawn, before this frame's trails move on
    this.wrecks.update(this.state, (id) => this.spines.get(id) ?? null);
    const serpents = near.filter((other) => other.shipClass.id === 'seaSerpent');
    this.trails.update(
      serpents.map((serpent) => {
        const { x, y } = head(serpent);
        return { id: serpent.id, x, y };
      }),
    );
    this.sinking.update(time, stage, ship);
    this.fire.update(dt, ship, stage, this.sinking.pose, time);
    this.shots.update(dt, this.state);
    this.repair.update(dt, this.state);

    const targetZoom = CAMERA.zoom * this.zoomLevel;
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * ZOOM_EASE);
    if (Math.abs(targetZoom - camera.zoom) < ZOOM_SNAP) camera.zoom = targetZoom;
    camera.originX = width / 2;
    camera.originY = height * CAMERA.originY;
    this.cameraControl.update(camera, ship, dt, width, height);
    painter.screenWidth = this.frontPainter.screenWidth = width;
    painter.screenHeight = this.frontPainter.screenHeight = height;

    this.scene.clear();

    // Everything lying on the water
    updateSeaSurface(this.seaSurface, camera, time, width, height);
    if (this.fogLayers.mist) updateFogOfWar(this.fog, camera, ship, time, width, height);
    else this.fog.mesh.visible = false;
    // Hidden clouds aren't updated either: placing them is most of their cost on the CPU
    this.fogClouds.container.visible = this.fogLayers.clouds;
    if (this.fogLayers.clouds) this.fogClouds.update(camera, ship, time, width, height);

    const islands = world.islands.filter((island) =>
      painter.isVisible(island.x, island.y, 0, island.reach * ISLAND_SHALLOWS + ISLAND_MARGIN),
    );
    for (const island of islands) drawIslandGround(painter, island);

    this.drawWorldBorder();

    // Only the islands on the screen can fade a wake that is: hundreds of them would cost a lot per point
    this.wake.draw(camera, ship, time, islands);
    this.sinking.drawWater(camera, ship, islands);
    for (const id of WEAPON_IDS) {
      const range = ship.range(id);
      if (this.ranges[id] && range > 0) drawRangeRing(painter, ship, range, RANGE_COLORS[id]);
    }
    // Units in the fog of war are not drawn at all, nor wrecks. The serpent is long: it is culled by its body
    const others = near.filter(
      (other) =>
        !other.isSinking &&
        ship.canSee(other.x, other.y) &&
        painter.isVisible(other.x, other.y, 0, other.height * 3 + other.hull.bow),
    );
    this.spines = new Map(
      others
        .filter((other) => other.shipClass.id === 'seaSerpent')
        .map((serpent) => {
          const { x, y } = head(serpent);
          return [serpent.id, this.trails.spine(serpent.id, x, y, serpent.rotation, SPINE.points, SPINE.spacing)];
        }),
    );
    // What lies on the water round the units: a serpent's body under the surface, a turtle's shell and the bubbles over
    // wrecks; ships' water is their wake
    for (const other of others) {
      const spine = this.spines.get(other.id);
      if (spine) drawSerpentWater(painter, spine, time);
      else if (other.shipClass.id === 'seaTurtle') drawTurtleWater(painter, other, time);
    }
    this.wrecks.drawWater(painter, time);
    // Chests in sight: a ring of foam round each
    const chests = this.state.chests.filter((c) => ship.canSee(c.x, c.y) && painter.isVisible(c.x, c.y, 0, 12));
    for (const chest of chests) drawChestWater(painter, chest, time);
    this.repair.drawWater(painter);
    const units: Unit[] = others;
    const locked = units.find((u) => u.id === ship.attackTarget);
    if (locked) drawTargetLock(painter, locked, time, ship.holdReason !== null);
    const selected = units.find((u) => u.id === this.selection.id);
    if (selected && selected !== locked) drawSelection(painter, selected);
    this.shots.drawWater(painter);
    for (const projectile of this.state.projectiles) drawProjectileShadow(painter, projectile);
    // No ship shadow here: it is baked into the ship's sprite
    // Where the ship will stop: the target, or the nearest open water to it when it is on land
    const goal = ship.route.at(-1) ?? ship.target;
    if (goal) drawTargetMarker(painter, goal, time);

    // Volumetric objects: from far to near
    const objects = islands.map((island) => ({
      depth: painter.depth([island.x, island.y, island.height / 2]),
      draw: (p: Painter3D) => drawIslandRaised(p, island, time),
    }));
    for (const other of others) {
      const shake = this.shots.shake(other.id, time);
      const lunge = this.shots.lunge(other.id, time);
      const spine = this.spines.get(other.id);
      objects.push({
        depth: painter.depth([other.x, other.y, other.height / 2]),
        draw: (p) => {
          if (spine) drawSerpent(p, spine, time, shake, lunge);
          else if (other.shipClass.id === 'seaTurtle') drawTurtle(p, other, time, shake, lunge);
          else drawBotShip(p, other, other.shipClass.id, other.shipClass.slots.cannon, time, shake);
        },
      });
    }
    objects.push(...this.wrecks.objects(painter, time));
    for (const chest of chests) {
      objects.push({ depth: painter.depth([chest.x, chest.y, 2]), draw: (p) => drawChest(p, chest, time) });
    }
    const { port } = world;
    if (painter.isVisible(port.island.x, port.island.y, 0, port.island.reach * ISLAND_SHALLOWS + ISLAND_MARGIN)) {
      objects.push(...portPieces(painter, port, time));
    }
    for (const projectile of this.state.projectiles) {
      const at = projectilePosition(projectile);
      objects.push({ depth: painter.depth([at.x, at.y, at.z]), draw: (p) => drawProjectile(p, projectile) });
    }
    // Sorted by a point about half the ship's height up; its collision radius is a fair measure of its size
    const shipDepth = painter.depth([ship.x, ship.y, ship.radius]);
    objects.sort((a, b) => b.depth - a.depth);

    // A sprite can't go inside a Graphics, so everything nearer than the ship goes to a layer on top of it
    this.front.clear();
    for (const object of objects) {
      object.draw(object.depth < shipDepth ? this.frontPainter : painter);
    }
    this.shipSprite.update(ship, camera, time, stage, this.sinking.pose);

    // Smoke after flames: it rises from them and drifts over them
    this.fireLayer.clear();
    this.fire.drawFlames(this.firePainter);
    this.fire.drawSmoke(this.firePainter);
    // Shot effects behind the ship go to the scene layer, under the sprite; the rest over it
    this.shots.draw(painter, this.firePainter, shipDepth);
    this.repair.draw(this.firePainter);

    // On the top layer, so nothing hides it
    if (this.debug.route) drawRoute(this.frontPainter, ship);
    if (this.debug.hulls) drawHulls(this.frontPainter, this.state);

    this.drawHpBars(units);
    this.damageNumbers.update(dt, this.state, camera);
  }

  /** The view's settings as plain data, to keep between visits */
  get settings() {
    return {
      zoom: this.zoomLevel,
      cameraMode: this.cameraControl.mode,
      zone: this.zoneOutlined,
      ranges: { ...this.ranges },
      fog: { ...this.fogLayers },
      debug: { ...this.debug },
    };
  }

  /** Puts kept settings back: whatever of them is valid; the rest stays as it is */
  applySettings(saved: unknown) {
    if (typeof saved !== 'object' || saved === null) return;
    if ('zoom' in saved && typeof saved.zoom === 'number' && saved.zoom >= MIN_ZOOM && saved.zoom <= MAX_ZOOM) {
      this.zoomLevel = saved.zoom;
    }
    const mode = 'cameraMode' in saved ? CAMERA_MODES.find((m) => m === saved.cameraMode) : undefined;
    if (mode) this.cameraControl.mode = mode;
    if ('zone' in saved && typeof saved.zone === 'boolean') this.zoneOutlined = saved.zone;
    if ('ranges' in saved) readFlags(saved.ranges, WEAPON_IDS, this.ranges);
    if ('fog' in saved) readFlags(saved.fog, FOG_LAYERS, this.fogLayers);
    if ('debug' in saved) readFlags(saved.debug, NAV_DEBUG, this.debug);
  }

  /** Which way the screen's right and up point on the water: the maps turn the world as the camera does */
  get mapAxes() {
    const { rightX, rightY, fwdX, fwdY } = this.camera;
    return { rightX, rightY, upX: fwdX, upY: fwdY };
  }

  /** Zoom as a multiple of the default one: 1 is the normal view, 2 shows everything twice as big */
  get zoom() {
    return this.zoomLevel;
  }

  setZoom(level: number) {
    this.zoomLevel = level;
  }

  get zoneShown() {
    return this.zoneOutlined;
  }

  toggleZone() {
    this.zoneOutlined = !this.zoneOutlined;
  }

  /** The camera mode's zone on the screen, in pixels, or null when the mode has none (follow) */
  get zoneBox() {
    const share = this.cameraControl.zone;
    if (share === null) return null;
    const { width, height } = this.app.screen;
    const w = width * share;
    const h = height * share;
    return { x: this.camera.originX - w / 2, y: this.camera.originY - h / 2, width: w, height: h };
  }

  get cameraMode() {
    return this.cameraControl.mode;
  }

  setCameraMode(mode: CameraMode) {
    this.cameraControl.mode = mode;
  }

  /** Which weapons' range rings are shown */
  get rangesShown(): Readonly<Record<WeaponId, boolean>> {
    return this.ranges;
  }

  toggleRange(weapon: WeaponId) {
    this.ranges[weapon] = !this.ranges[weapon];
  }

  /** Which debug drawings are shown */
  get debugShown(): Readonly<Record<NavDebug, boolean>> {
    return this.debug;
  }

  toggleDebug(kind: NavDebug) {
    this.debug[kind] = !this.debug[kind];
  }

  /** Which parts of the fog of war are shown */
  get fogShown(): Readonly<Record<FogLayer, boolean>> {
    return this.fogLayers;
  }

  toggleFog(layer: FogLayer) {
    this.fogLayers[layer] = !this.fogLayers[layer];
  }

  /**
   * The unit under a screen point, if any: the nearest whose target (PICK) the point is in, `held` (the unit under the
   * mouse last frame) winning a tie. Only what the player can see, and never their own ship
   */
  pickUnit(x: number, y: number, held: number | null = null): Unit | null {
    const { ship } = this.state;
    const { camera } = this;
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const unit of this.state.ships) {
      if (unit === ship) continue;
      if (!isAfloat(unit) || !ship.canSee(unit.x, unit.y)) continue;
      const water = camera.project(unit.x, unit.y, 0);
      if (Math.abs(water.x - x) > PICK.far || Math.abs(water.y - y) > PICK.far) continue;
      // The hull's line on the water, stern to bow, and the same line raised to the top of its hit point bar
      const cos = Math.cos(unit.rotation);
      const sin = Math.sin(unit.rotation);
      const { bow, stern, halfBeam } = unit.hull;
      const front = camera.project(unit.x + cos * bow, unit.y + sin * bow, 0);
      const back = camera.project(unit.x + cos * stern, unit.y + sin * stern, 0);
      const rise = water.y - camera.project(unit.x, unit.y, unitTop(unit)).y + HP_BAR.lift + HP_BAR.height;
      const outline = [back, front, { x: front.x, y: front.y - rise }, { x: back.x, y: back.y - rise }];
      const distance = Math.max(0, signedDistanceToPolygon(x, y, outline));
      const reach = (halfBeam * camera.zoom + PICK.pad) * (unit.id === held ? PICK.sticky : 1);
      const score = distance / reach;
      if (score >= 1) continue;
      if (score < bestScore || (score === bestScore && unit.id === held)) {
        best = unit;
        bestScore = score;
      }
    }
    return best;
  }

  screenToWorld(x: number, y: number) {
    return this.camera.screenToGround(x, y);
  }

  /**
   * A bar of hit points over every unit shown: green, yellow below half, red below a quarter; its border red when the
   * unit attacks the player
   */
  private drawHpBars(units: readonly Unit[]) {
    const g = this.hpBars.clear();
    const { width, height, lift } = HP_BAR;
    for (const u of units) {
      const share = u.hp / u.maxHp;
      const s = this.camera.project(u.x, u.y, unitTop(u));
      const x = s.x - width / 2;
      const y = s.y - lift - height;
      const color = share > 0.5 ? HP_COLORS.high : share > 0.25 ? HP_COLORS.mid : HP_COLORS.low;
      const hostile = isHostile(u, this.state.ship.id);
      g.rect(x, y, width, height).fill({ color: HP_COLORS.back, alpha: 0.7 });
      g.rect(x, y, width * share, height).fill({ color });
      g.rect(x, y, width, height).stroke({
        width: hostile ? 1.5 : 1,
        color: hostile ? HP_COLORS.hostile : HP_COLORS.border,
        alpha: hostile ? 0.95 : 0.6,
      });
    }
  }

  // World border: strips lying on the water rather than screen lines, so they are foreshortened like the sea
  private drawWorldBorder() {
    const half = 4;
    const edges = [
      [0, 0, WORLD_WIDTH, 0],
      [0, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT],
      [0, 0, 0, WORLD_HEIGHT],
      [WORLD_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT],
    ];

    for (const [x0, y0, x1, y1] of edges) {
      const strip: Vec3[] = [
        [Math.min(x0, x1) - half, Math.min(y0, y1) - half, 0],
        [Math.max(x0, x1) + half, Math.min(y0, y1) - half, 0],
        [Math.max(x0, x1) + half, Math.max(y0, y1) + half, 0],
        [Math.min(x0, x1) - half, Math.max(y0, y1) + half, 0],
      ];
      this.painter.polygon(strip, BORDER_COLOR, 0.6);
    }
  }
}
