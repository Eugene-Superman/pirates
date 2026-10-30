import { Container, Graphics, type Application } from 'pixi.js';
import {
  BOT_KINDS,
  PERKS,
  isAfloat,
  isHostile,
  projectilePosition,
  seaOpenTo,
  signedDistanceToPolygon,
  storyGoal,
  storyMark,
  storyTargets,
  storyWatch,
  type GameState,
  type GatePlace,
  type Ship,
  type ShipClass,
  type Unit,
  type UnitKind,
} from '../../game';
import { ARROWS, IconSprites } from '../hud/iconAtlas';
import type { Selection } from '../input/selection';
import { Camera3D, type CameraConfig } from '../render/Camera3D';
import { Painter3D } from '../render/Painter3D';
import { CameraControl } from './cameraControl';
import { Auras } from './effects/Auras';
import { BarrageMarks } from './effects/BarrageMarks';
import { Beacon, SpotBeacons, bossSpot, markSpot, type MarkedSpot } from './effects/Beacon';
import { DamageNumbers } from './effects/DamageNumbers';
import { createFogOfWar, type FogOfWar, updateFogOfWar } from './effects/fogOfWar';
import { LevelUpEffect } from './effects/LevelUpEffect';
import { drawRangeRings } from './effects/rangeRings';
import { RepairEffect } from './effects/RepairEffect';
import { SeamWalls } from './effects/SeamWalls';
import { ShipFire } from './effects/ShipFire';
import { ShotEffects } from './effects/ShotEffects';
import { Sinking } from './effects/Sinking';
import { NAV_DEBUG, drawHulls, drawRoute, type NavDebug } from './effects/navDebug';
import { drawTargetMarker } from './effects/targetMarker';
import { Trails } from './effects/Trails';
import { Wake } from './effects/Wake';
import { Wrecks } from './effects/Wrecks';
import { SEA_COLOR } from './effects/seaLook';
import {
  DIVE_LIGHTS,
  INK_CLOUDS,
  SHELL_LIGHTS,
  createSeaSurface,
  type SeaSurface,
  type WaterGate,
  type WaterLight,
  updateSeaSurface,
} from './effects/seaSurface';
import { drawChest, drawChestWater } from './models/chest3d';
import { drawKeg, drawKegWater } from './models/keg3d';
import { drawStandardWater } from './models/standard3d';
import { drawIslandGround, drawIslandRaised } from './models/island3d';
import { IslandSprites } from './models/IslandSprites';
import { portPieces } from './models/port3d';
import { PortSprites } from './models/PortSprites';
import { BotSprites } from './models/BotSprites';
import { ChestSprites } from './models/ChestSprites';
import { botShipTop, drawBotShip } from './models/botShip3d';
import { drawGate } from './models/gate3d';
import { drawStoryChevron, drawStoryMark, drawStoryPointer } from './models/storyMark3d';
import { drawDiveWater, drawMonster, drawMonsterWater, isMonsterModel, monsterTop } from './models/monster3d';
import { drawProjectile, drawProjectileShadow } from './models/projectile3d';
import { SPINE, drawSerpent, drawSerpentWater, type SpinePoint } from './models/serpent3d';
import { ShipSprite } from './models/ShipSprite';
import { drawTurtle, drawTurtleWater } from './models/turtle3d';
import type { SceneObject } from './sceneObjects';

// Classic 2:1 isometric: tilted 30°, world rotated 45°
export const CAMERA: CameraConfig = { pitch: 30, yaw: 45, zoom: 1.4, originY: 0.5 };
// The ship atlases (see ShipSprite) are rendered in Blender for exactly this camera.
// Changing the camera means re-rendering them from their source outside this repo

// The zoom levels the HUD offers range over these, as multiples of CAMERA.zoom: half as near (twice the sea on the
// screen) to half as near again
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
// How fast the camera reaches a new zoom: the share of the remaining difference closed per second
const ZOOM_EASE = 8;
const ZOOM_SNAP = 0.001; // pixels per unit: close enough to stop easing

