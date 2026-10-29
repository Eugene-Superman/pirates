import { Container, Graphics, Rectangle, type FederatedPointerEvent, type Text } from 'pixi.js';
import { LAYOUT_BLOCKS, type BlockId, type HudLayout } from './HudLayout';
import { NIGHT, moonButton, nightPlate } from './nightTheme';
import { THEME, subheading } from './theme';
import { text } from './ui';
import { t } from '../i18n/i18n';
import type { CursorId } from '../input/cursor';

// The painted pointer over a block: a compass rose, every way, as a block is dragged anywhere
const MOVE_CURSOR: CursorId = 'compass';

/** What the editor calls each block (English: t() when it is made) */
const NAMES: Readonly<Record<BlockId, string>> = {
  player: 'Your ship',
  target: 'Target',
  column: 'Info',
  tracker: 'Quests',
  chat: 'Chat',
  skills: 'Skill bar',
  minimap: 'Minimap',
};
const MARGIN = 16; // pixels from the screen's edges: the line a block's edge snaps to, as the HUD lays them out
const SNAP = 10; // pixels: an edge this near a line it can keep to goes onto it
const DOUBLE_CLICK = 350; // milliseconds between the two clicks that put a block back
const SHADE_ALPHA = 0.3; // the game under the editor, darkened
const BLOCK = { fill: 0.1, lit: 0.22, radius: 6, label: 12, pad: 5 } as const; // a block's outline and its name
const PANEL = { width: 460, height: 124, pad: 14, title: 18, hint: 12 } as const; // pixels
const BUTTON = { width: 132, height: 30, gap: 12, font: 13 } as const; // pixels

/** A block's outline over it, grabbed to drag the block */
interface Handle {
  readonly id: BlockId;
  readonly container: Container;
  readonly frame: Graphics;
  readonly label: Text;
  /** Its hit area: the block's box */
  readonly area: Rectangle;
  /** What the outline was drawn for */
  drawn: string;
}

/**
 * Where an edge at `at` of a block `size` pixels long goes along an axis: onto the screen's margin, its middle or the
 * block's default place (`home`) when it is that near one
 */
function snap(at: number, size: number, screen: number, home: number | undefined) {
  const lines = [MARGIN, (screen - size) / 2, screen - MARGIN - size];
  if (home !== undefined) lines.push(home);
  let best = at;
  let nearest = SNAP;
  for (const line of lines) {
    const off = Math.abs(line - at);
    if (off < nearest) {
      nearest = off;
      best = line;
    }
  }
  return Math.max(0, Math.min(best, screen - size));
}

/**
 * The layout editor, from the settings: over the main screen, each part it can move outlined and named, dragged where
 * the player likes it (an edge near the screen's margin or middle, or the part's own default place, snaps onto it; a
 * double click puts it back there), and a panel in the middle to save it (Enter), put every part back where it was by
 * default, or cancel (Escape). Nothing under it takes a click meanwhile, so the ship doesn't sail
 */
export class LayoutEditor {
  readonly container = new Container();
  private readonly shade = new Graphics();
  private readonly handles: readonly Handle[];
  private readonly panel = new Container();
  private readonly layout: HudLayout;
  private readonly screen: Rectangle;
  /** The block being dragged, and where in it the pointer took it */
  private drag: { readonly id: BlockId; readonly dx: number; readonly dy: number } | null = null;
  private hovered: BlockId | null = null;
  /** The last block pressed and when, for a double click */
  private pressed: { readonly id: BlockId; readonly at: number } | null = null;
  /** Screen size the shade and the panel were laid out for */
  private laidOut = '';

  constructor(layout: HudLayout, screen: Rectangle) {
    this.layout = layout;
    this.screen = screen;
    this.container.visible = false;
    this.container.eventMode = 'static';
    // Over the whole screen: a click anywhere must not reach the stage, which would steer the ship
    this.shade.eventMode = 'static';
    this.shade.on('pointerdown', (e) => e.stopPropagation());
    this.handles = LAYOUT_BLOCKS.map((id) => this.handle(id));
    this.container.on('globalpointermove', (e) => this.move(e));
    this.container.on('pointerup', () => (this.drag = null));
    this.container.on('pointerupoutside', () => (this.drag = null));
    this.buildPanel();
    this.container.addChild(this.shade, ...this.handles.map((h) => h.container), this.panel);

    window.addEventListener('keydown', (e) => {
      // A window over it closes first: the HUD makes them before it
      if (!this.isOpen || e.defaultPrevented) return;
      if (e.code === 'Escape') this.close(false);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.close(true);
      else return;
      // Escape ended the editing; it shouldn't also stop the ship firing (keyboardInput)
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.container.visible;
  }

  open() {
    if (this.isOpen) return;
    this.layout.edit();
    this.container.visible = true;
  }

  /** Draws the blocks' outlines where the HUD put them this frame */
  update() {
    if (!this.isOpen) return;
    const { width, height } = this.screen;
    const size = `${width}x${height}`;
    if (size !== this.laidOut) {
      this.laidOut = size;
      this.shade.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: SHADE_ALPHA });
      this.panel.position.set(Math.round((width - PANEL.width) / 2), Math.round((height - PANEL.height) / 2));
    }
    for (const handle of this.handles) this.paint(handle);
  }

