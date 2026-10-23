import { Container, Graphics, type Application } from 'pixi.js';
import {
  WEAPON_IDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isAfloat,
  isAlive,
  isHostile,
  isShip,
  projectilePosition,
  type GameState,
  type Island,
  type Ship,
  type Unit,
  type WeaponId,
} from '../../game';
import type { Selection } from '../input/selection';
import { Camera3D, type CameraConfig, type Vec3 } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { CameraControl, type CameraMode } from './cameraControl';
import { DamageNumbers } from './effects/DamageNumbers';
import { FogClouds } from './effects/FogClouds';
import { createFogOfWar, type FogLayer, type FogOfWar, updateFogOfWar } from './effects/fogOfWar';
import { drawRangeRing } from './effects/rangeRings';
import { RepairEffect } from './effects/RepairEffect';
import { ShipFire } from './effects/ShipFire';
import { ShotEffects } from './effects/ShotEffects';
import { Sinking } from './effects/Sinking';
import { drawHulls, drawRoute, type NavDebug } from './effects/navDebug';
import { drawSelection, drawTargetLock } from './effects/targetLock';
import { drawTargetMarker } from './effects/targetMarker';
import { Trails } from './effects/Trails';
import { Wake } from './effects/Wake';
import { Wrecks } from './effects/Wrecks';
import { createSeaSurface, type SeaSurface, setSeaLook, updateSeaSurface } from './effects/seaSurface';
import { SEA_STYLES } from './effects/seaStyles';
import { createWaves, drawWaves } from './effects/waves';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { ISLAND_LOOKS, IslandSprites } from './models/IslandSprites';
import { drawBarrel, drawBarrelWater } from './models/barrel3d';
import { botShipTop, drawBotShip } from './models/botShip3d';
import { drawProjectile, drawProjectileShadow } from './models/projectile3d';
import { SPINE, drawSerpent, drawSerpentWater, type SpinePoint } from './models/serpent3d';
import { ShipSprite } from './models/ShipSprite';
import { drawTurtle, drawTurtleWater } from './models/turtle3d';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };
// The ship atlases (see ShipSprite) are rendered in Blender for exactly this camera.
// Changing the camera means re-rendering them from their source outside this repo

// How fast the camera reaches a new zoom: the share of the remaining difference closed per second
const ZOOM_EASE = 8;
const ZOOM_SNAP = 0.001; // pixels per unit: close enough to stop easing

// Range rings, one color per weapon
const RANGE_COLORS: Readonly<Record<WeaponId, number>> = { cannon: 0xffb347, harpoon: 0x7fe3ff };
// A barrel is a few pixels across, so a click this close to a unit on screen counts as a click on it; a big unit
// counts out to its size
const PICK_RADIUS = 22; // screen pixels
// Ships and monsters this far beyond the ship's view range already leave a wake and lay a trail (a serpent's body), so
// both are there when they come into sight
const NEAR_MARGIN = 300; // world units
// An island's picture reaches this many times its reach from its centre: the sea floor round it
const ISLAND_PICTURE_REACH = 1.5;
// Share of an island's coast radius where its land rises: what a ship is compared with to sort it against the island
const ISLAND_CLIFF_SHARE = 0.85;

const BORDER_COLOR = 0x0b3a52;
// Hit point bars over the units in sight: screen pixels, the same at every zoom. A red border marks a unit that attacks
// the player (an aggressive bot, or one fighting them)
const HP_BAR = { width: 36, height: 5, lift: 12 };
const HP_COLORS = { back: 0x0b1a22, high: 0x5ad15a, mid: 0xf2c84b, low: 0xe5533d, border: 0xffffff, hostile: 0xff3b2f };

