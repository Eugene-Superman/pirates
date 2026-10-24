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
  type Player,
  type Ship,
  type ShipClass,
  gunPrice,
  type WeaponId,
} from '../../game';
import { HudWindow, Tile, UI, drawBall, drawHarpoon, show, text, tierColor, tint } from './ui';
import { t } from '../i18n/i18n';

const WIDTH = 1044; // pixels, before scaling down to fit the screen
const HEIGHT = 572; // at least: a ship with more gun slots makes it taller
const PAD = 16;
const TOP = 58; // where the columns start
const COLUMN = { slots: 280, guns: 360, ammo: 340 };
const SLOT_HEIGHT = 44;
const WEAPON_HEADER = 40; // pixels: a weapon's name and summary over its slots
const WEAPON_GAP = 12; // pixels after a weapon's slots
const GUN_HEIGHT = 40;
const AMMO_HEIGHT = 28;
const ROW_GAP = 5;
const LOAD_BUTTON = 72; // pixels: room for Load in every language
const SLOT_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannons', harpoon: 'Harpoon guns' };
const AMMO_NAMES: Readonly<Record<WeaponId, string>> = { cannon: 'Cannonballs', harpoon: 'Harpoons' };

export interface LoadoutActions {
  /** Fits a gun from the hold into one of its weapon's slots, or empties the slot (null): the old gun goes to the hold */
  fitGun: (weapon: WeaponId, slot: number, gun: GunId | null) => void;
  /** Picks the ammo its weapon fires */
  loadAmmo: (ammo: AmmoId) => void;
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
  return t('d{die} · reach {range} · {reload} s', { die, range, reload });
}

/**
 * The loadout window (L, or the anchor on the skill bar): the ship's gun slots of each weapon, and the guns that
 * fit the slot picked, with what each does a shot with the loaded ammo and how many are in the hold (bought in port);
 * the ammo in the hold and which one is loaded. Closed by Close, Escape, L or a click beside it
 */
export class LoadoutPanel {
  readonly container: Container;
  private readonly window: HudWindow;
  private readonly panel: Container;
  private readonly title = text(t('Loadout'), 20, UI.active, { fontWeight: 'bold' });
  private readonly summaries: Record<WeaponId, Text>;
  private readonly slots: SlotView[] = [];
  private readonly listTitle = text('', 14, UI.text, { fontWeight: 'bold' });
  private readonly list = new Container();
  private rows: GunRow[] = [];
  private readonly ammoRows: AmmoRow[] = [];
  private readonly actions: LoadoutActions;
  /** The slot the gun list is for */
  private picked: { weapon: WeaponId; slot: number } = { weapon: 'cannon', slot: 0 };
  private listFor = '';

  /** shipClass: the player's ship's, for its gun slots */
  constructor(actions: LoadoutActions, screen: Rectangle, shipClass: ShipClass) {
    this.actions = actions;
    // As tall as the ship's slots need: a header per weapon, its slots, a gap after them
    const slots = WEAPON_IDS.reduce(
      (sum, weapon) => sum + WEAPON_HEADER + shipClass.slots[weapon].length * (SLOT_HEIGHT + ROW_GAP) + WEAPON_GAP,
      0,
    );
    const height = Math.max(HEIGHT, TOP + slots - WEAPON_GAP + PAD);
    this.window = new HudWindow(screen, { width: WIDTH, height, pad: PAD }, () => this.hide());
    this.container = this.window.container;
    this.panel = this.window.panel;
    this.title.position.set(PAD, PAD);
    const note = text(t('Guns come from the hold; the one taken out goes back. Buy more in port'), 12, UI.dim);
    note.position.set(PAD + this.title.width + 16, PAD + 6);
    this.panel.addChild(this.title, note);

    this.summaries = { cannon: text('', 12, UI.dim), harpoon: text('', 12, UI.dim) };
    let y = TOP;
    for (const weapon of WEAPON_IDS) {
      const header = text(t(SLOT_NAMES[weapon]), 15, UI.text, { fontWeight: 'bold' });
      header.position.set(PAD, y);
      this.summaries[weapon].position.set(PAD, y + 20);
      this.panel.addChild(header, this.summaries[weapon]);
      y += WEAPON_HEADER;
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
      y += WEAPON_GAP;
    }

    const listX = PAD * 2 + COLUMN.slots;
    this.listTitle.position.set(listX, TOP);
    this.list.position.set(listX, TOP + 26);
    this.panel.addChild(this.listTitle, this.list);

    const ammoX = listX + COLUMN.guns + PAD;
    y = TOP;
    for (const weapon of WEAPON_IDS) {
      const header = text(t(AMMO_NAMES[weapon]), 15, UI.text, { fontWeight: 'bold' });
      header.position.set(ammoX, y);
      this.panel.addChild(header);
      y += 24;
      for (const ammo of AMMO_IDS[weapon]) {
        this.ammoRows.push(this.ammoRow(ammo, ammoX, y));
        y += AMMO_HEIGHT + 3;
      }
      y += 12;
    }
  }

  get isOpen() {
    return this.window.isOpen;
  }

  toggle() {
    this.container.visible = !this.container.visible;
  }

  hide() {
    this.container.visible = false;
  }

