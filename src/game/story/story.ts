import { GUN_IDS } from '../combat/arsenal';
import { isAfloat, type Unit, type UnitKind } from '../combat/units';
import type { WeaponId } from '../combat/weapons';
import type { GoodId } from '../economy/cargo';
import { mayHaul } from '../economy/loot';
import { earn, shipOf, type Player } from '../economy/player';
import { questDone, shipQuests, takeQuest, type QuestId } from '../economy/quests';
import { marketValue } from '../economy/shop';
import type { GameState } from '../GameState';
import type { Point } from '../lib/geometry';
import type { NavGrid } from '../navigation/NavGrid';
import { gainXp } from '../ships/talents';
import { leavePort } from '../world/port';
import { START_ZONE, type ZoneId } from '../world/zones';

/**
 * The story: what a new captain is told and asked to do, step by step, from the prologue to their first ship of a line.
 * The starting waters' part is all there is yet (docs/story.md): fifteen steps in five chapters, each with what to do
 * (its objectives), what is said before (its opening) and after (its closing), and a reward. A step's objectives count
 * only once its opening has been told; it is done the moment they are, or turned in in port, where whoever waits for
 * the player tells its closing. The player's, not a ship's: any ship they sail counts for it
 */

/** Who speaks: the client paints each one's portrait (a placeholder until painted) */
export type SpeakerId = 'keeper' | 'bosun' | 'harbourMaster' | 'shard';

export interface Speaker {
  /** English, as everything a player reads */
  readonly name: string;
  readonly role: string;
}

export const SPEAKERS: Readonly<Record<SpeakerId, Speaker>> = {
  keeper: { name: 'Edda', role: 'The lighthouse keeper' },
  bosun: { name: 'Tobin', role: 'Your bosun' },
  harbourMaster: { name: 'Hale', role: 'The harbour master' },
  shard: { name: 'The voice in the keel', role: 'A shard of the Moon' },
};

/** A line of a conversation: who says it, in English */
export interface Line {
  readonly speaker: SpeakerId;
  readonly text: string;
}

/** A card of the prologue a new player is shown before anything else: one sentence or two, in English */
export const PROLOGUE: readonly string[] = [
  'Forty years ago, the Moon fell into the sea.',
  'The tides stopped. The sea broke into bowls, and between them rose the Seams: walls of storm that no ship can cross.',
  "The Moon's shards still glow on the seabed. Whatever touches the glass changes: beasts grow into monsters, and captains who carry the Lighthouse's seal no longer stay drowned.",
  'You were one of the drowned. This morning, the sea gave you back.',
];

/** The story's chapters, by their place: a step names its own */
export const STORY_CHAPTERS: readonly string[] = [
  'The Returned',
  'The price of glass',
  'Glass in the deep',
  'The Baron',
  "The Seam's seal",
];

/** A place on a sea's map a step asks the player to sail to; `port`, the harbour, when it asks them home */
export type StoryMarkId = 'buoy' | 'lair' | 'port';

/** A story's place on the map, moved to open water when the sea is made (placeStoryMarks) */
export interface StoryMark {
  readonly id: StoryMarkId;
  readonly x: number;
  readonly y: number;
  /** World units: the ship's middle within it has got there */
  readonly radius: number;
}

/** World units of open water round a mark's middle: room for a ship to sail into it, whatever its size */
const MARK_CLEARANCE = 60;
/**
 * World units round a mark where no bot comes into the game or wanders, as round a gate: nothing falls on a ship
 * that has sailed there to be told something
 */
const MARK_KEEP = 450;
/** World units: the harbour's mark, at its berth, when the story asks the player home */
const PORT_MARK_RADIUS = 60;
/** World units round the unit the crew watches (StoryStep.watch) seen through the fog: its escort with it */
const WATCH_RADIUS = 260;
/**
 * Seconds the crew watches it at most: time to read the closing out, and no longer, or a player who never closes it
 * would sail unharmed (Ship.parley) for good
 */
const WATCH_TIME = 60;
/**
 * The good every prey leaves (economy/loot.ts), its chest kept for the player: a step that asks for it hauled up brings
 * in more prey till it is, so a chest of it lost (the sea made afresh, as a game is loaded) never stalls the story
 */
const PREY_GOOD: GoodId = 'moonGlass';
// Where each mark is meant to be; the open water nearest it is where it goes
const MARKS: readonly {
  readonly id: Exclude<StoryMarkId, 'port'>;
  readonly zone: ZoneId;
  readonly at: Point;
  readonly radius: number;
}[] = [
  // North-west of the roadstead (world/port.ts, 3640 × 4360), clear of the port's island: a short first course, on
  // the screen's left as the ship comes out of the harbour (the camera's yaw turns north-east up)
  { id: 'buoy', zone: START_ZONE, at: { x: 3320, y: 4045 }, radius: 70 },
  // A thousand units short of the Baron's lair (bots/botKinds.ts, 6500 × 1500), on the open water the way from the
  // port: out of reach of his mortar and his escort's guns while he wanders round it
  { id: 'lair', zone: START_ZONE, at: { x: 5650, y: 2000 }, radius: 140 },
];

