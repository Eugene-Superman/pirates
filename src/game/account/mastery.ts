/**
 * The captain's mastery: the account's own tree of passives, for every ship the player sails, as a ship's talents are
 * for that ship. Planned: the captain's levels and the points they give come with the online game, so none of these
 * does anything yet and their figures are provisional; the client shows the tree as a look ahead.
 *
 * Six branches round the captain in the middle, each in rings outwards. A passive opens once one it is linked to,
 * nearer the middle, has a rank. A minor passive gives a little a rank, a notable one more at once, and the keystone at
 * a branch's end changes how the captain fights, sails or trades, at a price
 */
export type MasteryBranchId = 'gunnery' | 'hunting' | 'seamanship' | 'shipwright' | 'trade' | 'command';
/** Clockwise from the top */
export const MASTERY_BRANCH_IDS: readonly MasteryBranchId[] = [
  'gunnery',
  'hunting',
  'seamanship',
  'shipwright',
  'trade',
  'command',
];

export type PassiveKind = 'root' | 'minor' | 'notable' | 'keystone';

export interface MasteryPassive {
  /** Its branch, ring and place across the ring: `gunnery.3.1` (the root's is `captain`) */
  readonly id: string;
  readonly kind: PassiveKind;
  /** null for the captain in the middle */
  readonly branch: MasteryBranchId | null;
  /** How far out: 0 the middle, then its branch's rings from 1 */
  readonly ring: number;
  /** Its place across its ring within its branch, from 0, of `across` */
  readonly slot: number;
  readonly across: number;
  /** A notable's or a keystone's name; a minor passive is known by what it gives */
  readonly name: string;
  /** What it gives a rank, for the player: `{n}` is `value` */
  readonly text: string;
  readonly value: number;
  /** 0 for the captain, who is there from the start */
  readonly maxRank: number;
  /** The passives nearer the middle it opens from */
  readonly links: readonly string[];
}

/** A passive's plan: what it gives a rank, how much, its ranks, and a notable's or a keystone's name */
type Plan = readonly [text: string, value: number, maxRank: number, name?: string];

interface BranchPlan {
  readonly name: string;
  readonly text: string;
  /** Its rings from the middle out; the last one's passive is the keystone */
  readonly rings: readonly (readonly Plan[])[];
}

const PLANS: Readonly<Record<MasteryBranchId, BranchPlan>> = {
  gunnery: {
    name: 'Gunnery',
    text: 'Cannons: harder hits, quicker reloads, a longer reach',
    rings: [
      [['+{n}% cannon damage', 2, 5]],
      [
        ['Cannons reload {n}% faster', 2, 5],
        ['+{n}% cannon reach', 2, 5],
      ],
      [
        ['+{n}% chance of a critical hit with cannons', 1, 5],
        ['A full broadside hits {n}% harder', 10, 1, 'Gun Captain'],
        ['Cannonballs fly {n}% faster', 5, 3],
      ],
      [
        ['Cannon ammo costs {n}% less', 4, 5],
        ['+{n}% cannon damage against ships', 3, 5],
      ],
      [['Volleys hit {n}% harder, but cannons reload a third slower', 30, 1, 'Thunder of the Line']],
    ],
  },
  hunting: {
    name: 'Hunting',
    text: 'Harpoons, and the sea monsters they bring down',
    rings: [
      [['+{n}% harpoon damage', 2, 5]],
      [
        ['Harpoons reload {n}% faster', 2, 5],
        ['+{n}% damage against sea monsters', 2, 5],
      ],
      [
        ['+{n}% harpoon reach', 2, 5],
        ['Sunk monsters pay {n}% more gold and experience', 15, 1, 'Leviathan Hunter'],
        ['Monsters bite {n}% less', 2, 5],
      ],
      [
        ['Harpoon ammo costs {n}% less', 4, 5],
        ['+{n}% chance of a critical hit with harpoons', 1, 5],
      ],
      [['Twice the damage against monsters, {n}% less against ships', 25, 1, "Kraken's Bane"]],
    ],
  },
  seamanship: {
    name: 'Seamanship',
    text: 'Speed, turning and a keen lookout',
    rings: [
      [['+{n}% speed', 1, 5]],
      [
        ['+{n}% turning', 2, 5],
        ['+{n}% view range', 2, 5],
      ],
      [
        ['The ship gathers speed {n}% quicker', 3, 5],
        ['Full sail lasts {n} s longer', 2, 1, 'Fair Winds'],
        ['Damage slows the ship {n}% less', 5, 5],
      ],
      [
        ['+{n}% speed out of combat', 2, 5],
        ['+{n}% speed with goods aboard', 2, 5],
      ],
      [['+{n}% speed, but the hull holds a tenth less', 15, 1, 'Windrunner']],
    ],
  },
  shipwright: {
    name: 'Shipwright',
    text: 'A stouter hull, and quicker, cheaper repairs',
    rings: [
      [['+{n}% hull', 2, 5]],
      [
        ['Repairs at sea are {n}% faster', 3, 5],
        ['Repairs cost {n}% less', 4, 5],
      ],
      [
        ['{n}% less damage from cannons', 1, 5],
        ['{n}% less damage while the hull is under half', 10, 1, 'Oak and Iron'],
        ['{n}% less damage from bites', 1, 5],
      ],
      [
        ['Repairs can start {n} s sooner after a fight', 1, 3],
        ['The shipwright in port charges {n}% less', 5, 5],
      ],
      [['Once a fight, a blow that would sink the ship leaves it {n}% of its hull', 10, 1, 'Iron Keel']],
    ],
  },
  trade: {
    name: 'Trade',
    text: 'Gold from bounties, chests and the market',
    rings: [
      [['+{n}% gold from bounties', 3, 5]],
      [
        ['Goods fetch {n}% more at the market', 3, 5],
        ['+{n} place in the hold|+{n} places in the hold', 2, 5],
      ],
      [
        ['+{n}% gold from chests', 4, 5],
        ['{n}% chance that a sunk ship leaves a second chest', 10, 1, 'Lucky Find'],
        ['Guns and outfit cost {n}% less', 2, 5],
      ],
      [
        ['The arsenal buys back for {n}% more', 4, 5],
        ['{n}% of the cargo stays aboard when the ship goes down', 5, 5],
      ],
      [['+{n}% gold from everything, but a fifth less experience', 25, 1, 'Merchant Prince']],
    ],
  },
  command: {
    name: 'Command',
    text: 'The crew, experience, quests and abilities',
    rings: [
      [['+{n}% experience for the ship', 3, 5]],
      [
        ['+{n}% gold from quests', 4, 5],
        ['Abilities are ready {n}% sooner', 3, 5],
      ],
      [
        ['+{n}% experience from quests', 5, 5],
        ['A new ship starts at level {n}', 3, 1, 'Veteran Crew'],
        ['The shipwright retrains the crew for {n}% less', 10, 5],
      ],
      [
        ['Abilities last {n}% longer', 5, 5],
        ['+{n} quest taken at a time', 1, 2],
      ],
      [['Every talent of the ship is worth {n}% more', 10, 1, 'Legend of the Seas']],
    ],
  },
};

