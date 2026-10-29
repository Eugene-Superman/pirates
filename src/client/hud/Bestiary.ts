import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import {
  AMMO,
  BOT_KINDS,
  GOODS,
  GUNS,
  OFF_TARGET_SHARE,
  SHIP_CLASSES,
  WEAPONS,
  WEAPON_IDS,
  ZONES,
  ZONE_IDS,
  averageDamage,
  botsInSea,
  zoneKinds,
  type BotKind,
  type BotKindId,
  type DamageDie,
  type GameState,
  type GunId,
  type ShipClass,
  type ZoneId,
} from '../../game';
import { HullPortrait } from '../scene/models/portrait';
import { HULL_LORE } from './bestiaryLore';
import { squareName } from './chart';
import { KNOT } from './itemFaces';
import { BRASS, THEME, THEMED_WINDOW, TITLE_STYLE, drawCard, drawDivider, iconSlot, subheading } from './theme';
import { HudWindow, Tile, UI, clip, text, tierColor, whole } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1270; // pixels, before scaling down to fit the screen
const HEIGHT = 730; // pixels: enough for the biggest bot's boards; it grows if one ever needs more
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 16; // where the columns start
const SEA = { width: 226, height: 32, gap: 4 } as const; // pixels: a sea's tab
const KIND = { width: 256, height: 64, gap: 6, icon: 52 } as const; // pixels: a bot's tab, and its portrait's slot
const KINDS_X = PAD + SEA.width + 14;
const DETAILS_X = KINDS_X + KIND.width + 20;
const DETAILS_WIDTH = WIDTH - PAD - DETAILS_X;
const PORTRAIT = 128; // pixels: the bot picked, its portrait's slot
const ABOUT_X = PORTRAIT + 18; // pixels: its name and legend, right of its portrait
const BOARD_GAP = 14; // pixels between the two columns of boards, between two boards, and over them
const BOARD_WIDTH = (DETAILS_WIDTH - BOARD_GAP) / 2;
const SECTION = { pad: 10, heading: 28 } as const; // pixels: inside a board, and its heading
const ROW = 20; // pixels a line
const INDENT = 12; // pixels a part of the line above is set in
const HERE = 0xffd447; // the sea the player is in, outlined as on the world chart
const BOSS_COLOR = 0xff7a6a;
const STRONGER = 0.005; // a sea's strength further than this from 1 is shown

/** A line of a board: a label and its value; `part` of the line above (set in, dim), or `strong` (bold) */
interface Line {
  readonly label: string;
  readonly value?: string;
  readonly color?: number;
  readonly part?: boolean;
  readonly strong?: boolean;
}