/** What a step asks the player to do. `text` is English, the tracker's line */
export type Objective =
  /** A mark of the sea's (the harbour has its own objective, dock) */
  | { readonly kind: 'reach'; readonly mark: Exclude<StoryMarkId, 'port'>; readonly text: string }
  /**
   * Sink so many of a kind, by any of the player's ships. Bots of it are brought in near the player for it, weaker
   * than their kind (bots/spawner.ts, stepPrey), but a boss
   */
  | { readonly kind: 'sink'; readonly target: UnitKind; readonly count: number; readonly text: string }
  /** So many guns of a weapon fitted on the ship sailed, from the hold */
  | { readonly kind: 'fit'; readonly weapon: WeaponId; readonly count: number; readonly text: string }
  /** Loot from a wreck hauled aboard: goods of this kind, or anything (gold too) */
  | { readonly kind: 'haul'; readonly good: GoodId | null; readonly text: string }
  /**
   * dock: the ship in port; talent: a talent taken; repair: a repair step at sea; sell: goods sold at the market;
   * takeQuest: a tavern quest the ship sailed has taken; turnInQuest: one turned in; outfit: a piece of outfit fitted
   */
  | {
      readonly kind: 'dock' | 'talent' | 'repair' | 'sell' | 'takeQuest' | 'turnInQuest' | 'outfit';
      readonly text: string;
    }
  | { readonly kind: 'level'; readonly level: number; readonly text: string }
  /** The weapon picked (Q, E) */
  | { readonly kind: 'weapon'; readonly weapon: WeaponId; readonly text: string }
  /** A ship of this tier or higher sailed */
  | { readonly kind: 'ship'; readonly tier: number; readonly text: string };

export type StoryStepId =
  | 'fitOut'
  | 'firstCourse'
  | 'notFish'
  | 'justGlass'
  | 'shardWakes'
  | 'dues'
  | 'shells'
  | 'serpents'
  | 'baronsMen'
  | 'scout'
  | 'report'
  | 'bounty'
  | 'workshop'
  | 'baron'
  | 'seal';

export interface StoryStep {
  readonly id: StoryStepId;
  /** Its chapter's place in STORY_CHAPTERS */
  readonly chapter: number;
  readonly title: string;
  readonly objectives: readonly Objective[];
  /** Told once the step before it is done (or the prologue seen): wherever the ship is */
  readonly opening: readonly Line[];
  /** Told once it is done; for one turned in in port, there, by whoever speaks first */
  readonly closing: readonly Line[];
  /** 'port': done once the player comes into port with its objectives met; 'done': the moment they are met */
  readonly turnIn: 'port' | 'done';
  readonly reward: { readonly gold: number; readonly xp: number };
  /** A piece of a good the one it is turned in to takes out of the hold, if there is one aboard */
  readonly takes?: GoodId;
  /**
   * A kind the crew watches while its closing is told: one of it is in sight wherever it is (and what sails round
   * it), the camera turns to it, and no bot starts a fight with the ship meanwhile (Ship.spotted, Ship.parley)
   */
  readonly watch?: UnitKind;
}