export const MASTERY_BRANCHES: Readonly<Record<MasteryBranchId, { readonly name: string; readonly text: string }>> =
  PLANS;

/** The captain in the middle, where every branch starts */
export const MASTERY_ROOT: MasteryPassive = {
  id: 'captain',
  kind: 'root',
  branch: null,
  ring: 0,
  slot: 0,
  across: 1,
  name: 'The Captain',
  text: 'Where every branch starts. What the captain masters stays with them from ship to ship',
  value: 0,
  maxRank: 0,
  links: [],
};

// A passive links to those of the ring before it that are near it across the branch (as shares of the branch's width)
const LINK_SPAN = 1 / 3;

/** Where a passive's middle is across its ring, as a share of the branch's width */
function across(slot: number, count: number) {
  return (slot + 0.5) / count;
}

function branchPassives(branch: MasteryBranchId): MasteryPassive[] {
  const { rings } = PLANS[branch];
  return rings.flatMap((plans, r) =>
    plans.map(([text, value, maxRank, name = ''], slot): MasteryPassive => {
      const ring = r + 1;
      const inner = r === 0 ? [] : rings[r - 1];
      const links =
        r === 0
          ? [MASTERY_ROOT.id]
          : inner
              .map((_, k) => k)
              .filter((k) => Math.abs(across(k, inner.length) - across(slot, plans.length)) < LINK_SPAN)
              .map((k) => `${branch}.${ring - 1}.${k}`);
      const kind = ring === rings.length ? 'keystone' : name ? 'notable' : 'minor';
      return {
        id: `${branch}.${ring}.${slot}`,
        kind,
        branch,
        ring,
        slot,
        across: plans.length,
        name,
        text,
        value,
        maxRank,
        links,
      };
    }),
  );
}

/** The whole tree: the captain first, then every branch's passives from the middle out */
export const MASTERY_PASSIVES: readonly MasteryPassive[] = [
  MASTERY_ROOT,
  ...MASTERY_BRANCH_IDS.flatMap(branchPassives),
];

/** How many rings a branch has, the keystone's the last */
export const MASTERY_RINGS = Math.max(...MASTERY_PASSIVES.map((p) => p.ring));

/** The ranks the whole tree takes to master */
export const MASTERY_RANKS = MASTERY_PASSIVES.reduce((sum, p) => sum + p.maxRank, 0);