/** Where a sea serpent's head is: its position is the middle of its body */
function head(serpent: Ship) {
  return {
    x: serpent.x + Math.cos(serpent.rotation) * serpent.hull.bow,
    y: serpent.y + Math.sin(serpent.rotation) * serpent.hull.bow,
  };
}

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
// Decorations (waves, foam) are view state: the scene owns and updates them itself.
export class SceneView {
  readonly container = new Container();
  /** The little wave strokes: over the sea's surface, under the fog of war, which is under the islands */
  private readonly sea = new Graphics();
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
  private readonly waves = createWaves();
  private readonly app: Application;
  private readonly state: GameState;
  private readonly camera: Camera3D;
  private readonly painter: Painter3D;
  private readonly seaPainter: Painter3D;
  private readonly seaSurface: SeaSurface;
  private seaStyleIndex = 0;
  private readonly islandSprites = new IslandSprites();
  /** 0: the simple low-poly islands; 1…: the textured looks of ISLAND_LOOKS */
  private islandLookIndex = 1;
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
    this.seaPainter = new Painter3D(this.sea, this.camera);
    this.seaSurface = createSeaSurface();
    this.fog = createFogOfWar();
    this.fogClouds = new FogClouds();
    this.frontPainter = new Painter3D(this.front, this.camera);
    this.firePainter = new Painter3D(this.fireLayer, this.camera);
    this.shipSprite = new ShipSprite(state.ship.shipClass);
    this.setSeaStyle(0);
    this.setIslandLook(this.islandLookIndex);

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;

