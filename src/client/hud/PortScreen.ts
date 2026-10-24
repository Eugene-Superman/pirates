import { Container, Graphics, type Rectangle, type Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  AMMO_PACK,
  GOODS,
  GOOD_IDS,
  GUNS,
  GUN_IDS,
  MAX_QUESTS,
  OUTFITS,
  OUTFIT_IDS,
  OUTFIT_SLOTS,
  OUTFIT_STATS,
  QUESTS,
  QUEST_IDS,
  REPAIR_HP_PER_GOLD,
  SHIP_CLASSES,
  WEAPON_IDS,
  ammoPackPrice,
  captainsPath,
  cargoCount,
  cargoValue,
  goalOffer,
  gunPrice,
  laidUpLevel,
  offerName,
  outfitPrice,
  questDone,
  questOffered,
  repairPrice,
  termsMet,
  type AmmoId,
  type GameState,
  type GoodId,
  type GunId,
  type OutfitBonus,
  type OutfitId,
  type OutfitSlot,
  type OutfitStat,
  type QuestId,
  type Ship,
  type WeaponId,
} from '../../game';
import { Tile, UI, drawBall, drawCoin, drawHarpoon, labelButton, show, text, tierColor, tint } from './ui';
import { t } from '../i18n/i18n';

/** What the port's menus do: game methods, each saying whether it worked */
export interface PortActions {
  leavePort: () => void;
  buyGun: (gun: GunId) => boolean;
  buyAmmo: (ammo: AmmoId) => boolean;
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

const WIDTH = 1200; // pixels, before scaling down to fit the screen
const HEIGHT = 640;
const MARGIN = 20; // between the window and the screen's edge, at least
const PAD = 18;
const HEADER = 58; // pixels: the title row
const TAVERN_WIDTH = 500;
const SHOP_X = PAD * 2 + TAVERN_WIDTH;
const SHOP_WIDTH = WIDTH - SHOP_X - PAD;
const QUEST_HEIGHT = 74;
const QUEST_GAP = 6;
const GUN_ROW = 40;
const AMMO_ROW = 29;
const ROW_GAP = 4;
const BUY = { width: 64, height: 24 };
const LEAVE = { width: 150, height: 30 };
const MESSAGE_TIME = 3.5; // seconds a message stays
const DIM_ALPHA = 0.55;
const GOLD = 0xffcf3f;

type ShopTab = WeaponId | 'ammo' | 'outfit' | 'shipwright' | 'market' | 'shipyard';
const TABS: readonly { readonly id: ShopTab; readonly label: string }[] = [
  { id: 'cannon', label: 'Cannons' },
  { id: 'harpoon', label: 'Harpoon guns' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'shipwright', label: 'Shipwright' },
  { id: 'market', label: 'Market' },
  { id: 'shipyard', label: 'Shipyard' },
];
const TAB = { pad: 8, gap: 5 } as const; // pixels: inside a shop tab beside its name, and between two
const MARKET_ROW = 34;
const PATH_LINE = 21; // pixels: a term of the shipyard's offer
const SHIPYARD = { buy: 300, button: 30, row: 40, helm: 130 } as const; // pixels: Buy, a ship's row, Take the helm
const SLOT_NAMES: Readonly<Record<OutfitSlot, string>> = {
  sails: 'Sails',
  hull: 'Hull',
  rudder: 'Rudder',
  lookout: 'Lookout',
};
const STAT_NAMES: Readonly<Record<OutfitStat, string>> = {
  speed: 'speed',
  holedSpeed: 'speed when holed',
  acceleration: 'acceleration',
  braking: 'braking',
  turn: 'turning',
  hull: 'hull',
  sight: 'sight',
};
const KNOT = 10; // world units per second
const OUTFIT_TOP = 62; // pixels: the outfit's rows, under its summary and slot buttons

/** What a piece of outfit gives, in a few words: "+17% speed · +15% acceleration" */
function bonusText(bonus: OutfitBonus) {
  return OUTFIT_STATS.flatMap((stat) => {
    const share = bonus[stat];
    if (!share) return [];
    return [`${share > 0 ? '+' : '−'}${Math.round(Math.abs(share) * 100)}% ${t(STAT_NAMES[stat])}`];
  }).join(' · ');
}

/** A figure of the ship for sale beside the player's: "Hull 800 (yours 400)" */
function compare(label: string, theirs: number | string, ours: number | string) {
  return t('{label} {theirs} (yours {ours})', { label: t(label), theirs, ours });
}

/** A speed in knots, for the shipyard's figures */
function knots(speed: number) {
  return t('{speed} kn', { speed: (speed / KNOT).toFixed(1) });
}

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

interface QuestView {
  readonly id: QuestId;
  readonly background: Graphics;
  readonly about: Text;
  /** The border the background was last drawn with */
  painted: number;
  readonly progress: Text;
  readonly button: Tile;
  readonly buttonText: Text;
  readonly drop: Tile;
}

/** A row of the shop: a gun or an ammo, its price, how many the player has, and Buy */
interface ShopRow {
  readonly gun: GunId | null;
  readonly ammo: AmmoId | null;
  readonly owned: Text;
  readonly buy: Tile;
}

/** The shipyard tab's texts that change: the terms, Buy and what it says, the ship sailed's level and hull */
interface ShipyardView {
  terms: Text[];
  buy: { readonly tile: Tile; readonly label: Text; readonly name: string; readonly price: number } | null;
  status: Text | null;
  sailed: Text | null;
}

/** A row of the outfit: a piece, whether it is fitted or in the hold, and Buy (and fit), Fit or Take off */
interface OutfitRow {
  readonly id: OutfitId;
  readonly background: Graphics;
  /** Whether the background was last drawn for a fitted piece */
  painted: boolean | null;
  readonly owned: Text;
  readonly button: Tile;
  readonly label: Text;
}

/**
 * The port's menus, over everything while the player's ship is in port: the tavern on the left (bounties to take,
 * how far each has got, the reward to collect), the shop on the right (guns into the hold, packs of ammo, the
 * shipwright's repair), the player's gold at the top and Leave port (or Escape), which sails the ship out
 */
export class PortScreen {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly gold = text('', 18, GOLD, { fontWeight: 'bold' });
  private readonly message = text('', 13, UI.text, { fontWeight: 'bold' });
  private readonly quests: QuestView[] = [];
  private readonly tabs: { id: ShopTab; tile: Tile; label: Text }[];
  private readonly list = new Container();
  private rows: ShopRow[] = [];
  private repair: { tile: Tile; label: Text; hull: Text } | null = null;
  private outfit: { figures: Text; slots: { slot: OutfitSlot; tile: Tile; label: Text }[]; rows: OutfitRow[] } | null =
    null;
  private market: { hold: Text; sellAll: Tile; sellText: Text } | null = null;
  private shipyard: ShipyardView | null = null;
  private tab: ShopTab = 'cannon';
  /** The outfit's slot shown */
  private slot: OutfitSlot = 'sails';
  /** The tab (and slot) the shop's rows were made for */
  private builtFor = '';
  private messageUntil = 0;
  private time = 0;
  /** The game as of the last frame: what a button acts on */
  private state: GameState | null = null;
  private readonly actions: PortActions;
  private readonly screen: Rectangle;
  /** The screen size the dim and the panel were fitted to */
  private fittedTo = '';

