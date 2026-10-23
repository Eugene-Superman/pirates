import { Container, Graphics, type Rectangle, type Text } from 'pixi.js';
import {
  AMMO,
  AMMO_IDS,
  GUNS,
  GUN_IDS,
  WEAPON_IDS,
  averageDamage,
  type AmmoId,
  type GunId,
  type Ship,
  type ShipClass,
  type WeaponId,
} from '../../game';
import { Tile, UI, drawBall, drawHarpoon, show, text, tierColor, tint } from './ui';

const WIDTH = 1044; // pixels, before scaling down to fit the screen
const HEIGHT = 572;
const MARGIN = 20; // between the panel and the screen's edge, at least
const PAD = 16;
const TOP = 58; // where the columns start
const COLUMN = { slots: 280, guns: 360, ammo: 340 };
const SLOT_HEIGHT = 44;
const GUN_HEIGHT = 40;
const AMMO_HEIGHT = 28;
const ROW_GAP = 5;
const SMALL_BUTTON = 36;
const AMMO_STEPS = [10, 50] as const; // shots the + buttons put in the hold
const DIM_ALPHA = 0.5;
const SLOT_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannons', harpoon: 'Harpoon guns' };
const AMMO_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannonballs', harpoon: 'Harpoons' };

export interface LoadoutActions {
  /** Fits a gun into one of its weapon's slots, or empties the slot (null). For testing; bought later */
  fitGun: (weapon: WeaponId, slot: number, gun: GunId | null) => void;
  /** Picks the ammo its weapon fires */
  loadAmmo: (ammo: AmmoId) => void;
  /** Puts ammo in the hold. For testing; bought later */
  addAmmo: (ammo: AmmoId, count: number) => void;
}

interface SlotView {
  readonly weapon: WeaponId;
  readonly slot: number;
  readonly tile: Tile;
  readonly name: Text;
  readonly stats: Text;
}

interface GunRow {
  readonly gun: GunId | null;
  readonly tile: Tile;
  readonly name: Text;
  readonly average: Text;
  readonly details: Text;
}

interface AmmoRow {
  readonly ammo: AmmoId;
  readonly count: Text;
  readonly load: Tile;
  readonly loadText: Text;
}

/** A gun in a few words: its die, reach and reload */
function gunStats(gun: GunId) {
  const { die, range, reload } = GUNS[gun];
  return `d${die} · reach ${range} · ${reload} s`;
}

/**
 * The loadout window (L, or the anchor on the skill bar): the ship's gun slots of each weapon, and the guns that
 * fit the slot picked, with what each does a shot with the loaded ammo; the ammo in the hold, which one is loaded, and
 * buttons to add more. A testing tool for now: any gun, any ammo, free. A shipyard and a shop later.
 * Closed by Close, Escape, L or a click beside it
 */
export class LoadoutPanel {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly background = new Graphics();
  private readonly title = text('Loadout', 20, UI.active, { fontWeight: 'bold' });
  private readonly summaries: Record<WeaponId, Text>;
  private readonly slots: SlotView[] = [];
  private readonly listTitle = text('', 14, UI.text, { fontWeight: 'bold' });
  private readonly list = new Container();
  private rows: GunRow[] = [];
  private readonly ammoRows: AmmoRow[] = [];
  private readonly actions: LoadoutActions;
  private readonly screen: Rectangle;
  /** The slot the gun list is for */
  private picked: { weapon: WeaponId; slot: number } = { weapon: 'cannon', slot: 0 };
  private listFor = '';

