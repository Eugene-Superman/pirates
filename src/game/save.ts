import { AMMO, AMMO_IDS, GUNS, type AmmoId, type GunId } from './combat/arsenal';
import { WEAPON_IDS, type WeaponId } from './combat/weapons';
import { MAX_QUESTS, QUESTS, QUEST_IDS, type QuestId } from './economy/quests';
import type { GameState } from './GameState';
import type { NavGrid } from './navigation/NavGrid';
import { routeClearance } from './navigation/pilot';
import { OUTFITS, OUTFIT_SLOTS, isOutfit, type OutfitId, type OutfitSlot } from './ships/outfit';
import { TALENTS, isTalent, xpForLevel, type TalentId } from './ships/talents';
import { GOOD_IDS, cargoCount, type Cargo } from './economy/cargo';
import { isSailable, type PathStepId } from './economy/shipyard';
import { Ship } from './ships/Ship';
import { SHIP_CLASSES, type ShipClassId } from './ships/shipClasses';
import { START } from './world/World';
import { GOLD_REASONS, STAT_COUNTS, copyStats, type Stats } from './records/stats';

/**
 * Bumped when the save's shape changes: an older save is read field by field, whatever still fits.
 * 2: the outfit, fitted and in the hold. 3: the ship's experience and talents. 4: talents with ranks (the tree to level
 * 20: older picks are forgotten, the XP kept), the cargo in the hold, the Captain's path. 5: the fleet: the ships laid
 * up in port, and the one sailed of any class a player can own. 6: the stats, the player's and every ship's (an older
save starts them at 0, but for the quests turned in, which the Captain's path counted). 7: the Corsair renamed the
Coastal Bark (`coastalBark`), the first of the European line. 8: gold earned at the arsenal in the stats (an older
save starts it at 0). 9: each ship's ammo at hand on the skill bar, two kinds a weapon (an older save's ship takes the
one loaded and the next it carries)
 */
