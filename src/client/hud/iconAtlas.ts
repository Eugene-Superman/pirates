import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AmmoId, GunId, LineShipId, OutfitId } from '../../game';

// Cut out of painted sheets by blender-assets/icons/build_gun_icons.py, build_ammo_icons.py, build_outfit_icons.py and
// build_ship_icons.py (in icons/), and build_minimap_buttons.py and build_skill_icons.py (in hud/)
const ART = `${import.meta.env.BASE_URL}sprites`;

/** An atlas's JSON: the tiles' size, and each icon's tile (its column and row) in the picture */
interface IconArt {
  readonly file: string;
  readonly tile: number;
  readonly icons: Readonly<Record<string, readonly [number, number]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The JSON is plain JSON, so it is checked rather than trusted
function isIconArt(value: unknown): value is IconArt {
  return (
    isRecord(value) &&
    typeof value.file === 'string' &&
    typeof value.tile === 'number' &&
    isRecord(value.icons) &&
    Object.values(value.icons).every(
      (at) => Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number'),
    )
  );
}

/**
 * Icons in one picture (public/sprites/<folder>/<name>.webp, its tiles in <name>.json), loaded the first time asked
 */
export class IconAtlas<Id extends string> {
  private readonly name: string;
  private readonly folder: string;
  private icons: ReadonlyMap<string, Texture> = new Map();
  private loading: Promise<boolean> | null = null;
  private attempts = 0;

  constructor(name: string, folder = 'icons') {
    this.name = name;
    this.folder = folder;
  }

  /**
   * Loads the icons and calls `onLoad` once they are there. Called again (opening a window that shows them) it does
   * nothing if they are, waits if they are on their way, and tries again if they failed: until then the window shows
   * what stands in for them
   */
  load(onLoad: () => void) {
    if (this.icons.size > 0) return;
    this.loading ??= this.fetch().catch((error: unknown) => {
      console.warn(`The icons in ${this.name} failed to load`, error);
      this.loading = null;
      return false;
    });
    void this.loading.then((loaded) => {
      if (loaded) onLoad();
    });
  }

  /** An icon, null until the icons have loaded or for one the atlas doesn't have */
  get(id: Id): Texture | null {
    return this.icons.get(id) ?? null;
  }

  private async fetch() {
    // A retry asks past the browser's and Pixi's caches: the files may have been missing the first time (written while
    // the page was loading), and a failed request would be answered from them again
    this.attempts += 1;
    const again = this.attempts > 1 ? `?attempt=${this.attempts}` : '';
    const folder = `${ART}/${this.folder}`;
    const art = await Assets.load<unknown>(`${folder}/${this.name}.json${again}`);
    if (!isIconArt(art)) throw new Error(`${this.name}.json is not what the game expects`);
    // Mipmaps: an icon is shown from half its size (a card) to its full size (an info window)
    const sheet = await Assets.load<Texture>({
      src: `${folder}/${art.file}${again}`,
      data: { autoGenerateMipmaps: true },
    });
    const { tile } = art;
    this.icons = new Map(
      Object.entries(art.icons).map(([id, [column, row]]) => [
        id,
        new Texture({ source: sheet.source, frame: new Rectangle(column * tile, row * tile, tile, tile) }),
      ]),
    );
    return true;
  }
}

/** The guns' icons: painted cannons and harpoon guns */
export const GUN_ICONS = new IconAtlas<GunId>('guns');
/** The ammo's icons: painted cannonballs and harpoons */
export const AMMO_ICONS = new IconAtlas<AmmoId>('ammo');
/** The outfit's icons: painted sails, planking and plating, rudders and wheels, spyglasses and crow's nests */
export const OUTFIT_ICONS = new IconAtlas<OutfitId>('outfit');
/** The ships' pictures, for the shipyard: a ship without one shows an empty slot until it is painted */
export const SHIP_ICONS = new IconAtlas<LineShipId>('ships');
/** What the buttons on top of the minimap's frame open */
export type MinimapButtonId = 'hold' | 'loadout' | 'talents' | 'mastery';
/** The minimap's buttons: painted medallions, in the slots on top of its frame */
export const MINIMAP_BUTTONS = new IconAtlas<MinimapButtonId>('minimap_buttons', 'hud');
/** The skills painted for the skill bar: the repair, the abilities so far, and a lock on a skill not open yet */
export type SkillIconId = 'repair' | 'fullSail' | 'locked';
/** The skills' pictures: the inside of painted buttons, laid in the skill bar's wells */
export const SKILL_ICONS = new IconAtlas<SkillIconId>('skill_icons', 'hud');
