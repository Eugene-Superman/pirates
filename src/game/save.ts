import { FEATS, FEAT_IDS, rungsReached, type FeatId } from './account/feats';
import { captainBonus, isPassive, retakeMastery } from './account/mastery';
import { choosePortrait } from './account/portrait';
import type { ShipBonus } from './ships/bonus';
import { AMMO, AMMO_IDS, GUNS, GUN_IDS, type AmmoId, type GunId } from './combat/arsenal';
import { WEAPON_IDS, type WeaponId } from './combat/weapons';
import { STARTING_HOLD, chartSea, type Player } from './economy/player';
import { QUESTS, isQuest, questLimit, type QuestId } from './economy/quests';
import type { GameState } from './GameState';
import type { NavGrid } from './navigation/NavGrid';
import { routeClearance } from './navigation/pilot';
import { OUTFITS, OUTFIT_SLOTS, isOutfit, type OutfitId, type OutfitSlot } from './ships/outfit';
import { isTalent, learnTalents, xpForLevel, type TalentId } from './ships/talents';
import { GOOD_IDS, cargoCount, type Cargo } from './economy/cargo';
import { isItem, type ItemId } from './items/items';
import { QUICK_SLOTS, setQuickSlot } from './items/quickSlots';
import { isSailable } from './economy/shipyard';
import { Ship } from './ships/Ship';
import { SHIP_CLASSES, type ShipClassId } from './ships/shipClasses';
import { arrivalPoint } from './world/gates';
import { START } from './world/World';
import { START_ZONE, ZONE_IDS, isZone, type ZoneId } from './world/zones';
import { GOLD_REASONS, STAT_COUNTS, copyStats, type Stats } from './records/stats';
import { STORY, finishedStory, newStory, objectiveNeed, type StoryStepId } from './story/story';

/**
 * Bumped when the save's shape changes: an older save is read field by field, whatever still fits.
 * 2: the outfit, fitted and in the hold. 3: the ship's experience and talents. 4: talents with ranks (the tree to level
 * 20: older picks are forgotten, the XP kept), the cargo in the hold, the Captain's path. 5: the fleet: the ships laid
 * up in port, and the one sailed of any class a player can own. 6: the stats, the player's and every ship's (an older
save starts them at 0, but for the quests turned in, which the Captain's path counted). 7: the Corsair renamed the
Coastal Bark (`coastalBark`), the first of the European line. 8: gold earned at the arsenal in the stats (an older
save starts it at 0). 9: each ship's ammo at hand on the skill bar, two kinds a weapon (an older save's ship takes the
one loaded and the next it carries). 10: the sea the player is in, and the one their ship sailed in from (an older
save is in the starting waters); the holds made smaller. 11: the captain's mastery, the passives taken (an older save
has none). 12: the doubloons in the purse (an older save has none). 13: each quest the ship's that took it (an older
save's are the ship sailed's). 14: the captain's portrait (an older save has the first). 15: the items bought for
doubloons and the skill bar's quick slots (an older save has none). 16: the story, how far along it the player is (an
older save's is told to its end if the player was past the starting waters' first steps, else it starts, the prologue
seen); the Captain's path's steps marked once gone with it. 17: the seas the player has sailed (an older save's: every
sea up to the one it is in, along the gates). 18: how many times each quest was turned in (an older save has none: each
quest's prizes are still to come). 19: the rungs of each feat whose rewards were claimed (an older save's rungs
reached are claimed: their points were the captain's already)
 */
export const SAVE_VERSION = 19;
/** The first version whose talents fit the tree of now */
const RANKED_TALENTS = 4;
/** The first version whose quests are each their ship's */
const SHIP_QUESTS = 13;
/**
 * The first version with the holds of now: an older save's cargo, from a bigger hold, comes back whole, the hold
 * over-full (nothing more hauled aboard) till it is sold or thrown overboard
 */
const SMALL_HOLDS = 10;
/** Classes renamed since a version: an older save's ship of the old name sails as the new one */
const RENAMED_CLASSES: readonly { readonly before: number; readonly from: string; readonly to: ShipClassId }[] = [
  { before: 7, from: 'corsair', to: 'coastalBark' },
];
/** The first version that keeps the story */
const STORY_SAVED = 16;
/** The first version that keeps the seas the player has sailed */
const CHARTED_SAVED = 17;
/** The first version that keeps the feats' rewards claimed */
const FEATS_SAVED = 19;
/** Tavern quests the Captain's path asked of an older save for the ship after the starter sloop */
const OLD_PATH_QUESTS = 5;