export const SAVE_VERSION = 9;
/** The first version whose talents fit the tree of now */
const RANKED_TALENTS = 4;
/** Classes renamed since a version: an older save's ship of the old name sails as the new one */
const RENAMED_CLASSES: readonly { readonly before: number; readonly from: string; readonly to: ShipClassId }[] = [
  { before: 7, from: 'corsair', to: 'coastalBark' },
];
/** Steps of the Captain's path marked once and kept (the rest are counted from the player and ship) */
const MARKED_STEPS: readonly PathStepId[] = ['sink', 'talent', 'repair', 'sell', 'baron'];

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
  readonly player: {
    readonly gold: number;
    readonly hold: Partial<Record<GunId, number>>;
    readonly outfits: Partial<Record<OutfitId, number>>;
    readonly quests: readonly { readonly id: QuestId; readonly kills: number }[];
    readonly progress: { readonly steps: readonly PathStepId[]; readonly questsDone: number };
    readonly fleet: readonly SavedShip[];
    readonly stats: Stats;
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
    player: {
      gold: player.gold,
      hold: { ...player.hold },
      outfits: { ...player.outfits },
      quests: player.quests.map((q) => ({ id: q.id, kills: q.kills })),
      progress: { steps: [...player.progress.steps], questsDone: player.progress.questsDone },
      fleet: [...player.fleet],
      stats: copyStats(player.stats),
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

/** Talents are put back rows first (signatures by their level), so each row finds its points spent before it */
function learnOrder(id: TalentId) {
  const talent = TALENTS[id];
  return talent.kind === 'branch' ? talent.row : talent.level;
}

/** A saved ship's class, under its name of now, if a player can sail it; null if not (a later version's) */
function sailable(value: unknown, version: number): ShipClassId | null {
  const renamed = RENAMED_CLASSES.find(({ before, from }) => version < before && value === from);
  const id = renamed ? renamed.to : value;
  return isSailable(id) ? id : null;
}

function isMarkedStep(value: unknown): value is PathStepId {
  return MARKED_STEPS.some((id) => id === value);
}

function isQuest(value: unknown): value is QuestId {
  return typeof value === 'string' && (QUEST_IDS as readonly string[]).includes(value);
}

/**
 * Puts a saved player's progress back into a new game: what is valid of it, field by field; the rest stays as a new
 * player's. A ship saved on land or off the map comes back at START, a sunk one whole at START, a docked one in port.
 * Returns whether there was a save to load
 */
export function loadGame(state: GameState, nav: NavGrid, data: unknown): boolean {
  const save = record(data);
  if (!save || typeof save.version !== 'number') return false;
  const { player } = state;

  const purse = record(save.player);
  if (purse) {
    player.gold = count(purse.gold) ?? player.gold;
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
    if (Array.isArray(purse.quests)) {
      player.quests = [];
      for (const item of purse.quests) {
        const quest = record(item);
        if (!quest || !isQuest(quest.id) || player.quests.length >= MAX_QUESTS) continue;
        if (player.quests.some((q) => q.id === quest.id)) continue;
        const kills = Math.min(count(quest.kills) ?? 0, QUESTS[quest.id].count);
        player.quests.push({ id: quest.id, kills });
      }
    }
    const progress = record(purse.progress);
    if (progress) {
      player.progress.questsDone = count(progress.questsDone) ?? 0;
      if (Array.isArray(progress.steps)) {
        for (const step of progress.steps) {
          if (isMarkedStep(step) && !player.progress.steps.includes(step)) player.progress.steps.push(step);
        }
      }
    }
    readStats(purse.stats, player.stats);
    // Kept before the stats were: the quests turned in, at least, are known
    player.stats.questsDone = Math.max(player.stats.questsDone, player.progress.questsDone);
  }

  // The ship sailed: a class no player can sail (a later version's) and only the purse is kept
  const saved = record(save.ship);
  const sailedClass = saved && sailable(saved.shipClass, save.version);
  if (!saved || !sailedClass) return true;
  let ship = state.ship;
  if (sailedClass !== ship.shipClass.id) {
    const sailed = new Ship(SHIP_CLASSES[sailedClass], ship.id);
    state.ships[state.ships.indexOf(ship)] = sailed;
    state.ship = sailed;
    ship = sailed;
  }
  loadShip(ship, saved, save.version);

  const hp = count(saved.hp);
  const x = finite(saved.x);
  const y = finite(saved.y);
  const afloat = hp !== null && hp > 0;
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

  // The ships laid up in port: one of each class, none of the sailed one's; each put through a ship of its class,
  // so what is kept is valid
  const fleet = purse?.fleet;
  if (Array.isArray(fleet)) {
    for (const item of fleet) {
      const laidUp = record(item);
      const id = laidUp && sailable(laidUp.shipClass, save.version);
      if (!laidUp || !id || id === ship.shipClass.id) continue;
      if (player.fleet.some((kept) => kept.shipClass === id)) continue;
      const kept = new Ship(SHIP_CLASSES[id], ship.id);
      loadShip(kept, laidUp, save.version);
      player.fleet.push({ ...saveShip(kept), docked: true });
    }
  }
  return true;
}

/**
 * Puts a saved ship's fittings back into a ship of its class: guns, ammo, the weapon picked, experience and talents,
 * cargo, outfit and hull (a wrecked one comes back whole). What is not valid is left as the new ship's. Where it is
 * is the caller's
 */
export function loadShip(ship: Ship, data: unknown, version: number) {
  const saved = record(data);
  if (!saved) return;
  const guns = record(saved.guns);
  for (const weapon of WEAPON_IDS) {
    const slots: unknown = guns?.[weapon];
    if (!Array.isArray(slots)) continue;
    ship.guns[weapon].forEach((_, slot) => {
      const gun: unknown = slots[slot];
      if (gun === null) ship.fitGun(weapon, slot, null);
      else if (isGun(gun) && GUNS[gun].weapon === weapon) ship.fitGun(weapon, slot, gun);
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
    // learnTalent keeps to the rules (points earned, a branch's rows in turn, a signature a milestone): rows first
    const ids = Object.keys(talents).filter(isTalent);
    ids.sort((a, b) => learnOrder(a) - learnOrder(b));
    for (const id of ids) {
      // Stops at the first refusal: a rank past the talent's last would loop on for as long as the save says
      const rank = count(talents[id]) ?? 0;
      for (let i = 0; i < rank && ship.learnTalent(id); i++);
    }
  }
  // After the talents: Quartermaster makes the hold bigger
  const cargo = record(saved.cargo);
  for (const id of GOOD_IDS) {
    const n = Math.min(count(cargo?.[id]) ?? 0, ship.holdSize - cargoCount(ship.cargo));
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
}