  private close(save: boolean) {
    this.layout.finish(save);
    this.drag = null;
    this.pressed = null;
    this.container.visible = false;
  }

  private handle(id: BlockId): Handle {
    const container = new Container();
    const frame = new Graphics();
    const label = text(t(NAMES[id]), BLOCK.label, THEME.text, {
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 3 },
    });
    label.position.set(BLOCK.pad + 2, BLOCK.pad);
    container.addChild(frame, label);
    container.eventMode = 'static';
    container.cursor = MOVE_CURSOR;
    const area = new Rectangle();
    container.hitArea = area;
    container.on('pointerover', () => (this.hovered = id));
    container.on('pointerout', () => {
      if (this.hovered === id) this.hovered = null;
    });
    container.on('pointerdown', (e) => this.press(id, e));
    return { id, container, frame, label, area, drawn: '' };
  }

  private press(id: BlockId, e: FederatedPointerEvent) {
    e.stopPropagation();
    const now = performance.now();
    if (this.pressed?.id === id && now - this.pressed.at < DOUBLE_CLICK) {
      this.pressed = null;
      this.layout.reset(id);
      return;
    }
    this.pressed = { id, at: now };
    const box = this.layout.box(id);
    if (box) this.drag = { id, dx: e.global.x - box.x, dy: e.global.y - box.y };
  }

  private move(e: FederatedPointerEvent) {
    const { drag } = this;
    if (!drag) return;
    // Let go of outside the page: the drag is over
    if ((e.buttons & 1) === 0) {
      this.drag = null;
      return;
    }
    const box = this.layout.box(drag.id);
    if (!box) return;
    const home = this.layout.home(drag.id);
    const x = snap(e.global.x - drag.dx, box.width, this.screen.width, home?.x);
    const y = snap(e.global.y - drag.dy, box.height, this.screen.height, home?.y);
    this.layout.move(drag.id, x, y);
  }

  /** A block's outline over its box, brighter under the pointer and while dragged; none for a block with no size */
  private paint(handle: Handle) {
    const box = this.layout.box(handle.id);
    const { container } = handle;
    container.visible = box !== undefined && box.width > 0 && box.height > 0;
    if (!box || !container.visible) return;
    container.position.set(box.x, box.y);
    const lit = this.hovered === handle.id || this.drag?.id === handle.id;
    const key = `${box.width}x${box.height}/${lit}`;
    if (key === handle.drawn) return;
    handle.drawn = key;
    handle.area.width = box.width;
    handle.area.height = box.height;
    const { label } = handle;
    handle.frame
      .clear()
      .roundRect(0, 0, box.width, box.height, BLOCK.radius)
      .fill({ color: THEME.brassLight, alpha: lit ? BLOCK.lit : BLOCK.fill })
      .stroke({ width: lit ? 2 : 1.5, color: lit ? THEME.brassLight : THEME.brass, alpha: 0.95 })
      .roundRect(BLOCK.pad, BLOCK.pad - 2, label.width + 4, label.height + 4, 4)
      .fill({ color: NIGHT.well, alpha: 0.75 });
  }

  /** The panel in the middle: what to do, and Save, Default and Cancel */
  private buildPanel() {
    const { width, height, pad } = PANEL;
    const title = subheading(t('Moving the panels'), PANEL.title);
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, pad);
    const hint = text(t('Drag a panel where you like it; a double click puts it back'), PANEL.hint, NIGHT.dim, {
      align: 'center',
      wordWrap: true,
      wordWrapWidth: width - pad * 2,
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(width / 2, title.y + title.height + 6);
    const buttons = [
      moonButton(BUTTON.width, BUTTON.height, t('Save'), () => this.close(true), BUTTON.font, true),
      moonButton(BUTTON.width, BUTTON.height, t('Default'), () => this.layout.reset(), BUTTON.font),
      moonButton(BUTTON.width, BUTTON.height, t('Cancel'), () => this.close(false), BUTTON.font),
    ];
    const rowLeft = (width - buttons.length * BUTTON.width - (buttons.length - 1) * BUTTON.gap) / 2;
    buttons.forEach(({ tile }, i) => {
      tile.container.position.set(rowLeft + i * (BUTTON.width + BUTTON.gap), height - pad - BUTTON.height);
    });
    this.panel.eventMode = 'static';
    // The panel over the blocks takes its own clicks
    this.panel.on('pointerdown', (e) => e.stopPropagation());
    this.panel.addChild(nightPlate(width, height), title, hint, ...buttons.map(({ tile }) => tile.container));
  }
}