// The starting waters' story. Each step teaches a part of the game as it goes (the loadout, the helm, firing, loot,
// the port, the talents, the market, the harpoons, the repair, the chart, the tavern, the workshop, the boss's mortar,
// the shipyard), and its reward is a few kills' worth: about 1,400 gold and 2,900 experience in all, a quarter of the
// way to the sloop's last level. The rest is the bounties and the hunting between: the tavern takes a new player's
// name only once the Baron is scouted (tavernOpen), so they learn the sea from the story first, and then bounties are
// what levels the sloop and saves the gold for the next ship. The last step asks for the ship the starting waters lead
// to: one of tier 1, of any line (economy/shipyard.ts), its reward gold for the guns a new hull comes without
export const STORY: readonly StoryStep[] = [
  {
    // A new player's sloop lies in port with its guns in the hold (economy/player.ts, STARTING_HOLD)
    id: 'fitOut',
    chapter: 0,
    title: 'Fitting out',
    objectives: [
      { kind: 'fit', weapon: 'cannon', count: 4, text: 'Fit four cannons (L)' },
      { kind: 'fit', weapon: 'harpoon', count: 4, text: 'Fit four harpoon guns (L)' },
    ],
    opening: [
      {
        speaker: 'keeper',
        text: 'Easy, captain, easy. The sea gave you back, and the Lighthouse caught you. It does that for those who carry its seal.',
      },
      {
        speaker: 'keeper',
        text: "I'm Edda, I keep the light here in Saltwind. The sloop at the quay is yours now, and so is the debt for her.",
      },
      {
        speaker: 'keeper',
        text: "Her guns are still in the hold, packed in grease. Don't take her out bare: fit them first, then sail.",
      },
      {
        speaker: 'bosun',
        text: "Tobin, your bosun. Click our sloop at the quay, or press L: that's the loadout. Drag a gun from the hold onto a slot. Four cannons, then four harpoon guns.",
      },
      {
        speaker: 'bosun',
        text: 'The shot is aboard already: cannonballs and harpoons, at hand on the bar under the guns.',
      },
    ],
    closing: [
      {
        speaker: 'bosun',
        text: 'All guns run out, captain. Cannons for hulls, harpoons for beasts: mind which is which.',
      },
    ],
    turnIn: 'done',
    reward: { gold: 10, xp: 25 },
  },
  {
    id: 'firstCourse',
    chapter: 0,
    title: 'First course',
    objectives: [{ kind: 'reach', mark: 'buoy', text: 'Sail to the buoy off the roadstead' }],
    opening: [
      {
        speaker: 'keeper',
        text: "Now take her out and get a feel for the helm. There's a buoy off the roadstead, its light gold: sail to it.",
      },
      {
        speaker: 'bosun',
        text: "Click the sea and we'll steer there, round any rock in the way. Set sail when you're ready.",
      },
      {
        speaker: 'bosun',
        text: "Mind the chart in the corner: the gold star on it is the buoy. When it's far off, it waits on the chart's rim, the way we're to steer.",
      },
    ],
    closing: [
      {
        speaker: 'bosun',
        text: 'She answers the helm well enough. Now look there, on the reefs: fishing boats, with lanterns lit in broad daylight.',
      },
    ],
    turnIn: 'done',
    reward: { gold: 20, xp: 50 },
  },
  {
    id: 'notFish',
    chapter: 0,
    title: 'Not fish',
    objectives: [
      { kind: 'sink', target: 'fishingBoat', count: 2, text: 'Sink fishing boats' },
      { kind: 'haul', good: 'moonGlass', text: 'Haul up the moon glass' },
    ],
    opening: [
      {
        speaker: 'bosun',
        text: "They drag the reefs with nets, but it isn't fish they're after. Let's see what they haul. I've marked them gold for you.",
      },
      {
        speaker: 'bosun',
        text: "They won't sail up to our bow: look for the gold crescents on the chart in the corner, and steer for them.",
      },
      {
        speaker: 'bosun',
        text: 'Double-click a boat and the cannons open fire, or pick it out and press Space. Then sail over whatever floats up.',
      },
    ],
    closing: [
      { speaker: 'bosun', text: 'Fish, nets... and this. Glass, captain, and it glows. Moon glass.' },
      { speaker: 'bosun', text: 'Edda should see it. Take us back into the harbour.' },
    ],
    turnIn: 'done',
    reward: { gold: 40, xp: 100 },
  },
  {
    id: 'justGlass',
    chapter: 0,
    title: 'Just glass',
    objectives: [{ kind: 'dock', text: 'Sail into the harbour' }],
    opening: [{ speaker: 'bosun', text: "Sail in between the harbour walls and we'll moor by ourselves." }],
    closing: [
      { speaker: 'keeper', text: 'Show me. Hm. Just glass, captain. The reefs are full of it since the Moon fell.' },
      {
        speaker: 'keeper',
        text: 'Forty years now. The tides stopped, the sea broke into bowls, and the Seams rose between them: walls of storm no ship gets through.',
      },
      { speaker: 'keeper', text: "Leave it with me, it's no use to you. Go and earn your keep." },
    ],
    turnIn: 'port',
    reward: { gold: 30, xp: 100 },
    takes: 'moonGlass',
  },
  {
    id: 'shardWakes',
    chapter: 1,
    title: 'The shard wakes',
    objectives: [
      { kind: 'level', level: 2, text: 'Reach level 2' },
      { kind: 'talent', text: 'Take a talent (K)' },
    ],
    opening: [
      {
        speaker: 'keeper',
        text: 'One more thing. Every ship carries a shard of the Moon in its keel. It drinks the light of the ships you sink, and grows.',
      },
      {
        speaker: 'keeper',
        text: "As it grows, so does your ship: the crew learns new tricks. Sink a few more and you'll see.",
      },
    ],
    closing: [
      { speaker: 'shard', text: '...the sky... I remember the sky...' },
      { speaker: 'bosun', text: 'Did you hear that, captain? It came from below. From the keel.' },
    ],
    turnIn: 'done',
    reward: { gold: 30, xp: 50 },
  },
  {
    id: 'dues',
    chapter: 1,
    title: 'The dues',
    objectives: [
      { kind: 'sink', target: 'merchantSloop', count: 2, text: 'Sink merchant sloops' },
      { kind: 'sell', text: 'Sell goods at the market' },
    ],
    opening: [
      {
        speaker: 'bosun',
        text: 'A signal from the harbour, captain: merchant sloops slip past without paying their dues.',
      },
      {
        speaker: 'bosun',
        text: "Sink two, haul up their cargo and sell it at the market. Mind their swivel guns: keep your distance and they can't answer.",
      },
    ],
    closing: [
      { speaker: 'harbourMaster', text: 'Hale, harbour master. Good work out there, captain.' },
      {
        speaker: 'harbourMaster',
        text: 'Funny thing: those sloops carried more glass than cloth. And all of it bound north-east.',
      },
      { speaker: 'harbourMaster', text: 'Come and see me again: I may have more work for you.' },
    ],
    turnIn: 'done',
    reward: { gold: 80, xp: 200 },
  },
  {
    id: 'shells',
    chapter: 2,
    title: 'Glass in the shells',
    objectives: [
      { kind: 'weapon', weapon: 'harpoon', text: 'Take the harpoon guns (E)' },
      { kind: 'sink', target: 'seaTurtle', count: 2, text: 'Hunt sea turtles' },
    ],
    opening: [
      {
        speaker: 'harbourMaster',
        text: "There's more. The turtles on the reefs grow glass in their shells now, and they're as big as boats.",
      },
      {
        speaker: 'harbourMaster',
        text: 'Cannonballs glance off a shell: take the harpoon guns (E). And keep clear of the jaws.',
      },
    ],
    closing: [
      { speaker: 'bosun', text: 'There it is, right in the shell. Grown in, like a pearl.' },
      { speaker: 'shard', text: '...they swallowed me... piece by piece...' },
    ],
    turnIn: 'done',
    reward: { gold: 80, xp: 250 },
  },
  {
    id: 'serpents',
    chapter: 2,
    title: 'What drags them under',
    objectives: [
      { kind: 'sink', target: 'seaSerpent', count: 2, text: 'Kill sea serpents' },
      { kind: 'repair', text: 'Repair the hull at sea (R)' },
    ],
    opening: [
      {
        speaker: 'bosun',
        text: "Serpents hunt the channels now, and they go for the hull. They've eaten glass too, by the size of them.",
      },
      {
        speaker: 'bosun',
        text: "Harpoons again. We'll take some bites: out of the fight, the crew mends the hull at sea. Press R.",
      },
    ],
    closing: [
      { speaker: 'bosun', text: 'Glass in their bellies, like the turtles. And somebody buys all this glass.' },
      { speaker: 'bosun', text: "The smugglers sail every route to the north-east. I'd ask them." },
    ],
    turnIn: 'done',
    reward: { gold: 100, xp: 300 },
  },
  {
    id: 'baronsMen',
    chapter: 3,
    title: "The Baron's men",
    objectives: [{ kind: 'sink', target: 'smugglerSloop', count: 3, text: 'Sink smuggler sloops' }],
    opening: [
      {
        speaker: 'bosun',
        text: 'The smugglers attack anyone who comes near. They work for the Baron, who holds the north-east.',
      },
      {
        speaker: 'bosun',
        text: 'Sink three and go through what they carry. Then home: Edda will want to hear of it.',
      },
    ],
    closing: [
      {
        speaker: 'keeper',
        text: "Papers from a smuggler's chest? Let me see. 'Glass by the crate, paid on delivery. The Baron.'",
      },
      {
        speaker: 'keeper',
        text: "So it's the Baron who buys it. He sits in the north-east with his brig, his mortar and two smugglers at his side.",
      },
      { speaker: 'keeper', text: "Before you go after him, scout his waters. Don't fight him yet: just look." },
    ],
    turnIn: 'port',
    reward: { gold: 150, xp: 400 },
  },
  {
    id: 'scout',
    chapter: 3,
    title: 'Scouting',
    objectives: [{ kind: 'reach', mark: 'lair', text: "Scout the Baron's lair" }],
    opening: [
      {
        speaker: 'bosun',
        text: "His lair is in the far north-east: the chart shows it (M). We'll sail close, not in, and look through the glass.",
      },
    ],
    closing: [
      { speaker: 'bosun', text: 'There she is: a brig with a mortar on her deck, and two smugglers off her beam.' },
      {
        speaker: 'bosun',
        text: "His grapeshot lands where we are and where we're going. Where the water glows red, get out of it.",
      },
      { speaker: 'shard', text: '...he has so much of me... I can feel it from here...' },
    ],
    turnIn: 'done',
    reward: { gold: 60, xp: 200 },
    watch: 'baronBrig',
  },
  {
    // Home from his waters: only now does the tavern take the player's name (tavernOpen)
    id: 'report',
    chapter: 3,
    title: 'Back to Saltwind',
    objectives: [{ kind: 'dock', text: 'Sail into the harbour' }],
    opening: [
      {
        speaker: 'bosun',
        text: "That's enough looking, captain: he'd send us down before we got a shot in. Back to the harbour, Edda will want to hear of him.",
      },
    ],
    closing: [
      {
        speaker: 'keeper',
        text: "A brig, a mortar and two smugglers at his side. Your sloop wouldn't last a minute against that, not as she is.",
      },
      {
        speaker: 'harbourMaster',
        text: "Then she must grow. My bounties are posted at the tavern, and I've told them to take your name.",
      },
      {
        speaker: 'harbourMaster',
        text: "Do a couple of them, captain: your ship grows faster on bounties, and you'll want the gold for a new hull.",
      },
      { speaker: 'keeper', text: "Go on. The Baron isn't going anywhere." },
    ],
    turnIn: 'port',
    reward: { gold: 40, xp: 100 },
  },
  {
    id: 'bounty',
    chapter: 3,
    title: 'Honest gold',
    objectives: [
      { kind: 'takeQuest', text: 'Take a bounty at the tavern' },
      { kind: 'turnInQuest', text: 'Turn it in at the tavern' },
    ],
    opening: [
      {
        speaker: 'harbourMaster',
        text: 'Start with an easy one: the fishing boats, say. Take it at the tavern, sink what it asks, and come back to the tavern for the gold.',
      },
      {
        speaker: 'bosun',
        text: 'The bounties we take sit on the board at the top right, captain, with how many are left to sink.',
      },
    ],
    closing: [
      { speaker: 'harbourMaster', text: 'Paid in full. A few more of those and the shipyard will be glad to see you.' },
      {
        speaker: 'bosun',
        text: "And while we're in port, captain: gold in the purse doesn't make her sail any faster. Let's see the workshop.",
      },
    ],
    turnIn: 'done',
    reward: { gold: 100, xp: 200 },
  },
  {
    id: 'workshop',
    chapter: 3,
    title: 'The workshop',
    objectives: [{ kind: 'outfit', text: 'Buy and fit a piece of outfit at the workshop' }],
    opening: [
      {
        speaker: 'bosun',
        text: 'The workshop fits her out: sails, planking, a rudder, a spyglass. Each piece adds a little to how she sails and holds.',
      },
      {
        speaker: 'bosun',
        text: 'Start with something cheap: canvas sails, say. A little more speed is a lot with a serpent on our heels.',
      },
    ],
    closing: [
      {
        speaker: 'bosun',
        text: 'Feel that? She runs livelier already. The better pieces cost more: we come back for them as the gold comes in.',
      },
    ],
    turnIn: 'done',
    reward: { gold: 60, xp: 100 },
  },
  {
    id: 'baron',
    chapter: 3,
    title: 'The Smuggler Baron',
    objectives: [{ kind: 'sink', target: 'baronBrig', count: 1, text: 'Sink the Smuggler Baron' }],
    opening: [
      {
        speaker: 'bosun',
        text: 'Bring her up a few levels first, captain, and fit the best guns the arsenal sells. Then we take the Baron.',
      },
    ],
    closing: [
      { speaker: 'keeper', text: 'The Baron sunk! Saltwind will drink to you tonight.' },
      { speaker: 'keeper', text: 'Crates of glass, a strongbox... and his seal. The seal of a Seam.' },
      { speaker: 'keeper', text: "Give me his papers, they're the harbour's business now. The seal you keep." },
      { speaker: 'shard', text: '...she knows who paid him... she knows...' },
    ],
    turnIn: 'port',
    reward: { gold: 300, xp: 800 },
  },
  {
    id: 'seal',
    chapter: 4,
    title: "The Seam's seal",
    objectives: [{ kind: 'ship', tier: 1, text: 'Buy a tier 1 ship at the shipyard' }],
    opening: [
      {
        speaker: 'keeper',
        text: "The seal opens a Seam, but your sloop won't pass one: the shard in her keel is too small to hold against the storm.",
      },
      {
        speaker: 'keeper',
        text: "The shipyard lays stronger keel stones in new hulls, under any flag you like: the crown's, the East's, the Black Flag's, the North's.",
      },
      {
        speaker: 'keeper',
        text: 'Bring the sloop to her last level and save the gold the shipwright asks. Then choose your ship.',
      },
    ],
    closing: [
      {
        speaker: 'keeper',
        text: 'A fine ship. A new hull comes bare: fit her from your hold (L), or buy her guns at the arsenal.',
      },
      { speaker: 'keeper', text: 'The Seam to the east will let you through now. Beyond it lies the Coral Coast.' },
      { speaker: 'shard', text: '...further... take me further...' },
    ],
    turnIn: 'done',
    reward: { gold: 300, xp: 0 },
  },
];

