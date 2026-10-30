import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type {
  AmmoId,
  GoodId,
  GunId,
  ItemId,
  LineShipId,
  OutfitId,
  QuestId,
  ShipClassId,
  SpeakerId,
  TalentId,
} from '../../game';
import type { CursorId } from '../input/cursor';

// Cut out of painted sheets by blender-assets/icons/build_gun_icons.py, build_ammo_icons.py, build_outfit_icons.py,
// build_ship_icons.py, build_item_icons.py, build_good_icons.py, build_mastery_icons.py, build_talent_icons.py and
// build_contract_icons.py (in icons/), and
// build_minimap_buttons.py, build_map_markers.py (the markers and the arrows),
// build_skill_icons.py, build_symbol_icons.py, build_portraits.py and build_cursors.py (in hud/), and
// build_story_art.py (in story/)
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

/**
 * An atlas's icons as sprites laid out again every frame: `begin`, a `put` each, then `end` hiding those not put.
 * Until the atlas has loaded `put` says no, and the caller draws its own in its place
 */
export class IconSprites<Id extends string> {
  readonly container = new Container();
  private readonly atlas: IconAtlas<Id>;
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(atlas: IconAtlas<Id>) {
    this.atlas = atlas;
    this.container.eventMode = 'none';
    atlas.load(() => {});
  }

  begin() {
    this.used = 0;
  }

