import { Container, Graphics, type Rectangle, Text } from 'pixi.js';
import { ButtonRow } from './ButtonRow';
import { Checkbox } from './Checkbox';
import { HUD_GROUPS, LABEL_STYLE, type HudFrame, type HudItem, type HudWidget } from './hudItems';

const PANEL_COLOR = 0x0b2433;
const PANEL_ALPHA = 0.95;
const DIM_ALPHA = 0.45; // darkens the game behind the panel
const MARGIN = 24; // pixels between the panel and the screen's edge
const PADDING = 16; // pixels inside the panel
const ROW_GAP = 8;
const GROUP_GAP = 16;
const CHECK_WIDTH = 30; // pixels: the "on screen" checkbox, then the item's label
const LABEL_WIDTH = 120; // pixels: then the item's control
const SCROLL_SPEED = 0.6; // pixels per unit of the mouse wheel
const HEADER_STYLE = { ...LABEL_STYLE, fontSize: 16, fontWeight: 'bold' as const, fill: 0xf2b33d };
const NOTE_STYLE = { ...LABEL_STYLE, fontSize: 12, fill: 0xb8cdd8 };

interface Row {
  readonly item: HudItem;
  readonly check: Checkbox;
  /** The item's own control, working here too; null for metrics, which only show on the screen */
  readonly widget: HudWidget | null;
}

/**
 * A development tool: every HUD item, grouped, with a checkbox for whether it is also shown on the screen, and every
 * control working right here. Opened by the HUD's Settings button, closed by Close, Escape or a click beside it.
 * The mouse wheel scrolls it when it is taller than the screen
 */
export class SettingsPanel {
  readonly container = new Container();
  private readonly dim = new Graphics();
  private readonly panel = new Container();
  private readonly background = new Graphics();
  private readonly title = new Text({ text: 'Settings (dev)', style: { ...HEADER_STYLE, fontSize: 18 } });
  private readonly note = new Text({ text: 'Checked: also shown on the screen', style: NOTE_STYLE });
  private readonly close = new ButtonRow([{ label: 'Close', key: null, onTap: () => this.hide() }]);
  private readonly content = new Container();
  private readonly clip = new Graphics();
  private readonly rows: Row[] = [];
  private readonly screen: Rectangle;
  private readonly isShown: (id: string) => boolean;
  /** Measured before the content is masked: a masked container is only as big as its mask */
  private contentWidth = 0;
  private contentHeight = 0;
  /** Where the scrolled content starts in the panel, and how much of it shows */
  private contentTop = 0;
  private viewHeight = 0;
  private scroll = 0;
  /** Screen size the panel was laid out for */
  private laidOut = '';

  constructor(
    items: readonly HudItem[],
    isShown: (id: string) => boolean,
    toggle: (id: string) => void,
    screen: Rectangle,
  ) {
    this.screen = screen;
    this.isShown = isShown;
    this.container.visible = false;

    // Clicks on the panel and around it must not reach the stage, which would steer the ship
    for (const blocker of [this.dim, this.background]) {
      blocker.eventMode = 'static';
      blocker.on('pointerdown', (e) => e.stopPropagation());
    }
    this.dim.on('pointertap', () => this.hide());
    this.panel.eventMode = 'static';
    this.panel.on('wheel', (e) => this.scrollBy(e.deltaY * SCROLL_SPEED));

    let y = 0;
    for (const group of HUD_GROUPS) {
      const members = items.filter((item) => item.group === group);
      if (members.length === 0) continue;
      const header = new Text({ text: group, style: HEADER_STYLE });
      header.y = y;
      this.content.addChild(header);
      y += header.height + ROW_GAP;
      for (const item of members) {
        y += this.addRow(item, y, () => toggle(item.id)) + ROW_GAP;
      }
      y += GROUP_GAP - ROW_GAP;
    }
    this.contentWidth = this.content.width;
    this.contentHeight = y;

    this.content.mask = this.clip;
    this.panel.addChild(this.background, this.title, this.note, this.close.container, this.content, this.clip);
    this.container.addChild(this.dim, this.panel);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
  }

  update(frame: HudFrame) {
    if (!this.isOpen) return;
    const size = `${this.screen.width}x${this.screen.height}`;
    if (size !== this.laidOut) this.layout(size);
    for (const row of this.rows) {
      row.check.setChecked(this.isShown(row.item.id));
      row.widget?.update(frame);
    }
  }

  /** Returns the row's height */
  private addRow(item: HudItem, y: number, onToggle: () => void) {
    const check = new Checkbox('', onToggle);
    const label = new Text({ text: item.label, style: LABEL_STYLE });
    const widget = item.kind === 'control' ? item.create() : null;
    const height = Math.max(widget ? widget.container.height : 0, label.height, 18);
    check.container.position.set(0, y + (height - 18) / 2);
    label.position.set(CHECK_WIDTH, y + (height - label.height) / 2);
    this.content.addChild(check.container, label);
    if (widget) {
      widget.container.position.set(CHECK_WIDTH + LABEL_WIDTH, y + (height - widget.container.height) / 2);
      this.content.addChild(widget.container);
    }
    this.rows.push({ item, check, widget });
    return height;
  }

  private layout(size: string) {
    this.laidOut = size;
    const { width, height } = this.screen;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: DIM_ALPHA });

    const top = PADDING + this.title.height + 4 + this.note.height + GROUP_GAP;
    const panelWidth = Math.min(Math.max(this.contentWidth, this.title.width + 120) + PADDING * 2, width - MARGIN * 2);
    const panelHeight = Math.min(top + this.contentHeight + PADDING, height - MARGIN * 2);
    this.viewHeight = panelHeight - top - PADDING;
    this.panel.position.set(Math.max(MARGIN, (width - panelWidth) / 2), Math.max(MARGIN, (height - panelHeight) / 2));
    this.background
      .clear()
      .roundRect(0, 0, panelWidth, panelHeight, 10)
      .fill({ color: PANEL_COLOR, alpha: PANEL_ALPHA })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
    this.title.position.set(PADDING, PADDING);
    this.note.position.set(PADDING, this.title.y + this.title.height + 4);
    this.close.container.position.set(panelWidth - PADDING - this.close.container.width, PADDING);
    this.content.x = PADDING;
    this.clip
      .clear()
      .rect(PADDING, top, panelWidth - PADDING * 2, this.viewHeight)
      .fill(0xffffff);
    this.contentTop = top;
    this.scrollBy(0);
  }

  private scrollBy(delta: number) {
    const most = Math.max(0, this.contentHeight - this.viewHeight);
    this.scroll = Math.min(Math.max(this.scroll + delta, 0), most);
    this.content.y = this.contentTop - this.scroll;
  }
}
