import {
  AMMO,
  GOODS,
  GOOD_IDS,
  GUNS,
  SHIP_CLASSES,
  WEAPONS,
  findUnit,
  STORY,
  type Cargo,
  type DieResult,
  type GameEvent,
  type GameState,
  type Strike,
  type StoryStepId,
  type UnitKind,
  QUESTS,
  talentOf,
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

const MAX_ENTRIES = 500; // the oldest go first
const DICE_PER_LINE = 3;
const DICE_LISTED = 9; // a volley of more dice is summed up gun by gun instead
const REPAIR_JOIN = 1.5; // seconds: repair steps closer than this are one entry, updated as it goes

/** A unit's name, in the player's language */
export function unitName(kind: UnitKind) {
  return t(SHIP_CLASSES[kind].name);
}

/** A step of the story's title, English, by its id */
function storyTitle(id: StoryStepId) {
  return STORY.find((step) => step.id === id)?.title ?? '';
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

/** "2 cannons, Cannonball I (+1)", "… (+2, Steady hands)", "a bite", "a mortar shell", "a rocket, as 20 cannons" */
function means(strike: Strike) {
  const n = strike.dice.length;
  if (strike.source === 'bite') return t('a bite');
  if (strike.source === 'shell') return t('a mortar shell');
  if (strike.source === 'rocket') return t('a rocket, as {n} cannon|a rocket, as {n} cannons', { n });
  if (strike.source === 'keg') return t('a powder keg, as {n} cannon|a powder keg, as {n} cannons', { n });
  if (strike.source === 'bombard') return t('a mortar shell, as {n} cannon|a mortar shell, as {n} cannons', { n });
  const guns =
    strike.source === 'cannon' ? t('{n} cannon|{n} cannons', { n }) : t('{n} harpoon gun|{n} harpoon guns', { n });
  const steady = strike.diceTalents
    .map((id) => talentOf(id))
    .filter((talent) => talent.kind === 'branch' && (talent.effects.dieBonus ?? 0) > 0)
    .map((talent) => `, ${t(talent.name)}`)
    .join('');
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
    const by = strike.talents.map((id) => t(talentOf(id).name));
    if (strike.captain !== 1) by.push(t("Captain's mastery"));
    parts.push(`× ${Number(strike.boost.toFixed(2))} (${by.join(', ')})`);
  }
  if (event.captainGuard !== 1) {
    parts.push(`× ${Math.round(event.captainGuard * 100)}% (${t("Captain's mastery")})`);
  }
  if (event.guard !== 1) {
    const by = event.guardedBy.map((id) => t(talentOf(id).name)).join(', ');
    parts.push(`× ${Math.round(event.guard * 100)}% (${by})`);
  }
  const scaled = parts.length > 0 ? ` ${parts.join(' ')} = ${amount}` : '';
  return `${t('Sum {sum}', { sum })}${scaled}  ·  ${hull}`;
}

type DamageEvent = Extract<GameEvent, { type: 'damage' }>;

/**
 * The player's combat log: every blow they dealt or took with all its dice, the units they sank, their own ship going
 * down and their repairs, as lines of text. Client state, made from the game's events: the game itself keeps no
 * history (the player's records are the game's: the statistics window)
 */
export class CombatLog {
  readonly entries: LogEntry[] = [];
  /** Changes with every new or updated entry, so the view rebuilds its lines only then */
  version = 0;
  private repair: { entry: LogEntry; amount: number; paid: number; steps: number; last: number } | null = null;

  /** Reads what happened in the game's last update; call once per update */
  record(state: GameState) {
    for (const event of state.events) this.read(event, state);
  }

  private read(event: GameEvent, state: GameState) {
    const me = state.ship.id;
    switch (event.type) {
      case 'damage': {
        const { strike, amount } = event;
        const target = findUnit(state, event.targetId);
        const hull = `${unitName(event.targetKind)} ${target ? `${target.hp}/${target.maxHp}` : t('sunk')}`;
        // The dice's own crits are in the details; the line stands out only for a critical volley, as on the screen
        const tone = amount === 0 ? 'miss' : event.critical ? 'crit' : 'plain';
        const details = [...diceLines(strike), sumLine(event, hull)];
        if (event.attackerId === me) {
          const result = amount === 0 ? t('miss') : `${amount}${event.critical ? ` ${t('crit!')}` : ''}`;
          this.add(
            'dealt',
            state.time,
            `${t('You → {target}', { target: unitName(event.targetKind) })}: ${result}  ·  ${means(strike)}`,
            details,
            tone,
          );
        } else if (event.targetId === me) {
          const who = unitName(strike.attackerKind);
          const what =
            strike.source === 'bite'
              ? t('{who} bit you', { who })
              : strike.source === 'shell'
                ? t("{who}'s mortar → you", { who })
                : t('{who} → you', { who });
          const result = amount === 0 ? t('miss') : `−${amount}${event.critical ? ` ${t('crit!')}` : ''}`;
          this.add('taken', state.time, `${what}: ${result}  ·  ${means(strike)}`, details, tone);
        }
        break;
      }
      case 'destroyed': {
        if (event.targetId === me) {
          const who = unitName(event.attackerKind);
          this.add('death', state.time, t('Your ship went down: {who} sank it', { who }), [], 'plain');
        } else if (event.attackerId === me) {
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
        const name = event.kind ? unitName(event.kind) : '';
        const why =
          event.reason === 'bounty' && event.kind
            ? t('Bounty for the {name}', { name: name.toLowerCase(), Name: name })
            : event.reason === 'quest' && event.quest
              ? t('Quest "{title}" turned in', { title: questTitle(QUESTS[event.quest]) })
              : event.reason === 'quest' && event.story
                ? t('Story: "{title}" done', { title: t(storyTitle(event.story)) })
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
        const talent = talentOf(event.talent);
        const name = t(talent.name);
        // An ability's text without its key and cooldown: "Broadside: the next volley does ×2 damage"
        const does = talent.text.replace(/^Ability \([A-Z]\): /, '').replace(/\. Every \d+ s$/, '');
        const what =
          event.amount > 0
            ? t('{talent}: +{n} hull at once', { talent: name, n: event.amount })
            : `${name}: ${t(does, talent.figures)}`;
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
      // An objective of the story met; a step done says so with its reward (the gold's line), or here without one
      case 'story': {
        const step = STORY.find((s) => s.id === event.step);
        if (event.shipId !== me || !step) break;
        const objective = event.objective === null ? null : step.objectives[event.objective];
        if (objective)
          this.add('level', state.time, t('Story: {what} — done', { what: t(objective.text) }), [], 'plain');
        else if (step.reward.gold === 0) {
          this.add('level', state.time, t('Story: "{title}" done', { title: t(step.title) }), [], 'plain');
        }
        break;
      }
      default:
    }
  }

  /** Repair steps a moment apart are one entry, its numbers growing as the repair goes on */
  private repaired(amount: number, paid: number, state: GameState) {
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
    return { entries: this.entries.map((e) => ({ ...e, details: [...e.details] })) };
  }

  /**
   * Puts a kept log back (what is valid of it; the totals an older one kept are left out), with a note where it ends: the next entries are this visit's. Their
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

/** A kept entry, if it is one */
function readEntry(item: unknown): LogEntry | null {
  if (!isRecord(item)) return null;
  const { kind, time, summary, details, tone } = item;
  if (!isLogKind(kind) || !isTone(tone) || typeof time !== 'number' || typeof summary !== 'string') return null;
  const lines = Array.isArray(details) ? details.filter((line): line is string => typeof line === 'string') : [];
  return { kind, time, summary, details: lines, tone };
}

/** Whether an entry shows under a tab */
export function inFilter(entry: LogEntry, filter: LogFilter) {
  if (filter === 'all') return true;
  if (filter === 'other') return entry.kind !== 'dealt' && entry.kind !== 'taken';
  return entry.kind === filter;
}
