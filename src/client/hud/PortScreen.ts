import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import {
  AMMO_IDS,
  GOODS,
  GOOD_IDS,
  GUN_IDS,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_IDS,
  ITEM_IDS,
  ITEMS,
  OUTFIT_IDS,
  QUESTS,
  zoneQuests,
  REPAIR_HP_PER_GOLD,
  LADDER_LINES,
  SHIPYARD_LINES,
  SHIP_CLASSES,
  SHIP_LINES,
  captainsPath,
  cargoCount,
  goalShips,
  isLineShip,
  lineShip,
  marketShare,
  marketValue,
  questDone,
  questLimit,
  questOffered,
  questReward,
  repairPrice,
  shipGoal,
  shipQuests,
  storyFitting,
  takenQuest,
  termsMet,
  type AmmoId,
  type GameState,
  type GoodId,
  type GunId,
  type ItemId,
  type LineShipId,
  type OutfitId,
  type OutfitSlot,
  type PlayerLineId,
  type Quest,
  type QuestId,
  type QuestReward,
  type ShipClassId,
  type ZoneId,
  type Ship,
  type WeaponId,
} from '../../game';
import { BUILDINGS, HarbourView, type BuildingId } from './HarbourView';
import type { ConfirmDialog } from './ConfirmDialog';
import { ItemInfo } from './ItemInfo';
import { AMMO_ICONS, GUN_ICONS, ITEM_ICONS, OUTFIT_ICONS, SHIP_ICONS } from './iconAtlas';
import { KNOT, itemFace, type ItemButton, type ItemFace, type ShopItem, type Tone } from './itemFaces';
import { abandonQuestion } from './QuestTracker';
import { LINE_STYLE } from './shipLore';
import type { StoryCue } from './storyCue';
import { StoryGuide, type Guide } from './StoryGuide';
import { THEME, TITLE_STYLE, drawMeter, glowFill, iconSlot, subheading } from './theme';
import {
  NIGHT,
  NIGHT_CORNER_REACH,
  NIGHT_WINDOW,
  drawNightCard,
  moonButton,
  moonButtonEnd,
  nightDivider,
} from './nightTheme';
import { GOODS_LIST, goodRow } from './goodIcons';
import { questText, questTitle } from './questText';
import {
  HudWindow,
  UI,
  clip,
  clipLines,
  coinOf,
  doubloon,
  goldCoin,
  playTap,
  show,
  text,
  tierColor,
  tint,
  whole,
  xpStar,
  type Tile,
} from './ui';
import { ScrollBar } from './ScrollPane';
import { Tooltip, type TooltipText } from './Tooltip';
import { t } from '../i18n/i18n';
import type { CursorId } from '../input/cursor';

/** What the port's menus do: game methods, each saying whether it worked */
export interface PortActions {
  /** Sets sail: false while the story keeps the ship in port (its guns in the hold) */
  leavePort: () => boolean;
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
  /** Buys `count` of an item at the market, for doubloons */
  buyItem: (id: ItemId, count?: number) => boolean;
  /** Buys a ship the shipyard offers and takes its helm */
  buyShip: (id: ShipClassId) => boolean;
  /** Takes the helm of a ship laid up in port (its place in the player's fleet) */
  takeHelm: (index: number) => boolean;
}

// A building's window, over the harbour's picture
const WIDTH = 860; // pixels, before scaling down to fit the screen
const HEIGHT = 720;
const PAD = 24;
// Pixels: the building's medallion in the header, left of its name, clear of the window's corner piece; its name and
// what it is for
const ICON = { size: 56, x: PAD + 6, y: PAD - 4 } as const;
const NAME = { x: ICON.x + ICON.size + 12, size: 26, about: PAD + 28 } as const;
const GOLD_RIGHT = WIDTH - PAD - 66; // pixels: the right end of the player's gold, left of the gold cross
const ABOUT_WIDTH = GOLD_RIGHT - 140 - NAME.x; // pixels: what the building is for, short of the gold
const DIVIDER = PAD + 64; // the gold line under the header
const DIVIDER_MIDDLE = 200; // pixels: its painted star, across, its points clear of the tabs under it
const TABS_TOP = DIVIDER + 22; // the row of tabs under the header, when the building has more than one
// Pixels: a tab, its name's size, the least room beside its name past the stars on its points, and between two
const TAB = { height: 30, label: 13, pad: 8, least: 1, gap: 6 } as const;
const BODY_TOP = { tabs: TABS_TOP + TAB.height + 12, plain: DIVIDER + 18 }; // where its rows start, under the tabs or not
const BODY_WIDTH = WIDTH - PAD * 2;
const TAVERN_WIDTH = BODY_WIDTH;
const SHOP_WIDTH = BODY_WIDTH;
const QUEST_HEIGHT = 84;
const QUEST_GAP = 8;
const DIAL = 28; // pixels: the radius of a quest's dial, how far it has got
const QUEST_BUTTON = { width: 96, drop: 60, height: 26 } as const; // pixels: Take or Turn in, and Drop
const QUEST_RIGHT = 190; // pixels at a quest's right end for its reward and buttons, beside its text
const XP_COLOR = 0x5aa8ff; // a quest's experience, as under the player's frame
// Pixels: a quest's reward, leftwards from `right` short of its card's right end on a line `middle` down: its gold,
// then its experience, `gap` apart, each its sign's middle `sign` before its figure, and what the player would get
// `bracket` after it; the pointer finds each in a box `height` tall
const REWARD = { right: 14, middle: 19, gap: 16, sign: 12, bracket: 4, height: 22 } as const;
const SELL_ALL = { width: 230, height: 30 } as const; // pixels: the market's Sell everything
// The guns, the ammo and the outfit, two cards a row (pixels): a card's height, the gaps between them, the icon's
// slot, the radius of the coin before a price in gold and before what the arsenal pays back; and the info button
const CARD = { height: 100, gap: 12, rowGap: 8, slot: 84, inset: 10, coin: 7, resaleCoin: 5 } as const;
const CARD_WIDTH = (BODY_WIDTH - CARD.gap) / 2;
const INFO = { width: 30, size: 16 } as const;
const BUY = { width: 64, height: 24 };
const ABOUT_LINE = 14; // pixels: a line of what an item of the market's does, two of them on its card
// Pixels: a ship's card's button (Take the helm) at its narrowest, and the room its label keeps past the stars on its
// points when a language's is longer
const SHIP_BUY = { width: 120, pad: 6 } as const;
const SHIPWRIGHT = { height: 118, pad: 18 } as const; // pixels: the repairs' board, and inside it
const MESSAGE_TIME = 3.5; // seconds a message stays
const GOLD = 0xffcf3f;
const CLOSED_ICON = 170; // pixels: the medallion of a building that isn't open yet

