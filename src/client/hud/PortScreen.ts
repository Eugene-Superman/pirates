import { Container, Graphics, type Rectangle, type Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  AMMO_PACK,
  GUNS,
  GUN_IDS,
  MAX_QUESTS,
  QUESTS,
  QUEST_IDS,
  WEAPON_IDS,
  ammoPackPrice,
  gunPrice,
  questDone,
  repairPrice,
  type AmmoId,
  type GameState,
  type GunId,
  type QuestId,
  type WeaponId,
} from '../../game';
import { Tile, UI, drawBall, drawCoin, drawHarpoon, show, text, tierColor, tint } from './ui';

/** What the port's menus do: game methods, each saying whether it worked */
export interface PortActions {
  leavePort: () => void;
  buyGun: (gun: GunId) => boolean;
  buyAmmo: (ammo: AmmoId) => boolean;
  repairInPort: () => boolean;
  takeQuest: (id: QuestId) => boolean;
  turnInQuest: (id: QuestId) => boolean;
  dropQuest: (id: QuestId) => void;
}

const WIDTH = 1040; // pixels, before scaling down to fit the screen
const HEIGHT = 600;
const MARGIN = 20; // between the window and the screen's edge, at least
const PAD = 18;
const HEADER = 58; // pixels: the title row
const TAVERN_WIDTH = 470;
const SHOP_X = PAD * 2 + TAVERN_WIDTH;
const SHOP_WIDTH = WIDTH - SHOP_X - PAD;
const QUEST_HEIGHT = 82;
const QUEST_GAP = 6;
const GUN_ROW = 40;
const AMMO_ROW = 29;
const ROW_GAP = 4;
const BUY = { width: 64, height: 24 };
const LEAVE = { width: 150, height: 30 };
const MESSAGE_TIME = 3.5; // seconds a message stays
const DIM_ALPHA = 0.55;
const GOLD = 0xffcf3f;

type ShopTab = WeaponId | 'ammo' | 'shipwright';
const TABS: readonly { readonly id: ShopTab; readonly label: string }[] = [
  { id: 'cannon', label: 'Cannons' },
  { id: 'harpoon', label: 'Harpoon guns' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'shipwright', label: 'Shipwright' },
];

