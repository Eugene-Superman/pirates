import { AMMO, AMMO_IDS, GUNS, STARTING_AMMO, type AmmoId, type Gun, type GunId } from '../combat/arsenal';
import { WEAPON_IDS, type HoldReason, type TargetNature, type WeaponId } from '../combat/weapons';
import type { BotMind } from '../bots/brain';
import type { Cargo } from '../economy/cargo';
import { clamp, normalizeAngle } from '../lib/math';
import type { Point } from '../lib/geometry';
import { newPilotMemory, type Helm } from '../navigation/pilot';
import { hullReach, type Body, type Hull } from '../physics/hull';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../world/World';
import { MAX_HEALTH, damageStage, damagedSpeed, type DamageStage } from './damage';
import {
  OUTFITS,
  addShares,
  fittedPieces,
  grownStats,
  scaledBonus,
  type OutfitBonus,
  type OutfitId,
  type OutfitSlot,
  type ShipStats,
} from './outfit';
import { COMBAT_TIME } from './repair';
import { PERKS, TALENTS, levelOf, reloadShare, talentBlock, type TalentId } from './talents';
import type { ShipClass } from './shipClasses';
import { newStats, type Stats } from '../records/stats';

// Bounds for tuning the top speeds, world units per second (1 to 40 knots)
const MIN_TOP_SPEED = 10;
const MAX_TOP_SPEED = 400;
// Bounds for the view range, world units
const MIN_VIEW_RANGE = 100;
const MAX_VIEW_RANGE = 2000;

/**
 * Anything that sails under a pilot: the player's ship, the bots' ships, and sea monsters (a class of nature
 * `creature`, with jaws instead of guns). Movement, hull, weapons and repairs. How it looks is up to the view; shots are
 * run by combat/combat.ts, the way to its target by navigation/pilot.ts, bumping into things by physics/collisions.ts,
 * a bot's decisions by bots/brain.ts
 */
