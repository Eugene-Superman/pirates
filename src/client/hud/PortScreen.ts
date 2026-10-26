import { Container, Graphics, Sprite, Text, type Rectangle } from 'pixi.js';
import {
  AMMO_IDS,
  GOODS,
  GOOD_IDS,
  GUN_IDS,
  MAX_QUESTS,
  OUTFIT_IDS,
  QUESTS,
  QUEST_IDS,
  REPAIR_HP_PER_GOLD,
  SHIPYARD_LINES,
  SHIP_CLASSES,
  SHIP_LINES,
  captainsPath,
  cargoCount,
  cargoValue,
  goalOffer,
  isLineShip,
  lineShip,
  offerName,
  questDone,
  questOffered,
  repairPrice,
  termsMet,
  type AmmoId,
  type GameState,
  type GoodId,
  type GunId,
  type OutfitId,
  type OutfitSlot,
  type PlayerLineId,
  type QuestId,
  type Ship,
  type WeaponId,
} from '../../game';
import { BUILDINGS, HarbourView, type BuildingId } from './HarbourView';
import type { ConfirmDialog } from './ConfirmDialog';
import { ItemInfo } from './ItemInfo';
import { AMMO_ICONS, GUN_ICONS, OUTFIT_ICONS, SHIP_ICONS } from './iconAtlas';
import { KNOT, itemFace, type ItemButton, type ItemFace, type ShopItem, type Tone } from './itemFaces';
import { abandonQuestion } from './QuestTracker';
import { LINE_STYLE } from './shipLore';
import {
  BRASS,
  THEME,
  TITLE_STYLE,
  brassButton,
  drawCard,
  drawDivider,
  drawMeter,
  glowFill,
  iconSlot,
  subheading,
  themedPanel,
} from './theme';
import { GOODS_LIST, goodRow } from './goodIcons';
import { Tile, UI, clip, drawCoin, playTap, show, text, tierColor, tint } from './ui';
import { t } from '../i18n/i18n';

/** What the port's menus do: game methods, each saying whether it worked */
export interface PortActions {
  leavePort: () => void;
  buyGun: (gun: GunId) => boolean;
  buyAmmo: (ammo: AmmoId, count?: number) => boolean;
  /** Sells a gun from the hold, or a pack of an ammo, back to the arsenal for a quarter of its price */
  sellGun: (gun: GunId) => boolean;
  sellAmmo: (ammo: AmmoId, count?: number) => boolean;
  repairInPort: () => boolean;
  buyOutfit: (id: OutfitId) => boolean;
  /** Fits a piece of outfit from the hold into its slot, or takes the slot's piece off (null) */
  fitOutfit: (slot: OutfitSlot, id: OutfitId | null) => boolean;
  takeQuest: (id: QuestId) => boolean;
  turnInQuest: (id: QuestId) => boolean;
  dropQuest: (id: QuestId) => void;
  /** Sells every piece of a good in the hold at the market, or everything (no good given) */
  sellCargo: (good?: GoodId) => boolean;
  /** Buys the ship the shipyard offers and takes its helm */
  buyShip: () => boolean;
  /** Takes the helm of a ship laid up in port (its place in the player's fleet) */
  takeHelm: (index: number) => boolean;
}

// A building's window, over the harbour's picture
const WIDTH = 860; // pixels, before scaling down to fit the screen
const HEIGHT = 720;
const MARGIN = 20; // between the window and the screen's edge, at least
const PAD = 18;
const ICON = 64; // pixels: the building's medallion in the window's corner
const DIVIDER = PAD + ICON + 7; // the gold line under the header
const TABS_TOP = PAD + ICON + 18; // the row of tabs under the building's name, when it has more than one
const BODY_TOP = { tabs: TABS_TOP + 38, plain: PAD + ICON + 20 }; // where its rows start, under the tabs or not
const BODY_WIDTH = WIDTH - PAD * 2;
const TAVERN_WIDTH = BODY_WIDTH;
const SHOP_WIDTH = BODY_WIDTH;
const QUEST_HEIGHT = 84;
const QUEST_GAP = 8;
const DIAL = 28; // pixels: the radius of a quest's dial, how far it has got
const QUEST_BUTTON = { width: 96, drop: 60, height: 26 } as const; // pixels: Take or Turn in, and Drop
const QUEST_RIGHT = 190; // pixels at a quest's right end for its reward and buttons, beside its text
const XP_COLOR = 0x5aa8ff; // a quest's experience, as under the player's frame
const SELL_ALL = { width: 230, height: 30 } as const; // pixels: the market's Sell everything
// The guns, the ammo and the outfit, two cards a row (pixels): a card's height, the gaps between them, the icon's
// slot, the info button
const CARD = { height: 100, gap: 12, rowGap: 8, slot: 84, inset: 10 } as const;
const CARD_WIDTH = (BODY_WIDTH - CARD.gap) / 2;
const INFO = { width: 30, size: 16 } as const;
const BUY = { width: 64, height: 24 };
const SHIP_BUY = 120; // pixels: a ship's card's button (Take the helm)
const BACK = { width: 220, height: 30 };
const MESSAGE_TIME = 3.5; // seconds a message stays
const DIM_ALPHA = 0.6; // how dark the harbour's picture is behind a building's window
const GOLD = 0xffcf3f;
const CLOSED_ICON = 170; // pixels: the medallion of a building that isn't open yet

type ShopTab =
  | WeaponId
  | 'cannonballs'
  | 'harpoons'
  | OutfitSlot
  | 'shipwright'
  | 'market'
  | 'myShips'
  | Exclude<PlayerLineId, 'starter'>;