// A unit is easier to pick than it looks: its hull's line, standing from the water up to its hit point bar, with `pad`
// screen pixels round it; the unit under the mouse last frame keeps `sticky` times that, so one the camera or its own
// speed carries along doesn't slip out from under the mouse
const PICK = { pad: 20, sticky: 1.7, far: 400 }; // screen pixels, a share, screen pixels beyond which none is looked at
// Ships and monsters this far beyond the ship's view range already leave a wake and lay a trail (a serpent's body), so
// both are there when they come into sight
const NEAR_MARGIN = 300; // world units
const GOAL_MOVED = 4; // world units a course's end must move by to count as a new one (the pilot replans round ships)
// For culling: an island's shallows reach 1.35 times as far out as its coast (island3d), and its hill and palms rise
// above it by up to ISLAND_MARGIN world units on the screen
const ISLAND_SHALLOWS = 1.35;
const ISLAND_MARGIN = 100;

// World units from the camera's focus within which a gate's whirlpool turns the water: beyond it, none is on the screen
const GATE_NEAR = 2500;
// Hit point bars over the units in sight: screen pixels, the same at every zoom. A red border marks a unit that attacks
// the player (an aggressive bot, or one fighting them)
const HP_BAR = { width: 36, height: 5, lift: 12 };
const HP_COLORS = { back: 0x0b1a22, high: 0x5ad15a, mid: 0xf2c84b, low: 0xe5533d, border: 0xffffff, hostile: 0xff3b2f };
// A cloud of ink (combat/monsterSkills.ts): seconds it takes to darken the water as it is shed, and to thin away before
// it is gone; how fast the fog closes in round a ship in one and opens again, the share of the way a second
const INK_FADE = { in: 0.3, out: 1.2 } as const;
const SIGHT_EASE = 5;
// Radians a ship's sprite rolls when hit (the player's and the bots'), rocking to and fro as the shake dies out
const SHAKE_TILT = 0.06;
const SHAKE_SWINGS = 16; // radians of the rocking over the whole shake: about two and a half swings

/** How far a ship's sprite is rolled by a hit: shake is 1 right after it, 0 once settled (ShotEffects.shake) */
function hitRoll(shake: number) {
  return SHAKE_TILT * shake * Math.sin(shake * SHAKE_SWINGS);
}

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
  return botShipTop(unit.shipClass.id) ?? monsterTop(unit.shipClass.id) ?? unit.height;
}