export class Ship implements Body {
  /** Unique among the ships of the game: what attacks and events refer to */
  readonly id: number;
  readonly shipClass: ShipClass;
  readonly nature: TargetNature;
  /** How far it sticks out of the water, world units */
  readonly height: number;
  x = 0;
  y = 0;
  rotation = 0;
  speed = 0;
  /** The class's figures as tuned with the debug buttons: what the outfit's shares are taken of */
  private tuned: ShipStats;
  /** The figures it sails and sees with: the class's, as tuned, grown by its outfit */
  private figures: ShipStats;
  /** The piece of outfit in each slot (ships/outfit.ts); null for none. Only players' ships are fitted out */
  readonly outfit: Record<OutfitSlot, OutfitId | null> = { sails: null, hull: null, rudder: null, lookout: null };
  /** Every point of experience the ship has earned (kills, quests): its level comes from it (ships/talents.ts) */
  xp = 0;
  /** The talents taken, with their ranks (ships/talents.ts). Only players' ships earn any */
  private readonly ranks = new Map<TalentId, number>();
  /** Game time its ability (a level 5 talent) can be used again */
  abilityReadyAt = 0;
  /** Broadside was used: the next volley does more damage */
  broadsideArmed = false;
  /** Game times Full sail ends, and a chain shot's slowing */
  fullSailUntil = 0;
  slowedUntil = 0;
  /** Second wind has mended the hull in this fight already */
  secondWindUsed = false;
  /** Hull points Damage control has mended short of a whole one */
  patchDue = 0;
  /** Relentless: the target of its last volleys, and how many in a row */
  relentless: { target: number | null; volleys: number } = { target: null, volleys: 0 };
  /** Game time Unsinkable is ready again */
  unsinkableReadyAt = 0;
  /** Share of its top speed it has this update: Full sail, a chain shot (stepTalents sets it) */
  speedFactor = 1;
  /** Share of its top speed the pilot sails at: bots cruise slower while nobody bothers them */
  throttle = 1;
  /** Chasing (or fleeing) something that moves: the pilot doesn't slow down on the way into its target */
  pursuing = false;
  /** Rough size for effects and the view; collisions use the hull */
  readonly radius: number;
  readonly hull: Hull;
  /** Hull points left out of maxHp. Damage takes them away */
  hp: number;
  /** Where the player sent the ship; null when it is not going anywhere */
  target: Point | null = null;
  /** Waypoints to the target round islands, planned by the pilot; the last one is where the ship stops */
  route: Point[] = [];
  /** What the pilot remembers between updates */
  readonly pilot = newPilotMemory();
  /** The weapon the ship fires: every gun of it that is loaded and in range, together, a volley */
  weapon: WeaponId = 'cannon';
  /** Seconds until the gun in each slot can fire again, by weapon */
  readonly reloads: Record<WeaponId, number[]>;
  /** Seconds until a monster can bite again */
  biteReload = 0;
  /** Game time a boss can fire its next barrage (combat/barrage.ts) */
  barrageReadyAt = 0;
  /** Goods in the hold, by kind (economy/cargo.ts): lost overboard when the ship goes down */
  readonly cargo: Cargo = {};
  /** What this ship has done under its player (records/stats.ts): kept with it, laid up or sailed */
  readonly stats: Stats = newStats();
  /** The gun in each of the class's slots, by weapon; null for an empty slot */
  readonly guns: Record<WeaponId, (GunId | null)[]>;
  /** Cannonballs and harpoons in the hold */
  readonly ammo: Record<AmmoId, number> = { ...STARTING_AMMO };
  /** The ammo each weapon fires */
  readonly loaded: Record<WeaponId, AmmoId> = { cannon: AMMO_IDS.cannon[0], harpoon: AMMO_IDS.harpoon[0] };
  /** The target the ship fires at, volley after volley, until told to stop or the target is gone; null for none */
  attackTarget: number | null = null;
  /** Why it isn't firing at its target right now (set by combat every update); null when it is, or has no target */
  holdReason: HoldReason | null = null;
  /** Who hit it last and hasn't been dealt with yet: combat sets it, a bot's brain takes it to fight back */
  lastHitBy: number | null = null;
  /** Game time until which it is in combat: it fired, or was fired at, less than COMBAT_TIME ago. No repairs till then */
  combatUntil = 0;
  /** Whether the crew is repairing the hull (ships/repair.ts) */
  repairing = false;
  /** Seconds since the last repair step */
  repairClock = 0;
  /** Gold owed to the crew for repairs, under one: paid once it adds up to a whole coin (ships/repair.ts) */
  repairDue = 0;
  /** Game time it was wrecked; null while afloat. A player's ship comes back some time after (Game) */
  wreckedAt: number | null = null;
  /** In port (world/port.ts): stopped by the pier, out of the fight, its player in the port's menus */
  docked = false;
  /** False from leaving port till it has sailed out of the harbour: it doesn't dock again at once */
  mayDock = true;
  /** How a bot thinks; null for a player's ship */
  bot: BotMind | null = null;

  constructor(shipClass: ShipClass, id: number) {
    this.id = id;
    this.shipClass = shipClass;
    this.nature = shipClass.nature;
    this.height = shipClass.height;
    this.radius = shipClass.radius;
    this.hull = shipClass.hull;
    const { maxSpeed, minSpeed, acceleration, deceleration, turnSpeed, viewRange, hp } = shipClass;
    this.tuned = { maxSpeed, minSpeed, acceleration, deceleration, turnSpeed, viewRange, maxHp: hp };
    this.figures = grownStats(this.tuned, addShares([]));
    this.hp = this.figures.maxHp;
    this.guns = { cannon: [...shipClass.startingGuns.cannon], harpoon: [...shipClass.startingGuns.harpoon] };
    this.reloads = { cannon: this.guns.cannon.map(() => 0), harpoon: this.guns.harpoon.map(() => 0) };
    // A ship with guns of one weapon only (a bot's) fires those
    if (this.guns.cannon.every((gun) => gun === null) && this.guns.harpoon.some((gun) => gun !== null)) {
      this.weapon = 'harpoon';
    }
  }

  get heading() {
    return this.rotation;
  }

  get vx() {
    return Math.cos(this.rotation) * this.speed;
  }

  get vy() {
    return Math.sin(this.rotation) * this.speed;
  }

  /** Bots never run out of ammo: their holds aren't counted */
  get infiniteAmmo() {
    return this.bot !== null;
  }