const TABS: Readonly<Record<ShopTab, string>> = {
  cannon: 'Cannons',
  harpoon: 'Harpoon guns',
  cannonballs: 'Cannonballs',
  harpoons: 'Harpoons',
  sails: 'Sails',
  hull: 'Hull',
  rudder: 'Rudder',
  lookout: 'Lookout',
  shipwright: 'Repairs',
  market: 'Market',
  myShips: 'My ships',
  premium: 'Buy',
  european: 'European',
  eastern: 'Eastern',
  pirate: 'Free pirates',
  northern: 'Northern',
  legendary: 'Legendary',
};
const TAB_IDS: readonly ShopTab[] = [
  'cannon',
  'harpoon',
  'cannonballs',
  'harpoons',
  'sails',
  'hull',
  'rudder',
  'lookout',
  'shipwright',
  'market',
  'myShips',
  'european',
  'eastern',
  'pirate',
  'northern',
  'legendary',
  'premium',
];
/** The tabs of ammo, and the weapon whose ammo each sells */
const AMMO_TABS: Partial<Record<ShopTab, WeaponId>> = { cannonballs: 'cannon', harpoons: 'harpoon' };
/** The workshop's tabs of outfit, a slot's each */
const OUTFIT_TABS: Partial<Record<ShopTab, OutfitSlot>> = {
  sails: 'sails',
  hull: 'hull',
  rudder: 'rudder',
  lookout: 'lookout',
};
/** The shipyard's tabs of a line's ships */
const LINE_TABS: Partial<Record<ShopTab, PlayerLineId>> = Object.fromEntries(
  SHIPYARD_LINES.map((line) => [line, line]),
);
const TONES: Readonly<Record<Tone, number>> = { good: UI.good, bad: UI.bad, plain: THEME.dim };
/** What each building's window shows: its tabs (none for the tavern, which has the quests, or one that isn't open) */
const BUILDING_TABS: Readonly<Record<BuildingId, readonly ShopTab[]>> = {
  tavern: [],
  market: ['market'],
  workshop: ['sails', 'hull', 'rudder', 'lookout', 'shipwright'],
  shipyard: ['myShips', 'european', 'eastern', 'pirate', 'northern', 'legendary', 'premium'],
  arsenal: ['cannon', 'harpoon', 'cannonballs', 'harpoons'],
  guild: [],
  auction: [],
};
/** The buildings that aren't open yet: what will be there */
const CLOSED: Partial<Record<BuildingId, string>> = {
  guild:
    'Captains will band together here: found a guild, share its treasury, sail out and fight side by side. It opens with the online game.',
  auction:
    'Captains will sell one another guns, outfit and goods here, each at their own price. It opens with the online game.',
};
/** What a line's tab says after its look: how its ships are got, for the lines whose ships aren't the shipyard's */
const LINE_NOTES: Partial<Record<PlayerLineId, string>> = {
  legendary:
    'Each is won its own way and paid in its own currency: sea monster hunts, boss fights, treasure maps, the arena, events and guild battles.',
  premium:
    'Bought with doubloons, once you have a ship of the same tier of another line at its last level. As strong as the ships of their tier, no stronger: what you pay for is their looks.',
};
const TAB = { pad: 10, gap: 6 } as const; // pixels: inside a tab beside its name, and between two
const PATH_LINE = 21; // pixels: a term of the shipyard's offer
const LIST_BOTTOM = HEIGHT - PAD - 20; // pixels: where a tab's rows are cut off, over the message under them
const SCROLL = { speed: 0.6, bar: 4, margin: 2 } as const; // pixels per unit of the wheel; the scroll bar's width
const TIER_HEADING = 28; // pixels: a tier's heading over its ships, in a line of several ships a tier

/** The ship's figures that its outfit changes, in a line */
function shipFigures(ship: Ship) {
  const turn = Math.round((ship.turnSpeed * 180) / Math.PI);
  return t('Speed {speed} kn · Turn {turn}°/s · Hull {hull} · Sight {sight}', {
    speed: (ship.maxSpeed / KNOT).toFixed(1),
    turn,
    hull: ship.maxHp,
    sight: ship.viewRange,
  });
}

/** A mark over a building's medallion when something waits there: quests to turn in, goods to sell, a ship to buy */
function badges(state: GameState): Partial<Record<BuildingId, string>> {
  const { player, ship } = state;
  const done = player.quests.filter(questDone).length;
  const cargo = cargoCount(ship.cargo);
  return {
    tavern: done > 0 ? String(done) : '',
    market: cargo > 0 ? String(cargo) : '',
    workshop: ship.hp < ship.maxHp ? '!' : '',
    shipyard: goalOffer(state, player) && termsMet(state, player) ? '!' : '',
  };
}

/** What the shipyard's cards depend on: the ship sailed, those laid up, the ship worked towards */
function fleetKey(state: GameState) {
  const { ship, player } = state;
  const goal = goalOffer(state, player);
  return `${ship.shipClass.id}:${player.fleet.map((kept) => kept.shipClass).join()}:${goal?.shipClass ?? ''}`;
}

/** A tavern quest as the player has it: not offered yet, offered, taken, or done and waiting to be turned in */
type QuestState = 'locked' | 'offered' | 'taken' | 'done';

interface QuestView {
  readonly id: QuestId;
  readonly background: Graphics;
  /** How far it has got, round the count in it (or a lock, or a tick) */
  readonly dial: Graphics;
  readonly mark: Graphics;
  readonly count: Text;
  /** Its words: dimmed while it isn't offered */
  readonly body: Container;
  readonly about: Text;
  /** The state and kills its card and dial were last drawn for, '' before */
  painted: string;
  readonly button: Tile;
  readonly buttonText: Text;
  readonly drop: Tile;
}

/** A card of the arsenal, the workshop or the shipyard: what it says of its item, how many the player has (or how
 * far its ship has got), and its button */
interface ShopRow {
  readonly face: ItemFace;
  readonly background: Graphics;
  /** Whether the background was last drawn outlined (the item in use), null before it was drawn */
  painted: boolean | null;
  readonly owned: Text;
  readonly button: Tile;
  readonly label: Text;
  /** Its Sell button, for what the arsenal buys back */
  readonly sell: { readonly tile: Tile; readonly label: Text } | null;
}

/**
 * A quest's dial round (0, 0), `radius` pixels: a brass ring round a dark well lit in `color` (unless it is locked),
 * and a track round it filled `share` of the way, from the top clockwise
 */
function drawDial(g: Graphics, radius: number, share: number, color: number, lit: boolean) {
  g.circle(0, 0, radius).fill({ color: 0x0a0705 }).stroke({ width: 3, color: THEME.brass });
  if (lit) g.circle(0, 0, radius - 2).fill(glowFill(color));
  const track = radius - 8;
  g.circle(0, 0, track).stroke({ width: 5, color: 0x000000, alpha: 0.5 });
  if (share <= 0) return;
  const start = -Math.PI / 2;
  g.moveTo(0, -track)
    .arc(0, 0, track, start, start + Math.PI * 2 * Math.min(1, share))
    .stroke({ width: 5, color, cap: 'round' });
}