// Pseudo-3D: the world has height and the camera looks at it at an angle.
// The scene is redrawn every frame through the Camera3D projection.
// Decorations (wakes, foam) are view state: the scene owns and updates them itself.
export class SceneView {
  readonly container = new Container();
  /** What lies on the water, then the farthest volumetric objects, up to the first ship sprite */
  private readonly scene = new Graphics();
  /** The scene's volumetric objects from far to near: the ships' sprites, each with its fire over it, and between
   * them layers (`segments`) of the vector-drawn objects in between, starting with `scene` */
  private readonly layers = new Container();
  private readonly segments: { graphics: Graphics; painter: Painter3D }[] = [];
  /** Over the fog: the target marker where the ship can't see, so the fog doesn't dim it */
  private readonly markerLayer = new Graphics();
  /** Over the fog too: the pillar of light over where the story sends the player, its light in the water */
  private readonly storyLight = new Beacon('story');
  /**
   * Under the ships: the red light round a boss that fights the player, in the water, its pillar rising behind its
   * masts (over them it would wash the hull out)
   */
  private readonly bossLight = new Beacon('boss');
  /** Under the ships too: the same red over every spot a boss's shells are to land on */
  private readonly shellLights = new SpotBeacons('boss', 'shell', SHELL_LIGHTS);
  /** And ink-dark over every spot a monster is to come up at from a dive */
  private readonly diveLights = new SpotBeacons('ink', 'dive', DIVE_LIGHTS);
  /** Over the whole scene: the debug drawings */
  private readonly overlay = new Graphics();
  /** Fire, smoke and shot effects above the player's ship, under whatever is nearer than it */
  private readonly fireLayer = new Graphics();
  /** Over everything in the scene, in screen pixels: the units' hit point bars, then the damage numbers */
  private readonly hpBars = new Graphics();
  /** Over the bars: the story's painted arrows, round the ship and over what it asks the player to sink */
  private readonly arrows = new IconSprites(ARROWS);
  private readonly damageNumbers = new DamageNumbers();
  private readonly wake = new Wake();
  private readonly fire = new ShipFire();
  private readonly sinking = new Sinking();
  private readonly shots = new ShotEffects();
  private readonly barrage = new BarrageMarks();
  private readonly repair = new RepairEffect();
  private readonly levelUp = new LevelUpEffect();
  /** Round the unit fired at, the one picked out and the story's prey: their light in the water */
  private readonly auras = new Auras();
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
  /** The Seams' walls at the map's edges: those behind the sea over it, those in front of it over everything on it */
  private readonly seams = new SeamWalls();
  private readonly fog: FogOfWar;
  private readonly overlayPainter: Painter3D;
  private readonly markerPainter: Painter3D;
  private readonly firePainter: Painter3D;
  /** The player's ship from its class's atlases: drawn anew for another ship bought or taken in port */
  private shipSprite: ShipSprite;
  private spriteClass: ShipClass;
  private readonly bots: BotSprites;
  /** The chests afloat in sight, drawn from their atlases */
  private readonly chestSprites: ChestSprites;
  /** The port from its pictures, once they have loaded */
  private readonly portSprites = new PortSprites();
  /** The islands from their paintings, each once it has loaded */
  private readonly islandSprites: IslandSprites;
  /** Zoom as a multiple of CAMERA.zoom; the camera eases towards it */
  private zoomLevel = 1;
  /** Which weapons' range rings are shown */
  private showRanges = true;
  /** Where the ship was heading last frame, and since when: the marker comes up anew for a new course */
  private goal: { x: number; y: number } | null = null;
  private goalSince = 0;
  /** Whether the mouse or finger is held down steering the ship: the course follows it, so no marker shows */
  private steering = false;
  /** Debug drawings of what the game logic sees */
  private readonly debug: Record<NavDebug, boolean> = { route: false, hulls: false };
  /**
   * How far the fog lets the crew see now, world units, and how much of it is a cloud of ink's murk: easing after the
   * ship's view range and the ink it is in
   */
  private sight: number;
  private inked = 0;

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
    this.overlayPainter = new Painter3D(this.overlay, this.camera);
    this.markerPainter = new Painter3D(this.markerLayer, this.camera);
    this.firePainter = new Painter3D(this.fireLayer, this.camera);
    this.spriteClass = state.ship.shipClass;
    this.shipSprite = new ShipSprite(this.spriteClass);
    this.bots = new BotSprites(this.camera);
    this.chestSprites = new ChestSprites(this.camera);
    this.islandSprites = new IslandSprites(state.world.islands);

    this.camera.focusX = state.ship.x;
    this.camera.focusY = state.ship.y;
    this.sight = state.ship.viewRange;

