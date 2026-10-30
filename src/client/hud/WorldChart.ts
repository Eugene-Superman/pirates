import { Container, Graphics, Text, type Rectangle } from 'pixi.js';
import {
  SHIP_CLASSES,
  WORLD_WIDTH,
  ZONES,
  ZONE_IDS,
  seaOpenTo,
  zoneKinds,
  type BotKind,
  type GameState,
  type Zone,
  type ZoneId,
} from '../../game';
import { arrowBob } from './chart';
import { ARROWS, IconSprites } from './iconAtlas';
import { THEME, THEMED_WINDOW, TITLE_STYLE, drawDivider, subheading } from './theme';
import { moonButton } from './nightTheme';
import { HudWindow, Tile, text, tierColor } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1240; // pixels, before scaling down to fit the screen
const HEIGHT = 660;
const PAD = 24;
const DIVIDER = PAD + 50; // the gold line under the title
const TOP = DIVIDER + 44; // where the tiers' columns start, under their headings
const HINT = 30; // the line at the bottom
const DETAILS = 380; // pixels: the column on the right telling of the sea picked
const GAP = 24; // between the chart and the details
const CHART_WIDTH = WIDTH - PAD * 2 - DETAILS - GAP;
const NODE = { width: 108, height: 62 } as const; // pixels: a sea's tile
const TIERS = 7; // columns: the starting waters' tier 0 to tier 6
const LINK = { width: 3, color: 0x7fe3ff, alpha: 0.6 } as const; // the gates between two seas
const HERE = 0xffd447; // the sea the player is in
const PICKED = 0x7fe3ff; // the sea the details tell of
const BOSS_COLOR = 0xff7a6a;
const CLOSED_ALPHA = 0.45; // a sea's name and levels, when the ship's tier is too low for it
const BUTTON = { width: 220, height: 34 } as const;
// Pixels: the arrows over the sea the player is in (gold) and the next one their ship may sail to (ivory), and how far
// over its tile each hangs
const ARROW = { size: 34, gap: 2 } as const;
// For now the details' button takes the player to the sea picked, wherever they are: for the developer. Later the seas
// are reached only through their gates
const JUMP = true;

interface Node {
  readonly zone: Zone;
  readonly tile: Tile;
  readonly frame: Graphics;
}

/**
 * The world chart (N, or its button in the HUD or on the sea chart): every sea, a column a tier of ship from the
 * starting waters on the left to tier 6 on the right, linked by the gates between them, the sea the player is in lit
 * and the ones their ship's tier is too low for dimmed, a gold arrow over it and an ivory one over the next sea along
 * the gates if the ship's tier is high enough for it. On the right, what the sea picked (or under the pointer) is:
 * its tier and levels, what it is like, its gates, what sails it and its boss. For now (JUMP) a button takes the
 * player to the sea picked at once, for the developer; later the seas are reached only through their gates
 */
export class WorldChart {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly nodes: Node[] = [];
  private readonly details = new Container();
  private readonly jump: ReturnType<typeof moonButton>;
  /** Over the sea the player is in and the next one open to their ship, bobbing */
  private readonly arrows = new IconSprites(ARROWS);
  private hovered: Zone | null = null;
  /** The sea the details tell of when the pointer is on none: the one clicked, or the one the player is in */
  private picked: Zone | null = null;
  /** What the tiles and the details were last drawn for, to draw them again only when it changes */
  private shown = '';

  /** travel: takes the player to a sea (the jump) */
  constructor(screen: Rectangle, travel: (zone: ZoneId) => void) {
    this.window = new HudWindow(screen, { width: WIDTH, height: HEIGHT, pad: PAD }, () => this.hide(), THEMED_WINDOW);
    this.container = this.window.container;
    const title = new Text({ text: t('World chart'), style: { ...TITLE_STYLE, fontSize: 28 } });
    title.position.set(PAD, PAD - 6);
    const note = text(t('Every sea, by the tier of ship it is for: its gates lead to the next'), 13, THEME.dim);
    note.position.set(PAD, PAD + 30);
    const links = new Graphics();
    this.window.panel.addChild(title, note, drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2), links);