    this.container.addChild(
      this.seaSurface.mesh,
      this.sea,
      this.fog.mesh,
      this.fogClouds.container,
      this.islandSprites.ground,
      this.wake.mesh,
      this.sinking.water,
      this.scene,
      this.islandSprites.far,
      this.shipSprite.sprite,
      this.shipSprite.waterMask,
      this.fireLayer,
      this.islandSprites.near,
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
    // Destroyed targets leave no wake; theirs fades where they went down. Far ships' wakes would never be seen
    this.wake.update(time, [ship, ...near, ...this.state.targets.filter(isAlive)]);
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
    painter.screenWidth = this.frontPainter.screenWidth = this.seaPainter.screenWidth = width;
    painter.screenHeight = this.frontPainter.screenHeight = this.seaPainter.screenHeight = height;

    this.scene.clear();

    // Everything lying on the water
    this.sea.clear();
    updateSeaSurface(this.seaSurface, camera, time, width, height);
    const { arcs } = SEA_STYLES[this.seaStyleIndex];
    if (arcs) drawWaves(this.seaPainter, this.waves, time, arcs.color, arcs.alpha);
    if (this.fogLayers.mist) updateFogOfWar(this.fog, camera, ship, time, width, height);
    else this.fog.mesh.visible = false;
    // Hidden clouds aren't updated either: placing them is most of their cost on the CPU
    this.fogClouds.container.visible = this.fogLayers.clouds;
    if (this.fogLayers.clouds) this.fogClouds.update(camera, ship, time, width, height);

    // Pictures reach past the coast with the sea floor round the island, and up with its hills and trees
    const visible = world.islands.filter((island) =>
      painter.isVisible(island.x, island.y, 0, island.reach * ISLAND_PICTURE_REACH + 60),
    );
    // Islands with their pictures loaded in the chosen look; the rest (all, for the low-poly look) are drawn here
    const textured = this.islandLookIndex > 0 ? visible.filter((island) => this.islandSprites.has(island)) : [];
    const islands = visible.filter((island) => !textured.includes(island));
    for (const island of islands) drawIslandGround(painter, island);
    this.islandSprites.update(camera, textured, (island) => this.islandInFront(island, painter));

    this.drawWorldBorder();

    this.wake.draw(camera, ship, time, world.islands);
    this.sinking.drawWater(camera, ship, world.islands);
    for (const id of WEAPON_IDS) {
      const range = ship.range(id);
      if (this.ranges[id] && range > 0) drawRangeRing(painter, ship, range, RANGE_COLORS[id], time);
    }
    // Units in the fog of war are not drawn at all, nor destroyed ones. The serpent is long: it is culled by its body
    const targets = this.state.targets.filter(
      (t) => isAlive(t) && ship.canSee(t.x, t.y) && painter.isVisible(t.x, t.y, 0, t.height * 3 + t.hull.bow),
    );
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
    // What lies on the water round the units: the barrel's foam, a serpent's body under the surface, a turtle's shell
    // and the bubbles over wrecks; ships' water is their wake
    for (const target of targets) drawBarrelWater(painter, target, time);
    for (const other of others) {
      const spine = this.spines.get(other.id);
      if (spine) drawSerpentWater(painter, spine, time);
      else if (other.shipClass.id === 'seaTurtle') drawTurtleWater(painter, other, time);
    }
    this.wrecks.drawWater(painter, time);
    this.repair.drawWater(painter);
    const units: Unit[] = [...targets, ...others];
    const locked = units.find((u) => u.id === ship.attackTarget);
    if (locked) drawTargetLock(painter, locked, time, ship.holdReason !== null);
    const selected = units.find((u) => u.id === this.selection.id);
    if (selected && selected !== locked) drawSelection(painter, selected, time);
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
    for (const target of targets) {
      const shake = this.shots.shake(target.id, time);
      objects.push({
        depth: painter.depth([target.x, target.y, target.height / 2]),
        draw: (p) => drawBarrel(p, target, time, shake),
      });
    }
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

  /**
   * Whether an island is nearer to the camera than the ship, where the two could overlap on the screen: compared at
   * the island's cliff line on the side facing the ship, so a ship close to an island sorts right whichever side it is
   */
  private islandInFront(island: Island, painter: Painter3D) {
    const { ship } = this.state;
    const dx = ship.x - island.x;
    const dy = ship.y - island.y;
    const distance = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const segments = island.shape.length;
    const k = island.shape[Math.round((angle / (Math.PI * 2)) * segments) % segments];
    const t = distance > 0 ? Math.min(distance, island.radius * k * ISLAND_CLIFF_SHARE) / distance : 0;
    const near = painter.depth([island.x + dx * t, island.y + dy * t, 0]);
    return near < painter.depth([ship.x, ship.y, 0]);
  }

  /** Which look the islands have: 0 the low-poly one, 1… a textured one (ISLAND_LOOKS) */
  get islandLook() {
    return this.islandLookIndex;
  }

  setIslandLook(index: number) {
    if (index < 0 || index > ISLAND_LOOKS.length) return;
    this.islandLookIndex = index;
    this.islandSprites.setLook(index > 0 ? ISLAND_LOOKS[index - 1].id : null);
  }

  /** Index of the sea's look in SEA_STYLES */
  get seaStyle() {
    return this.seaStyleIndex;
  }

  setSeaStyle(index: number) {
    const style = SEA_STYLES[index];
    if (!style) return;
    this.seaStyleIndex = index;
    // The whole screen behind the scene is open sea: its flat color shows where the surface isn't drawn
    this.app.renderer.background.color = style.color;
    setSeaLook(this.seaSurface, style.surface);
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
   * The unit under a screen point, if any: the one nearest to it within PICK_RADIUS pixels, or within its own size on
   * the screen for a big one. Only what the player can see, and never their own ship
   */
  pickUnit(x: number, y: number): Unit | null {
    const { ship } = this.state;
    let best: Unit | null = null;
    let bestScore = Infinity;
    const units: Unit[] = [...this.state.targets, ...this.state.ships.filter((other) => other !== ship)];
    for (const unit of units) {
      if (!isAfloat(unit) || !ship.canSee(unit.x, unit.y)) continue;
      const s = this.camera.project(unit.x, unit.y, unit.height / 2);
      const reach = Math.max(PICK_RADIUS, unit.radius * 1.4 * this.camera.zoom);
      const score = Math.hypot(s.x - x, s.y - y) / reach;
      if (score < 1 && score < bestScore) {
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
      // Over the top of a ship's mast
      const top = isShip(u) ? (botShipTop(u.shipClass.id) ?? u.height) : u.height;
      const s = this.camera.project(u.x, u.y, top);
      const x = s.x - width / 2;
      const y = s.y - lift - height;
      const color = share > 0.5 ? HP_COLORS.high : share > 0.25 ? HP_COLORS.mid : HP_COLORS.low;
      const hostile = isShip(u) && isHostile(u, this.state.ship.id);
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