  /** Whether a point is close enough to be seen, not hidden in the fog of war */
  canSee(x: number, y: number) {
    return Math.hypot(x - this.x, y - this.y) <= this.viewRange;
  }

  /** Top speed of the intact ship, world units per second */
  get maxSpeed() {
    return this.figures.maxSpeed;
  }

  /** Top speed with the hull nearly gone, world units per second */
  get minSpeed() {
    return this.figures.minSpeed;
  }

  /** World units per second, each second */
  get acceleration() {
    return this.figures.acceleration;
  }

  get deceleration() {
    return this.figures.deceleration;
  }

  /** Radians per second */
  get turnSpeed() {
    return this.figures.turnSpeed;
  }

  /** How far the crew sees, world units; beyond it is the fog of war */
  get viewRange() {
    return this.figures.viewRange;
  }

  /** Hull points of the whole ship */
  get maxHp() {
    return this.figures.maxHp;
  }

  /** Places in the hold for goods: the class's, more with Quartermaster */
  get holdSize() {
    return this.shipClass.hold + PERKS.hold * this.rank('quartermaster');
  }

  /**
   * Fits a piece of outfit into its slot, or empties the slot (null); a piece of another slot is ignored. Its figures
   * change at once. Who may fit what, and where, is the shop's (economy/shop.ts)
   */
  fitOutfit(slot: OutfitSlot, id: OutfitId | null) {
    if (id !== null && OUTFITS[id].slot !== slot) return;
    this.outfit[slot] = id;
    this.refit();
  }

  /** Changes how far the crew sees by `delta` world units, before the outfit. For tuning with the debug buttons */
  tuneViewRange(delta: number) {
    this.tuned = { ...this.tuned, viewRange: clamp(this.tuned.viewRange + delta, MIN_VIEW_RANGE, MAX_VIEW_RANGE) };
    this.refit();
  }

  /**
   * The figures again, after the outfit, the talents or the tuning changed. The hull keeps its share of hit points:
   * whole stays whole
   */
  private refit() {
    const before = this.figures.maxHp;
    this.figures = this.grown(this.outfit);
    if (this.figures.maxHp !== before) this.hp = Math.round((this.hp / before) * this.figures.maxHp);
  }

  /** What its figures would be with a piece in a slot instead of the one there (null: the slot empty), for the shop */
  figuresWith(slot: OutfitSlot, id: OutfitId | null): ShipStats {
    return this.grown({ ...this.outfit, [slot]: id });
  }

  /** Its class's figures (as tuned) grown by an outfit and the talents taken */
  private grown(outfit: Readonly<Record<OutfitSlot, OutfitId | null>>) {
    const bonuses: OutfitBonus[] = fittedPieces(outfit).map(({ bonus }) => bonus);
    for (const [id, rank] of this.ranks) {
      const { bonus } = TALENTS[id];
      if (bonus) bonuses.push(scaledBonus(bonus, rank));
    }
    return grownStats(this.tuned, addShares(bonuses));
  }

  /** The fastest the ship can go now: between maxSpeed and minSpeed, by how much hull is left */
  get topSpeed() {
    return damagedSpeed(this.health, this.maxSpeed, this.minSpeed) * this.speedFactor;
  }

  /**
   * Changes the top speeds by world units per second (intact, nearly wrecked), before the outfit; min is kept between
   * 0 and max. For tuning with the debug buttons
   */
  tuneSpeeds(maxDelta: number, minDelta: number) {
    const maxSpeed = clamp(this.tuned.maxSpeed + maxDelta, MIN_TOP_SPEED, MAX_TOP_SPEED);
    const minSpeed = clamp(this.tuned.minSpeed + minDelta, 0, maxSpeed);
    this.tuned = { ...this.tuned, maxSpeed, minSpeed };
    this.refit();
  }

  /** Hull integrity in percent of MAX_HEALTH: what the damage stages and the speed go by */
  get health() {
    return (this.hp / this.maxHp) * MAX_HEALTH;
  }

  get damageStage(): DamageStage {
    return damageStage(this.health);
  }

  /** A sinking ship can't be steered any more */
  get isSinking() {
    return this.hp <= 0;
  }