/** A tick round (0, 0), `size` pixels across: a quest done */
function drawTick(g: Graphics, size: number, color: number) {
  const h = size / 2;
  g.moveTo(-h, 0)
    .lineTo(-h * 0.2, h * 0.75)
    .lineTo(h, -h * 0.7)
    .stroke({ width: 4, color, cap: 'round', join: 'round' });
}

/** A padlock round (0, 0), `size` pixels tall: a quest not offered yet */
function drawLock(g: Graphics, size: number, color: number) {
  const h = size / 2;
  const shackle = h * 0.55;
  g.moveTo(-shackle, 0)
    .arc(0, 0, shackle, Math.PI, Math.PI * 2)
    .stroke({ width: 2.5, color });
  g.roundRect(-h * 0.8, 0, h * 1.6, h, 2).fill({ color });
}

/**
 * A quest's card and dial as the player has it: dim with a lock until it is offered, the count to sink while it is
 * on offer, the kills so far round the dial once taken (its card edged in brass), and a green tick when done
 */
function paintQuest(view: QuestView, look: QuestState, kills: number, count: number) {
  const done = look === 'done';
  const color = done ? UI.good : look === 'locked' ? THEME.dim : THEME.title;
  const share = done ? 1 : look === 'taken' ? kills / count : 0;
  drawDial(view.dial.clear(), DIAL, share, color, look !== 'locked');
  view.mark.clear();
  if (done) drawTick(view.mark, DIAL * 0.8, UI.good);
  else if (look === 'locked') drawLock(view.mark, DIAL * 0.75, THEME.dim);
  show(view.count, look === 'taken' ? `${kills}/${count}` : look === 'offered' ? `×${count}` : '');
  tint(view.count, look === 'taken' ? THEME.text : THEME.title);
  view.body.alpha = look === 'locked' ? 0.6 : 1;
  const edge = done ? UI.good : look === 'taken' ? THEME.brassLight : undefined;
  drawCard(view.background.clear(), TAVERN_WIDTH, QUEST_HEIGHT, done ? UI.good : edge && THEME.brass, edge);
}

/**
 * The port, over everything while the player's ship is in port: the harbour's picture with a medallion over each
 * building (HarbourView), and the window of the building clicked over it. The tavern has bounties to take, how far
 * each has got and the reward to collect; the market buys the hold's goods; the workshop sells and fits the ship's
 * outfit and mends its hull; the shipyard keeps the player's ships and shows every line's, built and planned, selling
 * the next one; the arsenal sells guns and ammo. The guild hall and the auction house aren't open yet. Escape closes a building's window, then sets sail
 */