/** A ship as plain data: its class, where it is, its hull, guns, ammo and outfit, its experience, talents and cargo */
export interface SavedShip {
  readonly shipClass: ShipClassId;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly hp: number;
  readonly docked: boolean;
  readonly guns: Readonly<Record<WeaponId, readonly (GunId | null)[]>>;
  readonly ammo: Partial<Record<AmmoId, number>>;
  readonly loaded: Readonly<Record<WeaponId, AmmoId>>;
  /** The ammo at hand on the skill bar, two places a weapon */
  readonly ammoBar: Readonly<Record<WeaponId, readonly (AmmoId | null)[]>>;
  readonly weapon: WeaponId;
  readonly outfit: Readonly<Record<OutfitSlot, OutfitId | null>>;
  readonly xp: number;
  /** Every talent taken, with its rank */
  readonly talents: Partial<Record<TalentId, number>>;
  readonly cargo: Cargo;
  /** What it has done (records/stats.ts) */
  readonly stats: Stats;
}

/**
 * A player's progress as plain data: their purse, hold (guns, outfit), quests and Captain's path, the ship they sail
 * and the ones laid up in port (economy/fleet.ts). No bots, chests or time: the sea is made afresh. Kept by the client
 * until there is a server, which will keep the same thing for every player
 */
export interface SaveData {
  readonly version: number;
  /** The sea the player is in (world/zones.ts): the game is made for it */
  readonly zone: ZoneId;
  /** The sea their ship has just sailed in from: it comes in off the gate back to it; null once it is in */
  readonly arrival: ZoneId | null;
  readonly player: {
    readonly gold: number;
    readonly doubloons: number;
    readonly hold: Partial<Record<GunId, number>>;
    readonly outfits: Partial<Record<OutfitId, number>>;
    /** The items bought for doubloons, by kind, and what is in each of the skill bar's quick slots */
    readonly items: Partial<Record<ItemId, number>>;
    readonly quickSlots: readonly (ItemId | null)[];
    readonly quests: readonly { readonly id: QuestId; readonly ship: ShipClassId; readonly kills: number }[];
    /** Quests turned in, all together and how many times each */
    readonly progress: { readonly questsDone: number; readonly turnedIn: Partial<Record<QuestId, number>> };
    /** How far along the story: the step on (`done` once all is told) by its id, so a step added doesn't move it */
    readonly story: {
      readonly prologue: boolean;
      readonly step: StoryStepId | 'done';
      readonly told: boolean;
      readonly counts: readonly number[];
      readonly closing: StoryStepId | null;
    };
    readonly fleet: readonly SavedShip[];
    readonly stats: Stats;
    /** The captain's mastery: the passives taken, in the order taken */
    readonly mastery: readonly string[];
    /** How many rungs of each feat's ladder the player has claimed the rewards of */
    readonly feats: Partial<Record<FeatId, number>>;
    /** The captain's portrait, by its number */
    readonly portrait: number;
    /** The seas the player has sailed */
    readonly charted: readonly ZoneId[];
  };
  readonly ship: SavedShip;
}

/** A ship as it is now, to keep */
export function saveShip(ship: Ship): SavedShip {
  return {
    shipClass: ship.shipClass.id,
    x: ship.x,
    y: ship.y,
    rotation: ship.rotation,
    hp: ship.hp,
    docked: ship.docked,
    guns: { cannon: [...ship.guns.cannon], harpoon: [...ship.guns.harpoon] },
    ammo: { ...ship.ammo },
    loaded: { ...ship.loaded },
    ammoBar: { cannon: [...ship.ammoBar.cannon], harpoon: [...ship.ammoBar.harpoon] },
    weapon: ship.weapon,
    outfit: { ...ship.outfit },
    xp: ship.xp,
    talents: Object.fromEntries(ship.talentRanks()),
    cargo: { ...ship.cargo },
    stats: copyStats(ship.stats),
  };
}