  constructor(actions: PortActions, screen: Rectangle, portName: string) {
    this.actions = actions;
    this.screen = screen;
    this.container.visible = false;
    const background = new Graphics()
      .roundRect(0, 0, WIDTH, HEIGHT, 12)
      .fill({ color: UI.panel, alpha: 0.97 })
      .stroke({ width: 1.5, color: UI.border, alpha: 0.4 });
    for (const blocker of [this.dim, background]) {
      blocker.eventMode = 'static';
      // Clicks in port must not reach the stage, which would steer the ship
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    const title = text(t(portName), 22, UI.active, { fontWeight: 'bold' });
    title.position.set(PAD, PAD - 2);
    const coin = new Graphics();
    drawCoin(coin, 10);
    coin.position.set(PAD + title.width + 34, PAD + 12);
    this.gold.position.set(coin.x + 16, PAD);
    const leave = labelButton(LEAVE.width, LEAVE.height, t('Leave port  (Esc)'), () => this.actions.leavePort(), 13);
    leave.tile.setLook({ border: UI.active });
    leave.tile.container.position.set(WIDTH - PAD - LEAVE.width, PAD - 4);
    this.message.position.set(PAD, HEIGHT - PAD - 14);
    this.panel.addChild(background, title, coin, this.gold, leave.tile.container, this.message);

    // The tavern
    const tavern = text(t('Tavern'), 17, UI.text, { fontWeight: 'bold' });
    tavern.position.set(PAD, HEADER);
    const tavernNote = text(
      t('Bounties: up to {n} at a time. Sink what they ask, then come back', { n: MAX_QUESTS }),
      12,
      UI.dim,
    );
    tavernNote.position.set(PAD, HEADER + 22);
    this.panel.addChild(tavern, tavernNote);
    QUEST_IDS.forEach((id, i) => this.panel.addChild(this.questView(id, HEADER + 46 + i * (QUEST_HEIGHT + QUEST_GAP))));

    // The shop
    const shop = text(t('Shop'), 17, UI.text, { fontWeight: 'bold' });
    shop.position.set(SHOP_X, HEADER);
    this.panel.addChild(shop);
    let x = SHOP_X + Math.ceil(shop.width) + TAB.gap * 2;
    this.tabs = TABS.map(({ id, label }) => {
      const caption = text(t(label), 12, UI.text, { fontWeight: 'bold' });
      const tile = new Tile(Math.ceil(caption.width) + TAB.pad * 2, 24, () => (this.tab = id), 5);
      caption.anchor.set(0.5);
      caption.position.set(tile.width / 2, 12);
      tile.content.addChild(caption);
      tile.container.position.set(x, HEADER - 2);
      x += tile.width + TAB.gap;
      this.panel.addChild(tile.container);
      return { id, tile, label: caption };
    });
    this.list.position.set(SHOP_X, HEADER + 34);
    this.panel.addChild(this.list);

    this.container.addChild(this.dim, this.panel);
    window.addEventListener('keydown', (e) => {
      // A window over the port (the loadout) closes first
      if (e.code !== 'Escape' || !this.isOpen || e.defaultPrevented) return;
      this.actions.leavePort();
      // Escape left port; it shouldn't also do what it does at sea (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Opens while the player's ship is in port, closes when it leaves; then fills in the gold, quests and shop */
  update(state: GameState) {
    const { ship, player } = state;
    this.time = state.time;
    this.state = state;
    if (ship.docked !== this.container.visible) {
      this.container.visible = ship.docked;
      if (ship.docked)
        this.say(t('Welcome ashore. The tavern has work, the shop has guns and shot, the market buys cargo'));
    }
    if (!this.isOpen) return;

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
    this.message.visible = this.time < this.messageUntil;

    for (const view of this.quests) {
      const taken = player.quests.find((q) => q.id === view.id);
      const quest = QUESTS[view.id];
      const done = taken !== undefined && questDone(taken);
      const full = player.quests.length >= MAX_QUESTS;
      const offered = questOffered(player, view.id);
      show(view.progress, taken ? (done ? t('Done!') : `${taken.kills} / ${quest.count}`) : '');
      tint(view.progress, done ? UI.good : UI.text);
      show(
        view.about,
        offered
          ? t(quest.text)
          : t('Turn in {n} more tavern quest to hear of it|Turn in {n} more tavern quests to hear of it', {
              n: quest.after - player.progress.questsDone,
            }),
      );
      tint(view.about, offered ? UI.dim : UI.warn);
      show(view.buttonText, done ? t('Turn in') : taken ? t('Taken') : offered ? t('Take') : t('Later'));
      view.button.setLook({
        pressed: done,
        disabled: (taken !== undefined && !done) || (!taken && (full || !offered)),
      });
      tint(view.buttonText, done ? UI.darkText : UI.text);
      view.drop.container.visible = taken !== undefined && !done;
      const border = done ? UI.good : taken ? UI.active : UI.border;
      if (view.painted !== border) {
        view.painted = border;
        view.background
          .clear()
          .roundRect(0, 0, TAVERN_WIDTH, QUEST_HEIGHT, 8)
          .fill({ color: UI.idle, alpha: 0.5 })
          .stroke({ width: taken ? 1.5 : 1, color: border, alpha: taken ? 0.9 : 0.3 });
      }
    }

    for (const { id, tile, label } of this.tabs) {
      tile.setLook({ pressed: id === this.tab });
      tint(label, id === this.tab ? UI.darkText : UI.text);
    }
    const built =
      this.tab === 'outfit'
        ? `outfit:${this.slot}`
        : this.tab === 'market'
          ? `market:${GOOD_IDS.map((id) => ship.cargo[id] ?? 0).join()}`
          : this.tab;
    if (this.builtFor !== built) {
      this.builtFor = built;
      this.buildShop(this.tab);
    }
    for (const row of this.rows) {
      if (row.gun) {
        const fitted = WEAPON_IDS.reduce((n, w) => n + ship.guns[w].filter((g) => g === row.gun).length, 0);
        const inHold = player.hold[row.gun] ?? 0;
        show(row.owned, fitted + inHold > 0 ? t('fitted {fitted} · hold {hold}', { fitted, hold: inHold }) : '');
        row.buy.setLook({ disabled: player.gold < gunPrice(row.gun) });
      } else if (row.ammo) {
        show(row.owned, t('{n} aboard', { n: ship.ammo[row.ammo] }));
        row.buy.setLook({ disabled: player.gold < ammoPackPrice(row.ammo) });
      }
    }
    if (this.outfit) this.updateOutfit(state);
    if (this.market) {
      const value = cargoValue(ship.cargo);
      show(this.market.hold, t('Hold {cargo} / {size}', { cargo: cargoCount(ship.cargo), size: ship.holdSize }));
      show(this.market.sellText, value > 0 ? t('Sell everything: {n} gold', { n: value }) : t('Nothing to sell'));
      this.market.sellAll.setLook({ disabled: value === 0, border: value > 0 ? GOLD : UI.border });
    }
    if (this.shipyard) this.updateShipyard(state);
    if (this.repair) {
      const price = repairPrice(ship);
      show(this.repair.hull, t('Hull {hp} / {max}', { hp: ship.hp, max: ship.maxHp }));
      show(this.repair.label, price > 0 ? t('Repair all: {n} gold', { n: price }) : t('The hull is whole'));
      this.repair.tile.setLook({ disabled: price === 0 || player.gold < price });
    }
  }

  private say(message: string, color: number = UI.text) {
    show(this.message, message);
    tint(this.message, color);
    this.messageUntil = this.time + MESSAGE_TIME;
  }

  private questView(id: QuestId, y: number) {
    const quest = QUESTS[id];
    const row = new Container();
    row.position.set(PAD, y);
    const background = new Graphics();
    const title = text(t(quest.title), 14, UI.text, { fontWeight: 'bold' });
    title.position.set(12, 8);
    const about = text(t(quest.text), 12, UI.dim, { wordWrap: true, wordWrapWidth: TAVERN_WIDTH - 150 });
    about.position.set(12, 28);
    const reward = text(t('{n} gold', { n: quest.reward }), 13, GOLD, { fontWeight: 'bold' });
    reward.anchor.set(1, 0);
    reward.position.set(TAVERN_WIDTH - 12, 8);
    const progress = text('', 13, UI.text, { fontWeight: 'bold' });
    progress.anchor.set(1, 0);
    progress.position.set(TAVERN_WIDTH - 12, 28);
    const main = labelButton(84, 24, t('Take'), () => this.questAction(id), 12);
    main.tile.container.position.set(TAVERN_WIDTH - 12 - 84, QUEST_HEIGHT - 32);
    const drop = labelButton(50, 24, t('Drop'), () => {
      this.actions.dropQuest(id);
      this.say(t('"{title}" dropped', { title: t(quest.title) }), UI.dim);
    });
    drop.tile.container.position.set(TAVERN_WIDTH - 12 - 84 - 56, QUEST_HEIGHT - 32);
    row.addChild(background, title, about, reward, progress, main.tile.container, drop.tile.container);
    this.quests.push({
      id,
      background,
      about,
      painted: -1,
      progress,
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

  /** The rows of a shop tab: the guns of a weapon by tier, every ammo, or the shipwright */
  private buildShop(tab: ShopTab) {
    for (const child of this.list.removeChildren()) child.destroy({ children: true });
    this.rows = [];
    this.repair = null;
    this.outfit = null;
    this.market = null;
    this.shipyard = null;
    if (tab === 'outfit') {
      this.buildOutfit();
    } else if (tab === 'market') {
      this.buildMarket();
    } else if (tab === 'shipyard') {
      this.buildShipyard();
    } else if (tab === 'ammo') {
      let y = 0;
      for (const weapon of WEAPON_IDS) {
        const heading = text(t(weapon === 'cannon' ? 'Cannonballs' : 'Harpoons'), 13, UI.text, { fontWeight: 'bold' });
        heading.position.set(0, y);
        this.list.addChild(heading);
        y += 20;
        for (const ammo of AMMO_IDS[weapon]) {
          this.list.addChild(this.ammoRow(ammo, y));
          y += AMMO_ROW + ROW_GAP;
        }
        y += 6;
      }
    } else if (tab === 'shipwright') {
      const hull = text('', 15, UI.text, { fontWeight: 'bold' });
      const fix = labelButton(200, 30, '', () => {
        if (this.actions.repairInPort()) this.say(t('The shipwright mended the hull'), UI.heal);
      });
      fix.tile.container.position.set(0, 30);
      const note = text(
        t('Or let the crew mend it at sea (R): 1 gold for every {per} hull, a step a second, out of combat', {
          per: REPAIR_HP_PER_GOLD,
        }),
        12,
        UI.dim,
      );
      note.position.set(0, 72);
      this.list.addChild(hull, fix.tile.container, note);
      this.repair = { tile: fix.tile, label: fix.text, hull };
    } else {
      GUN_IDS[tab].forEach((gun, i) => this.list.addChild(this.gunRow(gun, i * (GUN_ROW + ROW_GAP))));
    }
  }

  private gunRow(gun: GunId, y: number) {
    const { name, tier, die, range, reload, role } = GUNS[gun];
    const row = new Container();
    row.position.set(0, y);
    const background = new Graphics()
      .roundRect(0, 0, SHOP_WIDTH, GUN_ROW, 6)
      .fill({ color: UI.idle, alpha: 0.5 })
      .stroke({ width: 1, color: tierColor(tier), alpha: 0.5 });
    const badge = new Graphics().roundRect(8, 9, 24, 22, 4).fill({ color: tierColor(tier) });
    const tierText = text(`T${tier}`, 11, UI.darkText, { fontWeight: 'bold' });
    tierText.anchor.set(0.5);
    tierText.position.set(20, 20);
    const title = text(t(name), 13, UI.text, { fontWeight: 'bold' });
    title.position.set(40, 4);
    const stats = text(
      t('d{die} · reach {range} · {reload} s · {role}', { die, range, reload, role: t(role) }),
      11,
      UI.dim,
    );
    stats.position.set(40, 22);
    const owned = text('', 11, UI.dim);
    owned.anchor.set(1, 0);
    owned.position.set(SHOP_WIDTH - BUY.width - 16, 23);
    const price = text(t('{n} gold', { n: gunPrice(gun) }), 12, GOLD, { fontWeight: 'bold' });
    price.anchor.set(1, 0);
    price.position.set(SHOP_WIDTH - BUY.width - 16, 5);
    const buy = labelButton(BUY.width, BUY.height, t('Buy'), () => {
      if (this.actions.buyGun(gun))
        this.say(t('{name} is in the hold: fit it in the loadout (L)', { name: t(name) }), UI.good);
      else this.say(t('Not enough gold'), UI.bad);
    });
    buy.tile.container.position.set(SHOP_WIDTH - BUY.width - 8, (GUN_ROW - BUY.height) / 2);
    row.addChild(background, badge, tierText, title, stats, owned, price, buy.tile.container);
    this.rows.push({ gun, ammo: null, owned, buy: buy.tile });
    return row;
  }

  /**
   * The outfit tab: the ship's figures with what is fitted, a button per slot, and the pieces of the slot picked: each
   * bought and fitted at once, fitted from the hold, or taken off
   */
  private buildOutfit() {
    const figures = text('', 13, UI.text, { fontWeight: 'bold' });
    this.list.addChild(figures);
    let x = 0;
    const slots = OUTFIT_SLOTS.map((slot) => {
      const label = text(t(SLOT_NAMES[slot]), 12, UI.text, { fontWeight: 'bold' });
      const tile = new Tile(Math.ceil(label.width) + 22, 24, () => (this.slot = slot), 5);
      label.anchor.set(0.5);
      label.position.set(tile.width / 2, 12);
      tile.content.addChild(label);
      tile.container.position.set(x, 24);
      x += tile.width + 6;
      this.list.addChild(tile.container);
      return { slot, tile, label };
    });
    const rows = OUTFIT_IDS[this.slot].map((id, i) => this.outfitRow(id, OUTFIT_TOP + i * (GUN_ROW + ROW_GAP)));
    const note = text(t('The shipwright fits it here, in port; the piece taken off goes to the hold'), 12, UI.dim);
    note.position.set(0, OUTFIT_TOP + rows.length * (GUN_ROW + ROW_GAP) + 4);
    this.list.addChild(note);
    this.outfit = { figures, slots, rows };
  }

  private outfitRow(id: OutfitId, y: number): OutfitRow {
    const { name, tier, role, bonus } = OUTFITS[id];
    const row = new Container();
    row.position.set(0, y);
    const background = new Graphics();
    const badge = new Graphics().roundRect(8, 9, 24, 22, 4).fill({ color: tierColor(tier) });
    const tierText = text(`T${tier}`, 11, UI.darkText, { fontWeight: 'bold' });
    tierText.anchor.set(0.5);
    tierText.position.set(20, 20);
    const title = text(t(name), 13, UI.text, { fontWeight: 'bold' });
    title.position.set(40, 4);
    // What it is for beside its name; what it gives under it, where the hold's count goes too
    const about = text(t(role), 11, UI.dim);
    about.position.set(title.x + title.width + 8, 6);
    const gives = text(bonusText(bonus), 11, UI.text);
    gives.position.set(40, 22);
    const owned = text('', 11, UI.dim);
    owned.anchor.set(1, 0);
    owned.position.set(SHOP_WIDTH - BUY.width - 16, 23);
    const price = text(t('{n} gold', { n: outfitPrice(id) }), 12, GOLD, { fontWeight: 'bold' });
    price.anchor.set(1, 0);
    price.position.set(SHOP_WIDTH - BUY.width - 16, 5);
    const action = labelButton(BUY.width, BUY.height, t('Buy'), () => this.outfitAction(id));
    action.tile.container.position.set(SHOP_WIDTH - BUY.width - 8, (GUN_ROW - BUY.height) / 2);
    row.addChild(background, badge, tierText, title, about, gives, owned, price, action.tile.container);
    this.list.addChild(row);
    return { id, background, painted: null, owned, button: action.tile, label: action.text };
  }

  /** Buys a piece and fits it, fits it from the hold, or takes it off if it is fitted */
  private outfitAction(id: OutfitId) {
    if (!this.state) return;
    const { ship, player } = this.state;
    const { slot } = OUTFITS[id];
    const name = t(OUTFITS[id].name);
    if (ship.outfit[slot] === id) {
      if (this.actions.fitOutfit(slot, null)) this.say(t('{name} taken off: it is in the hold', { name }), UI.dim);
    } else if ((player.outfits[id] ?? 0) > 0) {
      if (this.actions.fitOutfit(slot, id)) this.say(t('{name} fitted', { name }), UI.good);
    } else if (this.actions.buyOutfit(id) && this.actions.fitOutfit(slot, id)) {
      this.say(t('{name} bought and fitted', { name }), UI.good);
    } else {
      this.say(t('Not enough gold'), UI.bad);
    }
  }

  private updateOutfit(state: GameState) {
    const { ship, player } = state;
    const view = this.outfit;
    if (!view) return;
    show(view.figures, shipFigures(ship));
    for (const { slot, tile, label } of view.slots) {
      tile.setLook({ pressed: slot === this.slot });
      tint(label, slot === this.slot ? UI.darkText : UI.text);
    }
    for (const row of view.rows) {
      const { slot, tier } = OUTFITS[row.id];
      const fitted = ship.outfit[slot] === row.id;
      const spares = player.outfits[row.id] ?? 0;
      show(row.owned, fitted ? t('fitted') : spares > 0 ? t('{n} in the hold', { n: spares }) : '');
      tint(row.owned, fitted ? UI.active : UI.dim);
      show(row.label, fitted ? t('Take off') : spares > 0 ? t('Fit') : t('Buy'));
      row.button.setLook({ disabled: !fitted && spares === 0 && player.gold < outfitPrice(row.id) });
      if (row.painted === fitted) continue;
      row.painted = fitted;
      row.background
        .clear()
        .roundRect(0, 0, SHOP_WIDTH, GUN_ROW, 6)
        .fill({ color: UI.idle, alpha: 0.5 })
        .stroke({ width: fitted ? 2 : 1, color: fitted ? UI.active : tierColor(tier), alpha: fitted ? 0.95 : 0.5 });
    }
  }

  /** The market: what the hold carries, by good, each sold apart or all together */
  private buildMarket() {
    const ship = this.state?.ship;
    const hold = text('', 15, UI.text, { fontWeight: 'bold' });
    const sellAll = labelButton(230, 28, '', () => {
      const value = ship ? cargoValue(ship.cargo) : 0;
      if (this.actions.sellCargo()) this.say(t('Sold everything for {n} gold', { n: value }), GOLD);
    });
    sellAll.tile.container.position.set(SHOP_WIDTH - 230, -4);
    this.list.addChild(hold, sellAll.tile.container);
    this.market = { hold, sellAll: sellAll.tile, sellText: sellAll.text };
    const aboard = GOOD_IDS.filter((id) => (ship?.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const empty = text(
        t(
          'The hold is empty. Sunk ships and monsters leave goods floating: sail over them to haul them aboard, then sell them here. A ship that goes down loses its cargo where it sank.',
        ),
        12,
        UI.dim,
        { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
      );
      empty.position.set(0, 40);
      this.list.addChild(empty);
      return;
    }
    aboard.forEach((id, i) => {
      const { price } = GOODS[id];
      const name = t(GOODS[id].name);
      const count = ship?.cargo[id] ?? 0;
      const row = new Container();
      row.position.set(0, 40 + i * (MARKET_ROW + ROW_GAP));
      const background = new Graphics()
        .roundRect(0, 0, SHOP_WIDTH, MARKET_ROW, 6)
        .fill({ color: UI.idle, alpha: 0.5 })
        .stroke({ width: 1, color: UI.border, alpha: 0.25 });
      const title = text(`${name}  ×${count}`, 13, UI.text, { fontWeight: 'bold' });
      title.position.set(12, (MARKET_ROW - title.height) / 2);
      const worth = text(`${t('{n} gold each', { n: price })} · ${t('{n} gold', { n: price * count })}`, 12, GOLD, {
        fontWeight: 'bold',
      });
      worth.anchor.set(1, 0.5);
      worth.position.set(SHOP_WIDTH - BUY.width - 16, MARKET_ROW / 2);
      const sell = labelButton(BUY.width, BUY.height, t('Sell'), () => {
        if (this.actions.sellCargo(id)) this.say(t('{name} sold: +{n} gold', { name, n: price * count }), GOLD);
      });
      sell.tile.container.position.set(SHOP_WIDTH - BUY.width - 6, (MARKET_ROW - BUY.height) / 2);
      row.addChild(background, title, worth, sell.tile.container);
      this.list.addChild(row);
    });
  }

  /**
   * The shipyard: the next ship the player works towards (its figures beside the ship sailed now, its terms, the
   * Captain's path, and Buy once they are met), then the player's ships: the one sailed and those laid up in port,
   * each with Take the helm
   */
  private buildShipyard() {
    const state = this.state;
    if (!state) return;
    const offer = goalOffer(state, state.player);
    const now = state.ship;
    let y = 0;
    const view: ShipyardView = { terms: [], buy: null, status: null, sailed: null };
    if (offer) {
      const next = SHIP_CLASSES[offer.shipClass];
      const title = text(t(offerName(offer)), 20, UI.active, { fontWeight: 'bold' });
      const line = text(t('European line · tier {tier} · {n} gold', { tier: next.tier, n: offer.price }), 13, GOLD, {
        fontWeight: 'bold',
      });
      line.position.set(title.width + 14, 6);
      const figures = [
        compare('Hull', next.hp, now.shipClass.hp),
        compare('Speed', knots(next.maxSpeed), knots(now.shipClass.maxSpeed)),
        compare('Cannons', next.slots.cannon.length, now.shipClass.slots.cannon.length),
        compare('Harpoon guns', next.slots.harpoon.length, now.shipClass.slots.harpoon.length),
        compare('Hold', next.hold, now.shipClass.hold),
        compare('Sight', next.viewRange, now.shipClass.viewRange),
      ].join('  ·  ');
      const stats = text(figures, 12, UI.text, { wordWrap: true, wordWrapWidth: SHOP_WIDTH });
      stats.position.set(0, 34);
      const about = text(
        t(
          'The first ship of the European line: all round, like its line. A new ship starts at level 1 with talents of its own.',
        ),
        12,
        UI.dim,
        { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
      );
      about.position.set(0, 34 + stats.height + 6);
      const heading = text(t("The shipwright's terms: the Captain's path"), 14, UI.text, { fontWeight: 'bold' });
      const top = about.y + about.height + 14;
      heading.position.set(0, top);
      this.list.addChild(title, line, stats, about, heading);
      view.terms = captainsPath(state, state.player).map((_, i) => {
        const term = text('', 13, UI.text);
        term.position.set(8, top + 26 + i * PATH_LINE);
        this.list.addChild(term);
        return term;
      });
      y = top + 30 + view.terms.length * PATH_LINE;
      const buy = labelButton(SHIPYARD.buy, SHIPYARD.button, '', () => {
        if (!this.actions.buyShip()) this.say(t('Not enough gold'), UI.bad);
      });
      buy.tile.container.position.set(0, y);
      const status = text('', 12, UI.dim, { wordWrap: true, wordWrapWidth: SHOP_WIDTH - SHIPYARD.buy - 14 });
      status.anchor.set(0, 0.5);
      status.position.set(SHIPYARD.buy + 14, y + SHIPYARD.button / 2);
      this.list.addChild(buy.tile.container, status);
      view.buy = { tile: buy.tile, label: buy.text, name: t(offerName(offer)), price: offer.price };
      view.status = status;
      y += SHIPYARD.button + 22;
    } else {
      const done = text(
        t('You own every ship the shipyard sells for now: more of the line come with the next waters'),
        13,
        UI.good,
        { fontWeight: 'bold', wordWrap: true, wordWrapWidth: SHOP_WIDTH },
      );
      this.list.addChild(done);
      y = done.height + 18;
    }

    const heading = text(t('Your ships'), 14, UI.text, { fontWeight: 'bold' });
    heading.position.set(0, y);
    this.list.addChild(heading);
    y += 26;
    const rows: { name: string; figures: string; laidUp: number | null }[] = [
      { name: now.shipClass.name, figures: '', laidUp: null },
      ...state.player.fleet.map((ship, i) => ({
        name: SHIP_CLASSES[ship.shipClass].name,
        figures: t('Lv {level} · hull {hp}', { level: laidUpLevel(ship), hp: ship.hp }),
        laidUp: i,
      })),
    ];
    for (const { name, figures, laidUp } of rows) {
      const row = new Container();
      row.position.set(0, y);
      const background = new Graphics()
        .roundRect(0, 0, SHOP_WIDTH, SHIPYARD.row, 6)
        .fill({ color: UI.idle, alpha: 0.5 })
        .stroke({ width: laidUp === null ? 2 : 1, color: laidUp === null ? UI.active : UI.border, alpha: 0.7 });
      const title = text(t(name), 14, UI.text, { fontWeight: 'bold' });
      title.position.set(12, (SHIPYARD.row - title.height) / 2);
      const info = text(figures, 12, UI.dim);
      info.anchor.set(0, 0.5);
      info.position.set(title.x + title.width + 14, SHIPYARD.row / 2);
      row.addChild(background, title, info);
      if (laidUp === null) {
        const helm = text(t('At the helm'), 13, UI.active, { fontWeight: 'bold' });
        helm.anchor.set(1, 0.5);
        helm.position.set(SHOP_WIDTH - 14, SHIPYARD.row / 2);
        row.addChild(helm);
        view.sailed = info;
      } else {
        const take = labelButton(SHIPYARD.helm, BUY.height, t('Take the helm'), () => this.actions.takeHelm(laidUp));
        take.tile.container.position.set(SHOP_WIDTH - SHIPYARD.helm - 8, (SHIPYARD.row - BUY.height) / 2);
        row.addChild(take.tile.container);
      }
      this.list.addChild(row);
      y += SHIPYARD.row + ROW_GAP;
    }
    const note = text(
      t("A ship you don't sail lies in port with its guns, ammo, outfit, talents and cargo, and levels on its own"),
      12,
      UI.dim,
      { wordWrap: true, wordWrapWidth: SHOP_WIDTH },
    );
    note.position.set(0, y + 4);
    this.list.addChild(note);
    this.shipyard = view;
  }

  private updateShipyard(state: GameState) {
    const view = this.shipyard;
    if (!view) return;
    const path = captainsPath(state, state.player);
    path.forEach((step, i) => {
      const term = view.terms[i];
      if (!term) return;
      const count = step.need === null ? '' : `: ${step.have} / ${step.need}`;
      show(term, `${step.done ? '✓' : '○'}  ${t(step.text)}${count}`);
      tint(term, step.done ? UI.good : UI.text);
    });
    const ready = termsMet(state, state.player);
    if (view.buy && view.status) {
      const { tile, label, name, price } = view.buy;
      show(label, t('Buy the {name}: {n} gold', { name, n: price }));
      tile.setLook({ disabled: !ready, border: ready ? GOLD : UI.border });
      show(
        view.status,
        ready ? t('Every term met: the {name} is yours to buy', { name }) : t('Meet every term to buy it'),
      );
      tint(view.status, ready ? UI.good : UI.dim);
    }
    if (view.sailed) {
      const { ship } = state;
      show(view.sailed, t('Lv {level} · hull {hp}', { level: ship.level, hp: ship.hp }));
    }
  }

  private ammoRow(ammo: AmmoId, y: number) {
    const { bonus, tier, weapon } = AMMO[ammo];
    const name = t(AMMO[ammo].name);
    const row = new Container();
    row.position.set(0, y);
    const icon = new Graphics();
    if (weapon === 'cannon') drawBall(icon, 5, tier);
    else drawHarpoon(icon, 14, tier);
    icon.position.set(10, AMMO_ROW / 2);
    const title = text(`${name}  +${bonus}`, 12, tierColor(tier), { fontWeight: 'bold' });
    title.position.set(24, (AMMO_ROW - title.height) / 2);
    const owned = text('', 11, UI.dim);
    owned.anchor.set(1, 0.5);
    owned.position.set(SHOP_WIDTH - BUY.width - 130, AMMO_ROW / 2);
    const price = text(t('{pack} for {n} gold', { pack: AMMO_PACK, n: ammoPackPrice(ammo) }), 12, GOLD, {
      fontWeight: 'bold',
    });
    price.anchor.set(1, 0.5);
    price.position.set(SHOP_WIDTH - BUY.width - 14, AMMO_ROW / 2);
    const buy = labelButton(BUY.width, BUY.height, t('Buy'), () => {
      if (this.actions.buyAmmo(ammo)) this.say(`+${AMMO_PACK} ${name}`, UI.good);
      else this.say(t('Not enough gold'), UI.bad);
    });
    buy.tile.container.position.set(SHOP_WIDTH - BUY.width - 4, (AMMO_ROW - BUY.height) / 2);
    row.addChild(icon, title, owned, price, buy.tile.container);
    this.rows.push({ gun: null, ammo, owned, buy: buy.tile });
    return row;
  }
}
