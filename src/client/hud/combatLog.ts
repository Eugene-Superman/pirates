import {
  AMMO,
  GOODS,
  GOOD_IDS,
  GUNS,
  SHIP_CLASSES,
  WEAPONS,
  captainsPath,
  findUnit,
  type Cargo,
  type AmmoId,
  type DieResult,
  type GameEvent,
  type GameState,
  type Strike,
  type UnitKind,
  QUESTS,
  TALENTS,
  ZONES,
} from '../../game';
import { t } from '../i18n/i18n';
import { questTitle } from './questText';

/**
 * What an entry is about: damage the player did or took, a unit they sank, their own ship going down, a repair, gold,
 * a level reached or a talent at work, or a note (where an earlier visit's entries end)
 */
export type LogKind = 'dealt' | 'taken' | 'kill' | 'death' | 'repair' | 'gold' | 'level' | 'note';
const LOG_KINDS = new Set<unknown>(['dealt', 'taken', 'kill', 'death', 'repair', 'gold', 'level', 'note']);
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
  'repairGold',
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
  /** Gold paid the crew for repairs at sea */
  repairGold: number;
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

/** A unit's name, in the player's language */
export function unitName(kind: UnitKind) {
  return t(SHIP_CLASSES[kind].name);
}

function clock(time: number) {
  const s = Math.floor(time);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What one die did, with its arithmetic: "Cannon I d10: 7+1 = 8", "… 10, crit 2×10+1 = 21", "… 1, miss" */
function dieText(d: DieResult, bonus: number) {
  const name = t(d.gun ? GUNS[d.gun].name : 'Jaws');
  const head = `${name} d${d.die}: ${d.roll}`;
  if (d.damage === 0) return `${head}, ${t('miss')}`;
  if (d.damage !== d.roll + bonus) {
    const multiplier = (d.damage - bonus) / d.die;
    return `${head}, ${t('crit')} ${multiplier}×${d.die}${bonus ? `+${bonus}` : ''} = ${d.damage}`;
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
    const name = t(d.gun ? GUNS[d.gun].name : 'Jaws');
    const total = byGun.get(name) ?? { count: 0, sum: 0, crits: 0, misses: 0 };
    total.count++;
    total.sum += d.damage;
    if (d.damage === 0) total.misses++;
    else if (d.damage !== d.roll + bonus) total.crits++;
    byGun.set(name, total);
  }
  return [...byGun].map(
    ([name, total]) =>
      `${name} ×${total.count}: ${total.sum}  (${t('{n} crit|{n} crits', { n: total.crits })}, ${t('{n} missed', { n: total.misses })})`,
  );
}

/** Goods by kind in a few words: "3 Cloth, 1 Spices" */
export function goodsText(goods: Cargo) {
  return GOOD_IDS.flatMap((id) => {
    const n = goods[id] ?? 0;
    return n > 0 ? [`${n} ${t(GOODS[id].name)}`] : [];
  }).join(', ');
}

/** "2 cannons, Cannonball I (+1)", "… (+2, Steady hands)", "a bite", "a mortar shell" */
function means(strike: Strike) {
  const n = strike.dice.length;
  if (strike.source === 'bite') return t('a bite');
  if (strike.source === 'shell') return t('a mortar shell');
  const guns =
    strike.source === 'cannon' ? t('{n} cannon|{n} cannons', { n }) : t('{n} harpoon gun|{n} harpoon guns', { n });
  const steady = strike.talents.includes('steadyHands') ? `, ${t(TALENTS.steadyHands.name)}` : '';
  return strike.ammo ? `${guns}, ${t(AMMO[strike.ammo].name)} (+${strike.bonus}${steady})` : guns;
}

/**
 * The sum of the dice, what scales it (the share the target takes, the attacker's talents, the target's guard), and
 * what is left of the target
 */
function sumLine(event: DamageEvent, hull: string) {
  const { strike, amount } = event;
  const sum = strike.dice.reduce((total, d) => total + d.damage, 0);
  const parts: string[] = [];
  if (strike.share < 1 && (strike.source === 'cannon' || strike.source === 'harpoon')) {
    const weapon = t(WEAPONS[strike.source].name).toLowerCase();
    parts.push(`× ${Math.round(strike.share * 100)}% (${t("{weapon} aren't made for it", { weapon })})`);
  }
  if (strike.boost !== 1) {
    const boosts = new Set<string>(['broadside', 'pointBlank', 'ambush', 'relentless', 'lastStand']);
    const by = strike.talents.filter((id) => boosts.has(id)).map((id) => t(TALENTS[id].name));
    parts.push(`× ${Number(strike.boost.toFixed(2))} (${by.join(', ')})`);
  }
  if (event.guardedBy) parts.push(`× ${Math.round(event.guard * 100)}% (${t(TALENTS[event.guardedBy].name)})`);
  const scaled = parts.length > 0 ? ` ${parts.join(' ')} = ${amount}` : '';
  return `${t('Sum {sum}', { sum })}${scaled}  ·  ${hull}`;
}

type DamageEvent = Extract<GameEvent, { type: 'damage' }>;

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
    repairGold: 0,
    deaths: 0,
    gold: 0,
    sunk: new Map(),
    ammo: new Map(),
  };
  /** Changes with every new or updated entry, so the view rebuilds its lines only then */
  version = 0;
  private repair: { entry: LogEntry; amount: number; paid: number; steps: number; last: number } | null = null;

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
        const hull = `${unitName(event.targetKind)} ${target ? `${target.hp}/${target.maxHp}` : t('sunk')}`;
        const tone = amount === 0 ? 'miss' : event.crits > 0 ? 'crit' : 'plain';
        const details = [...diceLines(strike), sumLine(event, hull)];
        if (event.attackerId === me) {
          stats.dealt += amount;
          stats.volleys++;
          stats.dice += event.guns;
          stats.crits += event.crits;
          stats.misses += event.misses;
          stats.best = Math.max(stats.best, amount);
          const result = amount === 0 ? t('miss') : `${amount}${event.crits > 0 ? ` ${t('crit!')}` : ''}`;
          this.add(
            'dealt',
            state.time,
            `${t('You → {target}', { target: unitName(event.targetKind) })}: ${result}  ·  ${means(strike)}`,
            details,
            tone,
          );
        } else if (event.targetId === me) {
          stats.taken += amount;
          stats.hitsTaken++;
          const who = unitName(strike.attackerKind);
          const what =
            strike.source === 'bite'
              ? t('{who} bit you', { who })
              : strike.source === 'shell'
                ? t("{who}'s mortar → you", { who })
                : t('{who} → you', { who });
          const result = amount === 0 ? t('miss') : `−${amount}${event.crits > 0 ? ` ${t('crit!')}` : ''}`;
          this.add('taken', state.time, `${what}: ${result}  ·  ${means(strike)}`, details, tone);
        }
        break;
      }
      case 'destroyed': {
        if (event.targetId === me) {
          stats.deaths++;
          const who = unitName(event.attackerKind);
          this.add('death', state.time, t('Your ship went down: {who} sank it', { who }), [], 'plain');
        } else if (event.attackerId === me) {
          // Kept by the English name: the totals outlast a change of language
          const kept = SHIP_CLASSES[event.kind].name;
          stats.sunk.set(kept, (stats.sunk.get(kept) ?? 0) + 1);
          const name = unitName(event.kind);
          const said = { name: name.toLowerCase(), Name: name };
          const line =
            SHIP_CLASSES[event.kind].nature === 'creature'
              ? t('You killed the {name}', said)
              : t('You sank the {name}', said);
          this.add('kill', state.time, line, [], 'plain');
        }
        break;
      }
      case 'repair':
        if (event.shipId === me) this.repaired(event.amount, event.paid, state);
        break;
      case 'repairStopped':
        if (event.shipId === me)
          this.add('repair', state.time, t('Repair stopped: no gold to pay the crew'), [], 'plain');
        break;
      case 'gold': {
        if (event.shipId !== me) break;
        stats.gold += event.amount;
        const name = event.kind ? unitName(event.kind) : '';
        const why =
          event.reason === 'bounty' && event.kind
            ? t('Bounty for the {name}', { name: name.toLowerCase(), Name: name })
            : event.reason === 'quest' && event.quest
              ? t('Quest "{title}" turned in', { title: questTitle(QUESTS[event.quest]) })
              : event.reason === 'market'
                ? t('Goods sold at the market')
                : event.reason === 'arsenal'
                  ? t('Sold to the arsenal')
                  : t('A chest hauled aboard');
        this.add('gold', state.time, t('{why}: +{n} gold', { why, n: event.amount }), [], 'plain');
        break;
      }
      case 'level':
        if (event.shipId === me)
          this.add('level', state.time, t('Level {level}! A talent to pick (K)', { level: event.level }), [], 'plain');
        break;
      case 'talent': {
        if (event.shipId !== me) break;
        const name = t(TALENTS[event.talent].name);
        // An ability's text without its cooldown: "Broadside: the next volley does ×2 damage"
        const does = TALENTS[event.talent].text.replace(/^Ability \(F\): /, '').replace(/\. Every \d+ s$/, '');
        const what =
          event.amount > 0
            ? t('{talent}: +{n} hull at once', { talent: name, n: event.amount })
            : `${name}: ${t(does)}`;
        this.add('level', state.time, what, [], 'plain');
        break;
      }
      case 'cargo':
        if (event.shipId !== me) break;
        this.add(
          'gold',
          state.time,
          `${event.reason === 'salvage' ? t('Your lost cargo hauled back') : t('Hauled aboard')}: ${goodsText(event.goods)}`,
          [],
          'plain',
        );
        break;
      case 'holdFull':
        if (event.shipId === me)
          this.add('note', state.time, t('The hold is full: sell at the port market'), [], 'plain');
        break;
      case 'gateClosed':
        if (event.shipId === me) {
          const sea = t(ZONES[event.to].name);
          const why =
            event.reason === 'tier'
              ? t('The gate to {sea} is closed: it needs a ship of tier {tier}', { sea, tier: event.tier })
              : t('The gate to {sea} is closed while you are in combat', { sea });
          this.add('note', state.time, why, [], 'plain');
        }
        break;
      case 'cargoLost':
        if (event.shipId === me) {
          const goods = goodsText(event.goods);
          this.add('death', state.time, t('Your cargo floats where you sank: {goods}', { goods }), [], 'plain');
        }
        break;
      case 'barrage':
        if (event.targetId === me) {
          this.add('taken', state.time, t('The Baron fires his mortar: get out of the marked circles!'), [], 'plain');
        }
        break;
      case 'pathStep': {
        if (event.shipId !== me) break;
        const step = captainsPath(state, state.player).find((s) => s.id === event.step);
        if (step)
          this.add('level', state.time, t("Captain's path: {step} — done", { step: t(step.text) }), [], 'plain');
        break;
      }
      default:
    }
  }

  /** Repair steps a moment apart are one entry, its numbers growing as the repair goes on */
  private repaired(amount: number, paid: number, state: GameState) {
    this.stats.repaired += amount;
    this.stats.repairGold += paid;
    const { ship, time } = state;
    let repair = this.repair;
    if (!repair || time - repair.last > REPAIR_JOIN || this.entries.at(-1) !== repair.entry) {
      const entry: LogEntry = { kind: 'repair', time, summary: '', details: [], tone: 'plain' };
      repair = { entry, amount: 0, paid: 0, steps: 0, last: time };
      this.repair = repair;
      this.push(entry);
    }
    repair.amount += amount;
    repair.paid += paid;
    repair.steps++;
    repair.last = time;
    const cost = repair.paid > 0 ? ` ${t('for {n} gold', { n: repair.paid })}` : '';
    const repaired = t('Repaired +{hp} hull in {time} s', { hp: repair.amount, time: repair.steps });
    repair.entry.summary = `[${clock(repair.entry.time)}] ${repaired}${cost}`;
    repair.entry.details = [t('Hull {hp}/{max}', { hp: ship.hp, max: ship.maxHp })];
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
   * times are each visit's own game time. A visit that left nothing in the log left only its note: one note between
   * two visits is enough, so a note right after another (or first) is dropped, and none is added after one
   */
  restore(data: unknown) {
    if (!isRecord(data)) return;
    if (Array.isArray(data.entries)) {
      for (const item of data.entries) {
        const entry = readEntry(item);
        if (!entry) continue;
        const last = this.entries.at(-1);
        if (isVisitNote(entry) && (!last || isVisitNote(last))) continue;
        this.entries.push(entry);
      }
      const last = this.entries.at(-1);
      if (last && !isVisitNote(last)) {
        this.push({ kind: 'note', time: 0, summary: t('— a new visit —'), details: [], tone: 'plain' });
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

/** The note where a visit's entries start: the only one at game time 0, before the visit's first update */
function isVisitNote(entry: LogEntry) {
  return entry.kind === 'note' && entry.time === 0;
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
  const sunk = [...stats.sunk].map(([name, n]) => `${t(name)} ×${n}`).join(', ') || t('nothing yet');
  const ammo = [...stats.ammo].map(([id, n]) => `${t(AMMO[id].name)} ×${n}`).join(', ') || t('none');
  return [
    t('Dealt {dealt} in {volleys}  ·  best {best}  ·  {crits}  ·  {miss}% of {dice} missed', {
      dealt: stats.dealt,
      volleys: t('{n} volley|{n} volleys', { n: stats.volleys }),
      best: stats.best,
      crits: t('{n} crit|{n} crits', { n: stats.crits }),
      miss: missRate,
      dice: t('{n} die|{n} dice', { n: stats.dice }),
    }),
    t('Taken {taken} in {hits}  ·  repaired {repaired} for {gold}  ·  went down {deaths}×  ·  gold earned {earned}', {
      taken: stats.taken,
      hits: t('{n} hit|{n} hits', { n: stats.hitsTaken }),
      repaired: stats.repaired,
      gold: t('{n} gold', { n: stats.repairGold }),
      deaths: stats.deaths,
      earned: stats.gold,
    }),
    t('Sunk: {list}', { list: sunk }),
    t('Shots fired: {list}', { list: ammo }),
  ];
}