  /**
   * An icon `size` pixels across round (x, y), turned by `rotation` (radians), over those put before it; false while
   * the atlas hasn't loaded
   */
  put(id: Id, x: number, y: number, size: number, alpha = 1, rotation = 0) {
    const texture = this.atlas.get(id);
    if (!texture) return false;
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite({ anchor: 0.5 });
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    this.used++;
    sprite.texture = texture;
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.setSize(size, size);
    sprite.alpha = alpha;
    sprite.rotation = rotation;
    return true;
  }

  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
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
/** The items' icons, for the market, the hold and the skill bar's quick slots: painted scrolls, charms, flags... */
export const ITEM_ICONS = new IconAtlas<ItemId>('items');
/** The goods' icons, for the hold's and the market's rows: painted fish, cloth, rum, moon glass... */
export const GOOD_ICONS = new IconAtlas<GoodId>('goods');
/** The captain's mastery's passives, by their ids: painted icons, each round in its own ground */
export const MASTERY_ICONS = new IconAtlas<string>('mastery');
/**
 * A board's emblem over the talent tree: the signature talents', the same on every ship's, or a branch's, by its ship's
 * class and the branch's key
 */
export type TalentEmblemId = 'signatures' | `${ShipClassId}/${string}`;
/**
 * The ships' talents, by their ids, and the boards' emblems: painted icons, each round in its own ground, as the
 * mastery's. Only some are painted yet (the starter sloop's and the signature talents; the signatures' emblem and the
 * starter sloop's crew's): the rest show their branch's sign
 */
export const TALENT_ICONS = new IconAtlas<TalentId | TalentEmblemId>('talents');
/**
 * The tavern's contracts' pictures, by their quests' ids, each round: painted scenes of the starting waters' eight, and
 * `contract`, a bounty contract nailed to a post, for every other sea's until it has pictures of its own
 */
export const CONTRACT_ICONS = new IconAtlas<QuestId | 'contract'>('contracts');
/** What the buttons in the slots round the minimap's frame's top open or do */
export type MinimapButtonId =
  'settings' | 'fullscreen' | 'feats' | 'hold' | 'loadout' | 'talents' | 'mastery' | 'bestiary' | 'world' | 'logout';
/** The minimap's buttons: painted medallions and icons, in the slots round its frame's top */
export const MINIMAP_BUTTONS = new IconAtlas<MinimapButtonId>('minimap_buttons', 'hud');
/**
 * The maps' markers, by what they mark: the story's in gold and the tavern's in silver (a "!", a star, the prey's
 * crescent, the harbour's lighthouse, a moon), the hostile in red, the neutral and friendly in green, the guild's and
 * the group's in blue (for the online game), and the bosses', ships and beasts, under a crown
 */
export type MarkerId =
  | `${'story' | 'quest'}${'New' | 'Goal' | 'Prey' | 'Home' | 'Moon'}`
  | 'hostile'
  | 'hostileShip'
  | 'hostilePlayer'
  | 'target'
  | 'hostileBeast'
  | 'neutralShip'
  | 'friend'
  | 'friendPlayer'
  | 'port'
  | 'neutral'
  | 'guildShip'
  | 'guildShield'
  | 'group'
  | 'guild'
  | 'guildStar'
  | 'compass'
  | 'helm'
  | 'guildPort'
  | 'guildPlayer'
  | 'guildMoon'
  | 'gate'
  | `boss${
      | 'Galleon'
      | 'Sloop'
      | 'Brig'
      | 'Helm'
      | 'Warship'
      | 'ManOfWar'
      | 'BlackFlag'
      | 'Anchor'
      | 'Frigate'
      | 'Flagship'
      | 'Serpent'
      | 'Tentacle'
      | 'Kraken'
      | 'Maw'
      | 'Horned'
      | 'Coil'
      | 'Shark'
      | 'Crab'
      | 'Eye'
      | 'Hydra'}`;
/** The minimap's and the sea chart's markers: painted, each with its glow, on a transparent ground */
export const MAP_MARKERS = new IconAtlas<MarkerId>('map_markers', 'hud');
/** The painted arrows, by their colour and make: the first ten pointing down, the rest up, each in the middle of its tile */
export type ArrowId =
  | `down${'Ivory' | 'Emerald' | 'Steel' | 'Gold' | 'Moon' | 'Ruby' | 'Winged' | 'Green' | 'Cyan' | 'Star'}`
  | `up${'Spear' | 'Cyan' | 'Ruby' | 'Crescent' | 'Emerald' | 'Violet' | 'Gold' | 'Anchor' | 'Jade' | 'Flame'}`;
/**
 * The arrows the game points with: round the ship towards where the story sends the player, over what it asks them to
 * sink, over the sea chart's goal and the world chart's seas
 */
export const ARROWS = new IconAtlas<ArrowId>('arrows', 'hud');
/** The skills painted for the skill bar: the repair, a lock on a skill not open yet, and the abilities so far */
export type SkillIconId =
  'repair' | 'locked' | 'broadside' | 'fullSail' | 'rocket' | 'powderKeg' | 'bombardment' | 'royalStandard';
/**
 * The skills' pictures, laid in the skill bar's wells: the inside of painted buttons, and the abilities' talents' icons
 * square
 */
export const SKILL_ICONS = new IconAtlas<SkillIconId>('skill_icons', 'hud');
/** The HUD's small painted signs: the gold coin, the doubloon and the experience star */
export type SymbolId = 'gold' | 'doubloon' | 'xp';
/** Wherever the HUD shows an amount of gold, of doubloons or of experience, in place of the word (ui.ts's goldCoin,
 * doubloon and xpStar) */
export const SYMBOL_ICONS = new IconAtlas<SymbolId>('symbols', 'hud');
/**
 * The game's painted mouse pointers as pictures (the cursors themselves are CSS: input/cursor.ts), for the HUD to show
 * one moving where a hand would: the loadout showing a new player how a gun is dragged into a slot
 */
export const CURSOR_ICONS = new IconAtlas<CursorId>('cursors', 'hud');
/** The captains' portraits a player picks from: painted busts, by their numbers (`player.portrait`) */
export const PORTRAIT_ICONS = new IconAtlas<`${number}`>('portraits', 'hud');
/**
 * The story's speakers' portraits, by their ids: painted faces, each cut square round the head (the voice in the
 * keel's, round its shard)
 */
export const SPEAKER_ICONS = new IconAtlas<SpeakerId>('speakers', 'story');
