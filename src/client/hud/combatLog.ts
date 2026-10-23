import {
  AMMO,
  GUNS,
  SHIP_CLASSES,
  WEAPONS,
  findUnit,
  type AmmoId,
  type DieResult,
  type GameEvent,
  type GameState,
  type Strike,
  type UnitKind,
  QUESTS,
} from '../../game';

/**
 * What an entry is about: damage the player did or took, a unit they sank, their own ship going down, a repair, gold,
 * or a note (where an earlier visit's entries end)
 */
export type LogKind = 'dealt' | 'taken' | 'kill' | 'death' | 'repair' | 'gold' | 'note';
const LOG_KINDS = new Set<unknown>(['dealt', 'taken', 'kill', 'death', 'repair', 'gold', 'note']);
const TONES = new Set<unknown>(['crit', 'miss', 'plain']);
const NUMBER_STATS = [
  'dealt',
  'volleys',
  'dice',
  'crits',
  'misses',
  'best',
  'taken',
  'hitsTaken',
  'repaired',
  'deaths',
  'gold',
] as const;

/** The log's tabs: everything, the player's blows, the blows they took, the rest (kills, losses, repairs, gold) */
export const LOG_FILTERS = ['all', 'dealt', 'taken', 'other'] as const;
export type LogFilter = (typeof LOG_FILTERS)[number];

export interface LogEntry {
  readonly kind: LogKind;
  /** Game time, seconds */
  readonly time: number;
  /** One line: who, whom, how much */
  summary: string;
  /** Every die of it, the sum, the share for the target, the hull left */
  details: string[];
  /** A critical hit and a miss stand out */
  readonly tone: 'crit' | 'miss' | 'plain';
}

/** Totals since the first game kept in this browser */
export interface LogStats {
  dealt: number;
  volleys: number;
  dice: number;
  crits: number;
  misses: number;
  best: number;
  taken: number;
  hitsTaken: number;
  repaired: number;
  deaths: number;
  /** Gold earned: bounties, chests, quests */
  gold: number;
  /** Units sunk, by name */
  readonly sunk: Map<string, number>;
  /** Shots fired, by ammo */
  readonly ammo: Map<AmmoId, number>;
}

const MAX_ENTRIES = 500; // the oldest go first
const DICE_PER_LINE = 3;
const DICE_LISTED = 9; // a volley of more dice is summed up gun by gun instead
const REPAIR_JOIN = 1.5; // seconds: repair steps closer than this are one entry, updated as it goes

export function unitName(kind: UnitKind) {
  return SHIP_CLASSES[kind].name;
}