  /** Sets hull integrity directly, in percent. For the debug buttons */
  setHealth(health: number) {
    this.setHp((clamp(health, 0, MAX_HEALTH) / MAX_HEALTH) * this.maxHp);
  }

  /** Takes hull points away: what a hit does */
  takeDamage(amount: number) {
    this.setHp(this.hp - amount);
  }

  /** Gives hull points back: what a repair step does */
  heal(amount: number) {
    this.setHp(this.hp + amount);
  }

  private setHp(hp: number) {
    this.hp = Math.round(clamp(hp, 0, this.maxHp));
    // Afloat again (the debug buttons): no longer a wreck waiting to come back
    if (!this.isSinking) this.wreckedAt = null;
    if (this.isSinking) {
      this.target = null;
      this.route = [];
      this.attackTarget = null;
      this.repairing = false;
    }
  }

  /** Whether it fired or was fired at less than COMBAT_TIME ago */
  inCombat(time: number) {
    return time < this.combatUntil;
  }

  /** It fired, or was fired at: in combat for COMBAT_TIME from now, and any repair stops */
  enterCombat(time: number) {
    // Bilge pumps: the crew gets to the repair sooner
    const length = COMBAT_TIME - PERKS.combatTime * this.rank('bilgePumps');
    this.combatUntil = Math.max(this.combatUntil, time + length);
    this.repairing = false;
  }

  /** Starts repairing the hull. Only out of combat (checked by ships/repair.ts every update) and with damage to mend */
  startRepair() {
    if (this.isSinking || this.hp >= this.maxHp || this.repairing) return;
    this.repairing = true;
    this.repairClock = 0;
  }

  stopRepair() {
    this.repairing = false;
  }

  /**
   * Picks the weapon to fire. Its guns start their reload over, as the crew runs to them: switching back and forth
   * doesn't fire one weapon's volley straight after the other's
   */
  setWeapon(weapon: WeaponId) {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    const share = reloadShare(this, weapon);
    for (const { gun, slot } of this.fittedGuns(weapon)) this.reloads[weapon][slot] = gun.reload * share;
  }

  /** Fire at a target with the selected weapon, every time a gun is loaded, until ceaseFire or the target is gone */
  attack(targetId: number) {
    if (this.isSinking || this.docked || targetId === this.id) return;
    this.attackTarget = targetId;
  }

  ceaseFire() {
    this.attackTarget = null;
    this.holdReason = null;
  }

  /**
   * Fits a gun of its weapon into a slot, or empties the slot (null). Anything else is ignored. A new gun starts
   * unloaded, so swapping guns mid-fight doesn't skip a reload
   */
  fitGun(weapon: WeaponId, slot: number, gun: GunId | null) {
    if (slot < 0 || slot >= this.guns[weapon].length) return;
    if (gun !== null && GUNS[gun].weapon !== weapon) return;
    this.guns[weapon][slot] = gun;
    this.reloads[weapon][slot] = gun === null ? 0 : GUNS[gun].reload;
  }

  /** The fitted guns of a weapon with their slots, in slot order */
  fittedGuns(weapon: WeaponId) {
    const fitted: { gun: Gun; slot: number }[] = [];
    this.guns[weapon].forEach((id, slot) => {
      if (id !== null) fitted.push({ gun: GUNS[id], slot });
    });
    return fitted;
  }

  /** How far the farthest-reaching fitted gun of a weapon reaches, world units; 0 with none fitted */
  range(weapon: WeaponId = this.weapon) {
    return this.fittedGuns(weapon).reduce((longest, { gun }) => Math.max(longest, this.reach(gun)), 0);
  }

  /**
   * How far every fitted gun of a weapon reaches, world units: the shortest gun's reach. Within it a volley fires all
   * the loaded guns; beyond it, out to `range`, only the guns that reach that far. 0 with none fitted
   */
  fullVolleyRange(weapon: WeaponId = this.weapon) {
    const guns = this.fittedGuns(weapon);
    return guns.length === 0 ? 0 : Math.min(...guns.map(({ gun }) => this.reach(gun)));
  }

  /** How far a gun of this ship reaches, world units: the gun's own reach, more with Long guns */
  reach(gun: Gun) {
    return gun.range * (1 + PERKS.range * this.rank('longGuns'));
  }