    const column = CHART_WIDTH / TIERS;
    const area = HEIGHT - TOP - HINT - PAD * 2;
    for (let tier = 0; tier < TIERS; tier++) {
      const heading = subheading(tier === 0 ? t('Starter') : t('Tier {tier}', { tier }), 16);
      heading.anchor.set(0.5, 0);
      heading.position.set(PAD + column * (tier + 0.5), DIVIDER + 12);
      this.window.panel.addChild(heading);
    }
    const centre = (zone: Zone) => ({ x: PAD + column * (zone.tier + 0.5), y: TOP + area * zone.chartY });
    // The gates: each sea to the next, as the ladder goes, under the tiles
    for (let i = 1; i < ZONE_IDS.length; i++) {
      const a = centre(ZONES[ZONE_IDS[i - 1]]);
      const b = centre(ZONES[ZONE_IDS[i]]);
      links.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(LINK);
    }
    for (const id of ZONE_IDS) {
      const zone = ZONES[id];
      const at = centre(zone);
      const tile = new Tile(NODE.width, NODE.height, () => (this.picked = zone), 8);
      tile.container.position.set(Math.round(at.x - NODE.width / 2), Math.round(at.y - NODE.height / 2));
      const name = text(t(zone.name), 12, THEME.text, {
        fontWeight: 'bold',
        wordWrap: true,
        wordWrapWidth: NODE.width - 10,
        align: 'center',
      });
      name.anchor.set(0.5, 0);
      name.position.set(NODE.width / 2, 6);
      const [from, to] = zone.levels;
      const levels = text(t('Lv {from}–{to}', { from, to }), 11, tierColor(Math.max(1, zone.tier)));
      levels.anchor.set(0.5, 1);
      levels.position.set(NODE.width / 2, NODE.height - 6);
      const frame = new Graphics();
      tile.content.addChild(name, levels);
      tile.container.addChild(frame);
      tile.container.on('pointerover', () => (this.hovered = zone));
      tile.container.on('pointerout', () => {
        if (this.hovered === zone) this.hovered = null;
      });
      this.window.panel.addChild(tile.container);
      this.nodes.push({ zone, tile, frame });
    }