export class PortScreen {
  readonly container = new Container();
  private readonly harbour: HarbourView;
  /** A gun, an ammo or a piece of outfit up close, over the arsenal or the workshop */
  private readonly info: ItemInfo;
  /** The HUD's question before what can't be undone (selling an item back), over every window */
  private readonly confirm: ConfirmDialog;
  /** A building's window and the dim behind it */
  private readonly building = new Container();
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly icon = new Sprite();
  private readonly title = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: 26 } });
  private readonly about = text('', 13, THEME.dim, {
    wordWrap: true,
    wordWrapWidth: WIDTH - PAD * 3 - ICON - BACK.width,
  });
  private readonly gold = text('', 18, GOLD, { fontWeight: 'bold' });
  private readonly coin = new Graphics();
  private readonly message = text('', 13, THEME.text, { fontWeight: 'bold' });
  /** The ship's figures, at the bottom of the workshop's outfit while no message is there */
  private readonly figures = text('', 12, THEME.dim);
  /** The tavern's quests, shown in its window */
  private readonly tavern = new Container();
  private readonly quests: QuestView[] = [];
  /** A building that isn't open yet: its medallion and what will be there */
  private readonly closed = new Container();
  private readonly closedIcon = new Sprite();
  private readonly closedText = text('', 15, THEME.text, {
    wordWrap: true,
    wordWrapWidth: BODY_WIDTH - CLOSED_ICON - 40,
  });
  private readonly tabs: { id: ShopTab; tile: Tile; label: Text }[];
  /** A tab's rows, scrolled with the mouse wheel or the bar beside them when they are taller than the window */
  private readonly list = new Container();
  /** The rows' mask: what of them shows */
  private readonly clip = new Graphics();
  private readonly scrollBar = new Graphics();
  private scroll = 0;
  /** Where the rows start in the window, scrolled to the top */
  private listTop: number = BODY_TOP.tabs;
  /** How tall the rows are, measured as they are made (a masked container is only as tall as its mask) */
  private listHeight = 0;
  /** Where the scroll bar was grabbed: the pointer's y and the scroll then; null while it isn't dragged */
  private dragging: { readonly y: number; readonly scroll: number } | null = null;
  private rows: ShopRow[] = [];
  private repair: { tile: Tile; label: Text; hull: Text } | null = null;
  private market: { hold: Text; sellAll: Tile; sellText: Text } | null = null;
  /** The Captain's path's terms under the line of the ship the player works towards, each one's text */
  private terms: Text[] = [];
  /** The building whose window is open over the harbour */
  private open: BuildingId | null = null;
  private tab: ShopTab = 'cannon';
  /** The building and tab the shop's rows were made for */
  private builtFor = '';
  private messageUntil = 0;
  private time = 0;
  /** The game as of the last frame: what a button acts on */
  private state: GameState | null = null;
  private readonly actions: PortActions;
  private readonly screen: Rectangle;
  /** The screen size the dim and the panel were fitted to */
  private fittedTo = '';

  constructor(actions: PortActions, screen: Rectangle, portName: string, confirm: ConfirmDialog) {
    this.actions = actions;
    this.screen = screen;
    this.confirm = confirm;
    this.container.visible = false;
    this.harbour = new HarbourView(
      screen,
      portName,
      (id) => this.enter(id),
      () => this.actions.leavePort(),
    );
    // Made before the port listens for Escape: it closes first
    this.info = new ItemInfo(screen, this.confirm);
    this.loadIcons();

    const background = themedPanel(WIDTH, HEIGHT);
    for (const blocker of [this.dim, background]) {
      blocker.eventMode = 'static';
      // Clicks in port must not reach the stage, which would steer the ship
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    // A click beside the window goes back to the harbour
    this.dim.on('pointertap', () => this.leaveBuilding());
    this.icon.width = this.icon.height = ICON;
    this.icon.position.set(PAD, PAD);
    this.title.position.set(PAD + ICON + 14, PAD - 2);
    this.about.position.set(PAD + ICON + 14, PAD + 32);
    const back = brassButton(BACK.width, BACK.height, t('Back to the harbour  (Esc)'), () => this.leaveBuilding(), 13);
    back.tile.container.position.set(WIDTH - PAD - BACK.width, PAD);
    drawCoin(this.coin, 10);
    this.gold.anchor.set(1, 0);
    this.gold.position.set(WIDTH - PAD, PAD + BACK.height + 12);
    this.message.position.set(PAD, HEIGHT - PAD - 14);
    this.figures.position.set(PAD, HEIGHT - PAD - 13);

    // The tavern: a row per quest
    QUEST_IDS.forEach((id, i) => this.tavern.addChild(this.questView(id, i * (QUEST_HEIGHT + QUEST_GAP))));
    this.tavern.position.set(PAD, BODY_TOP.plain);

    // A building that isn't open yet
    this.closedIcon.width = this.closedIcon.height = CLOSED_ICON;
    const closedTitle = text(t('Closed for now'), 18, UI.warn, { fontWeight: 'bold' });
    closedTitle.position.set(CLOSED_ICON + 32, 20);
    this.closedText.position.set(CLOSED_ICON + 32, 52);
    this.closed.addChild(this.closedIcon, closedTitle, this.closedText);
    this.closed.position.set(PAD + 8, BODY_TOP.plain + 20);

    // The shop's tabs: each building shows its own
    this.tabs = TAB_IDS.map((id) => {
      const caption = text(t(TABS[id]), 13, THEME.text, { fontWeight: 'bold' });
      const tile = new Tile(Math.ceil(caption.width) + TAB.pad * 2, 26, () => (this.tab = id), 5, BRASS);
      caption.anchor.set(0.5);
      caption.position.set(tile.width / 2, 13);
      tile.content.addChild(caption);
      tile.container.visible = false;
      return { id, tile, label: caption };
    });

    this.list.mask = this.clip;
    this.panel.eventMode = 'static';
    this.panel.on('wheel', (e) => this.scrollBy(e.deltaY * SCROLL.speed));
    this.scrollBar.eventMode = 'static';
    this.scrollBar.cursor = 'pointer';
    this.scrollBar.on('pointerdown', (e) => {
      e.stopPropagation();
      this.dragging = { y: e.global.y, scroll: this.scroll };
    });
    this.panel.on('globalpointermove', (e) => {
      if (!this.dragging) return;
      // The bar's thumb moves over the view as the rows move under it: scaled by how much taller they are
      const view = LIST_BOTTOM - this.listTop;
      const moved = (e.global.y - this.dragging.y) / this.panel.scale.y;
      this.scrollTo(this.dragging.scroll + (moved * this.listHeight) / view);
    });
    this.panel.on('pointerup', () => (this.dragging = null));
    this.panel.on('pointerupoutside', () => (this.dragging = null));

    this.panel.addChild(
      background,
      drawDivider(new Graphics(), PAD, DIVIDER, WIDTH - PAD * 2),
      this.icon,
      this.title,
      this.about,
      back.tile.container,
      this.coin,
      this.gold,
      this.tavern,
      this.closed,
      this.list,
      this.clip,
      this.scrollBar,
      this.message,
      this.figures,
    );
    for (const { tile } of this.tabs) this.panel.addChild(tile.container);
    this.building.addChild(this.dim, this.panel);
    this.building.visible = false;
    this.container.addChild(this.harbour.container, this.building, this.info.container);
    window.addEventListener('keydown', (e) => {
      // A window over the port (the loadout) closes first
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      // Out of a building's window to the harbour; from the harbour out to sea
      if (this.open) this.leaveBuilding();
      else this.actions.leavePort();
      // It shouldn't also do what Escape does at sea (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Opens a building's window over the harbour */
  private enter(id: BuildingId) {
    this.open = id;
    // The icons again, if they failed to load before
    if (id === 'arsenal' || id === 'workshop' || id === 'shipyard') this.loadIcons();
    const building = BUILDINGS.find((b) => b.id === id);
    show(this.title, building ? t(building.name) : '');
    // The tavern says how many bounties a captain may take; the others what they are for
    show(
      this.about,
      id === 'tavern'
        ? t('Bounties: up to {n} at a time. Sink what they ask, then come back', { n: MAX_QUESTS })
        : building
          ? t(building.about)
          : '',
    );
    // The medallion clicked would stay lit, its note shown, under the window
    this.harbour.unhover();
    const medallion = this.harbour.medallion(id);
    this.icon.visible = medallion !== null;
    this.closedIcon.visible = medallion !== null;
    if (medallion) {
      this.icon.texture = medallion;
      this.icon.width = this.icon.height = ICON;
      this.closedIcon.texture = medallion;
      this.closedIcon.width = this.closedIcon.height = CLOSED_ICON;
    }
    const tabs = BUILDING_TABS[id];
    if (tabs.length > 0 && !tabs.includes(this.tab)) this.tab = tabs[0];
    // A ship waiting to be bought: the shipyard opens on its line
    const goal = id === 'shipyard' && this.state ? goalOffer(this.state, this.state.player) : null;
    if (goal && this.state && termsMet(this.state, this.state.player)) {
      const line = SHIP_CLASSES[goal.shipClass].line;
      this.tab = tabs.find((tab) => tab === line) ?? this.tab;
    }
    // The tabs in a row under the name, only when there is more than one to choose from
    let x = PAD;
    for (const { id: tab, tile } of this.tabs) {
      tile.container.visible = tabs.length > 1 && tabs.includes(tab);
      if (!tile.container.visible) continue;
      tile.container.position.set(x, TABS_TOP);
      x += tile.width + TAB.gap;
    }
    const top = tabs.length > 1 ? BODY_TOP.tabs : BODY_TOP.plain;
    this.listTop = top;
    this.list.position.set(PAD, top);
    // A little room round the rows, for the cards' outlines
    const { margin } = SCROLL;
    this.clip
      .clear()
      .rect(PAD - margin, top - margin, BODY_WIDTH + margin * 2, LIST_BOTTOM - top + margin)
      .fill({ color: 0xffffff });
    this.tavern.visible = id === 'tavern';
    const closed = CLOSED[id];
    this.closed.visible = closed !== undefined;
    if (closed) show(this.closedText, t(closed));
    this.list.visible = tabs.length > 0;
    this.builtFor = '';
    this.messageUntil = 0;
    this.building.visible = true;
  }

  /** Closes the building's window: back to the harbour */
  private leaveBuilding() {
    this.open = null;
    this.building.visible = false;
    this.info.hide();
  }

  /** Opens while the player's ship is in port, closes when it leaves; then fills in the open building's window */
  update(state: GameState) {
    const { ship, player } = state;
    const dt = Math.max(0, state.time - this.time);
    this.time = state.time;
    this.state = state;
    if (ship.docked !== this.container.visible) {
      this.container.visible = ship.docked;
      this.leaveBuilding();
      if (ship.docked) this.harbour.open();
      else this.harbour.close();
    }
    if (!this.isOpen) return;
    this.harbour.update(dt, player.gold, badges(state));
    this.info.update(state);
    if (!this.open) return;

    const { width, height } = this.screen;
    const size = `${width}x${height}`;
    if (size !== this.fittedTo) {
      this.fittedTo = size;
      this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
      const scale = Math.min(1, (width - MARGIN * 2) / WIDTH, (height - MARGIN * 2) / HEIGHT);
      this.panel.scale.set(scale);
      this.panel.position.set(Math.round((width - WIDTH * scale) / 2), Math.round((height - HEIGHT * scale) / 2));
    }
    show(this.gold, t('{n} gold', { n: player.gold }));
    this.coin.position.set(this.gold.x - this.gold.width - 14, this.gold.y + this.gold.height / 2);
    this.message.visible = this.time < this.messageUntil;

    if (this.open === 'tavern') this.updateQuests(state);
    const tabs = BUILDING_TABS[this.open];
    if (tabs.length === 0) return;
    for (const { id, tile, label } of this.tabs) {
      tile.setLook({ pressed: id === this.tab });
      tint(label, id === this.tab ? THEME.darkText : THEME.text);
    }
    const built =
      this.tab === 'market'
        ? `market:${ship.holdSize}:${GOOD_IDS.map((id) => ship.cargo[id] ?? 0).join()}`
        : this.tab === 'myShips' || LINE_TABS[this.tab]
          ? `${this.tab}:${fleetKey(state)}`
          : this.tab;
    if (this.builtFor !== built) {
      this.builtFor = built;
      this.buildShop(this.tab);
    }
    for (const row of this.rows) {
      show(row.owned, row.face.owned(state));
      const { short, enabled } = row.face.button(state);
      show(row.label, short);
      row.button.setLook(enabled ? {} : { disabled: true });
      if (row.sell && row.face.sell) {
        const sell = row.face.sell.button(state);
        show(row.sell.label, sell.short);
        row.sell.tile.setLook(sell.enabled ? {} : { disabled: true });
      }
      const inUse = row.face.inUse(state);
      if (row.painted !== inUse) {
        row.painted = inUse;
        drawCard(
          row.background.clear(),
          CARD_WIDTH,
          CARD.height,
          tierColor(row.face.tier),
          inUse ? THEME.brassLight : undefined,
        );
      }
    }
    const outfit = OUTFIT_TABS[this.tab] !== undefined;
    show(this.figures, outfit ? t('Your ship: {figures}', { figures: shipFigures(ship) }) : '');
    this.figures.visible = outfit && !this.message.visible;
    if (this.market) {
      const value = cargoValue(ship.cargo);
      show(
        this.market.hold,
        t('{cargo} of {size} places taken', { cargo: cargoCount(ship.cargo), size: ship.holdSize }),
      );
      show(this.market.sellText, value > 0 ? t('Sell everything: {n} gold', { n: value }) : t('Nothing to sell'));
      this.market.sellAll.setLook(value > 0 ? { border: GOLD } : { disabled: true });
    }
    this.updateTerms(state);
    if (this.repair) {
      const price = repairPrice(ship);
      show(this.repair.hull, t('Hull {hp} / {max}', { hp: ship.hp, max: ship.maxHp }));
      show(this.repair.label, price > 0 ? t('Repair all: {n} gold', { n: price }) : t('The hull is whole'));
      this.repair.tile.setLook({ disabled: price === 0 || player.gold < price });
    }
  }

  /** The tavern's quests: taken or not, how far each has got, Take, Turn in or Drop */
  private updateQuests(state: GameState) {
    const { player } = state;
    for (const view of this.quests) {
      const taken = player.quests.find((q) => q.id === view.id);
      const quest = QUESTS[view.id];
      const done = taken !== undefined && questDone(taken);
      const full = player.quests.length >= MAX_QUESTS;
      const offered = questOffered(player, view.id);
      const kills = taken?.kills ?? 0;
      const look: QuestState = done ? 'done' : taken ? 'taken' : offered ? 'offered' : 'locked';
      if (view.painted !== `${look}:${kills}`) {
        view.painted = `${look}:${kills}`;
        paintQuest(view, look, kills, quest.count);
      }
      show(
        view.about,
        offered
          ? t(quest.text)
          : t('Turn in {n} more tavern quest to hear of it|Turn in {n} more tavern quests to hear of it', {
              n: quest.after - player.progress.questsDone,
            }),
      );
      tint(view.about, offered ? THEME.dim : UI.warn);
      show(view.buttonText, done ? t('Turn in') : taken ? t('Taken') : offered ? t('Take') : t('Later'));
      view.button.setLook({
        pressed: done,
        disabled: (taken !== undefined && !done) || (!taken && (full || !offered)),
      });
      tint(view.buttonText, done ? THEME.darkText : THEME.text);
      view.drop.container.visible = taken !== undefined && !done;
    }
  }

  private say(message: string, color: number = THEME.text) {
    show(this.message, message);
    tint(this.message, color);
    this.messageUntil = this.time + MESSAGE_TIME;
  }

  /**
   * A quest's card, `y` pixels down the tavern: its dial on the left, its title and what it asks, the reward in gold
   * and experience, and its buttons
   */
  private questView(id: QuestId, y: number) {
    const quest = QUESTS[id];
    const row = new Container();
    row.position.set(0, y);
    const background = new Graphics();
    const dial = new Graphics();
    dial.position.set(14 + DIAL, QUEST_HEIGHT / 2);
    const mark = new Graphics();
    mark.position.copyFrom(dial.position);
    const count = text('', 14, THEME.text, { fontWeight: 'bold' });
    count.anchor.set(0.5);
    count.position.copyFrom(dial.position);
    const left = 14 + DIAL * 2 + 16;
    const title = subheading(t(quest.title), 17);
    title.position.set(left, 9);
    const about = text(t(quest.text), 12, THEME.dim, {
      wordWrap: true,
      wordWrapWidth: TAVERN_WIDTH - left - QUEST_RIGHT,
    });
    about.position.set(left, 37);
    const reward = text(t('{n} gold', { n: quest.reward }), 14, GOLD, { fontWeight: 'bold' });
    reward.anchor.set(1, 0);
    reward.position.set(TAVERN_WIDTH - 14, 11);
    const coin = new Graphics();
    drawCoin(coin, 7);
    coin.position.set(reward.x - reward.width - 12, reward.y + reward.height / 2);
    const xp = text(t('+{n} XP', { n: quest.xp }), 12, XP_COLOR, { fontWeight: 'bold' });
    xp.anchor.set(1, 0.5);
    xp.position.set(coin.x - 16, coin.y);
    const body = new Container();
    body.addChild(title, about, reward, coin, xp);
    const main = brassButton(QUEST_BUTTON.width, QUEST_BUTTON.height, t('Take'), () => this.questAction(id), 12);
    main.tile.container.position.set(TAVERN_WIDTH - 14 - QUEST_BUTTON.width, QUEST_HEIGHT - 12 - QUEST_BUTTON.height);
    // Asked first, as the quest tracker at sea does
    const drop = brassButton(QUEST_BUTTON.drop, QUEST_BUTTON.height, t('Drop'), () => {
      const taken = this.state?.player.quests.find((q) => q.id === id);
      if (!taken) return;
      this.confirm.ask(abandonQuestion(taken), () => {
        this.actions.dropQuest(id);
        this.say(t('"{title}" dropped', { title: t(quest.title) }), THEME.dim);
      });
    });
    drop.tile.container.position.set(main.tile.container.x - 6 - QUEST_BUTTON.drop, main.tile.container.y);
    row.addChild(background, dial, mark, count, body, main.tile.container, drop.tile.container);
    this.quests.push({
      id,
      background,
      dial,
      mark,
      count,
      body,
      about,
      painted: '',
      button: main.tile,
      buttonText: main.text,
      drop: drop.tile,
    });
    return row;
  }

  /** Turns the quest in when it is done, else takes it: trying the other first would sound its refusal */
  private questAction(id: QuestId) {
    const quest = QUESTS[id];
    const title = t(quest.title);
    const taken = this.state?.player.quests.find((q) => q.id === id);
    if (taken && questDone(taken)) {
      if (this.actions.turnInQuest(id)) this.say(t('"{title}" done: +{n} gold', { title, n: quest.reward }), GOLD);
    } else if (this.actions.takeQuest(id)) {
      this.say(t('Taken: {title}. Sink {n} and come back', { title, n: quest.count }));
    }
  }

  /** The rows of a shop tab: the guns or the ammo of a weapon by tier, the outfit, the shipwright, the market... */
  private buildShop(tab: ShopTab) {
    for (const child of this.list.removeChildren()) child.destroy({ children: true });
    this.dragging = null;
    this.rows = [];
    this.repair = null;
    this.market = null;
    this.terms = [];
    const ammo = AMMO_TABS[tab];
    const slot = OUTFIT_TABS[tab];
    const line = LINE_TABS[tab];
    if (tab === 'market') {
      this.buildMarket();
    } else if (tab === 'myShips') {
      this.buildFleet();
    } else if (line) {
      this.buildLine(line);
    } else if (ammo) {
      AMMO_IDS[ammo].forEach((id, i) => this.list.addChild(this.card({ ammo: id }, i)));
    } else if (slot) {
      OUTFIT_IDS[slot].forEach((id, i) => this.list.addChild(this.card({ outfit: id }, i)));
    } else if (tab === 'shipwright') {
      const hull = text('', 15, THEME.text, { fontWeight: 'bold' });
      const fix = brassButton(200, 30, '', () => {
        if (this.actions.repairInPort()) this.say(t('The shipwright mended the hull'), UI.heal);
      });
      fix.tile.container.position.set(0, 30);
      const note = text(
        t('Or let the crew mend it at sea (R): 1 gold for every {per} hull, a step a second, out of combat', {
          per: REPAIR_HP_PER_GOLD,
        }),
        12,
        THEME.dim,
      );
      note.position.set(0, 72);
      this.list.addChild(hull, fix.tile.container, note);
      this.repair = { tile: fix.tile, label: fix.text, hull };
    } else if (tab === 'cannon' || tab === 'harpoon') {
      GUN_IDS[tab].forEach((gun, i) => this.list.addChild(this.card({ gun }, i)));
    }
    this.listHeight = Math.max(0, ...this.list.children.map((child) => child.y + child.height));
    this.scrollTo(0);
  }

  /** Scrolls a tab's rows by some pixels: down for more */
  private scrollBy(delta: number) {
    if (this.open && BUILDING_TABS[this.open].length > 0) this.scrollTo(this.scroll + delta);
  }

  /** Scrolls a tab's rows to a place (pixels from their top), as far as they go, and shows where on the bar */
  private scrollTo(scroll: number) {
    const top = this.listTop;
    const view = LIST_BOTTOM - top;
    const most = Math.max(0, this.listHeight - view);
    this.scroll = Math.min(Math.max(scroll, 0), most);
    this.list.y = top - this.scroll;
    this.scrollBar.clear();
    this.scrollBar.visible = most > 0;
    if (most === 0) return;
    const x = WIDTH - PAD + SCROLL.margin;
    const thumb = Math.max(30, (view * view) / this.listHeight);
    const y = top + ((view - thumb) * this.scroll) / most;
    this.scrollBar
      .roundRect(x, top, SCROLL.bar, view, 2)
      .fill({ color: 0x000000, alpha: 0.35 })
      .roundRect(x, y, SCROLL.bar, thumb, 2)
      .fill({ color: THEME.brass });
  }

  /** Loads the arsenal's, the workshop's and the shipyard's icons; their cards are made again with them once they are
   * there */
  private loadIcons() {
    for (const icons of [GUN_ICONS, AMMO_ICONS, OUTFIT_ICONS, SHIP_ICONS]) icons.load(() => (this.builtFor = ''));
  }

  /**
   * A card of the arsenal, the workshop or the shipyard, the `index`th of its tab (`top` pixels down it): the item's
   * icon in a slot lit in its tier's colour (or its tier, until the icons load; a ship's slot empty, its picture to
   * come), its name, what it is, its figures, its price and how many the player has, and buttons to see it up close (as
   * does a click on its icon) and to buy it (or fit it, take it off, take its helm). Outlined while the ship has it
   * fitted or loaded, or sails it
   */
  private card(item: ShopItem, index: number, top = 0) {
    const { inset, slot: size } = CARD;
    const width = CARD_WIDTH;
    const buy = 'ship' in item ? SHIP_BUY : BUY.width;
    const card = new Container();
    card.position.set((index % 2) * (CARD_WIDTH + CARD.gap), top + Math.floor(index / 2) * (CARD.height + CARD.rowGap));
    const face = itemFace(item, this.actions);
    const background = new Graphics();
    const slot = iconSlot(size, tierColor(face.tier), `T${face.tier}`, face.letters);
    slot.show(face.icon);
    slot.container.position.set(inset, (CARD.height - size) / 2);
    slot.container.eventMode = 'static';
    slot.container.cursor = 'pointer';
    slot.container.on('pointerdown', (e) => e.stopPropagation());
    slot.container.on('pointertap', () => {
      playTap();
      this.info.open(itemFace(item, this.actions));
    });
    const left = inset + size + 12;
    const price = text(face.price, 13, GOLD, { fontWeight: 'bold' });
    price.anchor.set(1, 0);
    price.position.set(width - 12, 9);
    const title = text(face.name, 14, THEME.text, { fontWeight: 'bold' });
    title.position.set(left, 8);
    clip(title, price.x - price.width - 8 - left);
    // What it is for in a line (the info window has all of it), and its figures under it
    // What the arsenal pays for it back, under the price
    const resale = text(face.resale ?? '', 11, THEME.dim);
    resale.anchor.set(1, 0);
    resale.position.set(width - 12, 30);
    const about = text(face.about, 11, THEME.dim);
    about.position.set(left, 29);
    clip(about, width - left - 12 - (face.resale ? resale.width + 8 : 0));
    const stats = text(face.stats, 12, THEME.text);
    stats.position.set(left, 47);
    // A piece of outfit that changes three figures takes a smaller hand before it is cut short
    if (stats.width > width - left - 12) stats.style.fontSize = 11;
    clip(stats, width - left - 12);
    const button = brassButton(buy, BUY.height, this.state ? face.button(this.state).short : t('Buy'), () =>
      this.press(face),
    );
    button.tile.container.position.set(width - 12 - buy, CARD.height - 12 - BUY.height);
    const info = brassButton(
      INFO.width,
      BUY.height,
      'i',
      () => this.info.open(itemFace(item, this.actions)),
      INFO.size,
    );
    info.text.style.fontFamily = TITLE_STYLE.fontFamily ?? 'serif';
    info.text.style.fontStyle = 'italic';
    info.tile.container.position.set(button.tile.container.x - 6 - INFO.width, button.tile.container.y);
    // What the arsenal buys back has a Sell button too, left of the info button
    const sell = face.sell ? brassButton(BUY.width, BUY.height, t('Sell'), () => this.press(face, face.sell)) : null;
    sell?.tile.container.position.set(info.tile.container.x - 6 - BUY.width, button.tile.container.y);
    // How many the player has, beside the buttons: in two lines where they leave it little room
    const room = (sell ? sell.tile.container.x : info.tile.container.x) - 8 - left;
    const owned = text('', 11, THEME.dim, { wordWrap: true, wordWrapWidth: room, lineHeight: 12 });
    owned.anchor.set(0, 0.5);
    owned.position.set(left, CARD.height - 12 - BUY.height / 2);
    card.addChild(
      background,
      slot.container,
      title,
      price,
      resale,
      about,
      stats,
      owned,
      info.tile.container,
      button.tile.container,
    );
    if (sell) card.addChild(sell.tile.container);
    this.rows.push({
      face,
      background,
      painted: null,
      owned,
      button: button.tile,
      label: button.text,
      sell: sell && { tile: sell.tile, label: sell.text },
    });
    return card;
  }

  /**
   * A card's button: buys the item, fits it or takes it off, or sells it back (`which`), and says what happened. What
   * can't be undone is asked about first
   */
  private press(face: ItemFace, which: ItemButton = face) {
    if (!this.state) return;
    const run = () => {
      const done = this.state && which.press(this.state);
      if (done) this.say(done.message, TONES[done.tone]);
    };
    const question = which.confirm?.(this.state);
    if (question) this.confirm.ask(question, run);
    else run();
  }

  /**
   * The market, like the hold's window: a board with the hold's places taken and Sell everything, then a row for each
   * good aboard (its picture with how many, its price) with its own Sell
   */
  private buildMarket() {
    const ship = this.state?.ship;
    const board = new Container();
    const hold = text('', 15, THEME.text, { fontWeight: 'bold' });
    hold.position.set(16, 12);
    const sellAll = brassButton(SELL_ALL.width, SELL_ALL.height, '', () => {
      const value = ship ? cargoValue(ship.cargo) : 0;
      if (this.actions.sellCargo()) this.say(t('Sold everything for {n} gold', { n: value }), GOLD);
    });
    const sellX = SHOP_WIDTH - 16 - SELL_ALL.width;
    sellAll.tile.container.position.set(sellX, (GOODS_LIST.board - SELL_ALL.height) / 2);
    const meter = new Graphics();
    meter.position.set(16, 40);
    if (ship) {
      const cargo = cargoCount(ship.cargo);
      const share = ship.holdSize > 0 ? cargo / ship.holdSize : 0;
      const color = cargo >= ship.holdSize ? UI.bad : THEME.brass;
      drawMeter(meter, sellX - 32, GOODS_LIST.meter, share, color, ship.holdSize);
    }
    board.addChild(drawCard(new Graphics(), SHOP_WIDTH, GOODS_LIST.board), hold, meter, sellAll.tile.container);
    const heading = subheading(t('Goods aboard'), 18);
    heading.position.set(0, GOODS_LIST.board + 18);
    this.list.addChild(board, heading);
    this.market = { hold, sellAll: sellAll.tile, sellText: sellAll.text };
    const top = heading.y + GOODS_LIST.heading;
    const aboard = GOOD_IDS.filter((id) => (ship?.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const empty = text(
        t(
          'The hold is empty. Sunk ships and monsters leave goods floating: sail over them to haul them aboard, then sell them here. A ship that goes down loses its cargo where it sank.',
        ),
        13,
        THEME.dim,
        { wordWrap: true, wordWrapWidth: SHOP_WIDTH - 48, align: 'center' },
      );
      empty.anchor.set(0.5);
      empty.position.set(SHOP_WIDTH / 2, top + GOODS_LIST.empty / 2);
      const card = drawCard(new Graphics(), SHOP_WIDTH, GOODS_LIST.empty);
      card.position.set(0, top);
      this.list.addChild(card, empty);
      return;
    }
    aboard.forEach((id, i) => {
      const row = this.marketRow(id, ship?.cargo[id] ?? 0);
      row.position.set(0, top + i * (GOODS_LIST.row + GOODS_LIST.gap));
      this.list.addChild(row);
    });
  }

  /** A good's row at the market, with its Sell */
  private marketRow(id: GoodId, count: number) {
    const { name, price } = GOODS[id];
    const sell = () => {
      const n = price * count;
      if (this.actions.sellCargo(id)) this.say(t('{name} sold: +{n} gold', { name: t(name), n }), GOLD);
    };
    return goodRow(id, count, SHOP_WIDTH, [{ label: t('Sell'), onTap: sell }]);
  }

  /**
   * The shipyard's "My ships": the ship sailed (outlined) and those laid up in port, as cards, each with Take the helm
   * but the one sailed
   */
  private buildFleet() {
    const state = this.state;
    if (!state) return;
    const owned = [state.ship.shipClass.id, ...state.player.fleet.map((kept) => kept.shipClass)].filter(isLineShip);
    owned.forEach((ship, i) => this.list.addChild(this.card({ ship }, i)));
    const laidUp = text(
      t("A ship you don't sail lies in port with its guns, ammo, outfit, talents and cargo, and levels on its own"),
      12,
      THEME.dim,
      { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
    );
    laidUp.position.set(0, Math.ceil(owned.length / 2) * (CARD.height + CARD.rowGap) + 6);
    const goal = goalOffer(state, state.player);
    const lines = text(
      goal
        ? t('Every line has a tab of its ships: the shipyard sells the {name} now, the others come later', {
            name: t(offerName(goal)),
          })
        : t('Every line has a tab of its ships: the others come later'),
      12,
      THEME.dim,
      { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
    );
    lines.position.set(0, laidUp.y + laidUp.height + 6);
    this.list.addChild(laidUp, lines);
  }

  /**
   * A line's tab of the shipyard: its name, what it is for and what its ships look like, then its ships from tier 1 up
   * as cards (a built one to buy or to take the helm of, a planned one with its provisional figures, coming later); in
   * a line of several ships a tier (the Forbidden Fleets, the masterworks), under a heading for each tier, and a word
   * on how they are got. Under the line of the ship the player works towards, the shipwright's terms for it, the
   * Captain's path
   */
  private buildLine(id: PlayerLineId) {
    const line = SHIP_LINES[id];
    const title = new Text({ text: t(line.name), style: { ...TITLE_STYLE, fontSize: 22 } });
    const role = text(t(line.role), 13, GOLD, { fontWeight: 'bold' });
    role.position.set(title.width + 14, 7);
    clip(role, SHOP_WIDTH - role.x);
    const about = [t(LINE_STYLE[id]), LINE_NOTES[id] ? t(LINE_NOTES[id]) : ''].filter(Boolean).join(' ');
    const style = text(about, 12, THEME.dim, { wordWrap: true, wordWrapWidth: SHOP_WIDTH });
    style.position.set(0, 34);
    this.list.addChild(title, role, style);
    let y = style.y + style.height + 12;
    const tiers = [...new Set(line.ships.map((ship) => lineShip(ship).tier))];
    if (tiers.length === line.ships.length) {
      line.ships.forEach((ship, i) => this.list.addChild(this.card({ ship }, i, y)));
      y += Math.ceil(line.ships.length / 2) * (CARD.height + CARD.rowGap);
    } else {
      for (const tier of tiers) {
        const heading = subheading(t('Tier {tier}', { tier }));
        heading.position.set(0, y);
        this.list.addChild(heading);
        y += TIER_HEADING;
        const ships = line.ships.filter((ship) => lineShip(ship).tier === tier);
        ships.forEach((ship, i) => this.list.addChild(this.card({ ship }, i, y)));
        y += Math.ceil(ships.length / 2) * (CARD.height + CARD.rowGap) + 6;
      }
    }

    const state = this.state;
    const goal = state && goalOffer(state, state.player);
    if (!state || !goal || !line.ships.some((ship) => ship === goal.shipClass)) return;
    y += 6;
    const heading = subheading(t("The shipwright's terms: the Captain's path"));
    heading.position.set(0, y);
    this.list.addChild(heading);
    // Two columns, the first half of the path down the left
    const path = captainsPath(state, state.player);
    const half = Math.ceil(path.length / 2);
    this.terms = path.map((_, i) => {
      const term = text('', 13, THEME.text);
      term.position.set(8 + Math.floor(i / half) * (SHOP_WIDTH / 2), y + 26 + (i % half) * PATH_LINE);
      this.list.addChild(term);
      return term;
    });
  }

  /** The Captain's path's terms under its ship's line: each done or not, and how far */
  private updateTerms(state: GameState) {
    if (this.terms.length === 0) return;
    captainsPath(state, state.player).forEach((step, i) => {
      const term = this.terms[i];
      if (!term) return;
      const count = step.need === null ? '' : `: ${step.have} / ${step.need}`;
      show(term, `${step.done ? '✓' : '○'}  ${t(step.text)}${count}`);
      tint(term, step.done ? UI.good : THEME.text);
    });
  }
}