  /** The ship's level from its XP, 1 to its class's `maxLevel` */
  get level() {
    return levelOf(this.xp, this.shipClass.maxLevel);
  }

  /** The rank of a talent: 0 if not taken, 1 for a signature talent taken */
  rank(id: TalentId) {
    return this.ranks.get(id) ?? 0;
  }

  hasTalent(id: TalentId) {
    return this.rank(id) > 0;
  }

  /** Every talent taken, with its rank */
  talentRanks(): ReadonlyMap<TalentId, number> {
    return this.ranks;
  }

  /** Its ability: the level 5 signature talent picked, used with a key; null without one */
  get ability(): TalentId | null {
    for (const id of this.ranks.keys()) {
      const talent = TALENTS[id];
      if (talent.kind === 'signature' && talent.active) return id;
    }
    return null;
  }

  /**
   * Takes a talent: a rank of a branch talent for a talent point, or the signature talent of a milestone reached
   * (ships/talents.ts, talentBlock, has the rules). False if it can't
   */
  learnTalent(id: TalentId) {
    if (talentBlock(this, id) !== null) return false;
    this.ranks.set(id, this.rank(id) + 1);
    this.refit();
    return true;
  }

  /** Forgets every talent taken: the shipwright's work (economy/shop.ts), to pick again */
  forgetTalents() {
    this.ranks.clear();
    this.broadsideArmed = false;
    this.fullSailUntil = 0;
    this.patchDue = 0;
    this.relentless = { target: null, volleys: 0 };
    this.refit();
  }

  /** Picks the ammo its weapon fires from now on */
  loadAmmo(ammo: AmmoId) {
    this.loaded[AMMO[ammo].weapon] = ammo;
  }

  /** Puts ammo in the hold (or takes it out, for a negative count). For testing now; bought later */
  addAmmo(ammo: AmmoId, count: number) {
    this.ammo[ammo] = Math.max(0, this.ammo[ammo] + count);
  }

  /** Sends the ship somewhere; the pilot finds the way round islands and other ships */
  setTarget(x: number, y: number) {
    if (this.isSinking || this.docked) return;
    const reach = hullReach(this.hull);
    this.target = { x: clamp(x, reach, WORLD_WIDTH - reach), y: clamp(y, reach, WORLD_HEIGHT - reach) };
  }

  /** Stops going anywhere */
  clearTarget() {
    this.target = null;
    this.route = [];
  }

  /** Comes into port (world/port.ts decides when): it stops firing and sails on to its berth, where it lies */
  dock(berth: Point) {
    this.ceaseFire();
    // Before it is docked: a docked ship takes no orders
    this.setTarget(berth.x, berth.y);
    this.docked = true;
  }

  /** Leaves port; it may not dock again till it has sailed out of the harbour */
  undock() {
    this.docked = false;
    this.mayDock = false;
  }

  /** Back afloat, whole, at (x, y): a wrecked player's ship comes back. Guns and ammo are kept */
  respawn(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.speed = 0;
    this.hp = this.maxHp;
    this.clearTarget();
    this.ceaseFire();
    for (const weapon of WEAPON_IDS) this.reloads[weapon].fill(0);
    this.combatUntil = 0;
    this.repairing = false;
    this.lastHitBy = null;
    this.wreckedAt = null;
    this.docked = false;
    this.mayDock = true;
    this.fullSailUntil = 0;
    this.slowedUntil = 0;
    this.secondWindUsed = false;
    this.patchDue = 0;
    this.relentless = { target: null, volleys: 0 };
  }

  /** Turns towards the helm's heading no faster than turnSpeed, speeds up or slows down towards its speed, and moves */
  steer(dt: number, helm: Helm) {
    const angleDiff = normalizeAngle(helm.heading - this.rotation);
    const maxTurn = this.turnSpeed * dt;
    this.rotation = normalizeAngle(this.rotation + clamp(angleDiff, -maxTurn, maxTurn));

    const rate = helm.speed > this.speed ? this.acceleration : this.deceleration;
    this.speed += clamp(helm.speed - this.speed, -rate * dt, rate * dt);

    this.x += Math.cos(this.rotation) * this.speed * dt;
    this.y += Math.sin(this.rotation) * this.speed * dt;
  }
}