    // The fog lies over everything on the water, so beyond the view islands, the port and wakes are hazed like the sea
    this.container.addChild(
      this.seaSurface.mesh,
      this.seams.back,
      this.wake.mesh,
      this.sinking.water,
      this.bossLight.container,
      this.shellLights.container,
      this.diveLights.container,
      this.levelUp.light.container,
      this.layers,
      this.seams.front,
      this.fog.mesh,
      this.markerLayer,
      this.storyLight.container,
      this.overlay,
      this.hpBars,
      this.arrows.container,
      this.damageNumbers.container,
    );
  }

  update(dt: number) {
    const { ship, world, time } = this.state;
    const { camera, painter } = this;
    const { width, height } = this.app.screen;

    // The other ships (the bots, sea monsters among them) near enough to come into sight soon, and those the crew
    // watches far off (the story's spyglass)
    const near = this.state.ships.filter(
      (other) =>
        other !== ship &&
        (Math.hypot(other.x - ship.x, other.y - ship.y) < ship.viewRange + NEAR_MARGIN ||
          ship.canSee(other.x, other.y)),
    );
    const stage = ship.damageStage;
    // Far ships' wakes would never be seen, nor a monster's under water
    this.wake.update(time, [ship, ...near.filter((other) => !other.submerged)]);
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
    this.barrage.update(this.state, this.shots);
    this.repair.update(dt, this.state);

    const targetZoom = CAMERA.zoom * this.zoomLevel;
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * ZOOM_EASE);
    if (Math.abs(targetZoom - camera.zoom) < ZOOM_SNAP) camera.zoom = targetZoom;
    camera.originX = width / 2;
    camera.originY = height * CAMERA.originY;
    // While the crew watches something the story shows them, the camera looks at it, then comes back to the ship
    this.cameraControl.update(camera, ship, dt, storyWatch(this.state, this.state.player));
    painter.screenWidth = this.overlayPainter.screenWidth = this.markerPainter.screenWidth = width;
    painter.screenHeight = this.overlayPainter.screenHeight = this.markerPainter.screenHeight = height;

    this.scene.clear();
    this.markerLayer.clear();

    // Units in the fog of war are not drawn at all, nor wrecks, nor a monster under water. The serpent is long: it is
    // culled by its body
    const others = near.filter(
      (other) =>
        !other.isSinking &&
        !other.submerged &&
        ship.canSee(other.x, other.y) &&
        painter.isVisible(other.x, other.y, 0, other.height * 3 + other.hull.bow),
    );
    // What the story asks the player to sink: marked gold
    const targets = storyTargets(this.state.player);

    // Everything lying on the water; where the story sends the player now, if anywhere, a boss that fights them and
    // where its shells will land, a level reached, the units marked, their lights in it
    const mark = storyMark(this.state, this.state.player);
    this.storyLight.update(dt, mark && markSpot(mark), camera, time, width, height);
    const boss = this.fightingBoss();
    this.bossLight.update(dt, boss && bossSpot(boss), camera, time, width, height);
    this.shellLights.update(dt, this.bossShells(), camera, time, width, height);
    this.diveLights.update(dt, this.diveSpots(near), camera, time, width, height);
    this.levelUp.update(dt, this.state, camera, width, height);
    this.auras.update(dt, others, ship, this.selection.id, targets);
    updateSeaSurface(
      this.seaSurface,
      camera,
      time,
      width,
      height,
      this.storyLight.water,
      this.bossLight.water,
      this.shellLights.water,
      this.levelUp.light.water,
      this.auras.water,
      this.waterGate(),
      this.diveLights.water,
      this.inkClouds(),
    );
    this.seams.update(camera, ship, time, this.seaSurface.textures.ripples);
    // In a cloud of ink the fog closes in round the ship, the ink's murk for its haze
    const inkSight = ship.inkSight;
    const ease = Math.min(1, dt * SIGHT_EASE);
    this.sight += ((inkSight ?? ship.viewRange) - this.sight) * ease;
    this.inked += ((inkSight === null ? 0 : 1) - this.inked) * ease;
    updateFogOfWar(this.fog, camera, ship, this.sight, this.inked, time, width, height);

    const islands = world.islands.filter((island) =>
      painter.isVisible(island.x, island.y, 0, island.reach * ISLAND_SHALLOWS + ISLAND_MARGIN),
    );
    // The port's island is in its pictures once they have loaded; until then it is drawn as an island
    const { port } = world;
    const portArt = this.portSprites.loaded;
    const drawn = portArt ? islands.filter((island) => island !== port.island) : islands;
    // A painted island is all in its pictures: its shallows under everything on the water, the rest sorted with the ships
    for (const island of drawn) if (!this.islandSprites.has(island)) drawIslandGround(painter, island);

    // The gates to other seas: whirlpools in the sea's shader; drawn on the water till its maps have loaded
    for (const gate of world.gates) {
      if (this.seaSurface.mesh.visible) break;
      if (painter.isVisible(gate.x, gate.y, 0, gate.radius + ISLAND_MARGIN)) drawGate(painter, gate, time);
    }
    // The story's buoy
    if (mark && painter.isVisible(mark.x, mark.y, 0, mark.radius + ISLAND_MARGIN)) drawStoryMark(painter, mark, time);

    // Only the islands on the screen can fade a wake that is: hundreds of them would cost a lot per point
    this.wake.draw(camera, ship, time, islands);
    this.sinking.drawWater(camera, ship, islands);
    // The picked weapon's: only its longest and shortest reach, however many lie between
    const { weapon } = ship;
    const longest = ship.range(weapon);
    if (this.showRanges && longest > 0) {
      drawRangeRings(painter, ship, { shortest: ship.fullVolleyRange(weapon), longest, weapon }, time);
    }
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
      const kind = other.shipClass.id;
      if (spine) drawSerpentWater(painter, spine, time);
      else if (kind === 'seaTurtle') drawTurtleWater(painter, other, time);
      else if (isMonsterModel(kind)) drawMonsterWater(painter, other, kind, time);
    }
    this.wrecks.drawWater(painter, time);
    // A monster under water: its shape gliding at its foe, bubbles breaking over it
    for (const other of near) {
      const { diving } = other;
      const kind = other.shipClass.id;
      if (!diving || !isMonsterModel(kind)) continue;
      // Till its spot is marked, at where the game will mark it (as far ahead of the foe as it will be): no jump then
      const foe = diving.spot ? null : this.state.ships.find((s) => s.id === diving.targetId);
      const ahead = diving.surfaceAt - diving.markAt;
      const to = diving.spot ?? (foe ? { x: foe.x + foe.vx * ahead, y: foe.y + foe.vy * ahead } : null);
      if (!to) continue;
      const k = Math.min(1, (time - diving.startAt) / (diving.surfaceAt - diving.startAt));
      const from = { x: diving.fromX, y: diving.fromY };
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      if (!ship.canSee(x, y) || !painter.isVisible(x, y, 0, other.radius * 2)) continue;
      drawDiveWater(painter, from, to, k, kind, time);
    }
    // Chests in sight: a ring of foam round each
    const chests = this.state.chests.filter((c) => ship.canSee(c.x, c.y) && painter.isVisible(c.x, c.y, 0, 12));
    for (const chest of chests) drawChestWater(painter, chest, time);
    // Powder kegs in sight: foam round each, and the ring of its blast, which a foe within sets off
    const kegs = this.state.kegs.filter(
      (k) => ship.canSee(k.x, k.y) && painter.isVisible(k.x, k.y, 0, PERKS.powderKeg.blast),
    );
    for (const keg of kegs) drawKegWater(painter, keg, time);
    this.repair.drawWater(painter);
    drawStandardWater(painter, ship, time);
    // The units' auras are lights in the sea's water: till its maps load, rings on it
    if (!this.seaSurface.mesh.visible) this.auras.drawWater(painter);
    this.shots.drawWater(painter);
    this.barrage.drawWater(painter, time, this.seaSurface.mesh.visible);
    for (const projectile of this.state.projectiles) drawProjectileShadow(painter, projectile);
    // No ship shadow here: it is baked into the ship's sprite
    // Where the ship will stop: the target, or the nearest open water to it when it is on land
    const goal = ship.route.at(-1) ?? ship.target;
    // The marker comes up where the mouse lets go, and again for a new course (not the same one replanned round
    // something)
    const last = this.goal;
    const moved = !last || !goal || Math.hypot(goal.x - last.x, goal.y - last.y) > GOAL_MOVED;
    if (goal && (this.steering || moved)) this.goalSince = time;
    this.goal = goal ? { x: goal.x, y: goal.y } : null;
    // In sight it lies on the water among the rest; beyond, the fog would dim it, and no unit there hides it anyway
    if (goal && !this.steering) {
      const p = ship.canSee(goal.x, goal.y) ? painter : this.markerPainter;
      drawTargetMarker(p, goal, time, this.goalSince);
    }

    // Volumetric objects: from far to near
    const objects = this.islandSprites.objects(painter, camera, drawn, width, height);
    for (const island of drawn) {
      if (this.islandSprites.has(island)) continue;
      objects.push({
        depth: painter.depth([island.x, island.y, island.height / 2]),
        draw: (p: Painter3D) => drawIslandRaised(p, island, time),
      });
    }
    for (const other of others) {
      const shake = this.shots.shake(other.id, time);
      const lunge = this.shots.lunge(other.id, time);
      const spine = this.spines.get(other.id);
      const biteAge = this.shots.biteAge(other.id, time);
      // A bot's ship, the turtle and the serpent from their atlases, once they have loaded
      const serpent = spine ? this.bots.takeSerpent(other.id) : null;
      if (spine && serpent) {
        serpent.update(spine, camera, time, other.damageStage, shake, lunge, biteAge);
        objects.push({ depth: painter.depth([other.x, other.y, other.height / 2]), layers: serpent.layers });
        continue;
      }
      const sprite = spine ? null : this.bots.take(other.id, other.shipClass.id);
      if (sprite) {
        const pose = { depth: 0, tilt: hitRoll(shake), alpha: 1 };
        sprite.update(dt, other, camera, time, other.damageStage, pose, biteAge);
        objects.push({ depth: painter.depth([other.x, other.y, other.radius]), layers: sprite.layers });
        continue;
      }
      objects.push({
        depth: painter.depth([other.x, other.y, other.height / 2]),
        draw: (p) => {
          const kind = other.shipClass.id;
          if (spine) drawSerpent(p, spine, time, shake, lunge);
          else if (kind === 'seaTurtle') drawTurtle(p, other, time, shake, lunge);
          else if (isMonsterModel(kind)) drawMonster(p, other, kind, time, shake, lunge);
          else drawBotShip(p, other, kind, other.shipClass.slots.cannon, time, shake);
        },
      });
    }
    objects.push(...this.wrecks.objects(painter, time, dt, camera, this.bots));
    for (const chest of chests) {
      // From its atlas once it has loaded
      const layers = this.chestSprites.take(chest, time);
      const depth = painter.depth([chest.x, chest.y, 2]);
      objects.push(layers ? { depth, layers } : { depth, draw: (p) => drawChest(p, chest, time) });
    }
    for (const keg of kegs) {
      objects.push({ depth: painter.depth([keg.x, keg.y, 2]), draw: (p) => drawKeg(p, keg, time) });
    }
    if (portArt) objects.push(...this.portSprites.objects(painter, camera, port, time, width, height));
    else if (painter.isVisible(port.island.x, port.island.y, 0, port.island.reach * ISLAND_SHALLOWS + ISLAND_MARGIN)) {
      objects.push(...portPieces(painter, port, time));
    }
    for (const projectile of this.state.projectiles) {
      const at = projectilePosition(projectile);
      objects.push({ depth: painter.depth([at.x, at.y, at.z]), draw: (p) => drawProjectile(p, projectile) });
    }
    // Sorted by a point about half the ship's height up; its collision radius is a fair measure of its size
    const shipDepth = painter.depth([ship.x, ship.y, ship.radius]);
    const { pose } = this.sinking;
    if (ship.shipClass !== this.spriteClass) {
      this.spriteClass = ship.shipClass;
      this.shipSprite.destroy();
      this.shipSprite = new ShipSprite(ship.shipClass);
    }
    this.shipSprite.update(ship, camera, time, stage, {
      ...pose,
      tilt: pose.tilt + hitRoll(this.shots.shake(ship.id, time)),
    });
    // Its gold glow at a level reached under it, its hull lit over it
    this.levelUp.dress(this.shipSprite.sprite, camera, time);
    objects.push({
      depth: shipDepth,
      layers: [this.levelUp.glow, ...this.shipSprite.layers, this.levelUp.shine, this.fireLayer],
    });
    objects.sort((a, b) => b.depth - a.depth);
    const behindShip = this.drawLayers(objects, width, height);
    this.bots.sweep();
    this.chestSprites.sweep();

    // Smoke after flames: it rises from them and drifts over them
    this.fireLayer.clear();
    this.fire.drawFlames(this.firePainter);
    this.fire.drawSmoke(this.firePainter);
    // Shot effects behind the ship go to the layer right under its sprite; the rest over it
    this.shots.draw(behindShip, this.firePainter, shipDepth);
    this.repair.draw(this.firePainter);
    this.levelUp.draw(this.firePainter);
    this.barrage.draw(this.firePainter, time);

    // On the top layer, so nothing hides it
    this.overlay.clear();
    if (this.debug.route) drawRoute(this.overlayPainter, ship);
    if (this.debug.hulls) drawHulls(this.overlayPainter, this.state);

    this.arrows.begin();
    this.drawHpBars(others, targets, time);
    // Off the screen, where the story sends the player: the mark, or else the nearest of the prey brought in for them
    // and the loot it asks them to haul up; that on the screen too while the fog hides it
    const sendTo = storyGoal(this.state, this.state.player);
    if (sendTo && !ship.docked) {
      const hidden = (sendTo.kind === 'prey' || sendTo.kind === 'loot') && !ship.canSee(sendTo.x, sendTo.y);
      drawStoryPointer(this.hpBars, this.arrows, camera, ship, sendTo, width, height, time, hidden);
    }
    this.arrows.end();
    this.damageNumbers.update(dt, this.state, camera);
  }

  /**
   * Draws the sorted objects, far to near: a sprite can't go inside a Graphics, so each ship's sprite (and its fire),
   * each slice of the port's or an island's pictures, goes between two layers, the vector-drawn objects farther than
   * it in the one under it, the nearer ones in the next (opened only when there are some: sprites in a row share none).
   * The islands' shallows and the port's ground lie under all of it. Returns the painter of the layer right under the
   * player's ship
   */
  private drawLayers(objects: readonly SceneObject[], width: number, height: number) {
    const order: Container[] = [this.islandSprites.shallows];
    if (this.portSprites.loaded) order.push(this.portSprites.ground);
    order.push(this.scene);
    let painter = this.painter;
    let behindShip = this.painter;
    let used = 0;
    // Whether `painter` draws into the topmost layer so far, or a sprite has gone over it since
    let open = true;
    const next = () => {
      if (used === this.segments.length) {
        const graphics = new Graphics();
        this.segments.push({ graphics, painter: new Painter3D(graphics, this.camera) });
      }
      const segment = this.segments[used++];
      segment.graphics.clear();
      segment.painter.screenWidth = width;
      segment.painter.screenHeight = height;
      order.push(segment.graphics);
      painter = segment.painter;
      open = true;
    };
    for (const object of objects) {
      if ('draw' in object) {
        if (!open) next();
        object.draw(painter);
        continue;
      }
      if (object.layers.includes(this.fireLayer)) {
        // Shot effects behind the ship are drawn later, into the layer right under it
        if (!open) next();
        behindShip = painter;
      }
      order.push(...object.layers);
      open = false;
    }
    // Layers left over from a frame with more ships in sight stay empty
    for (const segment of this.segments.slice(used)) segment.graphics.clear();
    this.layers.removeChildren();
    this.layers.addChild(...order);
    return behindShip;
  }

  /** The view's settings as plain data, to keep between visits */
  get settings() {
    return {
      zoom: this.zoomLevel,
      ranges: this.showRanges,
      debug: { ...this.debug },
    };
  }

  /** Puts kept settings back: whatever of them is valid; the rest stays as it is */
  applySettings(saved: unknown) {
    if (typeof saved !== 'object' || saved === null) return;
    if ('zoom' in saved && typeof saved.zoom === 'number' && saved.zoom >= MIN_ZOOM && saved.zoom <= MAX_ZOOM) {
      this.zoomLevel = saved.zoom;
    }
    // Kept as one flag a weapon before the rings followed the weapon picked: that is left as it is
    if ('ranges' in saved && typeof saved.ranges === 'boolean') this.showRanges = saved.ranges;
    if ('debug' in saved) readFlags(saved.debug, NAV_DEBUG, this.debug);
  }

  /** Which way the screen's right and up point on the water: the maps turn the world as the camera does */
  get mapAxes() {
    const { rightX, rightY, fwdX, fwdY } = this.camera;
    return { rightX, rightY, upX: fwdX, upY: fwdY };
  }

  /** Zoom as a multiple of the default one: 1 is the normal view, 1.5 shows everything half as big again */
  get zoom() {
    return this.zoomLevel;
  }

  setZoom(level: number) {
    this.zoomLevel = level;
  }

  setSteering(held: boolean) {
    this.steering = held;
  }

  get isSteering() {
    return this.steering;
  }

  /** Whether the picked weapon's range rings are shown */
  get rangesShown() {
    return this.showRanges;
  }

  toggleRanges() {
    this.showRanges = !this.showRanges;
  }

  /** Which debug drawings are shown */
  get debugShown(): Readonly<Record<NavDebug, boolean>> {
    return this.debug;
  }

  toggleDebug(kind: NavDebug) {
    this.debug[kind] = !this.debug[kind];
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
      if (!isAfloat(unit) || unit.submerged || !ship.canSee(unit.x, unit.y)) continue;
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
   * unit attacks the player; a gold chevron over it when it is of a kind the story asks the player to sink (`targets`)
   */
  private drawHpBars(units: readonly Unit[], targets: readonly UnitKind[], time: number) {
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
      if (targets.includes(u.shipClass.id)) drawStoryChevron(g, this.arrows, { x: s.x, y }, time);
    }
  }

  /**
   * The gate nearest the camera, for its whirlpool in the sea's shader (one at a time: they stand at the map's far
   * sides), its eye lit as it is open to the ship's tier or not; none near
   */
  private waterGate(): WaterGate | null {
    const { camera } = this;
    let nearest: GatePlace | null = null;
    let distance = GATE_NEAR;
    for (const gate of this.state.world.gates) {
      const d = Math.hypot(gate.x - camera.focusX, gate.y - camera.focusY);
      if (d >= distance) continue;
      distance = d;
      nearest = gate;
    }
    if (!nearest) return null;
    const open = seaOpenTo(nearest.to, this.state.ship.shipClass.tier);
    return { x: nearest.x, y: nearest.y, radius: nearest.radius, open };
  }

  /**
   * This sea's boss or a mini-boss while it fights the player's ship: from the moment it goes for it till it gives up
   * or sinks, but for while the crew can't see it: under water, or in a cloud of its ink
   */
  private fightingBoss(): Ship | null {
    const { ship, ships } = this.state;
    const fighting = ships.find((other) => other.bot?.foe === ship.id && BOT_KINDS[other.bot.kind]?.boss);
    return fighting && !fighting.submerged && ship.canSee(fighting.x, fighting.y) ? fighting : null;
  }

  /** The spots a boss's shells are to land on (a player's own bombardment's glow gold, BarrageMarks) */
  private bossShells(): MarkedSpot[] {
    return this.state.shells
      .filter((shell) => shell.ordnance === null)
      .map(({ id, x, y, radius, firedAt, landsAt }) => ({ key: id, x, y, radius, from: firedAt, to: landsAt }));
  }

  /** The spots the monsters under water near the ship are to come up at, those the crew can see */
  private diveSpots(near: readonly Ship[]): MarkedSpot[] {
    const { ship } = this.state;
    const spots: MarkedSpot[] = [];
    for (const other of near) {
      const { diving } = other;
      const spot = diving?.spot;
      if (!diving || !spot || !ship.canSee(spot.x, spot.y)) continue;
      const { radius, markAt: from, surfaceAt: to } = diving;
      spots.push({ key: other.id, x: spot.x, y: spot.y, radius, from, to });
    }
    return spots;
  }

  /** The clouds of ink on the screen, darkening the water as each is shed, thinning away before it is gone */
  private inkClouds(): WaterLight[] {
    const { time, inks } = this.state;
    return inks
      .filter((cloud) => this.painter.isVisible(cloud.x, cloud.y, 0, cloud.reach))
      .slice(0, INK_CLOUDS)
      .map(({ x, y, radius, from, until }) => ({
        x,
        y,
        radius,
        shown: Math.min(1, (time - from) / INK_FADE.in, (until - time) / INK_FADE.out),
      }));
  }
}
