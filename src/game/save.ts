import { AMMO, AMMO_IDS, GUNS, type AmmoId, type GunId } from './combat/arsenal';
import { WEAPON_IDS, type WeaponId } from './combat/weapons';
import { MAX_QUESTS, QUESTS, QUEST_IDS, type QuestId } from './economy/quests';
import type { GameState } from './GameState';
import type { NavGrid } from './navigation/NavGrid';
import { routeClearance } from './navigation/pilot';
import type { ShipClassId } from './ships/shipClasses';
import { START } from './world/World';

/** Bumped when the save's shape changes: an older save is read field by field, whatever still fits */
export const SAVE_VERSION = 1;

/**
 * A player's progress as plain data: their purse, hold and quests, and their ship (where it is, its hull, its guns and
 * ammo). No bots, chests or time: the sea is made afresh. Kept by the client until there is a server, which will keep
 * the same thing for every player
 */
export interface SaveData {
  readonly version: number;
  readonly player: {
    readonly gold: number;
    readonly hold: Partial<Record<GunId, number>>;
    readonly quests: readonly { readonly id: QuestId; readonly kills: number }[];
  };
  readonly ship: {
    readonly shipClass: ShipClassId;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly hp: number;
    readonly docked: boolean;
    readonly guns: Readonly<Record<WeaponId, readonly (GunId | null)[]>>;
    readonly ammo: Partial<Record<AmmoId, number>>;
    readonly loaded: Readonly<Record<WeaponId, AmmoId>>;
    readonly weapon: WeaponId;
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
      quests: player.quests.map((q) => ({ id: q.id, kills: q.kills })),
    },
    ship: {
      shipClass: ship.shipClass.id,
      x: ship.x,
      y: ship.y,
      rotation: ship.rotation,
      hp: ship.hp,
      docked: ship.docked,
      guns: { cannon: [...ship.guns.cannon], harpoon: [...ship.guns.harpoon] },
      ammo: { ...ship.ammo },
      loaded: { ...ship.loaded },
      weapon: ship.weapon,
    },
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

function isGun(value: unknown): value is GunId {
  return typeof value === 'string' && value in GUNS;
}

function isAmmo(value: unknown): value is AmmoId {
  return typeof value === 'string' && value in AMMO;
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
  const { player, ship } = state;

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
  }

  // A ship of another class (a later version's) has other slots: only the purse is kept then
  const saved = record(save.ship);
  if (!saved || saved.shipClass !== ship.shipClass.id) return true;
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
  if (saved.weapon === 'cannon' || saved.weapon === 'harpoon') ship.setWeapon(saved.weapon);

  const hp = count(saved.hp);
  const x = finite(saved.x);
  const y = finite(saved.y);
  const afloat = hp !== null && hp > 0;
  const open = x !== null && y !== null && nav.clearanceAt(x, y) >= routeClearance(ship);
  if (afloat && open) {
    ship.x = x;
    ship.y = y;
    ship.rotation = finite(saved.rotation) ?? ship.rotation;
    ship.takeDamage(ship.maxHp - hp);
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
  return true;
}