/**
 * How far a player is along the story, kept with their progress (save.ts): the prologue seen, the step they are on,
 * whether its opening was told and how far each of its objectives has got, and a step done whose closing is still to
 * be told
 */
export interface StoryProgress {
  prologue: boolean;
  /** The step the player is on, its place in STORY: STORY.length once all of it is told */
  step: number;
  /** Whether its opening was told: its objectives count only from then */
  told: boolean;
  /** How far each of its objectives has got, from 0 to objectiveNeed */
  counts: number[];
  /** A step done by itself (at sea, say) whose closing is still to be told, its place in STORY; null if none */
  closing: number | null;
  /**
   * Game time the crew stops watching what that closing has them watch (StoryStep.watch), told or not. Not saved: a
   * game loaded has watched it
   */
  watchUntil: number;
}

/** A new player's: the prologue first, then the first step */
export function newStory(): StoryProgress {
  return { prologue: false, step: 0, told: false, counts: [], closing: null, watchUntil: 0 };
}

/** The story told to its end: an older player's, who knew the starting waters before it was told (save.ts) */
export function finishedStory(): StoryProgress {
  return { prologue: true, step: STORY.length, told: true, counts: [], closing: null, watchUntil: 0 };
}

/** How many of an objective's: a kind to sink so many of, guns to fit, or one of anything else */
export function objectiveNeed(objective: Objective) {
  return objective.kind === 'sink' || objective.kind === 'fit' ? objective.count : 1;
}