type ShopTab =
  | WeaponId
  | 'cannonballs'
  | 'harpoons'
  | OutfitSlot
  | 'shipwright'
  | 'market'
  | 'wares'
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
  market: 'Sell',
  wares: 'Buy',
  myShips: 'My ships',
  premium: 'Buy',
  european: 'European',
  eastern: 'Eastern',
  pirate: 'Free pirates',
  northern: 'Northern',
  legendary: 'Legendary',
};
const TAB_IDS: readonly ShopTab[] = [
  'cannonballs',
  'harpoons',
  'cannon',
  'harpoon',
  'sails',
  'hull',
  'rudder',
  'lookout',
  'shipwright',
  'market',
  'wares',
  'myShips',
  'european',
  'eastern',
  'pirate',
  'northern',
  'legendary',
  'premium',
];
// What the story's guide says in port, by what it asks the player to press (storyCue)
const GUIDE_SAYS = {
  setSail: 'Click to set sail',
  market: 'Sell the goods at the market',
  sellTab: 'Open the Sell tab',
  sellAll: 'Click to sell everything',
  shipyard: 'Your new ship waits at the shipyard',
  buy: 'Click to buy the ship',
} as const;

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
const TONES: Readonly<Record<Tone, number>> = { good: UI.good, bad: UI.bad, plain: NIGHT.dim };
/** What each building's window shows: its tabs (none for the tavern, which has the quests, or one that isn't open) */
const BUILDING_TABS: Readonly<Record<BuildingId, readonly ShopTab[]>> = {
  tavern: [],
  // The hold's goods sold, and the items bought for doubloons
  market: ['market', 'wares'],
  workshop: ['sails', 'hull', 'rudder', 'lookout', 'shipwright'],
  shipyard: ['myShips', 'european', 'eastern', 'pirate', 'northern', 'legendary', 'premium'],
  arsenal: ['cannonballs', 'harpoons', 'cannon', 'harpoon'],
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
const PATH_LINE = 21; // pixels: a term of the shipyard's offer
const LIST_BOTTOM = HEIGHT - PAD - 26; // pixels: where a tab's rows are cut off, over the message under them
const MESSAGE_Y = HEIGHT - PAD - 18; // pixels: the message's top, under the rows, right of the corner piece
// Pixels per unit of the wheel; the scroll bar's gap from the rows, and its thumb's least length
const SCROLL = { speed: 0.6, margin: 2, thumb: 30 } as const;
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
  const done = shipQuests(state, player).filter(questDone).length;
  const cargo = cargoCount(ship.cargo);
  return {
    tavern: done > 0 ? String(done) : '',
    market: cargo > 0 ? String(cargo) : '',
    workshop: ship.hp < ship.maxHp ? '!' : '',
    shipyard: termsMet(state, player) ? '!' : '',
  };
}

/** What the shipyard's cards depend on: the ship sailed, those laid up, the ships worked towards */
function fleetKey(state: GameState) {
  const { ship, player } = state;
  const goal = shipGoal(state, player);
  const goals = goal ? goalShips(state, player, goal).join() : '';
  return `${ship.shipClass.id}:${player.fleet.map((kept) => kept.shipClass).join()}:${goals}`;
}

/** A tavern quest as the player has it: not offered yet, offered, taken, or done and waiting to be turned in */
type QuestState = 'locked' | 'offered' | 'taken' | 'done';

/** A quest's gold or its experience: its sign, the quest's figure, and in brackets what the player would get, if other */
interface RewardPart {
  readonly container: Container;
  readonly sign: Container;
  readonly figure: Text;
  readonly actual: Text;
  /** Where the pointer finds it in its card, for its tooltip */
  readonly hit: Rectangle;
}

/** Which of a quest's reward's parts */
type RewardKind = 'gold' | 'xp';

interface QuestView {
  readonly id: QuestId;
  /** Its card's top in the tavern */
  readonly y: number;
  readonly background: Graphics;
  /** How far it has got, round the count in it (or a lock, or a tick) */
  readonly dial: Graphics;
  readonly mark: Graphics;
  readonly count: Text;
  /** Its words: dimmed while it isn't offered */
  readonly body: Container;
  readonly about: Text;
  readonly gold: RewardPart;
  readonly xp: RewardPart;
  /** What its reward's brackets said when it was last laid out, '' before */
  laidOut: string;
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
  /** The ship it sells, a shipyard's card's: the story's guide lights the one to buy */
  readonly ship: LineShipId | null;
  /** Its Sell button, for what the arsenal buys back */
  readonly sell: { readonly tile: Tile; readonly label: Text } | null;
}

/**
 * A quest's dial round (0, 0), `radius` pixels: a brass ring round a dark well lit in `color` (unless it is locked),
 * and a track round it filled `share` of the way, from the top clockwise
 */