function clock(time: number) {
  const s = Math.floor(time);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What one die did, with its arithmetic: "Cannon I d10: 7+1 = 8", "… 10, crit 2×10+1 = 21", "… 1, miss" */
function dieText(d: DieResult, bonus: number) {
  const name = d.gun ? GUNS[d.gun].name : 'Jaws';
  const head = `${name} d${d.die}: ${d.roll}`;
  if (d.damage === 0) return `${head}, miss`;
  if (d.damage !== d.roll + bonus) {
    const multiplier = (d.damage - bonus) / d.die;
    return `${head}, crit ${multiplier}×${d.die}${bonus ? `+${bonus}` : ''} = ${d.damage}`;
  }
  return bonus ? `${head}+${bonus} = ${d.damage}` : `${head} = ${d.damage}`;
}

/** The dice of a strike, a few to a line; a big broadside gun by gun instead */
function diceLines(strike: Strike) {
  const { dice, bonus } = strike;
  if (dice.length <= DICE_LISTED) {
    const lines: string[] = [];
    for (let i = 0; i < dice.length; i += DICE_PER_LINE) {
      lines.push(
        dice
          .slice(i, i + DICE_PER_LINE)
          .map((d) => dieText(d, bonus))
          .join('  ·  '),
      );
    }
    return lines;
  }
  const byGun = new Map<string, { count: number; sum: number; crits: number; misses: number }>();
  for (const d of dice) {
    const name = d.gun ? GUNS[d.gun].name : 'Jaws';
    const total = byGun.get(name) ?? { count: 0, sum: 0, crits: 0, misses: 0 };
    total.count++;
    total.sum += d.damage;
    if (d.damage === 0) total.misses++;
    else if (d.damage !== d.roll + bonus) total.crits++;
    byGun.set(name, total);
  }
  return [...byGun].map(
    ([name, t]) => `${name} ×${t.count}: ${t.sum}  (${plural(t.crits, 'crit', 'crits')}, ${t.misses} missed)`,
  );
}

/** "2 cannons, Cannonball I (+1)", "a bite" */
function means(strike: Strike) {
  const n = strike.dice.length;
  if (strike.source === 'bite') return 'a bite';
  const guns = strike.source === 'cannon' ? plural(n, 'cannon', 'cannons') : plural(n, 'harpoon gun', 'harpoon guns');
  return strike.ammo ? `${guns}, ${AMMO[strike.ammo].name} (+${strike.bonus})` : guns;
}

/** The sum of the dice, the share the target takes, and what is left of it */
function sumLine(strike: Strike, amount: number, hull: string) {
  const sum = strike.dice.reduce((total, d) => total + d.damage, 0);
  const share =
    strike.share < 1 && strike.source !== 'bite'
      ? ` × ${Math.round(strike.share * 100)}% (${WEAPONS[strike.source].name.toLowerCase()} aren't made for it) = ${amount}`
      : '';
  return `Sum ${sum}${share}  ·  ${hull}`;
}

/**
 * The player's combat log: every blow they dealt or took with all its dice, the units they sank, their own ship going
 * down and their repairs, as lines of text, plus totals. Client state, made from the game's events: the game itself
 * keeps no history
 */
export class CombatLog {
  readonly entries: LogEntry[] = [];
  readonly stats: LogStats = {
    dealt: 0,
    volleys: 0,
    dice: 0,
    crits: 0,
    misses: 0,
    best: 0,
    taken: 0,
    hitsTaken: 0,
    repaired: 0,
    deaths: 0,
    gold: 0,
    sunk: new Map(),
    ammo: new Map(),
  };
  /** Changes with every new or updated entry, so the view rebuilds its lines only then */
  version = 0;
  private repair: { entry: LogEntry; amount: number; steps: number; last: number } | null = null;

  /** Reads what happened in the game's last update; call once per update */
  record(state: GameState) {
    for (const event of state.events) this.read(event, state);
  }

  private read(event: GameEvent, state: GameState) {
    const me = state.ship.id;
    const { stats } = this;
    switch (event.type) {
      case 'shot':
        if (event.shooterId === me)
          stats.ammo.set(event.ammo, (stats.ammo.get(event.ammo) ?? 0) + event.muzzles.length);
        break;
      case 'damage': {
        const { strike, amount } = event;
        const target = findUnit(state, event.targetId);
        const hull = `${unitName(event.targetKind)} ${target ? `${target.hp}/${target.maxHp}` : 'sunk'}`;
        const tone = amount === 0 ? 'miss' : event.crits > 0 ? 'crit' : 'plain';
        const details = [...diceLines(strike), sumLine(strike, amount, hull)];
        if (event.attackerId === me) {
          stats.dealt += amount;
          stats.volleys++;
          stats.dice += event.guns;
          stats.crits += event.crits;
          stats.misses += event.misses;
          stats.best = Math.max(stats.best, amount);
          const result = amount === 0 ? 'miss' : `${amount}${event.crits > 0 ? ' crit!' : ''}`;
          this.add(
            'dealt',
            state.time,
            `You → ${unitName(event.targetKind)}: ${result}  ·  ${means(strike)}`,
            details,
            tone,
          );
        } else if (event.targetId === me) {
          stats.taken += amount;
          stats.hitsTaken++;
          const who = unitName(strike.attackerKind);
          const what = strike.source === 'bite' ? `${who} bit you` : `${who} → you`;
          const result = amount === 0 ? 'miss' : `−${amount}${event.crits > 0 ? ' crit!' : ''}`;
          this.add('taken', state.time, `${what}: ${result}  ·  ${means(strike)}`, details, tone);
        }
        break;
      }
      case 'destroyed': {
        const name = unitName(event.kind);
        if (event.targetId === me) {
          stats.deaths++;
          this.add('death', state.time, `Your ship went down: ${unitName(event.attackerKind)} sank it`, [], 'plain');
        } else if (event.attackerId === me) {
          stats.sunk.set(name, (stats.sunk.get(name) ?? 0) + 1);
          const verb = SHIP_CLASSES[event.kind].nature === 'creature' ? 'killed' : 'sank';
          this.add('kill', state.time, `You ${verb} the ${name.toLowerCase()}`, [], 'plain');
        }
        break;
      }
      case 'repair':
        if (event.shipId === me) this.repaired(event.amount, state);
        break;
      case 'gold': {
        if (event.shipId !== me) break;
        stats.gold += event.amount;
        const why =
          event.reason === 'bounty' && event.kind
            ? `Bounty for the ${unitName(event.kind).toLowerCase()}`
            : event.reason === 'quest' && event.quest
              ? `Quest "${QUESTS[event.quest].title}" turned in`
              : 'A chest hauled aboard';
        this.add('gold', state.time, `${why}: +${event.amount} gold`, [], 'plain');
        break;
      }
      default:
    }
  }

  /** Repair steps a moment apart are one entry, its numbers growing as the repair goes on */
  private repaired(amount: number, state: GameState) {
    this.stats.repaired += amount;
    const { ship, time } = state;
    let repair = this.repair;
    if (!repair || time - repair.last > REPAIR_JOIN || this.entries.at(-1) !== repair.entry) {
      const entry: LogEntry = { kind: 'repair', time, summary: '', details: [], tone: 'plain' };
      repair = { entry, amount: 0, steps: 0, last: time };
      this.repair = repair;
      this.push(entry);
    }
    repair.amount += amount;
    repair.steps++;
    repair.last = time;
    repair.entry.summary = `[${clock(repair.entry.time)}] Repaired +${repair.amount} hull in ${repair.steps} s`;
    repair.entry.details = [`Hull ${ship.hp}/${ship.maxHp}`];
    this.version++;
  }

  private add(kind: LogKind, time: number, summary: string, details: string[], tone: LogEntry['tone']) {
    this.push({ kind, time, summary: `[${clock(time)}] ${summary}`, details, tone });
  }

  /** The log as plain data, to keep between visits */
  toData() {
    const numbers = Object.fromEntries(NUMBER_STATS.map((key) => [key, this.stats[key]]));
    return {
      entries: this.entries.map((e) => ({ ...e, details: [...e.details] })),
      stats: { ...numbers, sunk: [...this.stats.sunk], ammo: [...this.stats.ammo] },
    };
  }

  /**
   * Puts a kept log back (what is valid of it), with a note where it ends: the next entries are this visit's. Their
   * times are each visit's own game time
   */
  restore(data: unknown) {
    if (!isRecord(data)) return;
    if (Array.isArray(data.entries)) {
      for (const item of data.entries) {
        const entry = readEntry(item);
        if (entry) this.entries.push(entry);
      }
      if (this.entries.length > 0) {
        this.push({ kind: 'note', time: 0, summary: '— a new visit —', details: [], tone: 'plain' });
      }
    }
    if (isRecord(data.stats)) {
      const { stats } = data;
      for (const key of NUMBER_STATS) {
        const value = stats[key];
        if (typeof value === 'number' && Number.isFinite(value)) this.stats[key] = value;
      }
      for (const [name, n] of pairs(stats.sunk)) this.stats.sunk.set(name, n);
      for (const [id, n] of pairs(stats.ammo)) if (isAmmo(id)) this.stats.ammo.set(id, n);
    }
    this.version++;
  }

  private push(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.version++;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLogKind(value: unknown): value is LogKind {
  return LOG_KINDS.has(value);
}

function isTone(value: unknown): value is LogEntry['tone'] {
  return TONES.has(value);
}

function isAmmo(value: string): value is AmmoId {
  return value in AMMO;
}

/** A kept entry, if it is one */
function readEntry(item: unknown): LogEntry | null {
  if (!isRecord(item)) return null;
  const { kind, time, summary, details, tone } = item;
  if (!isLogKind(kind) || !isTone(tone) || typeof time !== 'number' || typeof summary !== 'string') return null;
  const lines = Array.isArray(details) ? details.filter((line): line is string => typeof line === 'string') : [];
  return { kind, time, summary, details: lines, tone };
}

/** Kept [name, count] pairs of a total, the valid ones */
function pairs(value: unknown): [string, number][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (pair): pair is [string, number] =>
      Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number' && Number.isFinite(pair[1]),
  );
}

/** Whether an entry shows under a tab */
export function inFilter(entry: LogEntry, filter: LogFilter) {
  if (filter === 'all') return true;
  if (filter === 'other') return entry.kind !== 'dealt' && entry.kind !== 'taken';
  return entry.kind === filter;
}

/** The totals, a few lines of them */
export function statsLines(stats: LogStats): string[] {
  const missRate = stats.dice > 0 ? Math.round((stats.misses / stats.dice) * 100) : 0;
  const sunk = [...stats.sunk].map(([name, n]) => `${name} ×${n}`).join(', ') || 'nothing yet';
  const ammo = [...stats.ammo].map(([id, n]) => `${AMMO[id].name} ×${n}`).join(', ') || 'none';
  return [
    `Dealt ${stats.dealt} in ${plural(stats.volleys, 'volley', 'volleys')}  ·  best ${stats.best}  ·  ${plural(stats.crits, 'crit', 'crits')}  ·  ${missRate}% of ${stats.dice} dice missed`,
    `Taken ${stats.taken} in ${plural(stats.hitsTaken, 'hit', 'hits')}  ·  repaired ${stats.repaired}  ·  went down ${stats.deaths}×  ·  gold earned ${stats.gold}`,
    `Sunk: ${sunk}`,
    `Shots fired: ${ammo}`,
  ];
}