  update(ship: Ship, player: Player) {
    if (!this.isOpen) return;
    this.window.fit();

    for (const weapon of WEAPON_IDS) {
      const bonus = AMMO[ship.loaded[weapon]].bonus;
      const fitted = ship.fittedGuns(weapon);
      const volley = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus), 0);
      const perSecond = fitted.reduce((sum, { gun }) => sum + averageDamage(gun, bonus) / gun.reload, 0);
      show(
        this.summaries[weapon],
        fitted.length === 0
          ? t('No guns fitted')
          : t(
              '{n} gun · ≈{volley} a volley · {perSecond}/s · reach {range}|{n} guns · ≈{volley} a volley · {perSecond}/s · reach {range}',
              {
                n: fitted.length,
                volley: volley.toFixed(1),
                perSecond: perSecond.toFixed(1),
                range: ship.range(weapon),
              },
            ),
      );
    }
    for (const view of this.slots) {
      const gun = ship.guns[view.weapon][view.slot];
      const picked = this.picked.weapon === view.weapon && this.picked.slot === view.slot;
      view.tile.setLook({ border: picked ? UI.active : gun ? tierColor(GUNS[gun].tier) : UI.border, pressed: false });
      show(view.name, gun ? t(GUNS[gun].name) : t('Empty'));
      tint(view.name, gun ? UI.text : UI.dim);
      show(view.stats, gun ? gunStats(gun) : t('Click, then pick a gun on the right'));
      view.tile.container.alpha = picked ? 1 : 0.85;
    }

    const { weapon, slot } = this.picked;
    const key = `${weapon}${slot}`;
    if (key !== this.listFor) {
      this.listFor = key;
      this.buildList(weapon);
    }
    show(
      this.listTitle,
      t('{weapon}, slot {slot}: pick what goes in it', { weapon: t(SLOT_NAMES[weapon]), slot: slot + 1 }),
    );
    const fitted = ship.guns[weapon][slot];
    const bonus = AMMO[ship.loaded[weapon]].bonus;
    for (const row of this.rows) {
      const here = row.gun === fitted;
      const stock = row.gun ? (player.hold[row.gun] ?? 0) : 0;
      // A gun that isn't in the hold can't be fitted: bought in port first
      const missing = row.gun !== null && !here && stock === 0;
      row.tile.setLook({
        pressed: here,
        disabled: missing,
        border: row.gun ? tierColor(GUNS[row.gun].tier) : UI.border,
      });
      tint(row.name, here ? UI.darkText : UI.text);
      tint(row.average, here ? UI.darkText : UI.active);
      tint(row.details, here ? UI.darkText : UI.dim);
      if (!row.gun) continue;
      show(row.average, t('≈{damage} a shot', { damage: averageDamage(GUNS[row.gun], bonus).toFixed(1) }));
      const where = here
        ? t('Fitted here')
        : stock > 0
          ? t('In the hold: {n}', { n: stock })
          : t('In port: {n} gold', { n: gunPrice(row.gun) });
      show(row.details, `${where} · ${gunStats(row.gun)}`);
    }

    for (const row of this.ammoRows) {
      const { weapon: kind } = AMMO[row.ammo];
      const loaded = ship.loaded[kind] === row.ammo;
      show(row.count, `${ship.ammo[row.ammo]}`);
      row.load.setLook({ pressed: loaded });
      show(row.loadText, loaded ? t('Loaded') : t('Load'));
      tint(row.loadText, loaded ? UI.darkText : UI.text);
    }
  }

  /** The rows of the gun list: an empty slot, then every gun of the weapon by tier */
  private buildList(weapon: WeaponId) {
    for (const row of this.rows) row.tile.container.destroy({ children: true });
    const guns: (GunId | null)[] = [null, ...GUN_IDS[weapon]];
    this.rows = guns.map((gun, i) => {
      const tile = new Tile(COLUMN.guns, GUN_HEIGHT, () => this.actions.fitGun(weapon, this.picked.slot, gun), 6);
      const name = text(gun ? t(GUNS[gun].name) : t('Empty slot'), 13, UI.text, { fontWeight: 'bold' });
      name.position.set(40, 4);
      const average = text('', 12, UI.active, { fontWeight: 'bold' });
      average.anchor.set(1, 0);
      average.position.set(COLUMN.guns - 10, 5);
      const details = text(gun ? gunStats(gun) : t('Takes the gun out, into the hold'), 11, UI.dim);
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

  /** An ammo's row: its icon and name with the bonus, the count in the hold, and Load */
  private ammoRow(ammo: AmmoId, x: number, y: number): AmmoRow {
    const { name, bonus, tier, weapon } = AMMO[ammo];
    const row = new Container();
    row.position.set(x, y);
    const icon = new Graphics();
    if (weapon === 'cannon') drawBall(icon, 5, tier);
    else drawHarpoon(icon, 14, tier);
    icon.position.set(8, AMMO_HEIGHT / 2);
    const label = text(`${t(name)}  +${bonus}`, 12, tierColor(tier), { fontWeight: 'bold' });
    label.position.set(20, (AMMO_HEIGHT - label.height) / 2);
    // Load on the right, the count just before it
    const bx = COLUMN.ammo - LOAD_BUTTON;
    const count = text('', 12, UI.text, { fontWeight: 'bold' });
    count.anchor.set(1, 0.5);
    count.position.set(bx - 10, AMMO_HEIGHT / 2);
    row.addChild(icon, label, count);
    const load = new Tile(LOAD_BUTTON, AMMO_HEIGHT - 4, () => this.actions.loadAmmo(ammo), 4);
    const loadText = text(t('Load'), 11);
    loadText.anchor.set(0.5);
    loadText.position.set(LOAD_BUTTON / 2, (AMMO_HEIGHT - 4) / 2);
    load.content.addChild(loadText);
    load.container.position.set(bx, 2);
    row.addChild(load.container);
    this.panel.addChild(row);
    return { ammo, count, load, loadText };
  }
}
