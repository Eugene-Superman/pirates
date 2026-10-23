import { Container, Graphics, type Rectangle, Text } from 'pixi.js';
import type { GameState } from '../../game';
import { ButtonRow } from './ButtonRow';
import { LABEL_STYLE, hudItems, type HudActions, type HudItem, type HudWidget, type ViewStatus } from './hudItems';
import { SettingsPanel } from './SettingsPanel';

export type { HudActions, ViewStatus } from './hudItems';

const MARGIN = 16; // pixels from the screen's edge
const METRIC_GAP = 6; // pixels under a line of text
const ROW_GAP = 8; // pixels between the button rows
const LABEL_WIDTH = 84; // pixels: the button rows start after their labels, lined up
const ZONE_COLOR = 0xffffff;
const ZONE_ALPHA = 0.55;
const ZONE_WIDTH = 2; // pixels
// Which items are on the screen, kept between reloads. Only a convenience: without storage the defaults show
const STORAGE_KEY = 'pirate-game.hud';

interface Shown {
  readonly widget: HudWidget;
  readonly label: Text | null;
}

function loadShown(items: readonly HudItem[]) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Storage blocked or broken: the defaults
  }
  return new Set(items.filter((item) => item.onScreen).map((item) => item.id));
}

function saveShown(ids: ReadonlySet<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Not kept for the next reload, that's all
  }
}

// Screen-space overlay in the top left corner: the items picked in the settings panel, stacked under its button
export class Hud {
  readonly container = new Container();
  private readonly items: readonly HudItem[];
  private readonly shownIds: Set<string>;
  /** Made the first time an item is shown, then only hidden */
  private readonly onScreen = new Map<string, Shown>();
  private readonly column = new Container();
  private readonly settingsButton: ButtonRow<null>;
  private readonly settings: SettingsPanel;
  /** The camera's zone, outlined across the screen behind the HUD's buttons */
  private readonly zoneOutline = new Graphics();

  constructor(actions: HudActions, screen: Rectangle) {
    this.items = hudItems(actions);
    this.shownIds = loadShown(this.items);
    this.settings = new SettingsPanel(
      this.items,
      (id) => this.shownIds.has(id),
      (id) => this.toggle(id),
      screen,
    );
    this.settingsButton = new ButtonRow([{ label: 'Settings', key: null, onTap: () => this.settings.toggle() }]);
    this.settingsButton.container.position.set(MARGIN, MARGIN);
    this.container.addChild(this.zoneOutline, this.column, this.settingsButton.container, this.settings.container);
    this.layout();
  }

  update(state: GameState, frameMs: number, view: ViewStatus) {
    const frame = { state, view, frameMs };
    for (const [id, { widget }] of this.onScreen) {
      if (this.shownIds.has(id)) widget.update(frame);
    }
    this.settings.update(frame);

    this.zoneOutline.clear();
    if (view.zoneShown && view.zoneBox) {
      const { x, y, width, height } = view.zoneBox;
      this.zoneOutline.rect(x, y, width, height).stroke({ width: ZONE_WIDTH, color: ZONE_COLOR, alpha: ZONE_ALPHA });
    }
  }

  private toggle(id: string) {
    if (!this.shownIds.delete(id)) this.shownIds.add(id);
    saveShown(this.shownIds);
    this.layout();
  }

  /** Stacks the shown items under the Settings button: texts as they are, controls after their labels */
  private layout() {
    let y = MARGIN + ButtonRow.HEIGHT + ROW_GAP;
    for (const item of this.items) {
      const shown = this.shownIds.has(item.id);
      const existing = this.onScreen.get(item.id);
      if (!shown) {
        if (existing) {
          existing.widget.container.visible = false;
          if (existing.label) existing.label.visible = false;
        }
        continue;
      }
      const { widget, label } = existing ?? this.show(item);
      widget.container.visible = true;
      if (label) {
        label.visible = true;
        label.position.set(MARGIN, y + (ButtonRow.HEIGHT - label.height) / 2);
        widget.container.position.set(MARGIN + LABEL_WIDTH, y);
        y += ButtonRow.HEIGHT + ROW_GAP;
      } else {
        widget.container.position.set(MARGIN, y);
        y += widget.container.height + METRIC_GAP;
      }
    }
  }

  private show(item: HudItem): Shown {
    const widget = item.create();
    const label = item.kind === 'control' ? new Text({ text: item.label, style: LABEL_STYLE }) : null;
    this.column.addChild(widget.container);
    if (label) this.column.addChild(label);
    const shown = { widget, label };
    this.onScreen.set(item.id, shown);
    return shown;
  }
}