interface QuestView {
  readonly id: QuestId;
  readonly background: Graphics;
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

function button(width: number, height: number, label: string, onTap: () => void, size = 12) {
  const tile = new Tile(width, height, onTap, 5);
  const t = text(label, size, UI.text, { fontWeight: 'bold' });
  t.anchor.set(0.5);
  t.position.set(width / 2, height / 2);
  tile.content.addChild(t);
  return { tile, text: t };
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
  private tab: ShopTab = 'cannon';
  private builtFor: ShopTab | null = null;
  private messageUntil = 0;
  private time = 0;
  private readonly actions: PortActions;
  private readonly screen: Rectangle;

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
    const title = text(portName, 22, UI.active, { fontWeight: 'bold' });
    title.position.set(PAD, PAD - 2);
    const coin = new Graphics();
    drawCoin(coin, 10);
    coin.position.set(PAD + title.width + 34, PAD + 12);
    this.gold.position.set(coin.x + 16, PAD);
    const leave = button(LEAVE.width, LEAVE.height, 'Leave port  (Esc)', () => this.actions.leavePort(), 13);
    leave.tile.setLook({ border: UI.active });
    leave.tile.container.position.set(WIDTH - PAD - LEAVE.width, PAD - 4);
    this.message.position.set(PAD, HEIGHT - PAD - 14);
    this.panel.addChild(background, title, coin, this.gold, leave.tile.container, this.message);

    // The tavern
    const tavern = text('Tavern', 17, UI.text, { fontWeight: 'bold' });
    tavern.position.set(PAD, HEADER);
    const tavernNote = text(`Bounties: up to ${MAX_QUESTS} at a time. Sink what they ask, then come back`, 12, UI.dim);
    tavernNote.position.set(PAD, HEADER + 22);
    this.panel.addChild(tavern, tavernNote);
    QUEST_IDS.forEach((id, i) => this.panel.addChild(this.questView(id, HEADER + 46 + i * (QUEST_HEIGHT + QUEST_GAP))));

    // The shop
    const shop = text('Shop', 17, UI.text, { fontWeight: 'bold' });
    shop.position.set(SHOP_X, HEADER);
    this.panel.addChild(shop);
    let x = SHOP_X + 60;
    this.tabs = TABS.map(({ id, label }) => {
      const t = text(label, 12, UI.text, { fontWeight: 'bold' });
      const tile = new Tile(Math.ceil(t.width) + 22, 24, () => (this.tab = id), 5);
      t.anchor.set(0.5);
      t.position.set(tile.width / 2, 12);
      tile.content.addChild(t);
      tile.container.position.set(x, HEADER - 2);
      x += tile.width + 6;
      this.panel.addChild(tile.container);
      return { id, tile, label: t };
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
    if (ship.docked !== this.container.visible) {
      this.container.visible = ship.docked;
      if (ship.docked) this.say('Welcome ashore. The tavern has work, the shop has guns and shot');
    }
    if (!this.isOpen) return;

    const { width, height } = this.screen;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
    const scale = Math.min(1, (width - MARGIN * 2) / WIDTH, (height - MARGIN * 2) / HEIGHT);
    this.panel.scale.set(scale);
    this.panel.position.set(Math.round((width - WIDTH * scale) / 2), Math.round((height - HEIGHT * scale) / 2));
    show(this.gold, `${player.gold} gold`);
    this.message.visible = this.time < this.messageUntil;

    for (const view of this.quests) {
      const taken = player.quests.find((q) => q.id === view.id);
      const quest = QUESTS[view.id];
      const done = taken !== undefined && questDone(taken);
      const full = player.quests.length >= MAX_QUESTS;
      show(view.progress, taken ? (done ? 'Done!' : `${taken.kills} / ${quest.count}`) : '');
      tint(view.progress, done ? UI.good : UI.text);
      show(view.buttonText, done ? 'Turn in' : taken ? 'Taken' : 'Take');
      view.button.setLook({ pressed: done, disabled: (taken !== undefined && !done) || (!taken && full) });
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
    if (this.builtFor !== this.tab) {
      this.builtFor = this.tab;
      this.buildShop(this.tab);
    }
    for (const row of this.rows) {
      if (row.gun) {
        const fitted = WEAPON_IDS.reduce((n, w) => n + ship.guns[w].filter((g) => g === row.gun).length, 0);
        const inHold = player.hold[row.gun] ?? 0;
        show(row.owned, fitted + inHold > 0 ? `fitted ${fitted} · hold ${inHold}` : '');
        row.buy.setLook({ disabled: player.gold < gunPrice(row.gun) });
      } else if (row.ammo) {
        show(row.owned, `${ship.ammo[row.ammo]} aboard`);
        row.buy.setLook({ disabled: player.gold < ammoPackPrice(row.ammo) });
      }
    }
    if (this.repair) {
      const price = repairPrice(ship);
      show(this.repair.hull, `Hull ${ship.hp} / ${ship.maxHp}`);
      show(this.repair.label, price > 0 ? `Repair all: ${price} gold` : 'The hull is whole');
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
    const title = text(quest.title, 14, UI.text, { fontWeight: 'bold' });
    title.position.set(12, 8);
    const about = text(quest.text, 12, UI.dim, { wordWrap: true, wordWrapWidth: TAVERN_WIDTH - 150 });
    about.position.set(12, 28);
    const reward = text(`${quest.reward} gold`, 13, GOLD, { fontWeight: 'bold' });
    reward.anchor.set(1, 0);
    reward.position.set(TAVERN_WIDTH - 12, 8);
    const progress = text('', 13, UI.text, { fontWeight: 'bold' });
    progress.anchor.set(1, 0);
    progress.position.set(TAVERN_WIDTH - 12, 28);
    const main = button(84, 24, 'Take', () => this.questAction(id), 12);
    main.tile.container.position.set(TAVERN_WIDTH - 12 - 84, QUEST_HEIGHT - 32);
    const drop = button(50, 24, 'Drop', () => {
      this.actions.dropQuest(id);
      this.say(`"${quest.title}" dropped`, UI.dim);
    });
    drop.tile.container.position.set(TAVERN_WIDTH - 12 - 84 - 56, QUEST_HEIGHT - 32);
    row.addChild(background, title, about, reward, progress, main.tile.container, drop.tile.container);
    this.quests.push({
      id,
      background,
      painted: -1,
      progress,
      button: main.tile,
      buttonText: main.text,
      drop: drop.tile,
    });
    return row;
  }

  private questAction(id: QuestId) {
    const quest = QUESTS[id];
    if (this.actions.turnInQuest(id)) this.say(`"${quest.title}" done: +${quest.reward} gold`, GOLD);
    else if (this.actions.takeQuest(id)) this.say(`Taken: ${quest.title}. Sink ${quest.count} and come back`);
  }

  /** The rows of a shop tab: the guns of a weapon by tier, every ammo, or the shipwright */
  private buildShop(tab: ShopTab) {
    for (const child of this.list.removeChildren()) child.destroy({ children: true });
    this.rows = [];
    this.repair = null;
    if (tab === 'ammo') {
      let y = 0;
      for (const weapon of WEAPON_IDS) {
        const heading = text(weapon === 'cannon' ? 'Cannonballs' : 'Harpoons', 13, UI.text, { fontWeight: 'bold' });
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
      const fix = button(200, 30, '', () => {
        if (this.actions.repairInPort()) this.say('The shipwright mended the hull', UI.heal);
      });
      fix.tile.container.position.set(0, 30);
      const note = text('Or let the crew mend it at sea (R): free, 2% of the hull a second, out of combat', 12, UI.dim);
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
    const title = text(name, 13, UI.text, { fontWeight: 'bold' });
    title.position.set(40, 4);
    const stats = text(`d${die} · reach ${range} · ${reload} s · ${role}`, 11, UI.dim);
    stats.position.set(40, 22);
    const owned = text('', 11, UI.dim);
    owned.anchor.set(1, 0);
    owned.position.set(SHOP_WIDTH - BUY.width - 16, 23);
    const price = text(`${gunPrice(gun)} gold`, 12, GOLD, { fontWeight: 'bold' });
    price.anchor.set(1, 0);
    price.position.set(SHOP_WIDTH - BUY.width - 16, 5);
    const buy = button(BUY.width, BUY.height, 'Buy', () => {
      if (this.actions.buyGun(gun)) this.say(`${name} is in the hold: fit it in the loadout (L)`, UI.good);
      else this.say('Not enough gold', UI.bad);
    });
    buy.tile.container.position.set(SHOP_WIDTH - BUY.width - 8, (GUN_ROW - BUY.height) / 2);
    row.addChild(background, badge, tierText, title, stats, owned, price, buy.tile.container);
    this.rows.push({ gun, ammo: null, owned, buy: buy.tile });
    return row;
  }

  private ammoRow(ammo: AmmoId, y: number) {
    const { name, bonus, tier, weapon } = AMMO[ammo];
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
    const price = text(`${AMMO_PACK} for ${ammoPackPrice(ammo)} gold`, 12, GOLD, { fontWeight: 'bold' });
    price.anchor.set(1, 0.5);
    price.position.set(SHOP_WIDTH - BUY.width - 14, AMMO_ROW / 2);
    const buy = button(BUY.width, BUY.height, 'Buy', () => {
      if (this.actions.buyAmmo(ammo)) this.say(`+${AMMO_PACK} ${name}`, UI.good);
      else this.say('Not enough gold', UI.bad);
    });
    buy.tile.container.position.set(SHOP_WIDTH - BUY.width - 4, (AMMO_ROW - BUY.height) / 2);
    row.addChild(icon, title, owned, price, buy.tile.container);
    this.rows.push({ gun: null, ammo, owned, buy: buy.tile });
    return row;
  }
}