/** The step the player is on, or null once the story is told */
export function storyStep(player: Player): StoryStep | null {
  return STORY[player.story.step] ?? null;
}

/** Whether the player has got this far along the story: on this step, or past it */
export function storyReached(player: Player, id: StoryStepId) {
  return player.story.step >= STORY.findIndex((step) => step.id === id);
}

/** Whether every objective of the step the player is on is met (an untold step's never are) */
export function objectivesMet(player: Player) {
  const step = storyStep(player);
  const { told, counts } = player.story;
  return step !== null && told && step.objectives.every((objective, i) => (counts[i] ?? 0) >= objectiveNeed(objective));
}

/** A sea's story marks on its map, each on the open water nearest where it is meant to be; once, as the sea is made */
export function placeStoryMarks(zone: ZoneId, nav: NavGrid): StoryMark[] {
  return MARKS.flatMap(({ id, zone: its, at, radius }) => {
    if (its !== zone) return [];
    const spot = nav.nearestOpen(at.x, at.y, MARK_CLEARANCE);
    return spot ? [{ id, x: spot.x, y: spot.y, radius }] : [];
  });
}

/** Whether a point is near one of a sea's story marks: no bot comes into the game or wanders there */
export function nearStoryMark(marks: readonly StoryMark[], x: number, y: number) {
  return marks.some((mark) => Math.hypot(x - mark.x, y - mark.y) < MARK_KEEP);
}

/**
 * The mark the player is to sail to now, in this sea: one the step they are on asks for, not reached yet; or the
 * harbour, at its berth, while it asks them home (to sail into it, to turn the step in there, to sell the goods
 * aboard at the market once that is all it still asks, to take a bounty at the tavern, or another once the one taken
 * was given up, to turn it in there once done, or to fit out the ship at the workshop), the ship at sea
 */