/** A board of lines under a gold heading, and a note right of the heading */
interface Board {
  readonly title: string;
  readonly note?: string;
  readonly lines: readonly Line[];
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
  if (kind.boss) return { name: t('Boss'), color: BOSS_COLOR };
  return kind.behaviour === 'aggressive'
    ? { name: t('Aggressive'), color: UI.hostile }
    : { name: t('Neutral'), color: UI.good };
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

/** How it behaves, how many of it sail its sea, and how soon one sunk comes back */
function seaBoard(kind: BotKind): Board {
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const armed = shipClass.bite !== null || gunsOf(shipClass).size > 0;
  const { name, color } = temper(kind);
  const lair = kind.boss?.lair;
  return {
    title: t('At sea'),
    lines: [
      { label: t('Temper'), value: name, color },
      kind.behaviour === 'aggressive'
        ? { label: t('Attacks a ship within'), value: String(kind.aggroRange) }
        : { label: t('When attacked'), value: armed ? t('fights back') : t('runs') },
      lair
        ? { label: t('Lair'), value: squareName(lair.x, lair.y) }
        : { label: t('In its sea'), value: t('about {n}', { n: botsInSea(kind) }) },
      { label: t('Back after it sinks'), value: duration(kind.respawnTime) },
    ],
  };
}

/** What sinking it pays: the bounty, the experience, a chest's gold and the goods its wreck may leave */
function spoilsBoard(kind: BotKind): Board {
  const { chest, cargo } = kind;
  return {
    title: t('Spoils'),
    lines: [
      { label: t('Bounty'), value: t('{n} gold', { n: kind.bounty }) },
      { label: t('Experience'), value: t('{n} XP', { n: kind.xp }) },
      {
        label: t('Chest of gold'),
        value: chest ? `${percent(chest.chance)} · ${chest.gold[0]}–${chest.gold[1]}` : '—',
      },
      ...(cargo.length > 0 ? [{ label: t('Goods it may leave') }] : []),
      ...cargo.map(({ good, count: [from, to], chance }) => ({
        label: t(GOODS[good].name),
        value: `×${from === to ? from : `${from}–${to}`} · ${percent(chance)}`,
        part: true,
      })),
    ],
  };
}

/** Its guns, the same ones together, and the ammo they fire; or its jaws; or nothing, and it runs */
function weaponBoard(kind: BotKind): Board {
  const shipClass = SHIP_CLASSES[kind.shipClass];
  const { power } = kind;
  const note = Math.abs(power - 1) > STRONGER ? t('×{n} in its sea', { n: power.toFixed(2) }) : undefined;
  const { bite } = shipClass;
  if (bite) {
    return {
      title: t('Jaws'),
      note,
      lines: [
        { label: t('Bite'), value: `d${bite.die} + ${bite.bonus}`, strong: true },
        ...blowLines(bite, bite.bonus, power, true),
        { label: t('Reach · every'), value: `${bite.reach} · ${t('{n} s', { n: bite.reload })}`, part: true },
        { label: t('Damage a second'), value: figure((averageDamage(bite, bite.bonus) * power) / bite.reload) },
      ],
    };
  }
  const guns = gunsOf(shipClass);
  if (guns.size === 0) return { title: t('Guns'), lines: [{ label: t('None: it runs when attacked') }] };
  const ammo = kind.ammo ? AMMO[kind.ammo] : null;
  const lines: Line[] = [];
  let perSecond = 0;
  for (const [id, count] of guns) {
    const gun = GUNS[id];
    const bonus = ammo?.weapon === gun.weapon ? ammo.bonus : 0;
    perSecond += (count * averageDamage(gun, bonus) * power) / gun.reload;
    lines.push(
      { label: `${count} × ${t(gun.name)}`, value: `d${gun.die}`, strong: true },
      ...blowLines(gun, bonus, power, true),
      { label: t('Reach · reload'), value: `${gun.range} · ${t('{n} s', { n: gun.reload })}`, part: true },
    );
  }
  if (ammo) lines.push({ label: t('Ammo'), value: `${t(ammo.name)}  +${ammo.bonus}` });
  lines.push({ label: t('Damage a second, every gun'), value: figure(perSecond) });
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

/** A boss's escort: the bots that follow it and join its fights */
function escortBoard(kind: BotKind): Board | null {
  if (!kind.boss) return null;
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
 * The bestiary (B, the Seas row's button, or a click on the plate of a bot picked out): every kind of bot of every
 * sea, in the windows' theme. The seas down the left, the sea picked's bots beside them, a tab each with its portrait,
 * and the bot picked on the right: its portrait and legend, its hull, temper and spoils, its guns or jaws (how many,
 * which, their dice, crits and misses, reach and reload, the damage they do in its sea), a boss's mortar and escort.
 * Read from the game's own tables, so it tells what the game does
 */
export class Bestiary {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly seas = new Container();
  private readonly kinds = new Container();
  private readonly details = new Container();
  /** The sea picked; null: the one the player is in */
  private zone: ZoneId | null = null;
  /** The bot picked; null, or not of the sea picked: its first */
  private kind: BotKindId | null = null;
  /** What the columns were last built for, to build them again only when it changes */
  private shown = '';
  /** The portraits shown, each waiting for its atlas */
  private portraits: HullPortrait[] = [];
  private height = HEIGHT;

  constructor(screen: Rectangle) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;
    const title = new Text({ text: t('Bestiary'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(
      t('Every ship and creature of every sea: what it carries, how hard it hits, what it is worth'),
      13,
      THEME.dim,
    );
    note.position.set(PAD, PAD + 30);
    this.seas.position.set(PAD, TOP);
    this.kinds.position.set(KINDS_X, TOP);
    this.details.position.set(DETAILS_X, TOP);
    this.window.panel.addChild(
      title,
      note,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.seas,
      this.kinds,
      this.details,
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
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    this.window.fit();
    for (const portrait of this.portraits) portrait.update();
    const here = state.world.zone;
    const zone = this.zone ?? here;
    const kinds = zoneKinds(zone);
    const kind = kinds.find((k) => k.id === this.kind) ?? kinds[0];
    const key = `${zone}|${kind.id}|${here}`;
    if (key === this.shown) return;
    this.shown = key;
    this.portraits = [];
    this.showSeas(zone, here);
    this.showKinds(kinds, kind);
    this.showDetails(kind, zone);
    const needed = TOP + Math.max(this.seas.height, this.kinds.height, this.details.height) + PAD;
    if (needed > this.height) {
      this.height = needed;
      this.window.resize(needed);
    }
  }

  /** Every sea, by the ladder of tiers: its name and levels, the one picked gold, the player's outlined */
  private showSeas(picked: ZoneId, here: ZoneId) {
    for (const child of this.seas.removeChildren()) child.destroy({ children: true });
    ZONE_IDS.forEach((id, i) => {
      const zone = ZONES[id];
      const on = id === picked;
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
      const name = text(t(zone.name), 12, on ? THEME.darkText : THEME.text, { fontWeight: 'bold' });
      name.anchor.set(0, 0.5);
      name.position.set(12, SEA.height / 2);
      clip(name, SEA.width - 12 - levels.width - 16);
      tile.content.addChild(stripe, name, levels);
      if (id === here) {
        tile.container.addChild(
          new Graphics().roundRect(-2, -2, SEA.width + 4, SEA.height + 4, 8).stroke({ width: 2, color: HERE }),
        );
      }
      tile.container.position.set(0, i * (SEA.height + SEA.gap));
      this.seas.addChild(tile.container);
    });
  }

  /** The sea's bots: a tab each with its portrait in a slot lit in its tier's colour, its level on the chip */
  private showKinds(kinds: readonly BotKind[], picked: BotKind) {
    for (const child of this.kinds.removeChildren()) child.destroy({ children: true });
    kinds.forEach((kind, i) => {
      const on = kind === picked;
      const tile = new Tile(KIND.width, KIND.height, () => (this.kind = kind.id), 6, BRASS);
      tile.setLook({ pressed: on });
      const slot = this.portraitSlot(kind, KIND.icon);
      slot.position.set(6, (KIND.height - KIND.icon) / 2);
      const x = 6 + KIND.icon + 10;
      const name = text(t(SHIP_CLASSES[kind.shipClass].name), 14, on ? THEME.darkText : THEME.text, {
        fontWeight: 'bold',
      });
      name.position.set(x, 13);
      clip(name, KIND.width - x - 8);
      const { name: mood, color } = temper(kind);
      const note = text(`${mood} · ${t('Lv {level}', { level: kind.level })}`, 12, on ? THEME.darkText : color);
      note.position.set(x, 35);
      tile.content.addChild(slot, name, note);
      tile.container.position.set(0, i * (KIND.height + KIND.gap));
      this.kinds.addChild(tile.container);
    });
  }

  /** A bot's portrait in a slot lit in its tier's colour (a boss's in red), its level on the chip */
  private portraitSlot(kind: BotKind, size: number) {
    const slot = iconSlot(size, kind.boss ? BOSS_COLOR : tierColor(kind.tier), `${kind.level}`, false);
    const portrait = new HullPortrait(kind.shipClass, size - 6);
    portrait.container.position.set(3, 3);
    // Over the slot's well, under its chip
    slot.container.addChildAt(portrait.container, 1);
    this.portraits.push(portrait);
    return slot.container;
  }

  /** The bot picked: its portrait, name, sea and legend, then its boards in two columns */
  private showDetails(kind: BotKind, zone: ZoneId) {
    for (const child of this.details.removeChildren()) child.destroy({ children: true });
    const sea = ZONES[zone];
    const shipClass = SHIP_CLASSES[kind.shipClass];
    this.details.addChild(this.portraitSlot(kind, PORTRAIT));
    const width = DETAILS_WIDTH - ABOUT_X;
    let y = 0;
    const add = (part: Text, gap: number) => {
      part.position.set(ABOUT_X, y);
      this.details.addChild(part);
      y += part.height + gap;
    };
    add(subheading(t(shipClass.name), 24), 2);
    const tier = sea.tier === 0 ? t('Starter') : t('Tier {tier}', { tier: sea.tier });
    const where = `${t(sea.name)} · ${tier} · ${t('Lv {level}', { level: kind.level })}`;
    add(text(where, 13, tierColor(sea.tier), { fontWeight: 'bold' }), 8);
    const lore = HULL_LORE[kind.shipClass];
    if (lore) add(text(t(lore), 13, THEME.text, { wordWrap: true, wordWrapWidth: width, lineHeight: 18 }), 0);

    const top = Math.max(PORTRAIT, y) + BOARD_GAP;
    const left = [hullBoard(kind), seaBoard(kind), spoilsBoard(kind)];
    const right = [weaponBoard(kind), mortarBoard(kind), escortBoard(kind)].filter((board) => board !== null);
    for (const [x, boards] of [
      [0, left],
      [BOARD_WIDTH + BOARD_GAP, right],
    ] as const) {
      let at = top;
      for (const board of boards) at += this.board(x, at, board) + BOARD_GAP;
    }
  }

  /** A board at (x, y): a gold heading with its note, then its lines, every other one shaded. Returns its height */
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
      this.details.addChild(aside);
    }
    let row = y + SECTION.pad + SECTION.heading;
    for (const line of lines) {
      const value = text(line.value ?? '', 13, line.color ?? THEME.text, { fontWeight: 'bold' });
      value.anchor.set(1, 0.5);
      value.position.set(x + BOARD_WIDTH - SECTION.pad, row + ROW / 2);
      const indent = line.part ? INDENT : 0;
      const label = text(line.label, 13, line.part ? THEME.dim : THEME.text, line.strong ? { fontWeight: 'bold' } : {});
      label.anchor.set(0, 0.5);
      label.position.set(x + SECTION.pad + indent, row + ROW / 2);
      clip(label, BOARD_WIDTH - SECTION.pad * 2 - indent - (line.value ? value.width + 10 : 0));
      this.details.addChild(label, value);
      row += ROW;
    }
    return height;
  }
}
