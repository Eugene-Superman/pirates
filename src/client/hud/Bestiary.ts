import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import {
  AMMO,
  BOT_KINDS,
  GOODS,
  GUNS,
  OFF_TARGET_SHARE,
  SHIP_CLASSES,
  WEAPONS,
  WEAPON_IDS,
  XP_BY_LEVELS,
  ZONES,
  ZONE_IDS,
  averageDamage,
  bonusesFor,
  botsInSea,
  damageShare,
  killReward,
  noticeRange,
  seaOpenTo,
  zoneKinds,
  type Ammo,
  type BotKind,
  type BotKindId,
  type DamageDie,
  type GameState,
  type Gun,
  type GunId,
  type KillReward,
  type RewardBoost,
  type Ship,
  type ShipClass,
  type WeaponId,
  type ZoneId,
} from '../../game';
import { HullPortrait } from '../scene/models/portrait';
import { BOSS_LEGENDS, HULL_LORE } from './bestiaryLore';
import { squareName } from './chart';
import { KNOT } from './itemFaces';
import { bonusLines } from './rewardText';
import { PANE_BAR_ROOM, ScrollPane } from './ScrollPane';
import { BRASS, THEME, THEMED_WINDOW, TITLE_STYLE, drawCard, drawDivider, iconSlot, subheading } from './theme';
import { Tooltip, type TooltipText } from './Tooltip';
import { HudWindow, Tile, UI, clip, drawLock, text, tierColor, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1270; // pixels, before scaling down to fit the screen
// Pixels, the same whatever it shows: what doesn't fit of the bot picked (a boss, its legend) scrolls
const HEIGHT = 730;
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the columns start
const SEA = { width: 226, height: 32, gap: 4, mark: 12 } as const; // pixels: a sea's tab, and its lock or "?"
const KIND = { width: 256, height: 64, gap: 6, icon: 52 } as const; // pixels: a bot's tab, and its portrait's slot
const KINDS_X = PAD + SEA.width + 14;
const DETAILS_X = KINDS_X + KIND.width + 20;
const DETAILS_WIDTH = WIDTH - PAD - DETAILS_X - PANE_BAR_ROOM; // the bot picked, its scroll bar right of it
const PORTRAIT = 128; // pixels: the bot picked, its portrait's slot
const ABOUT_X = PORTRAIT + 18; // pixels: its name and legend, right of its portrait
const BOARD_GAP = 14; // pixels between the two columns of boards, between two boards, and over them
const BOARD_WIDTH = (DETAILS_WIDTH - BOARD_GAP) / 2;
const SECTION = { pad: 10, heading: 28 } as const; // pixels: inside a board, and its heading
const ROW = 20; // pixels a line
const INDENT = 12; // pixels a part of the line above is set in
const BRACKET_GAP = 4; // pixels between a figure and the player's own, in brackets after it
const HERE = 0xffd447; // the sea the player is in, outlined as on the world chart
const BOSS_COLOR = 0xff7a6a;
const GOLD = 0xffcf3f; // the spoils' tooltips, as the tavern's
const XP_COLOR = 0x5aa8ff; // the experience's, as the tavern's and under the player's frame
const STRONGER = 0.005; // a sea's strength further than this from 1 is shown
const CLOSED_ALPHA = 0.5; // a sea's tab, forbidden to the player's ship
const HIDDEN_GLOW = 0x9a8766; // the slot of a bot of a sea the player hasn't sailed: light enough for its black shape
const SILHOUETTE = 0x000000; // its portrait, in a sea open to them: its shape alone
const SILHOUETTE_ALPHA = 0.85;
const BACKLIGHT_ALPHA = 0.45; // the slot's well behind that shape

/**
 * A figure of the player's own beside the bestiary's: in brackets after it, green when it is better for them, amber
 * when worse
 */
interface Bracket {
  readonly text: string;
  readonly better: boolean;
}

/**
 * A line of a board: a label and its value, and in brackets what it is for the player's ship (`actual`); `part` of the
 * line above (set in, dim), or `strong` (bold); `tip`, told under the pointer
 */
interface Line {
  readonly label: string;
  readonly value?: string;
  readonly color?: number;
  readonly actual?: Bracket;
  readonly part?: boolean;
  readonly strong?: boolean;
  readonly tip?: TooltipText;
}

/** A board of lines under a gold heading, and a note right of the heading */
interface Board {
  readonly title: string;
  readonly note?: string;
  readonly lines: readonly Line[];
}

/**
 * What the player knows of a sea: one they have sailed (charted), one open to their ship they haven't, or one
 * forbidden to it (a higher tier's): only a charted sea's bots are told
 */
type SeaKnown = 'charted' | 'uncharted' | 'forbidden';

function known(state: GameState, zone: ZoneId): SeaKnown {
  if (state.player.charted.includes(zone)) return 'charted';
  return seaOpenTo(zone, state.ship.shipClass.tier) ? 'uncharted' : 'forbidden';
}

/**
 * What the figures for the player's ship come from (its class, XP and so its level, talents and guns, the captain's
 * mastery) and the seas they have sailed: the columns are built again only when one of them changes
 */
function playerKey({ ship, player }: GameState) {
  return [
    ship.shipClass.id,
    ship.xp,
    [...ship.talentRanks()].join(),
    ship.guns.cannon.join(),
    ship.guns.harpoon.join(),
    player.mastery.join(),
    player.charted.join(),
  ].join('|');
}

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

/** Damage as the HUD shows it: a decimal while small */
function figure(n: number) {
  return n >= 100 ? whole(Math.round(n)) : n.toFixed(1);
}

/** "4 min", "25 s" */
function duration(seconds: number) {
  return seconds >= 60 && seconds % 60 === 0 ? t('{m} min', { m: seconds / 60 }) : t('{s} s', { s: seconds });
}

/** A chest's gold, at least and at most: "10–25" */
function range([from, to]: readonly [number, number]) {
  return `${from}–${to}`;
}

/** "+80", "−40" */
function signed(n: number) {
  return `${n > 0 ? '+' : '−'}${whole(Math.abs(n))}`;
}

/** The player's figure in brackets, while it differs from the bestiary's: `higher` whether more is better for them */
function bracket(base: number, actual: number, shown: (n: number) => string, higher = true): Bracket | undefined {
  if (shown(actual) === shown(base)) return undefined;
  return { text: `(${shown(actual)})`, better: higher === actual > base };
}

/** The sea a kind of bot sails */
function seaOf(kind: BotKindId): ZoneId {
  return ZONE_IDS.find((zone) => zoneKinds(zone).some((k) => k.id === kind)) ?? ZONE_IDS[0];
}

/** Its guns, the same ones together, in the order of its slots */
function gunsOf(shipClass: ShipClass) {
  const guns = new Map<GunId, number>();
  for (const weapon of WEAPON_IDS) {
    for (const gun of shipClass.startingGuns[weapon]) if (gun) guns.set(gun, (guns.get(gun) ?? 0) + 1);
  }
  return guns;
}

function temper(kind: BotKind) {
  if (kind.boss) return { name: kind.boss.mini ? t('Mini-boss') : t('Boss'), color: BOSS_COLOR };
  return kind.behaviour === 'aggressive'
    ? { name: t('Aggressive'), color: UI.hostile }
    : { name: t('Neutral'), color: UI.good };
}

/** A die's misses and critical hits, in words: "misses on 1, a critical hit on 10 (×2)" */
function dieWords(die: DamageDie) {
  return t('d{die}: misses on {miss}, a critical hit on {crit} (×{times})', {
    die: die.die,
    miss: die.missOn === 1 ? '1' : `1–${die.missOn}`,
    crit: die.critFrom === die.die ? `${die.die}` : `${die.critFrom}–${die.die}`,
    times: die.critMultiplier,
  });
}

/**
 * A die's blow (a gun's shot with its ammo's bonus, a bite, a shell) as the bot deals it: on average, a critical hit's
 * chance and damage, the chance to miss. Every one multiplied by the bot's strength in its sea, as the game does
 */
function blowLines(die: DamageDie, bonus: number, power: number, part: boolean): Line[] {
  const crits = (die.die - die.critFrom + 1) / die.die;
  const crit = Math.round((die.critMultiplier * die.die + bonus) * power);
  return [
    { label: t('Average hit'), value: figure(averageDamage(die, bonus) * power), part },
    { label: t('Critical hit'), value: `${percent(crits)} · ${crit}`, part },
    { label: t('Miss chance'), value: percent(die.missOn / die.die), part },
  ];
}

/** Its hull or body: how tough, how fast, what hurts it */
function hullBoard(kind: BotKind): Board {
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const best = shipClass.nature === 'creature' ? WEAPONS.harpoon : WEAPONS.cannon;
  return {
    title: shipClass.nature === 'creature' ? t('Body') : t('Hull'),
    lines: [
      { label: t('Hull points'), value: whole(kind.hp ?? shipClass.hp) },
      { label: t('Top speed'), value: t('{speed} kn', { speed: (shipClass.maxSpeed / KNOT).toFixed(1) }) },
      { label: t('Turning'), value: t('{n}°/s', { n: Math.round((shipClass.turnSpeed * 180) / Math.PI) }) },
      { label: t('Sight'), value: String(shipClass.viewRange) },
      {
        label: t('Full damage from'),
        value: t('{weapon}, others {n}%', { weapon: t(best.name), n: Math.round(OFF_TARGET_SHARE * 100) }),
      },
    ],
  };
}

/** How near an aggressive bot attacks a ship, and in brackets the player's: nearer with their ship's stealth */
function noticeLine(kind: BotKind, { ship, player }: GameState): Line {
  const near = noticeRange(kind, ship);
  return {
    label: t('Attacks a ship within'),
    value: whole(kind.aggroRange),
    actual: bracket(kind.aggroRange, near, whole, false),
    tip: {
      title: t('Attacks your ship within {n}', { n: whole(near) }),
      lines: [
        t('It notices a ship within {n} and goes for it', { n: whole(kind.aggroRange) }),
        t('Stealth: hostile ships and monsters notice yours nearer'),
        ...bonusLines(bonusesFor(ship, player, ['stealth']), ship.bonus.stealth),
      ],
    },
  };
}

/** How it behaves, how many of it sail its sea, and how soon one sunk comes back */
function seaBoard(kind: BotKind, state: GameState): Board {
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const armed = shipClass.bite !== null || gunsOf(shipClass).size > 0;
  const { name, color } = temper(kind);
  const lair = kind.boss?.lair;
  return {
    title: t('At sea'),
    lines: [
      { label: t('Temper'), value: name, color },
      kind.behaviour === 'aggressive'
        ? noticeLine(kind, state)
        : { label: t('When attacked'), value: armed ? t('fights back') : t('runs') },
      lair
        ? { label: t('Lair'), value: squareName(lair.x, lair.y) }
        : { label: t('In its sea'), value: t('about {n}', { n: botsInSea(kind) }) },
      ...(kind.pack > 1 ? [packLine(kind)] : []),
      { label: t('Back after it sinks'), value: duration(kind.respawnTime) },
    ],
  };
}

/** A kind that sails in packs: how many to a pack, and how they fight under the pointer */
function packLine(kind: BotKind): Line {
  return {
    label: t('In a pack'),
    value: t('{n} ship|{n} ships', { n: kind.pack }),
    tip: {
      title: t('A pack of {n}', { n: kind.pack }),
      lines: [
        t('They sail together behind the first of them and fight as one: whoever attacks one fights them all'),
        t('They keep to the far waters, away from the port'),
        t('One sunk comes back to its pack, never while the pack fights'),
      ],
    },
  };
}

/** A part of the spoils under the pointer: what the kind gives, then what adds to it for the player's ship */
function boostTip(title: string, color: number, base: string, boost: RewardBoost): TooltipText {
  return { title, color, lines: [base, ...bonusLines(boost.by, boost.share)] };
}

/**
 * The experience under the pointer: what the kind is worth, what the ship's tier and level against the bot's leave
 * of it, what adds to it, and what is lost beyond the ship's last level
 */
function xpTip(kind: BotKind, ship: Ship, reward: KillReward): TooltipText {
  const share = reward.xpShare;
  const lines = [t('It is worth {n}', { n: whole(kind.xp) })];
  if (share.by === 'starter') lines.push(t('The starter sloop earns all of it, whatever it sinks'));
  else if (share.by === 'higherTier') lines.push(t("A tier above your ship's: all of it"));
  else if (share.by === 'farBelow') lines.push(t("Two tiers or more below your ship's: a single point"));
  else {
    if (share.by === 'tierBelow') lines.push(t("A tier below your ship's: ×{share}", { share: percent(share.tier) }));
    lines.push(
      t('Your ship Lv {ship}, it Lv {level}: ×{share}', {
        ship: ship.level,
        level: kind.level,
        share: percent(share.levels),
      }),
      t('All of it up to {all} levels above it, half up to {half}, a quarter beyond', { ...XP_BY_LEVELS }),
    );
  }
  lines.push(...bonusLines(reward.boosts.xp.by, reward.boosts.xp.share));
  if (reward.xpLost > 0) lines.push(t("{n} lost: beyond the ship's last level", { n: whole(reward.xpLost) }));
  return { title: t('Experience: {n}', { n: whole(reward.xp) }), color: XP_COLOR, lines };
}

/**
 * What sinking it pays, the kind's figures with the player's ship's in brackets (more with the captain's mastery and
 * its talents, its experience by its tier and level): the bounty, the experience, a chest's gold and the goods its
 * wreck may leave; what makes up each under the pointer
 */
function spoilsBoard(kind: BotKind, state: GameState): Board {
  const { chest, cargo } = kind;
  const { ship } = state;
  const reward = killReward(state, state.player, kind.id);
  // Only with the player's ship in the game: online, between two seas
  const of = <T>(make: (reward: KillReward) => T) => (reward ? make(reward) : undefined);
  const lines: Line[] = [
    {
      label: t('Bounty'),
      value: t('{n} gold', { n: kind.bounty }),
      actual: of((r) => bracket(kind.bounty, r.bounty, whole)),
      tip: of((r) =>
        boostTip(
          t('Bounty: {n}', { n: whole(r.bounty) }),
          GOLD,
          t('Its bounty: {n}', { n: whole(kind.bounty) }),
          r.boosts.bounty,
        ),
      ),
    },
    {
      label: t('Experience'),
      value: t('{n} XP', { n: kind.xp }),
      actual: of((r) => bracket(kind.xp, r.xp, whole)),
      tip: of((r) => xpTip(kind, ship, r)),
    },
  ];
  if (chest) {
    lines.push(
      {
        label: t('Chest of gold'),
        value: percent(chest.chance),
        actual: of((r) => bracket(chest.chance, r.chestChance, percent)),
        tip: of((r) =>
          boostTip(
            t('Chest of gold: {share}', { share: percent(r.chestChance) }),
            GOLD,
            t('It leaves one {share} of the time', { share: percent(chest.chance) }),
            r.boosts.chest,
          ),
        ),
      },
      {
        label: t('Gold in it'),
        value: range(chest.gold),
        part: true,
        actual: of((r) =>
          range(r.chestGold) === range(chest.gold)
            ? undefined
            : { text: `(${range(r.chestGold)})`, better: r.chestGold[1] > chest.gold[1] },
        ),
        tip: of((r) =>
          boostTip(
            t('Gold in a chest: {gold}', { gold: range(r.chestGold) }),
            GOLD,
            t('Its chest holds {gold}', { gold: range(chest.gold) }),
            r.boosts.chestGold,
          ),
        ),
      },
    );
    if (reward && reward.secondChest > 0) {
      lines.push({
        label: t('A second chest'),
        value: percent(reward.secondChest),
        part: true,
        tip: boostTip(
          t('A second chest: {share}', { share: percent(reward.secondChest) }),
          GOLD,
          t('Another chest of gold beside the first, when it leaves one'),
          reward.boosts.secondChest,
        ),
      });
    }
  } else lines.push({ label: t('Chest of gold'), value: '—' });
  const goodsTip = of((r) =>
    boostTip(t('Goods it may leave'), GOLD, t('How often its wreck leaves each of them'), r.boosts.goods),
  );
  if (cargo.length > 0) lines.push({ label: t('Goods it may leave'), tip: goodsTip });
  for (const {
    good,
    count: [from, to],
    chance,
  } of cargo) {
    lines.push({
      label: t(GOODS[good].name),
      value: `×${from === to ? from : `${from}–${to}`} · ${percent(chance)}`,
      actual: of((r) => bracket(chance, Math.min(1, chance * r.goods), percent)),
      part: true,
      tip: goodsTip,
    });
  }
  return {
    title: t('Spoils'),
    note: t('Your {ship}, Lv {level}', { ship: t(ship.shipClass.name), level: ship.level }),
    lines,
  };
}

/** A gun of its under the pointer: what it is, its die, its ammo, its reach and reload, what it does to the player */
function gunTip(gun: Gun, count: number, ammo: Ammo | null, power: number, ship: Ship): TooltipText {
  const bonus = ammo?.weapon === gun.weapon ? ammo.bonus : 0;
  const share = damageShare(gun.weapon, ship.nature);
  const lines = [
    t(gun.role),
    `${t(WEAPONS[gun.weapon].name)} · ${t('Tier {tier}', { tier: gun.tier })}`,
    dieWords(gun),
    t('Reach {n}, reloads every {s} s', { n: gun.range, s: gun.reload }),
  ];
  if (ammo && bonus > 0) lines.push(t('Fires {ammo}: +{n} a hit', { ammo: t(ammo.name), n: bonus }));
  if (Math.abs(power - 1) > STRONGER) lines.push(t('Its sea makes it hit ×{n}', { n: power.toFixed(2) }));
  if (count > 1) {
    const volley = count * averageDamage(gun, bonus) * power;
    lines.push(t('A volley of all {count}: {n} on average', { count, n: figure(volley) }));
  }
  lines.push(
    share === 1
      ? t('Against your ship: full damage')
      : t('Against your ship: {share} of it', { share: percent(share) }),
  );
  return { title: t(gun.name), color: tierColor(gun.tier), lines };
}

/** Its jaws under the pointer: their die, its strength in its sea, and how near they reach */
function biteTip(die: DamageDie, reach: number, power: number): TooltipText {
  const lines = [dieWords(die), t('Its jaws reach {n} from its head: it must come alongside', { n: reach })];
  if (Math.abs(power - 1) > STRONGER) lines.push(t('Its sea makes it hit ×{n}', { n: power.toFixed(2) }));
  return { title: t('Bite'), color: BOSS_COLOR, lines };
}

/**
 * How far it reaches against how far the player's guns do, a line a weapon (their longest gun of it, with their
 * talents and the captain's mastery): in brackets by how much further, green when theirs reach further
 */
function reachLines(its: number, ship: Ship): Line[] {
  return WEAPON_IDS.map((weapon: WeaponId) => {
    const yours = ship.range(weapon);
    const label = weapon === 'cannon' ? t('Your cannons reach') : t('Your harpoons reach');
    if (yours === 0) return { label, value: '—', part: true, tip: { title: label, lines: [t('None fitted')] } };
    const lines = [
      t('Your longest gun of them, with your talents and the captain’s mastery: {n}', { n: whole(yours) }),
    ];
    if (yours > its) {
      lines.push(
        t('You outreach it by {n}: from between {its} and {yours} away it cannot answer', {
          n: whole(yours - its),
          its: whole(its),
          yours: whole(yours),
        }),
      );
    } else if (yours < its) {
      lines.push(
        t('It outreaches you by {n}: close in, or keep beyond {its}', { n: whole(its - yours), its: whole(its) }),
      );
    } else lines.push(t('You reach as far as it does'));
    return {
      label,
      value: whole(yours),
      actual: yours === its ? undefined : { text: `(${signed(yours - its)})`, better: yours > its },
      part: true,
      tip: { title: label, lines },
    };
  });
}

/**
 * Its guns, the same ones together, and the ammo they fire; or its jaws; or nothing, and it runs. Then how far it
 * reaches against the player's guns
 */
function weaponBoard(kind: BotKind, ship: Ship): Board {
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const { power } = kind;
  const note = Math.abs(power - 1) > STRONGER ? t('×{n} in its sea', { n: power.toFixed(2) }) : undefined;
  const { bite } = shipClass;
  if (bite) {
    return {
      title: t('Jaws'),
      note,
      lines: [
        {
          label: t('Bite'),
          value: `d${bite.die} + ${bite.bonus}`,
          strong: true,
          tip: biteTip(bite, bite.reach, power),
        },
        ...blowLines(bite, bite.bonus, power, true),
        { label: t('Reach'), value: whole(bite.reach), part: true },
        { label: t('Bites every'), value: t('{n} s', { n: bite.reload }), part: true },
        { label: t('Damage a second'), value: figure((averageDamage(bite, bite.bonus) * power) / bite.reload) },
        ...reachLines(bite.reach, ship),
      ],
    };
  }
  const guns = gunsOf(shipClass);
  if (guns.size === 0) return { title: t('Guns'), lines: [{ label: t('None: it runs when attacked') }] };
  const ammo = kind.ammo ? AMMO[kind.ammo] : null;
  const lines: Line[] = [];
  let perSecond = 0;
  let longest = 0;
  for (const [id, count] of guns) {
    const gun = GUNS[id];
    const bonus = ammo?.weapon === gun.weapon ? ammo.bonus : 0;
    perSecond += (count * averageDamage(gun, bonus) * power) / gun.reload;
    longest = Math.max(longest, gun.range);
    lines.push(
      {
        label: `${count} × ${t(gun.name)}`,
        value: `d${gun.die}`,
        strong: true,
        tip: gunTip(gun, count, ammo, power, ship),
      },
      ...blowLines(gun, bonus, power, true),
      { label: t('Reach'), value: whole(gun.range), part: true },
      { label: t('Reload'), value: t('{n} s', { n: gun.reload }), part: true },
    );
  }
  if (ammo) lines.push({ label: t('Ammo'), value: `${t(ammo.name)}  +${ammo.bonus}` });
  lines.push({ label: t('Damage a second, every gun'), value: figure(perSecond) }, ...reachLines(longest, ship));
  return { title: t('Guns'), note, lines };
}

/** A boss's mortar: its shells on marked spots round its foe */
function mortarBoard(kind: BotKind): Board | null {
  const { barrage } = SHIP_CLASSES[kind.shipClass];
  if (!barrage) return null;
  return {
    title: t('Mortar'),
    lines: [
      { label: t('Shells'), value: t('{n} every {s} s', { n: barrage.shells, s: barrage.cooldown }) },
      { label: t('Reach'), value: String(barrage.range) },
      { label: t('Each shell'), value: `d${barrage.die} + ${barrage.bonus}`, strong: true },
      ...blowLines(barrage, barrage.bonus, kind.power, true),
      {
        label: t('Lands after · radius'),
        value: `${t('{n} s', { n: barrage.delay })} · ${barrage.radius}`,
        part: true,
      },
    ],
  };
}

/** A monster's own ways of fighting: its dive, its ink and its brood, and how much harder it fights low */
function skillsBoard(kind: BotKind): Board | null {
  const { skills } = SHIP_CLASSES[kind.shipClass];
  if (!skills) return null;
  const { dive, ink, brood } = skills;
  const lines: Line[] = [];
  if (dive) {
    const [often, oftener] = dive.cooldown;
    lines.push(
      {
        label: t('Dive'),
        value: t('every {n} s, {m} s below {share}', { n: often, m: oftener, share: percent(skills.phase) }),
        strong: true,
      },
      { label: t('At a foe this far'), value: `${dive.from}–${dive.range}`, part: true },
      { label: t('Its arms as it comes up'), value: `d${dive.die} + ${dive.bonus}`, part: true },
      ...blowLines(dive, dive.bonus, kind.power, true),
      {
        label: t('Marked before · radius'),
        value: `${t('{n} s', { n: dive.warn })} · ${dive.radius}`,
        part: true,
      },
    );
  }
  if (ink) {
    lines.push(
      {
        label: t('Ink'),
        value: t('at {shares} of its hull', { shares: ink.at.map(percent).join(', ') }),
        strong: true,
      },
      { label: t('Spreads to · lasts'), value: `${ink.radius} · ${t('{n} s', { n: ink.lasts })}`, part: true },
      { label: t('Sight in it'), value: String(ink.sight), part: true },
    );
  }
  if (brood) {
    const name = t(SHIP_CLASSES[brood.hull].name);
    lines.push({
      label: t('Brood'),
      value: t('{n} × {name} at {share}', { n: brood.count, name, share: percent(brood.at) }),
      strong: true,
    });
  }
  return { title: t('Its ways'), lines };
}

/** A boss's escort: the bots that follow it and join its fights; none for one alone at its lair */
function escortBoard(kind: BotKind): Board | null {
  if (!kind.boss?.escorts) return null;
  const { kind: id, count } = kind.boss.escorts;
  const escort = BOT_KINDS[id];
  return {
    title: t('Escort'),
    lines: [
      {
        label: `${count} × ${t(SHIP_CLASSES[escort.shipClass].name)}`,
        value: t('Lv {level}', { level: escort.level }),
      },
    ],
  };
}

/**
 * The bestiary (B, the minimap's button, or a click on the plate of a bot picked out): every kind of bot of every
 * sea, in the windows' theme. The seas down the left, the sea picked's bots beside them, a tab each with its portrait,
 * and the bot picked on the right: its portrait and legend, its hull, temper and spoils, its guns or jaws (how many,
 * which, their dice, crits and misses, reach and reload, the damage they do in its sea, how far they reach against the
 * player's), a boss's mortar and escort, a monster's own ways (its dive, ink, brood), and a boss's or a mini-boss's legend, scrolled when they run past the
 * window's foot, which never grows: the window keeps one size, so its text keeps its size too. What it is to the player's ship stands in brackets beside the kind's own
 * figures (the experience by its tier and level, the bounty and the chests with the captain's mastery and its talents,
 * how near it attacks with its stealth), and what makes each up under the pointer. Only the seas the player has sailed
 * are told: one open to their ship shows its bots' shapes alone, one forbidden to it nothing. Read from the game's own
 * tables, so it tells what the game does
 */
export class Bestiary {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly seas = new Container();
  private readonly kinds = new Container();
  /** The bot picked, scrolled on its own when it is longer than the window */
  private readonly pane = new ScrollPane(DETAILS_WIDTH + PANE_BAR_ROOM, HEIGHT - TOP - PAD);
  private readonly details = this.pane.content;
  /** What a line under the pointer is made of */
  private readonly tooltip = new Tooltip();
  /** The line under the pointer: its tip, and where it is in the window (the middle of its top, and its bottom) */
  private hint: { readonly tip: TooltipText; readonly x: number; readonly y: number; readonly under: number } | null =
    null;
  /** The sea picked; null: the one the player is in */
  private zone: ZoneId | null = null;
  /** The bot picked; null, or not of the sea picked: its first */
  private kind: BotKindId | null = null;
  /** What the columns were last built for, to build them again only when it changes */
  private shown = '';
  /** The sea and the bot the details were last built for: another one shows from its top */
  private detailsOf = '';
  /** The portraits shown, each waiting for its atlas */
  private portraits: HullPortrait[] = [];

  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;
    const title = new Text({ text: t('Bestiary'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(
      t(
        'Every ship and creature of the seas you have sailed: what it carries, how hard it hits, what it is worth to you',
      ),
      13,
      THEME.dim,
    );
    note.position.set(PAD, PAD + 30);
    this.seas.position.set(PAD, TOP);
    this.kinds.position.set(KINDS_X, TOP);
    this.pane.container.position.set(DETAILS_X, TOP);
    // The lines move under a pointer that stays put: the tip of the one it was on goes
    this.pane.container.on('wheel', () => (this.hint = null));
    this.window.panel.addChild(
      title,
      note,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.seas,
      this.kinds,
      this.pane.container,
      this.tooltip.container,
    );
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
  }

  /** Opens on a kind of bot: its sea, and it picked */
  open(kind: BotKindId) {
    this.zone = seaOf(kind);
    this.kind = kind;
    this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
    // Hidden, the line under the pointer never hears it leave: built again, unlit, when it opens
    this.hint = null;
    this.tooltip.point(null, 0, 0);
    this.shown = '';
    this.detailsOf = '';
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    this.window.fit();
    for (const portrait of this.portraits) portrait.update();
    const here = state.world.zone;
    const zone = this.zone ?? here;
    const kinds = zoneKinds(zone);
    const kind = kinds.find((k) => k.id === this.kind) ?? kinds[0];
    const key = `${zone}|${kind.id}|${here}|${playerKey(state)}`;
    if (key !== this.shown) {
      this.shown = key;
      this.build(state, zone, kinds, kind);
    }
    const { hint } = this;
    if (hint) this.tooltip.point(hint.tip, hint.x, hint.y, { width: WIDTH, under: hint.under });
    else this.tooltip.point(null, 0, 0);
  }

  /** The three columns: the seas, the sea picked's bots, and the bot picked, or why the sea's are hidden */
  private build(state: GameState, zone: ZoneId, kinds: readonly BotKind[], kind: BotKind) {
    this.hint = null;
    this.portraits = [];
    const seen = known(state, zone);
    this.showSeas(zone, state);
    this.showKinds(kinds, kind, seen);
    this.pane.setContentHeight(
      seen === 'charted' ? this.showDetails(kind, zone, state) : this.showHidden(zone, seen, state),
    );
    const of = `${zone}|${kind.id}`;
    if (of !== this.detailsOf) {
      this.detailsOf = of;
      this.pane.scrollTo(0);
    }
  }

  /**
   * Every sea, by the ladder of tiers: its name and levels, the one picked gold, the player's outlined; one they haven't
   * sailed with a "?", one forbidden to their ship dim under a lock
   */
  private showSeas(picked: ZoneId, state: GameState) {
    for (const child of this.seas.removeChildren()) child.destroy({ children: true });
    ZONE_IDS.forEach((id, i) => {
      const zone = ZONES[id];
      const on = id === picked;
      const seen = known(state, id);
      const tile = new Tile(
        SEA.width,
        SEA.height,
        () => {
          this.zone = id;
          this.kind = null;
        },
        6,
        BRASS,
      );
      tile.setLook({ pressed: on });
      const stripe = new Graphics().roundRect(0, 4, 3, SEA.height - 8, 1.5).fill({ color: tierColor(zone.tier) });
      const [from, to] = zone.levels;
      const levels = text(`${from}–${to}`, 11, on ? THEME.darkText : tierColor(zone.tier), { fontWeight: 'bold' });
      levels.anchor.set(1, 0.5);
      levels.position.set(SEA.width - 10, SEA.height / 2);
      let right = levels.x - levels.width;
      const color = on ? THEME.darkText : seen === 'charted' ? THEME.text : THEME.dim;
      const name = text(t(zone.name), 12, color, { fontWeight: 'bold' });
      name.anchor.set(0, 0.5);
      name.position.set(12, SEA.height / 2);
      tile.content.addChild(stripe, name, levels);
      if (seen !== 'charted') {
        const mark = new Graphics();
        const x = right - 8 - SEA.mark / 2;
        if (seen === 'forbidden') {
          // The lock's middle is a little under its (0, 0): the shackle rises over it
          drawLock(mark, SEA.mark, color);
          mark.position.set(x, SEA.height / 2 - SEA.mark * 0.15);
          name.alpha = levels.alpha = mark.alpha = CLOSED_ALPHA;
          tile.content.addChild(mark);
        } else {
          const ask = text('?', 13, color, { fontWeight: 'bold' });
          ask.anchor.set(0.5);
          ask.position.set(x, SEA.height / 2);
          tile.content.addChild(ask);
        }
        right = x - SEA.mark / 2;
      }
      clip(name, right - 12 - 8);
      if (id === state.world.zone) {
        tile.container.addChild(
          new Graphics().roundRect(-2, -2, SEA.width + 4, SEA.height + 4, 8).stroke({ width: 2, color: HERE }),
        );
      }
      tile.container.position.set(0, i * (SEA.height + SEA.gap));
      this.seas.addChild(tile.container);
    });
  }

  /**
   * The sea's bots: a tab each with its portrait in a slot lit in its tier's colour, its level on the chip. In a sea
   * the player hasn't sailed, a tab each still, unnamed and not to be picked: its shape alone if the sea is open to
   * their ship, a lock if it is forbidden to it
   */
  private showKinds(kinds: readonly BotKind[], picked: BotKind, seen: SeaKnown) {
    for (const child of this.kinds.removeChildren()) child.destroy({ children: true });
    const told = seen === 'charted';
    kinds.forEach((kind, i) => {
      const on = told && kind === picked;
      const tile = new Tile(KIND.width, KIND.height, told ? () => (this.kind = kind.id) : null, 6, BRASS);
      tile.setLook({ pressed: on });
      const slot = told ? this.portraitSlot(kind, KIND.icon) : this.hiddenSlot(kind, KIND.icon, seen);
      slot.position.set(6, (KIND.height - KIND.icon) / 2);
      const x = 6 + KIND.icon + 10;
      const name = text(
        told ? t(SHIP_CLASSES[kind.shipClass].name) : t('Unknown'),
        14,
        on ? THEME.darkText : THEME.text,
        {
          fontWeight: 'bold',
        },
      );
      name.position.set(x, 13);
      clip(name, KIND.width - x - 8);
      const { name: mood, color } = temper(kind);
      const note = told
        ? text(`${mood} · ${t('Lv {level}', { level: kind.level })}`, 12, on ? THEME.darkText : color)
        : text(seen === 'forbidden' ? t('Forbidden waters') : t('Not met yet'), 12, THEME.dim);
      note.position.set(x, 35);
      if (!told) name.alpha = note.alpha = CLOSED_ALPHA;
      tile.content.addChild(slot, name, note);
      tile.container.position.set(0, i * (KIND.height + KIND.gap));
      this.kinds.addChild(tile.container);
    });
  }

  /** A bot's portrait in a slot lit in its tier's colour (a boss's in red), its level on the chip */
  private portraitSlot(kind: BotKind, size: number) {
    const slot = iconSlot(size, kind.boss ? BOSS_COLOR : tierColor(kind.tier), `${kind.level}`, false);
    slot.container.addChildAt(this.portrait(kind, size), 1);
    return slot.container;
  }

  /** A bot's portrait, fitted into a slot `size` pixels square: over its well, under its chip */
  private portrait(kind: BotKind, size: number) {
    const portrait = new HullPortrait(kind.shipClass, size - 6);
    portrait.container.position.set(3, 3);
    this.portraits.push(portrait);
    return portrait.container;
  }

  /**
   * The slot of a bot of a sea the player hasn't sailed, dim, its level unknown: its shape alone, black, in a sea open
   * to their ship; a lock in one forbidden to it
   */
  private hiddenSlot(kind: BotKind, size: number, seen: SeaKnown) {
    const slot = iconSlot(size, HIDDEN_GLOW, '?', false);
    if (seen === 'forbidden') {
      const lock = new Graphics();
      drawLock(lock, size * 0.4, THEME.dim);
      lock.position.set(size / 2, size / 2 - size * 0.05);
      slot.container.addChildAt(lock, 1);
    } else {
      // The well lit behind it, or a black shape is lost in the dark
      const backlight = new Graphics()
        .roundRect(4, 4, size - 8, size - 8, 5)
        .fill({ color: HIDDEN_GLOW, alpha: BACKLIGHT_ALPHA });
      const shape = this.portrait(kind, size);
      shape.tint = SILHOUETTE;
      shape.alpha = SILHOUETTE_ALPHA;
      slot.container.addChildAt(backlight, 1);
      slot.container.addChildAt(shape, 2);
    }
    return slot.container;
  }

  /** Its name, sea and legend, right of its portrait; returns how far down they reach */
  private about(name: string, where: string, color: number, lore: string | undefined) {
    const width = DETAILS_WIDTH - ABOUT_X;
    let y = 0;
    const add = (part: Text, gap: number) => {
      part.position.set(ABOUT_X, y);
      this.details.addChild(part);
      y += part.height + gap;
    };
    add(subheading(name, 24), 2);
    add(text(where, 13, color, { fontWeight: 'bold' }), 8);
    if (lore) add(text(lore, 13, THEME.text, { wordWrap: true, wordWrapWidth: width, lineHeight: 18 }), 0);
    return y;
  }

  /**
   * The bot picked: its portrait, name, sea and lore, then its boards in two columns, a boss's legend under them.
   * Returns how far down they reach
   */
  private showDetails(kind: BotKind, zone: ZoneId, state: GameState) {
    for (const child of this.details.removeChildren()) child.destroy({ children: true });
    const sea = ZONES[zone];
    this.details.addChild(this.portraitSlot(kind, PORTRAIT));
    const tier = sea.tier === 0 ? t('Starter') : t('Tier {tier}', { tier: sea.tier });
    const where = `${t(sea.name)} · ${tier} · ${t('Lv {level}', { level: kind.level })}`;
    const lore = HULL_LORE[kind.shipClass];
    const y = this.about(t(SHIP_CLASSES[kind.shipClass].name), where, tierColor(sea.tier), lore && t(lore));

    const top = Math.max(PORTRAIT, y) + BOARD_GAP;
    const left = [hullBoard(kind), seaBoard(kind, state), spoilsBoard(kind, state)];
    const right = [weaponBoard(kind, state.ship), mortarBoard(kind), skillsBoard(kind), escortBoard(kind)].filter(
      (board) => board !== null,
    );
    let bottom = top;
    for (const [x, boards] of [
      [0, left],
      [BOARD_WIDTH + BOARD_GAP, right],
    ] as const) {
      let at = top;
      for (const board of boards) at += this.board(x, at, board) + BOARD_GAP;
      bottom = Math.max(bottom, at);
    }
    const legend = BOSS_LEGENDS[kind.shipClass];
    return legend ? bottom + this.legend(bottom, t(legend)) : bottom - BOARD_GAP;
  }

  /**
   * A boss's or a mini-boss's legend at y, a board as wide as both columns: what the sea tells of it. Returns its
   * height
   */
  private legend(y: number, legend: string) {
    const width = BOARD_WIDTH * 2 + BOARD_GAP;
    const body = text(legend, 13, THEME.text, {
      fontStyle: 'italic',
      wordWrap: true,
      wordWrapWidth: width - SECTION.pad * 2,
      lineHeight: 18,
    });
    const height = SECTION.pad * 2 + SECTION.heading + body.height;
    const g = drawCard(new Graphics(), width, height);
    g.position.set(0, y);
    g.rect(SECTION.pad, SECTION.pad + SECTION.heading - 5, width - SECTION.pad * 2, 1).fill({
      color: THEME.brass,
      alpha: 0.35,
    });
    const heading = subheading(t('Legend'), 15);
    heading.position.set(SECTION.pad, y + SECTION.pad - 2);
    body.position.set(SECTION.pad, y + SECTION.pad + SECTION.heading);
    this.details.addChild(g, heading, body);
    return height;
  }

  /**
   * A sea the player hasn't sailed, in the bot's place: what it is, and why what sails it is hidden. Returns how far
   * down they reach
   */
  private showHidden(zone: ZoneId, seen: Exclude<SeaKnown, 'charted'>, state: GameState) {
    for (const child of this.details.removeChildren()) child.destroy({ children: true });
    const sea = ZONES[zone];
    const slot = iconSlot(PORTRAIT, HIDDEN_GLOW, '', false);
    const mark = new Graphics();
    if (seen === 'forbidden') drawLock(mark, PORTRAIT * 0.4, THEME.dim);
    mark.position.set(PORTRAIT / 2, PORTRAIT / 2 - PORTRAIT * 0.05);
    slot.container.addChild(mark);
    if (seen === 'uncharted') {
      const ask = new Text({
        text: '?',
        style: { ...TITLE_STYLE, fontSize: Math.round(PORTRAIT * 0.5), fill: THEME.dim },
      });
      ask.anchor.set(0.5);
      ask.position.set(PORTRAIT / 2, PORTRAIT / 2);
      slot.container.addChild(ask);
    }
    this.details.addChild(slot.container);
    const [from, to] = sea.levels;
    const tier = sea.tier === 0 ? t('Starter') : t('Tier {tier}', { tier: sea.tier });
    const where = `${t(sea.name)} · ${tier} · ${t('Lv {from}–{to}', { from, to })}`;
    const why =
      seen === 'forbidden'
        ? t(
            'Only a ship of tier {tier} or higher may sail these waters, and your {ship} may not. What sails them stays unknown till you do.',
            { tier: sea.tier, ship: t(state.ship.shipClass.name) },
          )
        : t(
            'No ship of yours has sailed these waters yet. Sail in through their gate, and the bestiary will tell of every ship and creature in them.',
          );
    const y = this.about(
      seen === 'forbidden' ? t('Forbidden waters') : t('Uncharted waters'),
      where,
      tierColor(sea.tier),
      why,
    );
    return Math.max(PORTRAIT, y);
  }

  /**
   * A board at (x, y): a gold heading with its note, then its lines, every other one shaded; a line with more to tell
   * lit under the pointer, its tip over it. Returns its height
   */
  private board(x: number, y: number, { title, note, lines }: Board) {
    const height = SECTION.pad * 2 + SECTION.heading + lines.length * ROW;
    const g = drawCard(new Graphics(), BOARD_WIDTH, height);
    g.position.set(x, y);
    lines.forEach((_, i) => {
      if (i % 2 === 0) return;
      g.rect(SECTION.pad - 4, SECTION.pad + SECTION.heading + i * ROW, BOARD_WIDTH - (SECTION.pad - 4) * 2, ROW).fill({
        color: 0xffffff,
        alpha: 0.035,
      });
    });
    g.rect(SECTION.pad, SECTION.pad + SECTION.heading - 5, BOARD_WIDTH - SECTION.pad * 2, 1).fill({
      color: THEME.brass,
      alpha: 0.35,
    });
    const heading = subheading(title, 15);
    heading.position.set(x + SECTION.pad, y + SECTION.pad - 2);
    this.details.addChild(g, heading);
    if (note) {
      const aside = text(note, 12, THEME.dim, { fontWeight: 'bold' });
      aside.anchor.set(1, 0.5);
      aside.position.set(x + BOARD_WIDTH - SECTION.pad, heading.y + heading.height / 2);
      clip(aside, BOARD_WIDTH - SECTION.pad * 2 - heading.width - 12);
      this.details.addChild(aside);
    }
    const right = x + BOARD_WIDTH - SECTION.pad;
    let row = y + SECTION.pad + SECTION.heading;
    for (const line of lines) {
      if (line.tip) this.details.addChild(this.tipSpot(line.tip, x, row));
      let valueRight = right;
      if (line.actual) {
        const actual = text(line.actual.text, 13, line.actual.better ? UI.good : UI.warn, { fontWeight: 'bold' });
        actual.anchor.set(1, 0.5);
        actual.position.set(right, row + ROW / 2);
        this.details.addChild(actual);
        valueRight -= actual.width + BRACKET_GAP;
      }
      const value = text(line.value ?? '', 13, line.color ?? THEME.text, { fontWeight: 'bold' });
      value.anchor.set(1, 0.5);
      value.position.set(valueRight, row + ROW / 2);
      const indent = line.part ? INDENT : 0;
      const label = text(line.label, 13, line.part ? THEME.dim : THEME.text, line.strong ? { fontWeight: 'bold' } : {});
      label.anchor.set(0, 0.5);
      label.position.set(x + SECTION.pad + indent, row + ROW / 2);
      const used = right - valueRight + (line.value ? value.width + 10 : 0);
      clip(label, BOARD_WIDTH - SECTION.pad * 2 - indent - used);
      this.details.addChild(label, value);
      row += ROW;
    }
    return height;
  }

  /** Under a line of a board at (x, y) with more to tell: lit faintly under the pointer, its tip shown over it */
  private tipSpot(tip: TooltipText, x: number, y: number) {
    const spot = new Container();
    spot.eventMode = 'static';
    spot.cursor = 'help';
    spot.hitArea = new Rectangle(x, y, BOARD_WIDTH, ROW);
    const light = new Graphics()
      .rect(x + SECTION.pad - 4, y, BOARD_WIDTH - (SECTION.pad - 4) * 2, ROW)
      .fill({ color: THEME.brass, alpha: 0.16 });
    light.visible = false;
    spot.addChild(light);
    spot.on('pointerover', () => {
      light.visible = true;
      const top = TOP + y - this.pane.scrolled;
      this.hint = { tip, x: DETAILS_X + x + BOARD_WIDTH / 2, y: top, under: top + ROW };
    });
    spot.on('pointerout', () => {
      light.visible = false;
      if (this.hint?.tip === tip) this.hint = null;
    });
    return spot;
  }
}