/** The player's progress now, to keep */
export function saveGame(state: GameState): SaveData {
  const { player, ship } = state;
  return {
    version: SAVE_VERSION,
    zone: state.world.zone,
    arrival: null,
    player: {
      gold: player.gold,
      doubloons: player.doubloons,
      hold: { ...player.hold },
      outfits: { ...player.outfits },
      items: { ...player.items },
      quickSlots: [...player.quickSlots],
      quests: player.quests.map((q) => ({ id: q.id, ship: q.ship, kills: q.kills })),
      progress: { questsDone: player.progress.questsDone, turnedIn: { ...player.progress.turnedIn } },
      story: {
        prologue: player.story.prologue,
        step: STORY[player.story.step]?.id ?? 'done',
        told: player.story.told,
        counts: [...player.story.counts],
        closing: player.story.closing === null ? null : STORY[player.story.closing].id,
      },
      fleet: [...player.fleet],
      stats: copyStats(player.stats),
      mastery: [...player.mastery],
      feats: { ...player.feats },
      portrait: player.portrait,
      charted: [...player.charted],
    },
    ship: saveShip(ship),
  };
}

// The save comes from the browser's storage: anything may be in it, so every field is checked before it is used
type Fields = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Fields | null {
  return isRecord(value) ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A saved number not below 0, or 0 */
function amount(value: unknown) {
  return Math.max(finite(value) ?? 0, 0);
}

/** Stats from a save, into `into`: every number checked, the rest left at 0 */
function readStats(data: unknown, into: Stats) {
  const fields = record(data);
  if (!fields) return;
  for (const key of STAT_COUNTS) into[key] = amount(fields[key]);
  const kills = record(fields.kills);
  for (const { id } of Object.values(SHIP_CLASSES)) {
    const n = count(kills?.[id]) ?? 0;
    if (n > 0) into.kills[id] = n;
  }
  const earned = record(fields.goldEarned);
  for (const reason of GOLD_REASONS) into.goldEarned[reason] = amount(earned?.[reason]);
  const volleys = record(fields.volleys);
  for (const weapon of WEAPON_IDS) into.volleys[weapon] = amount(volleys?.[weapon]);
}

function isGun(value: unknown): value is GunId {
  return typeof value === 'string' && value in GUNS;
}

function isAmmo(value: unknown): value is AmmoId {
  return typeof value === 'string' && value in AMMO;
}

/** A saved ship's class, under its name of now, if a player can sail it; null if not (a later version's) */
function sailable(value: unknown, version: number): ShipClassId | null {
  const renamed = RENAMED_CLASSES.find(({ before, from }) => version < before && value === from);
  const id = renamed ? renamed.to : value;
  return isSailable(id) ? id : null;
}

/** The sea a save is in, to make its game for: the starting waters for an older save, or none */
export function savedZone(data: unknown): ZoneId {
  const zone = record(data)?.zone;
  return isZone(zone) ? zone : START_ZONE;
}

/**
 * Puts a saved player's progress back into a new game (made for its sea, savedZone): what is valid of it, field by
 * field; the rest stays as a new player's. A ship that has just sailed in from another sea comes in off the gate back
 * to it. A ship saved on land or off the map comes back at START, a sunk one whole at START, a docked one in port.
 * The captain's mastery is taken again once the ships are in (their levels pay for it), the quests after it (it may
 * allow one more). Returns whether there was a save to load
 */
export function loadGame(state: GameState, nav: NavGrid, data: unknown): boolean {
  const save = record(data);
  if (!save || typeof save.version !== 'number') return false;
  const { player } = state;
  const purse = record(save.player);
  if (purse) loadPurse(player, purse);
  // Before the mastery: the rungs claimed pay for some of it
  loadFeats(player, purse, save.version);
  loadCharted(player, purse, state.world.zone, save.version);
  // The ships load with the passives as saved, so a talent point the mastery gives keeps its talent; the passives are
  // then checked against what the ships pay
  const taken = purse?.mastery;
  const mastery = Array.isArray(taken) ? taken.filter(isPassive) : [];
  loadShips(state, nav, save, save.version, captainBonus(mastery));
  retakeMastery(state, player, mastery);
  if (purse) loadQuests(state, player, purse.quests, save.version);
  loadStory(state, purse, save.version);
  return true;
}

/**
 * The purse of a save: gold and doubloons, the hold of guns, outfit and items, the quick slots, the Captain's path, the
 * stats, the portrait
 */
function loadPurse(player: Player, purse: Fields) {
  player.gold = count(purse.gold) ?? player.gold;
  player.doubloons = count(purse.doubloons) ?? player.doubloons;
  choosePortrait(player, count(purse.portrait) ?? player.portrait);
  const hold = record(purse.hold);
  if (hold) {
    for (const [gun, n] of Object.entries(hold)) {
      const stock = count(n);
      if (isGun(gun) && stock !== null && stock > 0) player.hold[gun] = stock;
    }
  }
  const outfits = record(purse.outfits);
  if (outfits) {
    for (const [id, n] of Object.entries(outfits)) {
      const stock = count(n);
      if (isOutfit(id) && stock !== null && stock > 0) player.outfits[id] = stock;
    }
  }
  const items = record(purse.items);
  if (items) {
    for (const [id, n] of Object.entries(items)) {
      const stock = count(n);
      if (isItem(id) && stock !== null && stock > 0) player.items[id] = stock;
    }
  }
  // After the items: a slot keeps only one the hold has, each in one slot at most
  const slots = purse.quickSlots;
  if (Array.isArray(slots)) {
    slots.slice(0, QUICK_SLOTS).forEach((id: unknown, slot) => {
      if (isItem(id) && !player.quickSlots.includes(id)) setQuickSlot(player, slot, id);
    });
  }
  const progress = record(purse.progress);
  if (progress) player.progress.questsDone = count(progress.questsDone) ?? 0;
  const turnedIn = record(progress?.turnedIn);
  if (turnedIn) {
    for (const [id, n] of Object.entries(turnedIn)) {
      const times = count(n);
      if (isQuest(id) && times !== null && times > 0) player.progress.turnedIn[id] = times;
    }
  }
  readStats(purse.stats, player.stats);
  // Kept before the stats were: the quests turned in, at least, are known
  player.stats.questsDone = Math.max(player.stats.questsDone, player.progress.questsDone);
}

/**
 * The rungs of each feat whose rewards the player has claimed, as saved, no more than the ladder has; after the stats.
 * An older save's: every rung reached, whose points it gave unasked
 */
function loadFeats(player: Player, purse: Fields | null, version: number) {
  const saved = record(purse?.feats);
  for (const id of FEAT_IDS) {
    const feat = FEATS[id];
    const rungs = version < FEATS_SAVED ? rungsReached(feat, player.stats) : (count(saved?.[id]) ?? 0);
    if (rungs > 0) player.feats[id] = Math.min(rungs, feat.goals.length);
  }
}

/**
 * The seas the player has sailed, as saved, to the sea the game is in (charted already). An older save's: every sea up
 * to the one it is in, as the gates lead from one to the next
 */
function loadCharted(player: Player, purse: Fields | null, zone: ZoneId, version: number) {
  const saved = version < CHARTED_SAVED ? ZONE_IDS.slice(0, ZONE_IDS.indexOf(zone) + 1) : purse?.charted;
  if (!Array.isArray(saved)) return;
  for (const id of saved as unknown[]) if (isZone(id)) chartSea(player, id);
}

/**
 * How far along the story: as saved, each count no more than its objective needs. An older save's, from before the
 * story, is told to its end if the player was past the starting waters' first steps (a ship of tier 1, the quests the
 * Captain's path asked, the Baron sunk), so it doesn't teach them again what they know; else it starts, the prologue
 * seen, the guns its first step asks for in the hold. After the ships: they tell how far the player had got
 */
function loadStory(state: GameState, purse: Fields | null, version: number) {
  const { player } = state;
  if (version < STORY_SAVED) {
    const steps: unknown = record(purse?.progress)?.steps;
    const baron = Array.isArray(steps) && steps.includes('baron');
    const ships = [state.ship.shipClass.id, ...player.fleet.map((kept) => kept.shipClass)];
    const ahead = ships.some((id) => SHIP_CLASSES[id].tier >= 1) || player.progress.questsDone >= OLD_PATH_QUESTS;
    if (ahead || baron) {
      player.story = finishedStory();
      return;
    }
    player.story = { ...newStory(), prologue: true };
    // The story's first step asks for the sloop's four cannons and four harpoon guns fitted, and an older sloop came
    // with two of each fitted: the rest go into the hold, as a new player's do
    for (const weapon of WEAPON_IDS) {
      const guns = GUN_IDS[weapon];
      const given = guns.find((gun) => (STARTING_HOLD[gun] ?? 0) > 0);
      if (!given) continue;
      const aboard = guns.reduce((sum, gun) => sum + (player.hold[gun] ?? 0), 0);
      const missing = (STARTING_HOLD[given] ?? 0) - state.ship.fittedGuns(weapon).length - aboard;
      if (missing > 0) player.hold[given] = (player.hold[given] ?? 0) + missing;
    }
    return;
  }
  const saved = record(purse?.story);
  if (!saved) return;
  const story = newStory();
  story.prologue = saved.prologue === true;
  const at = saved.step === 'done' ? STORY.length : STORY.findIndex((step) => step.id === saved.step);
  // A step a later version added: the story from its start
  if (at < 0) return;
  story.step = at;
  const step = STORY[at];
  const counts: unknown = saved.counts;
  if (step && saved.told === true) {
    story.told = true;
    story.counts = step.objectives.map((objective, i) =>
      Math.min(Array.isArray(counts) ? (count(counts[i]) ?? 0) : 0, objectiveNeed(objective)),
    );
  }
  const closing = STORY.findIndex((done) => done.id === saved.closing);
  story.closing = closing >= 0 && closing < at ? closing : null;
  player.story = story;
}

/**
 * The quests of a save, each its ship's: one the player has (an older save's, the ship sailed), with as many as a ship
 * may have at once
 */
function loadQuests(state: GameState, player: Player, quests: unknown, version: number) {
  if (!Array.isArray(quests)) return;
  player.quests = [];
  const limit = questLimit(state, player);
  const owned = new Set([state.ship.shipClass.id, ...player.fleet.map((kept) => kept.shipClass)]);
  for (const item of quests) {
    const quest = record(item);
    if (!quest || !isQuest(quest.id)) continue;
    const ship = version < SHIP_QUESTS ? state.ship.shipClass.id : sailable(quest.ship, version);
    if (!ship || !owned.has(ship)) continue;
    const its = player.quests.filter((q) => q.ship === ship);
    if (its.length >= limit || its.some((q) => q.id === quest.id)) continue;
    const kills = Math.min(count(quest.kills) ?? 0, QUESTS[quest.id].count);
    player.quests.push({ id: quest.id, ship, kills });
  }
}

/**
 * The ship sailed, where it is, and the ships laid up in port, each with the captain's mastery as saved. A class no
 * player can sail (a later version's) and only the purse is kept
 */
function loadShips(state: GameState, nav: NavGrid, save: Fields, version: number, captain: ShipBonus) {
  const { player } = state;
  const purse = record(save.player);
  const saved = record(save.ship);
  const sailedClass = saved && sailable(saved.shipClass, version);
  if (!saved || !sailedClass) return;
  let ship = state.ship;
  if (sailedClass !== ship.shipClass.id) {
    const sailed = new Ship(SHIP_CLASSES[sailedClass], ship.id);
    state.ships[state.ships.indexOf(ship)] = sailed;
    state.ship = sailed;
    ship = sailed;
  }
  ship.setCaptain(captain);
  stow(player, loadShip(ship, saved, version));

  const hp = count(saved.hp);
  const x = finite(saved.x);
  const y = finite(saved.y);
  const afloat = hp !== null && hp > 0;
  if (isZone(save.arrival)) {
    const spot = arrivalPoint(state, nav, save.arrival, routeClearance(ship)) ?? START;
    ship.x = spot.x;
    ship.y = spot.y;
    ship.rotation = Math.atan2(state.world.port.island.y - spot.y, state.world.port.island.x - spot.x);
    loadFleet(state, purse, version, captain);
    return;
  }
  const open = x !== null && y !== null && nav.clearanceAt(x, y) >= routeClearance(ship);
  if (afloat && open) {
    ship.x = x;
    ship.y = y;
    ship.rotation = finite(saved.rotation) ?? ship.rotation;
  } else {
    ship.x = START.x;
    ship.y = START.y;
  }
  if (afloat && saved.docked === true) {
    const { mooring } = state.world.port;
    ship.x = mooring.x;
    ship.y = mooring.y;
    ship.dock(mooring);
  }
  loadFleet(state, purse, version, captain);
}

/**
 * The ships laid up in port: one of each class, none of the sailed one's; each put through a ship of its class (with
 * the captain's mastery, for its talents), so what is kept is valid. After the ship sailed: the ammo is the player's
 * and goes with it (economy/fleet.ts), so a ship an older save laid up with some of its own hands it over
 */
function loadFleet(state: GameState, purse: Fields | null, version: number, captain: ShipBonus) {
  const { player, ship } = state;
  const fleet = purse?.fleet;
  if (!Array.isArray(fleet)) return;
  for (const item of fleet) {
    const laidUp = record(item);
    const id = laidUp && sailable(laidUp.shipClass, version);
    if (!laidUp || !id || id === ship.shipClass.id) continue;
    if (player.fleet.some((kept) => kept.shipClass === id)) continue;
    const kept = new Ship(SHIP_CLASSES[id], ship.id);
    kept.setCaptain(captain);
    stow(player, loadShip(kept, laidUp, version));
    ship.takeAmmo(kept);
    player.fleet.push({ ...saveShip(kept), docked: true });
  }
}

/** Guns a saved ship can't carry any more, into the player's hold */
function stow(player: Player, guns: readonly GunId[]) {
  for (const gun of guns) player.hold[gun] = (player.hold[gun] ?? 0) + 1;
}

/**
 * Puts a saved ship's fittings back into a ship of its class: guns, ammo, the weapon picked, experience and talents,
 * cargo, outfit and hull (a wrecked one comes back whole). What is not valid is left as the new ship's. Where it is
 * is the caller's. Returns the saved guns in slots its class no longer has: the player's hold takes them
 */
export function loadShip(ship: Ship, data: unknown, version: number): GunId[] {
  const left: GunId[] = [];
  const saved = record(data);
  if (!saved) return left;
  const guns = record(saved.guns);
  for (const weapon of WEAPON_IDS) {
    const slots: unknown = guns?.[weapon];
    if (!Array.isArray(slots)) continue;
    slots.forEach((gun: unknown, slot) => {
      const valid = isGun(gun) && GUNS[gun].weapon === weapon;
      if (slot >= ship.guns[weapon].length) {
        if (valid) left.push(gun);
      } else if (gun === null || valid) ship.fitGun(weapon, slot, gun);
    });
  }
  const ammo = record(saved.ammo);
  for (const weapon of WEAPON_IDS) {
    for (const id of AMMO_IDS[weapon]) {
      const n = ammo ? count(ammo[id]) : null;
      if (n !== null) ship.ammo[id] = n;
    }
  }
  const loaded = record(saved.loaded);
  for (const weapon of WEAPON_IDS) {
    const id = loaded?.[weapon];
    if (isAmmo(id) && AMMO[id].weapon === weapon) ship.loadAmmo(id);
  }
  // The bar as kept; an older save's (or a place not valid) as a new ship's with this ammo: the loaded one and the next
  ship.fillAmmoBar();
  const bar = record(saved.ammoBar);
  for (const weapon of WEAPON_IDS) {
    const places: unknown = bar?.[weapon];
    if (!Array.isArray(places) || places.length !== 2) continue;
    // Only the weapon's ammo aboard, each kind once. Put straight in, not by setAmmoSlot: that would load another in
    // place of a loaded one off the bar, and a ship holding fire for want of it must come back holding fire
    const [first, second] = places.map((id: unknown) =>
      isAmmo(id) && AMMO[id].weapon === weapon && ship.ammo[id] > 0 ? id : null,
    );
    ship.ammoBar[weapon] = [first ?? null, second !== first ? (second ?? null) : null];
  }
  // Straight in, not setWeapon: a loaded game starts with its guns loaded
  if (saved.weapon === 'cannon' || saved.weapon === 'harpoon') ship.weapon = saved.weapon;
  // Before the hull: the plating and Thick hull set how many hull points it has
  // A ship's XP beyond its class's last level is lost: the starter sloop stops at 10
  ship.xp = Math.min(count(saved.xp) ?? 0, xpForLevel(ship.shipClass.maxLevel));
  const talents = record(saved.talents);
  if (talents && version >= RANKED_TALENTS) {
    learnTalents(
      ship,
      Object.keys(talents)
        .filter(isTalent)
        .map((id) => [id, count(talents[id]) ?? 0] as const),
    );
  }
  // After the talents: a talent may make the hold bigger (the treasure's Deep hold)
  const cargo = record(saved.cargo);
  const room = version < SMALL_HOLDS ? Infinity : ship.holdSize;
  for (const id of GOOD_IDS) {
    const n = Math.min(count(cargo?.[id]) ?? 0, room - cargoCount(ship.cargo));
    if (n > 0) ship.cargo[id] = n;
  }
  const outfit = record(saved.outfit);
  for (const slot of OUTFIT_SLOTS) {
    const id = outfit?.[slot];
    if (isOutfit(id) && OUTFITS[id].slot === slot) ship.fitOutfit(slot, id);
  }

  const hp = count(saved.hp);
  if (hp !== null && hp > 0) ship.takeDamage(ship.maxHp - hp);
  readStats(saved.stats, ship.stats);
  return left;
}
