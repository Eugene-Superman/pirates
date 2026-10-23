import { Container, Graphics, type Application } from 'pixi.js';
import {
  WEAPONS,
  WEAPON_IDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  projectilePosition,
  type GameState,
  type Island,
  type Target,
  type WeaponId,
} from '../../game';
import { Camera3D, type CameraConfig, type Vec3 } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { CameraControl, type CameraMode } from './cameraControl';
import { FogClouds } from './effects/FogClouds';
import { createFogOfWar, type FogLayer, type FogOfWar, updateFogOfWar } from './effects/fogOfWar';
import { drawRangeRing } from './effects/rangeRings';
import { ShipFire } from './effects/ShipFire';
import { ShotEffects } from './effects/ShotEffects';
import { Sinking } from './effects/Sinking';
import { drawHulls, drawRoute, type NavDebug } from './effects/navDebug';
import { drawTargetMarker } from './effects/targetMarker';
import { Wake, drawWake } from './effects/Wake';
import { createSeaSurface, type SeaSurface, setSeaLook, updateSeaSurface } from './effects/seaSurface';
import { SEA_STYLES } from './effects/seaStyles';
import { createWaves, drawWaves } from './effects/waves';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { ISLAND_LOOKS, IslandSprites } from './models/IslandSprites';
import { drawBarrel, drawBarrelWater } from './models/barrel3d';
import { drawProjectile, drawProjectileShadow } from './models/projectile3d';
import { ShipSprite } from './models/ShipSprite';
import { drawTargetBoat, drawTargetBoatWater } from './models/targetBoat3d';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };
// The ship atlases (see ShipSprite) are rendered in Blender for exactly this camera.
// Changing the camera means re-rendering them from their source outside this repo

// How fast the camera reaches a new zoom: the share of the remaining difference closed per second
const ZOOM_EASE = 8;
const ZOOM_SNAP = 0.001; // pixels per unit: close enough to stop easing

// Range rings, one color per weapon
const RANGE_COLORS: Readonly<Record<WeaponId, number>> = { cannon: 0xffb347, harpoon: 0x7fe3ff };
// A barrel is a few pixels across, so a click this close to a target on screen counts as a click on it
const PICK_RADIUS = 22; // screen pixels
// An island's picture reaches this many times its reach from its centre: the sea floor round it
const ISLAND_PICTURE_REACH = 1.5;
// Share of an island's coast radius where its land rises: what a ship is compared with to sort it against the island
const ISLAND_CLIFF_SHARE = 0.85;

const BORDER_COLOR = 0x0b3a52;

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
  private readonly wake = new Wake();
  private readonly fire = new ShipFire();
  private readonly sinking = new Sinking();
  private readonly shots = new ShotEffects();
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

  constructor(app: Application, state: GameState) {
    this.app = app;
    this.state = state;
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
      this.scene,
      this.islandSprites.far,
      this.shipSprite.sprite,
      this.shipSprite.waterMask,
      this.fireLayer,
      this.islandSprites.near,
      this.front,
    );
  }

  update(dt: number) {
    const { ship, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    const stage = ship.damageStage;
    this.wake.update(dt, ship);
    this.sinking.update(time, stage, ship);
    this.fire.update(dt, ship, stage, this.sinking.pose, time);
    this.shots.update(dt, this.state);

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

    drawWake(painter, this.wake);
    this.sinking.drawFoam(painter, ship);
    for (const id of WEAPON_IDS) {
      if (this.ranges[id]) drawRangeRing(painter, ship, WEAPONS[id].range, RANGE_COLORS[id], time);
    }
    // Targets in the fog of war are not drawn at all
    const targets = this.state.targets.filter(
      (t) => ship.canSee(t.x, t.y) && painter.isVisible(t.x, t.y, 0, t.height * 3),
    );
    for (const target of targets) {
      if (target.kind === 'barrel') drawBarrelWater(painter, target, time);
      else drawTargetBoatWater(painter, target);
    }
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
        draw: (p) =>
          target.kind === 'barrel' ? drawBarrel(p, target, time, shake) : drawTargetBoat(p, target, time, shake),
      });
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

    // On the top layer, so nothing hides it
    if (this.debug.route) drawRoute(this.frontPainter, ship);
    if (this.debug.hulls) drawHulls(this.frontPainter, this.state);
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

  /** The target under a screen point, if any: the one nearest to it within PICK_RADIUS pixels */
  pickTarget(x: number, y: number) {
    let best: Target | null = null;
    let bestDist = PICK_RADIUS;
    for (const target of this.state.targets) {
      if (!this.state.ship.canSee(target.x, target.y)) continue;
      const s = this.camera.project(target.x, target.y, target.height / 2);
      const dist = Math.hypot(s.x - x, s.y - y);
      if (dist < bestDist) {
        best = target;
        bestDist = dist;
      }
    }
    return best;
  }

  screenToWorld(x: number, y: number) {
    return this.camera.screenToGround(x, y);
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