  /** shipClass: the player's ship's, for its gun slots */
  constructor(actions: LoadoutActions, screen: Rectangle, shipClass: ShipClass) {
    this.actions = actions;
    this.screen = screen;
    this.container.visible = false;
    for (const blocker of [this.dim, this.background]) {
      blocker.eventMode = 'static';
      // Clicks on the panel and round it must not reach the stage, which would steer the ship
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    this.dim.on('pointertap', () => this.hide());
    this.background.roundRect(0, 0, WIDTH, HEIGHT, 12).fill({ color: UI.panel, alpha: 0.97 }).stroke({
      width: 1.5,
      color: UI.border,
      alpha: 0.4,
    });
    this.title.position.set(PAD, PAD);
    const note = text('Testing: any gun and any ammo, free. Bought in port later', 12, UI.dim);
    note.position.set(PAD + this.title.width + 16, PAD + 6);
    const close = new Tile(70, 26, () => this.hide(), 6);
    const closeText = text('Close', 13);
    closeText.anchor.set(0.5);
    closeText.position.set(35, 13);
    close.content.addChild(closeText);
    close.container.position.set(WIDTH - PAD - 70, PAD);
    this.panel.addChild(this.background, this.title, note, close.container);

    this.summaries = { cannon: text('', 12, UI.dim), harpoon: text('', 12, UI.dim) };
    let y = TOP;
    for (const weapon of WEAPON_IDS) {
      const header = text(SLOT_NAMES[weapon], 15, UI.text, { fontWeight: 'bold' });
      header.position.set(PAD, y);
      this.summaries[weapon].position.set(PAD, y + 20);
      this.panel.addChild(header, this.summaries[weapon]);
      y += 40;
      for (let slot = 0; slot < shipClass.slots[weapon].length; slot++) {
        const tile = new Tile(COLUMN.slots, SLOT_HEIGHT, () => (this.picked = { weapon, slot }), 6);
        const label = text(`${slot + 1}`, 18, UI.dim, { fontWeight: 'bold' });
        label.position.set(10, (SLOT_HEIGHT - label.height) / 2);
        const name = text('', 14, UI.text, { fontWeight: 'bold' });
        name.position.set(34, 5);
        const stats = text('', 11, UI.dim);
        stats.position.set(34, 25);
        tile.content.addChild(label, name, stats);
        tile.container.position.set(PAD, y);
        this.panel.addChild(tile.container);
        this.slots.push({ weapon, slot, tile, name, stats });
        y += SLOT_HEIGHT + ROW_GAP;
      }
      y += 12;
    }

    const listX = PAD * 2 + COLUMN.slots;
    this.listTitle.position.set(listX, TOP);
    this.list.position.set(listX, TOP + 26);
    this.panel.addChild(this.listTitle, this.list);

    const ammoX = listX + COLUMN.guns + PAD;
    y = TOP;
    for (const weapon of WEAPON_IDS) {
      const header = text(AMMO_NAMES[weapon], 15, UI.text, { fontWeight: 'bold' });
      header.position.set(ammoX, y);
      this.panel.addChild(header);
      y += 24;
      for (const ammo of AMMO_IDS[weapon]) {
        this.ammoRows.push(this.ammoRow(ammo, ammoX, y));
        y += AMMO_HEIGHT + 3;
      }
      y += 12;
    }

    this.container.addChild(this.dim, this.panel);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen) return;
      this.hide();
      // Escape closed the panel; it shouldn't also stop the ship firing (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  toggle() {
    this.container.visible = !this.container.visible;
  }

  hide() {
    this.container.visible = false;
  }