    const right = WIDTH - PAD - DETAILS;
    const rule = new Graphics()
      .rect(right - GAP / 2, DIVIDER + 12, 1, HEIGHT - DIVIDER - PAD * 2 - HINT - 4)
      .fill({ color: THEME.brass, alpha: 0.3 });
    this.details.position.set(right, DIVIDER + 12);
    this.jump = moonButton(BUTTON.width, BUTTON.height, t('Sail there (developer)'), () => {
      if (this.picked) travel(this.picked.id);
    });
    this.jump.tile.container.position.set(right, HEIGHT - PAD - HINT - BUTTON.height - 8);
    this.jump.tile.container.visible = JUMP;
    const hint = text(t('Click a sea to read about it; sail into its gates to go there'), 12, THEME.dim);
    hint.position.set(PAD, HEIGHT - PAD - HINT + 8);
    drawDivider(links, PAD, HEIGHT - PAD - HINT, WIDTH - PAD * 2);
    this.window.panel.addChild(rule, this.details, this.jump.tile.container, hint, this.arrows.container);
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
    this.hovered = null;
  }

  update(state: GameState) {
    if (!this.isOpen) return;
    this.window.fit();
    const tier = state.ship.shipClass.tier;
    const here = ZONES[state.world.zone];
    this.pointArrows(here, tier);
    const told = this.hovered ?? this.picked ?? here;
    const charted = state.player.charted;
    const key = `${told.id}:${here.id}:${tier}:${this.picked?.id ?? ''}:${charted.join()}`;
    if (key === this.shown) return;
    this.shown = key;
    for (const { zone, tile, frame } of this.nodes) {
      const lit = zone === here ? HERE : zone === told ? PICKED : null;
      frame.clear();
      if (lit !== null) frame.roundRect(-3, -3, NODE.width + 6, NODE.height + 6, 10).stroke({ width: 2.5, color: lit });
      tile.setLook({ pressed: zone === here });
      tile.content.alpha = seaOpenTo(zone.id, tier) ? 1 : CLOSED_ALPHA;
    }
    // The jump goes to the sea clicked
    this.jump.tile.setLook({ disabled: (this.picked ?? here) === here });
    this.describe(told, here, tier, charted.includes(told.id));
  }

  /**
   * The arrows over the tiles, bobbing: the gold one over the sea the player is in, the ivory one over the next sea
   * along the gates, when a ship of `tier` may sail there
   */
  private pointArrows(here: Zone, tier: number) {
    const nextId = ZONE_IDS[ZONE_IDS.indexOf(here.id) + 1];
    const next = nextId ? ZONES[nextId] : null;
    const bob = arrowBob(performance.now() / 1000);
    const arrows = this.arrows;
    arrows.begin();
    for (const { zone, tile } of this.nodes) {
      const id = zone === here ? 'downGold' : zone === next && seaOpenTo(zone.id, tier) ? 'downIvory' : null;
      if (!id) continue;
      const { x, y } = tile.container;
      arrows.put(id, x + NODE.width / 2, y - ARROW.gap - ARROW.size / 2 - bob, ARROW.size);
    }
    arrows.end();
  }

  /** The details of a sea, down the column on the right: what sails it only once the player has sailed it (`charted`) */
  private describe(zone: Zone, here: Zone, tier: number, charted: boolean) {
    for (const child of this.details.removeChildren()) child.destroy({ children: true });
    let y = 0;
    const add = (part: Text, gap = 6) => {
      part.position.set(0, y);
      this.details.addChild(part);
      y += part.height + gap;
    };
    const [from, to] = zone.levels;
    add(subheading(t(zone.name), 22), 2);
    const kind =
      zone.tier === 0
        ? t('The starting waters, levels {from}–{to}', { from, to })
        : t('A tier {tier} sea, levels {from}–{to}', { tier: zone.tier, from, to });
    add(text(kind, 13, tierColor(Math.max(1, zone.tier)), { fontWeight: 'bold' }), 2);
    const open = seaOpenTo(zone.id, tier);
    const status =
      zone === here
        ? t('You are here')
        : open
          ? t('Open to your ship')
          : t('Needs a ship of tier {tier}', { tier: zone.tier });
    add(text(status, 12, zone === here ? HERE : open ? THEME.text : THEME.dim), 10);
    add(text(t(zone.about), 13, THEME.text, { wordWrap: true, wordWrapWidth: DETAILS, lineHeight: 18 }), 12);

    add(subheading(t('Gates'), 15), 4);
    for (const gate of zone.gates) {
      const sea = ZONES[gate.to];
      const side = gate.at.x < WORLD_WIDTH / 2 ? 'West gate: {sea} (tier {tier})' : 'East gate: {sea} (tier {tier})';
      add(text(`• ${t(side, { sea: t(sea.name), tier: sea.tier })}`, 12, THEME.text), 2);
    }
    y += 10;

    add(subheading(t('What sails it'), 15), 4);
    if (!charted) {
      add(text(t('Unknown: no ship of yours has sailed it yet'), 12, THEME.dim), 2);
      return;
    }
    for (const bot of zoneKinds(zone.id)) add(text(`• ${botLine(bot)}`, 12, bot.boss ? BOSS_COLOR : THEME.text), 2);
  }
}

/**
 * A kind of bot in a line: its hull, its level, how it behaves, whether it is the sea's boss or a mini-boss, and its
 * packs
 */
function botLine(bot: BotKind) {
  const name = t(SHIP_CLASSES[bot.shipClass].name);
  const temper = bot.boss
    ? bot.boss.mini
      ? t('mini-boss')
      : t('boss')
    : bot.behaviour === 'aggressive'
      ? t('aggressive')
      : t('neutral');
  const pack = bot.pack > 1 ? ` · ${t('in packs of {n}', { n: bot.pack })}` : '';
  return `${name} · ${t('Lv {level}', { level: bot.level })} · ${temper}${pack}`;
}