export function storyMark(state: GameState, player: Player): StoryMark | null {
  const step = storyStep(player);
  const { told, counts, closing } = player.story;
  if (!step || !told || closing !== null || state.world.zone !== START_ZONE) return null;
  const unmet = (kind: Objective['kind']) =>
    step.objectives.findIndex((o, i) => o.kind === kind && (counts[i] ?? 0) < 1);
  const ship = shipOf(state, player);
  const sells =
    unmet('sell') >= 0 &&
    step.objectives.every((o, i) => o.kind === 'sell' || (counts[i] ?? 0) >= objectiveNeed(o)) &&
    ship !== undefined &&
    marketValue(ship) > 0;
  // What only the port does: a bounty taken or turned in at the tavern, the outfit bought at the workshop
  const quests = shipQuests(state, player);
  const tavern =
    unmet('takeQuest') >= 0 || (unmet('turnInQuest') >= 0 && (quests.length === 0 || quests.some(questDone)));
  const workshop = unmet('outfit') >= 0;
  if (unmet('dock') >= 0 || sells || tavern || workshop || (step.turnIn === 'port' && objectivesMet(player))) {
    if (ship?.docked !== false) return null;
    const { mooring } = state.world.port;
    return { id: 'port', x: mooring.x, y: mooring.y, radius: PORT_MARK_RADIUS };
  }
  const objective = step.objectives[unmet('reach')];
  if (objective?.kind !== 'reach') return null;
  return state.world.marks.find((mark) => mark.id === objective.mark) ?? null;
}

/**
 * What the step the player is on asks them to sink and hasn't been sunk yet: those kinds, for the client to mark them
 * out. None while its opening or a closing is still to be told
 */
export function storyTargets(player: Player): UnitKind[] {
  return huntsLeft(player, false).map((hunt) => hunt.target);
}

/**
 * What the step the player is on still asks them to sink: each kind and how many more. Once every kind is sunk, while
 * the prey's good it asks them to haul up is not (its chest lost with the sea made afresh, say), one more of its first
 * kind, unless a chest of that good floats (`goodAfloat`) for them to haul. None while its opening or a closing is
 * still to be told
 */
function huntsLeft(player: Player, goodAfloat: boolean): { readonly target: UnitKind; readonly count: number }[] {
  const step = storyStep(player);
  const { told, counts, closing } = player.story;
  if (!step || !told || closing !== null) return [];
  const hunts = step.objectives.flatMap((o, i) =>
    o.kind === 'sink' && (counts[i] ?? 0) < o.count ? [{ target: o.target, count: o.count - (counts[i] ?? 0) }] : [],
  );
  if (hunts.length > 0 || goodAfloat) return hunts;
  const first = step.objectives.find((o) => o.kind === 'sink');
  const unhauled = step.objectives.some((o, i) => o.kind === 'haul' && o.good === PREY_GOOD && (counts[i] ?? 0) < 1);
  return first?.kind === 'sink' && unhauled ? [{ target: first.target, count: 1 }] : [];
}

/**
 * A weapon whose guns the step the player is on asks them to fit and they can fit now (some in the hold, a slot of it
 * empty), if any: the story keeps their ship in port till they have (setSail), and the client shows them how. Not when
 * there are none to fit (sold, say): the player is never shut in
 */
export function storyFitting(state: GameState, player: Player): WeaponId | null {
  const step = storyStep(player);
  const ship = shipOf(state, player);
  if (!step || !ship || state.world.zone !== START_ZONE) return null;
  for (const objective of step.objectives) {
    if (objective.kind !== 'fit') continue;
    const { weapon } = objective;
    const inHold = GUN_IDS[weapon].some((gun) => (player.hold[gun] ?? 0) > 0);
    if (ship.fittedGuns(weapon).length < objective.count && inHold && ship.guns[weapon].includes(null)) return weapon;
  }
  return null;
}

/**
 * The player's ship sets sail from port (world/port.ts, leavePort), unless the story keeps it there while its guns wait
 * in the hold (Edda: "Don't take her out bare"; storyFitting). A player's action, like any; false if the ship stays
 */
export function setSail(state: GameState, player: Player) {
  const ship = shipOf(state, player);
  if (!ship?.docked || storyFitting(state, player) !== null) return false;
  leavePort(state, ship);
  return true;
}

/**
 * Whether the tavern takes the player's bounties: in the starting waters, only once the story has brought them home
 * from the Baron's waters (Hale: "do a couple of them"), so a new player learns the sea from the story first; and
 * while a quest of theirs is still to do or turn in, so none taken (an older save's) is ever stranded. Another sea's
 * tavern is open: the story isn't told there
 */
export function tavernOpen(state: GameState, player: Player) {
  return state.world.zone !== START_ZONE || storyReached(player, 'bounty') || player.quests.length > 0;
}

/**
 * Takes a tavern quest (economy/quests.ts, takeQuest), unless the story keeps the tavern shut yet (tavernOpen). A
 * player's action, like any; false if it isn't taken
 */
export function takeBounty(state: GameState, player: Player, id: QuestId) {
  return tavernOpen(state, player) && takeQuest(state, player, id);
}

/**
 * Where the story sends the player, and what is there: a mark of its (storyMark), the prey brought in for them, or
 * loot it asks them to haul up
 */
export interface StoryGoal {
  readonly x: number;
  readonly y: number;
  readonly kind: StoryMarkId | 'prey' | 'loot';
}