function drawDial(g: Graphics, radius: number, share: number, color: number, lit: boolean) {
  g.circle(0, 0, radius).fill({ color: NIGHT.well }).stroke({ width: 3, color: THEME.brass });
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

/** A part of a quest's reward, its sign before its figure, in `size` pixels and `color` */
function rewardPart(sign: Container, figure: number, size: number, color: number): RewardPart {
  const label = text(whole(figure), size, color, { fontWeight: 'bold' });
  const actual = text('', size, color, { fontWeight: 'bold' });
  label.anchor.set(1, 0.5);
  actual.anchor.set(1, 0.5);
  sign.y = label.y = actual.y = REWARD.middle;
  const hit = new Rectangle(0, REWARD.middle - REWARD.height / 2, 0, REWARD.height);
  const container = new Container();
  container.addChild(sign, label, actual);
  container.eventMode = 'static';
  container.hitArea = hit;
  return { container, sign, figure: label, actual, hit };
}

/** What the player would get, in brackets after the quest's figure while bonuses change it: green more, amber less */
function showActual(part: RewardPart, figure: number, actual: number) {
  show(part.actual, actual === figure ? '' : `(${whole(actual)})`);
  tint(part.actual, actual > figure ? UI.good : UI.warn);
}

/** Lays a reward's part out leftwards from `right` in its card: the brackets, the figure, the sign. Returns its sign's x */
function layOut(part: RewardPart, right: number) {
  let x = right;
  part.actual.visible = part.actual.text !== '';
  if (part.actual.visible) {
    part.actual.x = x;
    x -= part.actual.width + REWARD.bracket;
  }
  part.figure.x = x;
  part.sign.x = x - part.figure.width - REWARD.sign;
  part.hit.x = part.sign.x - REWARD.sign;
  part.hit.width = right - part.hit.x;
  return part.sign.x;
}

function signedPercent(share: number) {
  return `+${Math.round(share * 1000) / 10}%`;
}

/**
 * The tooltip over a quest's gold or experience: what the quest gives, what adds to it from the captain's mastery and
 * from the ship's talents, and the experience lost beyond the ship's last level
 */
function rewardText(kind: RewardKind, quest: Quest, reward: QuestReward): TooltipText {
  const gold = kind === 'gold';
  const bonuses = gold ? reward.goldBonuses : reward.xpBonuses;
  const lines = [t('The quest gives {n}', { n: whole(gold ? quest.reward : quest.xp) })];
  for (const source of ['captain', 'talent'] as const) {
    const given = bonuses.filter((bonus) => bonus.source === source);
    if (given.length === 0) continue;
    lines.push(source === 'captain' ? t("Captain's mastery") : t("Ship's talents"));
    for (const { name, share } of given) lines.push(`   ${t(name)}  ${signedPercent(share)}`);
  }
  lines.push(
    bonuses.length > 0
      ? t('In all: {share}', { share: signedPercent(bonuses.reduce((sum, bonus) => sum + bonus.share, 0)) })
      : t("No bonuses yet: the captain's mastery and the ship's talents add to it"),
  );
  if (!gold && reward.xpLost > 0) lines.push(t("{n} lost: beyond the ship's last level", { n: whole(reward.xpLost) }));
  return {
    title: gold ? t('Gold: {n}', { n: whole(reward.gold) }) : t('Experience: {n}', { n: whole(reward.xp) }),
    color: gold ? GOLD : XP_COLOR,
    lines,
  };
}

/**
 * A quest's card and dial as the player has it: dim with a lock until it is offered, the count to sink while it is
 * on offer, the kills so far round the dial once taken (its card edged in brass), and a green tick when done
 */
function paintQuest(view: QuestView, look: QuestState, kills: number, count: number) {
  const done = look === 'done';
  const color = done ? UI.good : look === 'locked' ? NIGHT.dim : THEME.title;
  const share = done ? 1 : look === 'taken' ? kills / count : 0;
  drawDial(view.dial.clear(), DIAL, share, color, look !== 'locked');
  view.mark.clear();
  if (done) drawTick(view.mark, DIAL * 0.8, UI.good);
  else if (look === 'locked') drawLock(view.mark, DIAL * 0.75, NIGHT.dim);
  show(view.count, look === 'taken' ? `${kills}/${count}` : look === 'offered' ? `×${count}` : '');
  tint(view.count, look === 'taken' ? THEME.text : THEME.title);
  view.body.alpha = look === 'locked' ? 0.6 : 1;
  const edge = done ? UI.good : look === 'taken' ? THEME.brassLight : undefined;
  drawNightCard(view.background.clear(), TAVERN_WIDTH, QUEST_HEIGHT, edge, done ? UI.good : edge && THEME.brass);
}

/**
 * The port, over everything while the player's ship is in port: the harbour's picture with a medallion over each
 * building (HarbourView), and the window of the building clicked over it, in the night look like the hold. The tavern has bounties to take, how far
 * each has got and the reward to collect; the market buys the hold's goods and sells items for doubloons; the workshop sells and fits the ship's
 * outfit and mends its hull; the shipyard keeps the player's ships and shows every line's, built and planned, selling
 * the next one; the arsenal sells guns and ammo. The guild hall and the auction house aren't open yet. The gold cross, a click beside
 * it or Escape closes a building's window; Escape in the harbour sets sail
 */
export class PortScreen {
  readonly container = new Container();
  private readonly harbour: HarbourView;
  /** A gun, an ammo or a piece of outfit up close, over the arsenal or the workshop */
  private readonly info: ItemInfo;
  /** The HUD's question before what can't be undone (selling an item back), over every window */
  private readonly confirm: ConfirmDialog;
  /** A building's window, the game dimmed behind it */
  private readonly window: HudWindow;
  /** What the window shows: the owner adds to it */
  private readonly panel: Container;
  private readonly icon = new Sprite();
  private readonly title = new Text({ text: '', style: { ...TITLE_STYLE, fontSize: NAME.size } });
  private readonly about = text('', 13, NIGHT.dim, { wordWrap: true, wordWrapWidth: ABOUT_WIDTH });
  /** The player's gold beside the gold cross; their doubloons in the market's Buy, which takes only those */
  private readonly gold = text('', 18, GOLD, { fontWeight: 'bold' });
  private readonly coin = goldCoin(10);
  private readonly doubloon = doubloon(10);
  private readonly message = text('', 13, THEME.text, { fontWeight: 'bold' });
  /** The ship's figures, at the bottom of the workshop's outfit while no message is there */
  private readonly figures = text('', 12, NIGHT.dim);
  /** The tavern's quests, shown in its window */
  private readonly tavern = new Container();
  private readonly quests: QuestView[] = [];
  /** What a quest's reward is made of, over the part of it under the pointer */
  private readonly tooltip = new Tooltip();
  private hint: { readonly view: QuestView; readonly kind: RewardKind } | null = null;
  /** A building that isn't open yet: its medallion and what will be there */
  private readonly closed = new Container();
  private readonly closedIcon = new Sprite();
  private readonly closedText = text('', 15, THEME.text, {
    wordWrap: true,
    wordWrapWidth: BODY_WIDTH - CLOSED_ICON - 40,
  });
  private readonly tabs: { id: ShopTab; tile: Tile; label: Text; resize: (width: number) => void }[];
  /** A tab's rows, scrolled with the mouse wheel or the bar beside them when they are taller than the window */
  private readonly list = new Container();
  /** The rows' mask: what of them shows */
  private readonly clip = new Graphics();
  private readonly scrollBar = new ScrollBar(SCROLL.thumb, (y) => this.scrollTo(y));
  private scroll = 0;
  /** Where the rows start in the window, scrolled to the top */
  private listTop: number = BODY_TOP.tabs;
  /** How tall the rows are, measured as they are made (a masked container is only as tall as its mask) */
  private listHeight = 0;
  private rows: ShopRow[] = [];
  private repair: { tile: Tile; label: Text; hull: Text } | null = null;
  private market: { hold: Text; sellAll: Tile; sellText: Text } | null = null;
  /** The Captain's path's terms under the line of the ship the player works towards, each one's text */
  private terms: Text[] = [];
  /** The building whose window is open over the harbour */
  private open: BuildingId | null = null;
  private tab: ShopTab = 'cannonballs';
  /** The building and tab the shop's rows were made for */
  private builtFor = '';
  private messageUntil = 0;
  private time = 0;
  /** The game as of the last frame: what a button acts on */
  private state: GameState | null = null;
  private readonly actions: PortActions;
  /** Over the harbour and the window: what the story asks the player to press here, lit for a new player */
  private readonly guide: StoryGuide;
  private readonly guideSays: Readonly<Record<keyof typeof GUIDE_SAYS, string>>;
  /** The card whose button the guide lights: the question before pressing it lights its Yes too */
  private guided: ItemFace | null = null;

  /** zone: the sea the port is in: its tavern offers that sea's quests; openLoadout: the ship at the quay clicked */
  constructor(
    actions: PortActions,
    screen: Rectangle,
    portName: string,
    confirm: ConfirmDialog,
    zone: ZoneId,
    openLoadout: () => void,
  ) {
    this.actions = actions;
    this.confirm = confirm;
    this.container.visible = false;
    this.harbour = new HarbourView(
      screen,
      portName,
      (id) => this.enter(id),
      () => this.setSail(),
      openLoadout,
    );
    // Made before the port listens for Escape, the item's window first: the one on top closes first
    this.info = new ItemInfo(screen, this.confirm);
    // Its gold cross, a click beside it and Escape go back to the harbour
    this.window = new HudWindow(
      screen,
      { width: WIDTH, height: HEIGHT, pad: PAD },
      () => this.leaveBuilding(),
      NIGHT_WINDOW,
    );
    this.panel = this.window.panel;
    this.loadIcons();

    this.icon.width = this.icon.height = ICON.size;
    this.icon.position.set(ICON.x, ICON.y);
    this.title.position.set(NAME.x, PAD - 6);
    this.about.position.set(NAME.x, NAME.about);
    // The gold beside the cross, on the title's line
    this.gold.anchor.set(1, 0.5);
    this.gold.position.set(GOLD_RIGHT, PAD + 17);
    const divider = nightDivider(WIDTH - PAD * 2, DIVIDER_MIDDLE);
    divider.position.set(PAD, DIVIDER);
    this.message.position.set(NIGHT_CORNER_REACH, MESSAGE_Y);
    this.figures.position.set(NIGHT_CORNER_REACH, MESSAGE_Y + 1);

    // The tavern: a row per quest of its sea
    zoneQuests(zone).forEach((id, i) => this.tavern.addChild(this.questView(id, i * (QUEST_HEIGHT + QUEST_GAP))));
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
      const { tile, text: label, resize } = moonButton(0, TAB.height, t(TABS[id]), () => (this.tab = id), TAB.label);
      tile.container.visible = false;
      return { id, tile, label, resize };
    });

    this.list.mask = this.clip;
    this.panel.on('wheel', (e) => this.scrollBy(e.deltaY * SCROLL.speed));

    this.panel.addChild(
      divider,
      this.icon,
      this.title,
      this.about,
      this.coin,
      this.doubloon,
      this.gold,
      this.tavern,
      this.closed,
      this.list,
      this.clip,
      this.scrollBar.container,
      this.message,
      this.figures,
    );
    for (const { tile } of this.tabs) this.panel.addChild(tile.container);
    this.panel.addChild(this.tooltip.container);
    this.guide = new StoryGuide(screen);
    this.guideSays = {
      setSail: t(GUIDE_SAYS.setSail),
      market: t(GUIDE_SAYS.market),
      sellTab: t(GUIDE_SAYS.sellTab),
      sellAll: t(GUIDE_SAYS.sellAll),
      shipyard: t(GUIDE_SAYS.shipyard),
      buy: t(GUIDE_SAYS.buy),
    };
    this.container.addChild(this.harbour.container, this.window.container, this.info.container, this.guide.container);
    window.addEventListener('keydown', (e) => {
      // A window over the port (the loadout, an item, a building's) closes first
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      // From the harbour out to sea
      this.setSail();
      // It shouldn't also do what Escape does at sea (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  /** The story's guide on what it asks the player to press here, after the rows were made for this frame */
  private updateGuide(state: GameState, cue: StoryCue | null, dt: number) {
    const shown = cue && !this.info.isOpen ? this.guideFor(state, cue) : null;
    this.guided = shown?.face ?? null;
    this.guide.update(shown?.guide ?? null, shown?.says ?? '', dt);
  }

  /**
   * Where the story's guide points in port: in the harbour, at the ship's medallion (its guns to fit, the note over Set
   * sail saying so), Set sail, or the medallion of the building to go into; in that building's window, at the tab and
   * the button to press. Nothing over another building's window
   */
  private guideFor(
    state: GameState,
    cue: StoryCue,
  ): { readonly guide: Guide; readonly says: string; readonly face?: ItemFace } | null {
    const says = this.guideSays;
    if (!this.open) {
      const at = (id: BuildingId | 'ship' | 'sail', said: string) => {
        const target = this.harbour.target(id);
        return target
          ? { guide: { kind: 'click', target, round: id !== 'sail', above: true } as const, says: said }
          : null;
      };
      if (cue.kind === 'fit') return at('ship', '');
      if (cue.kind === 'setSail') return at('sail', says.setSail);
      if (cue.kind === 'sell') return at('market', says.market);
      if (cue.kind === 'buyShip') return at('shipyard', says.shipyard);
      return null;
    }
    if (this.open === 'market' && cue.kind === 'sell') {
      if (this.tab !== 'market') {
        const tab = this.tabs.find(({ id }) => id === 'market');
        return tab ? { guide: { kind: 'click', target: { container: tab.tile.container } }, says: says.sellTab } : null;
      }
      const sellAll = this.market?.sellAll;
      // Its note over it: under it, it would hide the goods' rows
      return sellAll
        ? { guide: { kind: 'click', target: { container: sellAll.container }, above: true }, says: says.sellAll }
        : null;
    }
    if (this.open === 'shipyard' && cue.kind === 'buyShip') {
      const goal = shipGoal(state, state.player);
      const ships: readonly string[] = goal ? goalShips(state, state.player, goal) : [];
      const row = this.rows.find((r) => r.ship !== null && ships.includes(r.ship) && r.face.button(state).enabled);
      if (!row) return null;
      const guide = { kind: 'click', target: { container: row.button.container }, above: true } as const;
      return { guide, says: says.buy, face: row.face };
    }
    return null;
  }

  /** Out to sea, unless the story keeps the ship in port: then the harbour says why */
  private setSail() {
    if (!this.actions.leavePort()) this.harbour.refused();
  }

  /** Opens a building's window over the harbour */
  private enter(id: BuildingId) {
    this.open = id;
    // The icons again, if they failed to load before
    if (id === 'arsenal' || id === 'workshop' || id === 'shipyard' || id === 'market') this.loadIcons();
    const building = BUILDINGS.find((b) => b.id === id);
    show(this.title, building ? t(building.name) : '');
    // The tavern says how many bounties a captain may take; the others what they are for
    show(
      this.about,
      id === 'tavern'
        ? t('Bounties: up to {n} at a time. Sink what they ask, then come back', {
            n: this.state ? questLimit(this.state, this.state.player) : 0,
          })
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
      this.icon.width = this.icon.height = ICON.size;
      this.closedIcon.texture = medallion;
      this.closedIcon.width = this.closedIcon.height = CLOSED_ICON;
    }
    const tabs = BUILDING_TABS[id];
    if (tabs.length > 0 && !tabs.includes(this.tab)) this.tab = tabs[0];
    // A ship waiting to be bought: the shipyard opens on its line (the first of them, when it may be of any)
    const goal = id === 'shipyard' && this.state ? shipGoal(this.state, this.state.player) : null;
    if (goal && this.state && termsMet(this.state, this.state.player)) {
      const [ship] = goalShips(this.state, this.state.player, goal);
      const line = ship && SHIP_CLASSES[ship].line;
      this.tab = tabs.find((tab) => tab === line) ?? this.tab;
    }
    this.layTabs(tabs);
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
    this.window.container.visible = true;
  }

  /**
   * A building's tabs in a row under the header, only when there is more than one to choose from: as wide as their
   * names, squeezed closer where the names are long (a language's)
   */
  private layTabs(ids: readonly ShopTab[]) {
    const shown = this.tabs.filter(({ id }) => ids.length > 1 && ids.includes(id));
    const end = moonButtonEnd(TAB.height);
    const names = shown.reduce((sum, { label }) => sum + Math.ceil(label.width) + end * 2, 0);
    const room = BODY_WIDTH - names - (shown.length - 1) * TAB.gap;
    const pad = Math.max(TAB.least, Math.min(TAB.pad, Math.floor(room / (Math.max(1, shown.length) * 2))));
    let x = PAD;
    for (const tab of this.tabs) tab.tile.container.visible = shown.includes(tab);
    for (const { tile, label, resize } of shown) {
      resize(Math.ceil(label.width) + (end + pad) * 2);
      tile.container.position.set(x, TABS_TOP);
      x += tile.width + TAB.gap;
    }
  }

  /** Closes the building's window: back to the harbour */
  private leaveBuilding() {
    this.open = null;
    this.window.container.visible = false;
    this.info.hide();
    // Hidden, the reward under the pointer never hears it leave
    this.hint = null;
    this.tooltip.point(null, 0, 0);
  }

  /**
   * Opens while the player's ship is in port, closes when it leaves; then fills in the open building's window. cue:
   * what the story asks the player to press now (storyCue), lit for a new player
   */
  update(state: GameState, cue: StoryCue | null) {
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
    this.harbour.update(dt, player.gold, badges(state), storyFitting(state, player) !== null);
    this.info.update(state);
    if (this.open) this.fillWindow(state, this.open);
    this.updateGuide(state, cue, dt);
  }

  /** The open building's window as the game is now: the purse, the message, the quests or the tab's rows */
  private fillWindow(state: GameState, open: BuildingId) {
    const { ship, player } = state;
    this.window.fit();
    const doubloons = open === 'market' && this.tab === 'wares';
    show(this.gold, whole(doubloons ? player.doubloons : player.gold));
    const coin = doubloons ? this.doubloon : this.coin;
    this.coin.visible = !doubloons;
    this.doubloon.visible = doubloons;
    coin.position.set(this.gold.x - this.gold.width - 14, this.gold.y);
    this.message.visible = this.time < this.messageUntil;

    if (open === 'tavern') this.updateQuests(state);
    const tabs = BUILDING_TABS[open];
    if (tabs.length === 0) return;
    for (const { id, tile } of this.tabs) tile.setLook({ pressed: id === this.tab });
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
        drawNightCard(
          row.background.clear(),
          CARD_WIDTH,
          CARD.height,
          inUse ? THEME.brassLight : undefined,
          tierColor(row.face.tier),
        );
      }
    }
    const outfit = OUTFIT_TABS[this.tab] !== undefined;
    show(this.figures, outfit ? t('Your ship: {figures}', { figures: shipFigures(ship) }) : '');
    this.figures.visible = outfit && !this.message.visible;
    if (this.market) {
      const value = marketValue(ship);
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

  /** The tavern's quests, for the ship sailed: taken or not, how far each has got, Take, Turn in or Drop */
  private updateQuests(state: GameState) {
    const { player } = state;
    const full = shipQuests(state, player).length >= questLimit(state, player);
    for (const view of this.quests) {
      const taken = takenQuest(state, player, view.id);
      const quest = QUESTS[view.id];
      const done = taken !== undefined && questDone(taken);
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
          ? questText(quest)
          : t('Turn in {n} more tavern quest to hear of it|Turn in {n} more tavern quests to hear of it', {
              n: quest.after - player.progress.questsDone,
            }),
      );
      tint(view.about, offered ? NIGHT.dim : UI.warn);
      const reward = questReward(state, player, view.id);
      showActual(view.gold, quest.reward, reward.gold);
      showActual(view.xp, quest.xp, reward.xp);
      const brackets = `${view.gold.actual.text}|${view.xp.actual.text}`;
      if (view.laidOut !== brackets) {
        view.laidOut = brackets;
        layOut(view.xp, layOut(view.gold, TAVERN_WIDTH - REWARD.right) - REWARD.gap);
      }
      show(view.buttonText, done ? t('Turn in') : taken ? t('Taken') : offered ? t('Take') : t('Later'));
      view.button.setLook({
        pressed: done,
        disabled: (taken !== undefined && !done) || (!taken && (full || !offered)),
      });
      view.drop.container.visible = taken !== undefined && !done;
    }
    if (!this.hint) {
      this.tooltip.point(null, 0, 0);
      return;
    }
    const { view, kind } = this.hint;
    const { hit } = view[kind];
    const top = this.tavern.y + view.y + hit.y;
    this.tooltip.point(
      rewardText(kind, QUESTS[view.id], questReward(state, player, view.id)),
      this.tavern.x + hit.x + hit.width / 2,
      top,
      { width: WIDTH - PAD, under: top + hit.height },
    );
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
    const title = subheading(questTitle(quest), 17);
    title.position.set(left, 9);
    const about = text(questText(quest), 12, NIGHT.dim, {
      wordWrap: true,
      wordWrapWidth: TAVERN_WIDTH - left - QUEST_RIGHT,
    });
    about.position.set(left, 37);
    // The experience's star before it, as the coin is before the gold; laid out as the game is shown (updateQuests)
    const gold = rewardPart(goldCoin(7), quest.reward, 14, GOLD);
    const xp = rewardPart(xpStar(7), quest.xp, 12, XP_COLOR);
    const body = new Container();
    body.addChild(title, about, xp.container, gold.container);
    const main = moonButton(QUEST_BUTTON.width, QUEST_BUTTON.height, t('Take'), () => this.questAction(id), 12);
    main.tile.container.position.set(TAVERN_WIDTH - 14 - QUEST_BUTTON.width, QUEST_HEIGHT - 12 - QUEST_BUTTON.height);
    // Asked first, as the quest tracker at sea does
    const drop = moonButton(QUEST_BUTTON.drop, QUEST_BUTTON.height, t('Drop'), () => {
      const taken = this.state && takenQuest(this.state, this.state.player, id);
      if (!taken) return;
      this.confirm.ask(abandonQuestion(taken), () => {
        this.actions.dropQuest(id);
        this.say(t('"{title}" dropped', { title: questTitle(quest) }), NIGHT.dim);
      });
    });
    drop.tile.container.position.set(main.tile.container.x - 6 - QUEST_BUTTON.drop, main.tile.container.y);
    row.addChild(background, dial, mark, count, body, main.tile.container, drop.tile.container);
    const view: QuestView = {
      id,
      y,
      background,
      dial,
      mark,
      count,
      body,
      about,
      gold,
      xp,
      laidOut: '',
      painted: '',
      button: main.tile,
      buttonText: main.text,
      drop: drop.tile,
    };
    this.quests.push(view);
    for (const kind of ['gold', 'xp'] as const) {
      const { container } = view[kind];
      container.on('pointerover', () => (this.hint = { view, kind }));
      container.on('pointerout', () => {
        if (this.hint?.view === view && this.hint.kind === kind) this.hint = null;
      });
    }
    return row;
  }

  /** Turns the quest in when it is done, else takes it: trying the other first would sound its refusal */
  private questAction(id: QuestId) {
    const quest = QUESTS[id];
    const title = questTitle(quest);
    const taken = this.state && takenQuest(this.state, this.state.player, id);
    if (taken && questDone(taken)) {
      // What it pays, with the bonuses: worked out before it is turned in
      const gold = this.state ? questReward(this.state, this.state.player, id).gold : quest.reward;
      if (this.actions.turnInQuest(id)) this.say(t('"{title}" done: +{n} gold', { title, n: gold }), GOLD);
    } else if (this.actions.takeQuest(id)) {
      this.say(t('Taken: {title}. Sink {n} and come back', { title, n: quest.count }));
    }
  }

  /** The rows of a shop tab: the guns or the ammo of a weapon by tier, the outfit, the shipwright, the market... */
  private buildShop(tab: ShopTab) {
    for (const child of this.list.removeChildren()) child.destroy({ children: true });
    this.rows = [];
    this.repair = null;
    this.market = null;
    this.terms = [];
    const ammo = AMMO_TABS[tab];
    const slot = OUTFIT_TABS[tab];
    const line = LINE_TABS[tab];
    if (tab === 'market') {
      this.buildMarket();
    } else if (tab === 'wares') {
      this.buildWares();
    } else if (tab === 'myShips') {
      this.buildFleet();
    } else if (line) {
      this.buildLine(line);
    } else if (ammo) {
      AMMO_IDS[ammo].forEach((id, i) => this.list.addChild(this.card({ ammo: id }, i)));
    } else if (slot) {
      OUTFIT_IDS[slot].forEach((id, i) => this.list.addChild(this.card({ outfit: id }, i)));
    } else if (tab === 'shipwright') {
      const { pad } = SHIPWRIGHT;
      const hull = text('', 15, THEME.text, { fontWeight: 'bold' });
      hull.position.set(pad, 14);
      const fix = moonButton(220, 30, '', () => {
        if (this.actions.repairInPort()) this.say(t('The shipwright mended the hull'), UI.heal);
      });
      fix.tile.container.position.set(pad, 42);
      const note = text(
        t('Or let the crew mend it at sea (R): 1 gold for every {per} hull, a step a second, out of combat', {
          per: REPAIR_HP_PER_GOLD,
        }),
        12,
        NIGHT.dim,
        { wordWrap: true, wordWrapWidth: SHOP_WIDTH - pad * 2 },
      );
      note.position.set(pad, 84);
      const board = drawNightCard(new Graphics(), SHOP_WIDTH, SHIPWRIGHT.height);
      this.list.addChild(board, hull, fix.tile.container, note);
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
    this.scrollBar.container.position.set(WIDTH - PAD + SCROLL.margin, top);
    this.scrollBar.draw(view, most, this.scroll);
  }

  /** Loads the arsenal's, the workshop's, the shipyard's and the market's icons; their cards are made again with them
   * once they are there */
  private loadIcons() {
    for (const icons of [GUN_ICONS, AMMO_ICONS, OUTFIT_ICONS, SHIP_ICONS, ITEM_ICONS]) {
      icons.load(() => (this.builtFor = ''));
    }
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
    const card = new Container();
    card.position.set((index % 2) * (CARD_WIDTH + CARD.gap), top + Math.floor(index / 2) * (CARD.height + CARD.rowGap));
    const face = itemFace(item, this.actions);
    const background = new Graphics();
    const slot = iconSlot(size, tierColor(face.tier), face.chip ?? `T${face.tier}`, face.letters);
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
    // A price in gold or doubloons: its coin before it, in place of the word
    const coin = coinOf(face.coin ?? 'gold', CARD.coin);
    coin.visible = face.coin !== null;
    coin.position.set(price.x - price.width - 4 - CARD.coin, price.y + price.height / 2);
    const title = text(face.name, 14, THEME.text, { fontWeight: 'bold' });
    title.position.set(left, 8);
    clip(title, price.x - price.width - (face.coin ? CARD.coin * 2 + 4 : 0) - 8 - left);
    // What it is for in a line (the info window has all of it), and its figures under it
    // What the arsenal pays for it back, under the price
    const resale = text(face.resale ?? '', 11, NIGHT.dim);
    resale.anchor.set(1, 0);
    resale.position.set(width - 12, 30);
    const resaleCoin = goldCoin(CARD.resaleCoin);
    resaleCoin.visible = face.resale !== undefined;
    resaleCoin.position.set(resale.x - resale.width - 3 - CARD.resaleCoin, resale.y + resale.height / 2);
    const aboutWidth = width - left - 12 - (face.resale ? resale.width + CARD.resaleCoin * 2 + 11 : 0);
    // An item of the market's says what it does in two lines, in place of the figures' line
    const about = face.wrap
      ? text(face.about, 11, THEME.text, { wordWrap: true, wordWrapWidth: aboutWidth, lineHeight: ABOUT_LINE })
      : text(face.about, 11, NIGHT.dim);
    about.position.set(left, 29);
    if (face.wrap) clipLines(about, 2, ABOUT_LINE);
    else clip(about, aboutWidth);
    const stats = text(face.stats, 12, THEME.text);
    stats.position.set(left, 47);
    // A piece of outfit that changes three figures takes a smaller hand before it is cut short
    if (stats.width > width - left - 12) stats.style.fontSize = 11;
    clip(stats, width - left - 12);
    const button = moonButton(BUY.width, BUY.height, this.state ? face.button(this.state).short : t('Buy'), () =>
      this.press(face),
    );
    // A ship's button as wide as its label: that changes only with the fleet, which makes the cards again
    const end = moonButtonEnd(BUY.height) + SHIP_BUY.pad;
    const buy = 'ship' in item ? Math.max(SHIP_BUY.width, Math.ceil(button.text.width) + end * 2) : BUY.width;
    button.resize(buy);
    button.tile.container.position.set(width - 12 - buy, CARD.height - 12 - BUY.height);
    const info = moonButton(INFO.width, BUY.height, 'i', () => this.info.open(itemFace(item, this.actions)), INFO.size);
    info.text.style.fontFamily = TITLE_STYLE.fontFamily ?? 'serif';
    info.text.style.fontStyle = 'italic';
    info.tile.container.cursor = 'info' satisfies CursorId;
    info.tile.container.position.set(button.tile.container.x - 6 - INFO.width, button.tile.container.y);
    // What the arsenal buys back has a Sell button too, left of the info button
    const sell = face.sell ? moonButton(BUY.width, BUY.height, t('Sell'), () => this.press(face, face.sell)) : null;
    sell?.tile.container.position.set(info.tile.container.x - 6 - BUY.width, button.tile.container.y);
    // How many the player has, beside the buttons: in two lines where they leave it little room
    const room = (sell ? sell.tile.container.x : info.tile.container.x) - 8 - left;
    const owned = text('', 11, NIGHT.dim, { wordWrap: true, wordWrapWidth: room, lineHeight: 12 });
    owned.anchor.set(0, 0.5);
    owned.position.set(left, CARD.height - 12 - BUY.height / 2);
    card.addChild(
      background,
      slot.container,
      title,
      price,
      coin,
      resale,
      resaleCoin,
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
      ship: 'ship' in item ? item.ship : null,
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
    if (question) this.confirm.ask({ ...question, guided: which === this.guided }, run);
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
    const sellAll = moonButton(SELL_ALL.width, SELL_ALL.height, '', () => {
      const value = ship ? marketValue(ship) : 0;
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
    board.addChild(drawNightCard(new Graphics(), SHOP_WIDTH, GOODS_LIST.board), hold, meter, sellAll.tile.container);
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
        NIGHT.dim,
        { wordWrap: true, wordWrapWidth: SHOP_WIDTH - 48, align: 'center' },
      );
      empty.anchor.set(0.5);
      empty.position.set(SHOP_WIDTH / 2, top + GOODS_LIST.empty / 2);
      const card = drawNightCard(new Graphics(), SHOP_WIDTH, GOODS_LIST.empty);
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

  /**
   * The market's Buy: the items, for doubloons only, under a word that they do nothing yet, group by group, each under
   * its heading and what its items are for, as cards (bought one at a click, any count in the info window)
   */
  private buildWares() {
    const note = text(
      t(
        'Paid in doubloons. Bought, an item goes into the hold (H), as many as you like: drag it from there onto a quick slot of the skill bar. What each does comes with an update: for now they do nothing yet.',
      ),
      12,
      UI.warn,
      { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
    );
    this.list.addChild(note);
    let y = note.height + 12;
    for (const category of ITEM_CATEGORY_IDS) {
      const { name, text: about } = ITEM_CATEGORIES[category];
      const heading = subheading(t(name));
      heading.position.set(0, y);
      const line = text(t(about), 12, NIGHT.dim);
      line.position.set(heading.width + 12, y + 4);
      clip(line, SHOP_WIDTH - line.x);
      this.list.addChild(heading, line);
      y += TIER_HEADING;
      const items = ITEM_IDS.filter((id) => ITEMS[id].category === category);
      items.forEach((id, i) => this.list.addChild(this.card({ item: id }, i, y)));
      y += Math.ceil(items.length / 2) * (CARD.height + CARD.rowGap) + 6;
    }
  }

  /** A good's row at the market, with its Sell */
  private marketRow(id: GoodId, count: number) {
    const { name } = GOODS[id];
    const ship = this.state?.ship;
    const sell = () => {
      const n = ship ? marketValue(ship, [id]) : 0;
      if (this.actions.sellCargo(id)) this.say(t('{name} sold: +{n} gold', { name: t(name), n }), GOLD);
    };
    return goodRow(id, count, SHOP_WIDTH, [{ label: t('Sell'), onTap: sell }], ship ? marketShare(ship) : 1);
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
      NIGHT.dim,
      { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
    );
    laidUp.position.set(0, Math.ceil(owned.length / 2) * (CARD.height + CARD.rowGap) + 6);
    const goal = shipGoal(state, state.player);
    const [next] = goal ? goalShips(state, state.player, goal) : [];
    const lines = text(
      goal && !goal.line
        ? t(
            'Every line has a tab of its ships: the shipyard sells you a tier {tier} ship of any line, once every term is met',
            {
              tier: goal.tier,
            },
          )
        : next
          ? t('Every line has a tab of its ships: the shipyard sells the {name} now, the others come later', {
              name: t(SHIP_CLASSES[next].name),
            })
          : t('Every line has a tab of its ships: the others come later'),
      12,
      NIGHT.dim,
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
    const style = text(about, 12, NIGHT.dim, { wordWrap: true, wordWrapWidth: SHOP_WIDTH });
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

    // Under the goal's line, or under every ladder's when it may be of any
    const state = this.state;
    const goal = state && shipGoal(state, state.player);
    if (!state || !goal || (goal.line ? goal.line !== id : !LADDER_LINES.includes(id))) return;
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