  update(ship: Ship) {
    if (!this.isOpen) return;
    const { width, height } = this.screen;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });
    const scale = Math.min(1, (width - MARGIN * 2) / WIDTH, (height - MARGIN * 2) / HEIGHT);
    this.panel.scale.set(scale);
    this.panel.position.set(Math.round((width - WIDTH * scale) / 2), Math.round((height - HEIGHT * scale) / 2));

    for (const weapon of WEAPON_IDS) {
      const bonus = AMMO[ship.loaded[weapon]].bonus;
      const fitted = ship.fittedGuns(weapon);
      const volley = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus), 0);
      const perSecond = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus) / gun.reload, 0);
      show(
        this.summaries[weapon],
        fitted.length === 0
          ? 'No guns fitted'
          : `${fitted.length} guns · ≈${volley.toFixed(1)} a volley · ${perSecond.toFixed(1)}/s · reach ${ship.range(weapon)}`,
      );
    }
    for (const view of this.slots) {
      const gun = ship.guns[view.weapon][view.slot];
      const picked = this.picked.weapon === view.weapon && this.picked.slot === view.slot;
      view.tile.setLook({ border: picked ? UI.active : gun ? tierColor(GUNS[gun].tier) : UI.border, pressed: false });
      show(view.name, gun ? GUNS[gun].name : 'Empty');
      tint(view.name, gun ? UI.text : UI.dim);
      show(view.stats, gun ? gunStats(gun) : 'Click, then pick a gun on the right');
      view.tile.container.alpha = picked ? 1 : 0.85;
    }

    const { weapon, slot } = this.picked;
    const key = `${weapon}${slot}`;
    if (key !== this.listFor) {
      this.listFor = key;
      this.buildList(weapon);
    }
    show(this.listTitle, `${SLOT_NAMES[weapon]}, slot ${slot + 1}: pick what goes in it`);
    const fitted = ship.guns[weapon][slot];
    const bonus = AMMO[ship.loaded[weapon]].bonus;
    for (const row of this.rows) {
      row.tile.setLook({ pressed: row.gun === fitted, border: row.gun ? tierColor(GUNS[row.gun].tier) : UI.border });
      tint(row.name, row.gun === fitted ? UI.darkText : UI.text);
      tint(row.average, row.gun === fitted ? UI.darkText : UI.active);
      tint(row.details, row.gun === fitted ? UI.darkText : UI.dim);
      if (row.gun) show(row.average, `≈${averageDamage(GUNS[row.gun], bonus).toFixed(1)} a shot`);
    }

    for (const row of this.ammoRows) {
      const { weapon: kind } = AMMO[row.ammo];
      const loaded = ship.loaded[kind] === row.ammo;
      show(row.count, `${ship.ammo[row.ammo]}`);
      row.load.setLook({ pressed: loaded });
      show(row.loadText, loaded ? 'Loaded' : 'Load');
      tint(row.loadText, loaded ? UI.darkText : UI.text);
    }
  }

  /** The rows of the gun list: an empty slot, then every gun of the weapon by tier */
  private buildList(weapon: WeaponId) {
    for (const row of this.rows) row.tile.container.destroy({ children: true });
    const guns: (GunId | null)[] = [null, ...GUN_IDS[weapon]];
    this.rows = guns.map((gun, i) => {
      const tile = new Tile(COLUMN.guns, GUN_HEIGHT, () => this.actions.fitGun(weapon, this.picked.slot, gun), 6);
      const name = text(gun ? GUNS[gun].name : 'Empty slot', 13, UI.text, { fontWeight: 'bold' });
      name.position.set(40, 4);
      const average = text('', 12, UI.active, { fontWeight: 'bold' });
      average.anchor.set(1, 0);
      average.position.set(COLUMN.guns - 10, 5);
      const details = text(gun ? `${gunStats(gun)} · ${GUNS[gun].role}` : 'Takes the gun out', 11, UI.dim);
      details.position.set(40, 22);
      tile.content.addChild(name, average, details);
      if (gun) {
        const badge = new Graphics().roundRect(8, 9, 24, 22, 4).fill({ color: tierColor(GUNS[gun].tier) });
        const tier = text(`T${GUNS[gun].tier}`, 11, UI.darkText, { fontWeight: 'bold' });
        tier.anchor.set(0.5);
        tier.position.set(20, 20);
        tile.content.addChild(badge, tier);
      }
      tile.container.position.set(0, i * (GUN_HEIGHT + 3));
      this.list.addChild(tile.container);
      return { gun, tile, name, average, details };
    });
  }

  /** An ammo's row: its icon and name with the bonus, the count in the hold, + buttons, and Load */
  private ammoRow(ammo: AmmoId, x: number, y: number): AmmoRow {
    const { name, bonus, tier, weapon } = AMMO[ammo];
    const row = new Container();
    row.position.set(x, y);
    const icon = new Graphics();
    if (weapon === 'cannon') drawBall(icon, 5, tier);
    else drawHarpoon(icon, 14, tier);
    icon.position.set(8, AMMO_HEIGHT / 2);
    const label = text(`${name}  +${bonus}`, 12, tierColor(tier), { fontWeight: 'bold' });
    label.position.set(20, (AMMO_HEIGHT - label.height) / 2);
    // The buttons on the right, the count just before them
    const loadWidth = SMALL_BUTTON + 18;
    let bx = COLUMN.ammo - AMMO_STEPS.length * (SMALL_BUTTON + 4) - loadWidth;
    const count = text('', 12, UI.text, { fontWeight: 'bold' });
    count.anchor.set(1, 0.5);
    count.position.set(bx - 8, AMMO_HEIGHT / 2);
    row.addChild(icon, label, count);
    for (const step of AMMO_STEPS) {
      const add = new Tile(SMALL_BUTTON, AMMO_HEIGHT - 4, () => this.actions.addAmmo(ammo, step), 4);
      const plus = text(`+${step}`, 11);
      plus.anchor.set(0.5);
      plus.position.set(SMALL_BUTTON / 2, (AMMO_HEIGHT - 4) / 2);
      add.content.addChild(plus);
      add.container.position.set(bx, 2);
      row.addChild(add.container);
      bx += SMALL_BUTTON + 4;
    }
    const load = new Tile(loadWidth, AMMO_HEIGHT - 4, () => this.actions.loadAmmo(ammo), 4);
    const loadText = text('Load', 11);
    loadText.anchor.set(0.5);
    loadText.position.set(loadWidth / 2, (AMMO_HEIGHT - 4) / 2);
    load.content.addChild(loadText);
    load.container.position.set(bx, 2);
    row.addChild(load.container);
    this.panel.addChild(row);
    return { ammo, count, load, loadText };
  }
}