/**
 * Where the story sends the player now, for the client to point them there: its mark, or else the nearest of the prey
 * brought in for them and the chests afloat with what it asks them to haul up, wherever it is; null if nowhere
 */
export function storyGoal(state: GameState, player: Player): StoryGoal | null {
  const mark = storyMark(state, player);
  if (mark) return { x: mark.x, y: mark.y, kind: mark.id };
  const ship = shipOf(state, player);
  if (!ship) return null;
  let nearest: StoryGoal | null = null;
  let distance = Infinity;
  const consider = (x: number, y: number, kind: StoryGoal['kind']) => {
    const d = Math.hypot(x - ship.x, y - ship.y);
    if (d >= distance) return;
    distance = d;
    nearest = { x, y, kind };
  };
  for (const unit of state.ships) {
    if (unit.bot?.prey === ship.id && isAfloat(unit)) consider(unit.x, unit.y, 'prey');
  }
  const goods = state.world.zone === START_ZONE ? haulsLeft(player) : [];
  for (const chest of state.chests) {
    // A bot's loot, not the player's own cargo lost: hauled back, that isn't loot (progress)
    if (chest.lostBy !== null || !mayHaul(chest, ship.id)) continue;
    if (goods.some((good) => good === null || (chest.goods[good] ?? 0) > 0)) consider(chest.x, chest.y, 'loot');
  }
  return nearest;
}

/**
 * The goods the step the player is on asks them to haul up and they haven't yet (null: anything). None while its
 * opening or a closing is still to be told
 */
function haulsLeft(player: Player): (GoodId | null)[] {
  const step = storyStep(player);
  const { told, counts, closing } = player.story;
  if (!step || !told || closing !== null) return [];
  return step.objectives.flatMap((o, i) => (o.kind === 'haul' && (counts[i] ?? 0) < 1 ? [o.good] : []));
}

/**
 * The first kind the step the player is on asks them to sink, and how many more of it (huntsLeft: one more while the
 * prey's good is still to haul up and none floats): the spawner brings that many in near them (bots/spawner.ts,
 * stepPrey). Null when there is none, in another sea, or while something is still to be told
 */
export function storyPrey(
  state: GameState,
  player: Player,
): { readonly target: UnitKind; readonly count: number } | null {
  if (state.world.zone !== START_ZONE) return null;
  // A bot's loot, not the player's own cargo lost: hauled back, that isn't loot (progress); and theirs to haul
  const goodAfloat = state.chests.some(
    (chest) => chest.lostBy === null && mayHaul(chest, player.shipId) && (chest.goods[PREY_GOOD] ?? 0) > 0,
  );
  return huntsLeft(player, goodAfloat)[0] ?? null;
}

/**
 * The unit the crew watches now (StoryStep.watch), while the closing of the step that asks for it is told, for
 * WATCH_TIME at most
 */
export function storyWatch(state: GameState, player: Player): Unit | null {
  const { closing, watchUntil } = player.story;
  const kind = closing === null ? undefined : STORY[closing]?.watch;
  if (!kind || state.time >= watchUntil || state.world.zone !== START_ZONE) return null;
  return state.ships.find((ship) => ship.shipClass.id === kind && isAfloat(ship)) ?? null;
}

/**
 * A conversation the client is to play now: a step's opening, the closing of one done by itself, or the closing of
 * one the player turns in, told in port. `key` names it, for `tellStory`
 */
export interface StoryTalk {
  readonly key: string;
  readonly kind: 'opening' | 'closing' | 'turnIn';
  readonly step: StoryStep;
  readonly lines: readonly Line[];
}

function talk(kind: StoryTalk['kind'], step: StoryStep): StoryTalk {
  return { key: `${kind}:${step.id}`, kind, step, lines: kind === 'opening' ? step.opening : step.closing };
}

/**
 * What is to be told to the player now, if anything: after the prologue, a closing still to be told, then the
 * opening of the step they are on; and in port, the closing of a step to turn in there once its objectives are met.
 * Only in the starting waters, the story's sea so far
 */
export function storyTalk(state: GameState, player: Player): StoryTalk | null {
  const { story } = player;
  if (!story.prologue) return null;
  const closed = story.closing === null ? undefined : STORY[story.closing];
  if (closed) return talk('closing', closed);
  const step = storyStep(player);
  if (!step || state.world.zone !== START_ZONE) return null;
  if (!story.told) return talk('opening', step);
  const docked = shipOf(state, player)?.docked === true;
  if (step.turnIn === 'port' && docked && objectivesMet(player)) return talk('turnIn', step);
  return null;
}

/**
 * The player has heard a conversation out (or skipped it): a closing is told, an opening starts its step's
 * objectives, a turn-in's closing ends its step with the reward. `key`: the one heard, which must be the one due now
 * (storyTalk). A player's action, like any: online, a command to the server. False if it wasn't due
 */
export function tellStory(state: GameState, player: Player, key: string) {
  const due = storyTalk(state, player);
  if (!due || due.key !== key) return false;
  const { story } = player;
  if (due.kind === 'closing') story.closing = null;
  else if (due.kind === 'turnIn') finishStep(state, player, false);
  else {
    story.told = true;
    story.counts = due.step.objectives.map(() => 0);
  }
  return true;
}

/** The prologue seen (or skipped): the story's first opening follows. A player's action, like any */
export function seePrologue(player: Player) {
  player.story.prologue = true;
}

/**
 * Ends the step the player is on: its reward to them and their ship (gold, experience), a `story` event, and the next
 * step, its opening to be told. `closing`: whether its closing is still to be told (a step done by itself); a step
 * turned in has just had it told
 */
function finishStep(state: GameState, player: Player, closing: boolean) {
  const { story } = player;
  const step = storyStep(player);
  if (!step) return;
  const ship = shipOf(state, player);
  const at = ship ? { x: ship.x, y: ship.y, z: ship.height } : { x: 0, y: 0, z: 0 };
  story.closing = closing ? story.step : null;
  if (closing && step.watch) story.watchUntil = state.time + WATCH_TIME;
  story.step++;
  story.told = false;
  story.counts = [];
  const { takes } = step;
  if (ship && takes && (ship.cargo[takes] ?? 0) > 0) {
    ship.cargo[takes] = (ship.cargo[takes] ?? 0) - 1;
    if (ship.cargo[takes] === 0) delete ship.cargo[takes];
  }
  const { gold, xp } = step.reward;
  if (gold > 0) earn(state, player, { amount: gold, reason: 'quest', kind: null, quest: null, story: step.id, at });
  if (ship && xp > 0) gainXp(state, ship, xp, 'quest', at);
  state.events.push({ type: 'story', shipId: player.shipId, step: step.id, objective: null });
}

/**
 * How far an objective has got by this update: its count before, and what the update's events and the player's ship
 * add to it
 */
function progress(state: GameState, player: Player, objective: Objective, before: number) {
  const ship = shipOf(state, player);
  if (!ship) return before;
  const mine = (shipId: number) => shipId === player.shipId;
  const events = state.events;
  switch (objective.kind) {
    case 'reach': {
      const mark = state.world.marks.find((m) => m.id === objective.mark);
      return mark && !ship.isSinking && Math.hypot(ship.x - mark.x, ship.y - mark.y) <= mark.radius ? 1 : before;
    }
    case 'sink':
      return (
        before +
        events.filter((e) => e.type === 'destroyed' && mine(e.attackerId) && e.kind === objective.target).length
      );
    case 'fit':
      return Math.max(before, ship.fittedGuns(objective.weapon).length);
    case 'haul': {
      const { good } = objective;
      return events.some(
        (e) =>
          (e.type === 'cargo' &&
            mine(e.shipId) &&
            e.reason === 'loot' &&
            (good === null || (e.goods[good] ?? 0) > 0)) ||
          (good === null && e.type === 'gold' && mine(e.shipId) && e.reason === 'chest'),
      )
        ? 1
        : before;
    }
    case 'dock':
      return ship.docked ? 1 : before;
    case 'talent':
      return ship.talentRanks().size > 0 ? 1 : before;
    case 'repair':
      return events.some((e) => e.type === 'repair' && mine(e.shipId)) ? 1 : before;
    case 'sell':
      return events.some((e) => e.type === 'gold' && mine(e.shipId) && e.reason === 'market') ? 1 : before;
    case 'takeQuest':
      return shipQuests(state, player).length > 0 ? 1 : before;
    case 'turnInQuest':
      // A quest's gold, not a step of the story's (paid as a quest's too, with no quest named)
      return events.some((e) => e.type === 'gold' && mine(e.shipId) && e.reason === 'quest' && e.quest !== null)
        ? 1
        : before;
    case 'outfit':
      return Object.values(ship.outfit).some((piece) => piece !== null) ? 1 : before;
    case 'level':
      return ship.level >= objective.level ? 1 : before;
    case 'weapon':
      return ship.weapon === objective.weapon ? 1 : before;
  }
  // The last kind left: a ship of a tier sailed
  return ship.shipClass.tier >= objective.tier ? 1 : before;
}

/**
 * Counts the update's events and the player's ship towards the objectives of the step they are on (a `story` event
 * for each one met), and ends a step done by itself once they all are. Stepped from Game.update before the stats,
 * with every other event of the update in. Only in the starting waters, the story's sea so far
 */
export function stepStory(state: GameState) {
  const { player } = state;
  const { story } = player;
  // The unit watched in sight through the fog, and the ship left alone meanwhile, from the next update: not while it
  // attacks anything, or it would fight the Baron with his escort kept off it
  const ship = shipOf(state, player);
  if (ship) {
    const watched = storyWatch(state, player);
    ship.spotted = watched ? { x: watched.x, y: watched.y, radius: WATCH_RADIUS } : null;
    ship.parley = watched !== null && ship.attackTarget === null;
  }
  const step = storyStep(player);
  if (!step || !story.told || story.closing !== null || state.world.zone !== START_ZONE) return;
  step.objectives.forEach((objective, i) => {
    const need = objectiveNeed(objective);
    const before = story.counts[i] ?? 0;
    if (before >= need) return;
    story.counts[i] = Math.min(need, progress(state, player, objective, before));
    if (story.counts[i] >= need) {
      state.events.push({ type: 'story', shipId: player.shipId, step: step.id, objective: i });
    }
  });
  if (step.turnIn === 'done' && objectivesMet(player)) finishStep(state, player, true);
}

/**
 * For the HUD's debug buttons: the step the player is on done at once, its opening and closing left untold. Testing
 * a later step without playing the ones before it
 */
export function skipStoryStep(state: GameState, player: Player) {
  if (!storyStep(player)) return false;
  player.story.prologue = true;
  player.story.closing = null;
  finishStep(state, player, false);
  return true;
}
