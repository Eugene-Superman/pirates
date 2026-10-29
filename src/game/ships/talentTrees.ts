import { BONUS_PERKS, type BonusEffect, type Effects } from './bonus';
import type { ShipClassId } from './shipClasses';

/**
 * Every ship's own talent tree (ships/talents.ts has the rules). A tree is its ship's branches side by side, each a
 * few rows of talents; a row opens with `rowPoints` more points spent in its branch, the last once every row before
 * it is taken in full: a branch's last talent is for the captain who took the whole branch. Up a line the trees grow
 * longer and more tangled: the starter sloop's one short branch, a tier 1 ship's three, then deeper rows, ranks and
 * branches, a talent that is one of two (taking it shuts the other), and one that needs a talent of another branch. A
 * ship never has the points for its whole tree, so two ships at their last level differ by what their captains took:
 * a tier 1 to tier 3 ship's take one branch of three to its end (each branch as many points as the ship has, none
 * needing another's, the three about as strong in a fight), from tier 4 two of four (each half its points less one,
 * the one left for the talent of another branch one of them may need). The starter sloop takes all of its own, a first
 * lesson. Figures are provisional
 */

/**
 * The numbers a talent's text shows, by their names in it (`{n}`). A branch talent's `n` is what a rank of it gives,
 * so its text for several ranks shows it times them (talentFigures)
 */
export type Figures = Readonly<Record<string, number>>;

/** How the talent tree shows a branch (its colour and sign are the client's): what the branch is about */
export type BranchLook = 'gunnery' | 'seamanship' | 'hull' | 'harpoons' | 'command' | 'treasure';

/** A branch talent's id: its ship's class and its key in that class's tree, `coastalBark.quickLoaders` */
export type BranchTalentId = `${string}.${string}`;

/** A talent of a ship's branch: bought with a talent point a rank at a time, once its row is open */
export interface BranchTalent {
  readonly id: BranchTalentId;
  readonly kind: 'branch';
  /** The ship class whose tree it is in */
  readonly ship: ShipClassId;
  /** Its branch's key in the tree */
  readonly branch: string;
  /** Its row in the branch, 0 first */
  readonly row: number;
  /**
   * Points spent in its branch that open its row: the tree's `rowPoints` a row, the last row once every row before it
   * is taken in full, so a branch's last talent is for the captain who took the whole branch
   */
  readonly opens: number;
  readonly maxRank: number;
  readonly name: string;
  /** What a rank of it gives, for the player: English, its figures by name */
  readonly text: string;
  readonly figures: Figures;
  /** What a rank of it gives */
  readonly effects: Effects;
  /** The talent of its row it is one of two with: either taken shuts the other; null for none */
  readonly rival: BranchTalentId | null;
  /** A talent of an earlier row, of any branch, it needs `rank` ranks of; null for none */
  readonly needs: { readonly id: BranchTalentId; readonly rank: number } | null;
}

export interface TalentBranch {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly look: BranchLook;
  /** Row by row */
  readonly talents: readonly BranchTalent[];
}

export interface TalentTree {
  /** Points spent in a branch that open its next row, but the last (BranchTalent's `opens`) */
  readonly rowPoints: number;
  readonly branches: readonly TalentBranch[];
}

/** No branches: a bot's hull */
export const NO_TREE: TalentTree = { rowPoints: 1, branches: [] };

/** A talent as planned, its key unique in its tree; its rival and what it needs by their keys */
interface Plan {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly figures: Figures;
  readonly effects: Effects;
  readonly maxRank: number;
  readonly rival: string | null;
  readonly needs: { readonly key: string; readonly rank: number } | null;
}

/**
 * What a rank of a talent of one effect says, and what its share is multiplied by for the text: 100 to show it in
 * percent, 1 as it is; the figures the text shows besides
 */
const SAYS = {
  speed: ['+{n}% speed', 100],
  turn: ['+{n}% turning', 100],
  acceleration: ['The ship gathers speed {n}% quicker', 100],
  holedSpeed: ['Damage slows the ship {n}% less', 100],
  cruiseSpeed: ['+{n}% speed out of combat', 100],
  sight: ['+{n}% view range', 100],
  stealth: ['Hostile ships and monsters spot the ship from {n}% closer', 100],
  hull: ['+{n}% hull', 100],
  damage: ['+{n}% damage', 100],
  cannonDamage: ['+{n}% cannon damage', 100],
  harpoonDamage: ['+{n}% harpoon damage', 100],
  cannonReload: ['Cannons reload {n}% faster', 100],
  harpoonReload: ['Harpoon guns reload {n}% faster', 100],
  cannonRange: ['+{n}% cannon reach', 100],
  dieBonus: ['+{n} to every die that hits', 1],
  critSooner: ['Every die crits {n} face sooner|Every die crits {n} faces sooner', 1],
  cannonCrit: ['Cannon dice crit {n} face sooner|Cannon dice crit {n} faces sooner', 1],
  pointBlank: ['+{n}% damage within half your reach', 100],
  marksman: ['+{n}% cannon damage beyond half their reach', 100],
  fullBroadside: ['A volley of every cannon fitted does +{n}% damage', 100],
  rollingThunder: ['Every third cannon volley in a row at one target does +{n}% damage', 100],
  freeShot: ['{n}% of volleys cost no ammo', 100],
  battleCry: ['Using an ability gives +{n}% damage for {s} s', 100, { s: BONUS_PERKS.battleCry }],
  cannonGuard: ['{n}% less damage from cannons and shells', 100],
  biteGuard: ['{n}% less damage from bites', 100],
  guard: ['{n}% less damage from everything', 100],
  repairRate: ['Repairs at sea mend {n}% more', 100],
  combatTime: ['A fight is over {n} s sooner: repairs and the gates open sooner', 1],
  patchRate: ['Mends {n}% of the hull every second, even in a fight', 100],
  hold: ['+{n}% room in the hold', 100],
  bounty: ['+{n}% gold from bounties', 100],
  chestChance: ['Sunk ships leave chests {n}% more often', 100],
  chestGold: ['+{n}% gold in chests', 100],
  secondChest: ['{n}% chance that a sunk ship leaves a second chest', 100],
  wreckGoods: ['Wrecks leave goods {n}% more often', 100],
  market: ['Goods fetch {n}% more at the market', 100],
  xp: ['+{n}% experience for the ship', 100],
  cooldown: ['Abilities are ready {n}% sooner', 100],
  prizeCrew: ['Sinking a ship or a monster mends {n}% of the hull', 100],
} as const satisfies Partial<Record<BonusEffect, readonly [string, number, Figures?]>>;

type Said = keyof typeof SAYS;

/** A figure as the text shows it: shares in percent to a hundredth, so 0.15% stays 0.15% */
function shown(value: number, scale: number) {
  return Math.round(value * scale * 100) / 100;
}

function plan(key: string, name: string, maxRank: number, text: string, figures: Figures, effects: Effects): Plan {
  return { key, name, text, figures, effects, maxRank, rival: null, needs: null };
}

/** A talent of one effect, `value` of it a rank */
function rank(key: string, name: string, maxRank: number, effect: Said, value: number): Plan {
  const [text, scale, extra] = SAYS[effect] as readonly [string, number, Figures?];
  return plan(key, name, maxRank, text, { n: shown(value, scale), ...extra }, { [effect]: value });
}

/**
 * A talent that needs `ranks` of another branch's talent `key`, of its first row: from tier 4 a ship's two branches
 * taken to their ends leave a point to spare, and it pays for the one such talent a tree has
 */
function needs(p: Plan, key: string, ranks: number): Plan {
  return { ...p, needs: { key, rank: ranks } };
}

/** Two talents of a row, one of which the ship may have */
function or(a: Plan, b: Plan): [Plan, Plan] {
  return [
    { ...a, rival: b.key },
    { ...b, rival: a.key },
  ];
}

// The talents more than one tree has, with their figures there

function longGuns(key: string, name: string, maxRank: number, share: number) {
  const text = '+{n}% reach for every gun';
  return plan(key, name, maxRank, text, { n: shown(share, 100) }, { cannonRange: share, harpoonRange: share });
}

function reloadAll(key: string, name: string, maxRank: number, share: number) {
  const effects = { cannonReload: share, harpoonReload: share };
  return plan(key, name, maxRank, 'Cannons and harpoon guns reload {n}% faster', { n: shown(share, 100) }, effects);
}

function chainShot() {
  const figures = { n: shown(1 - BONUS_PERKS.chainSpeed, 100), s: BONUS_PERKS.chainTime };
  return plan('chainShot', 'Chain shot', 1, 'Cannon hits slow the target by {n}% for {s} s', figures, { chainShot: 1 });
}

function hotBarrels() {
  return plan('hotBarrels', 'Hot barrels', 1, 'Sinking a ship reloads every cannon at once', {}, { hotBarrels: 1 });
}

function hiddenHold() {
  const text = 'All your cargo stays aboard when your ship goes down';
  return plan('hiddenHold', 'Hidden hold', 1, text, {}, { hiddenHold: 1 });
}

function secondWind(share: number) {
  const text = 'Once a fight, at {m}% hull: +{n}% of it at once';
  const figures = { n: shown(share, 100), m: BONUS_PERKS.secondWindBelow };
  return plan('secondWind', 'Second wind', 1, text, figures, { secondWind: share });
}

function ironKeel(share: number) {
  const text = 'Once a fight, a blow that would sink the ship leaves it {n}% of its hull';
  return plan('ironKeel', 'Iron keel', 1, text, { n: shown(share, 100) }, { ironKeel: share });
}

function oakAndIron(share: number) {
  const text = '{n}% less damage while the hull is under {m}%';
  const figures = { n: shown(share, 100), m: BONUS_PERKS.lowHull };
  return plan('oakAndIron', 'Oak and iron', 1, text, figures, { lowHullGuard: share });
}

function windward(key: string, name: string, speed: number, turn: number) {
  const figures = { n: shown(speed, 100), m: shown(turn, 100) };
  return plan(key, name, 1, '+{n}% speed and +{m}% turning', figures, { speed, turn });
}

function flagOfficer(key: string, name: string, damage: number, hull: number, speed: number) {
  const text = '+{n}% damage, +{m}% hull and +{s}% speed';
  const figures = { n: shown(damage, 100), m: shown(hull, 100), s: shown(speed, 100) };
  return plan(key, name, 1, text, figures, { damage, hull, speed });
}

function barbedHarpoons() {
  const time = 3; // seconds a harpoon hit slows a monster
  const text = 'Harpoon hits slow a monster by {n}% for {s} s';
  const figures = { n: shown(1 - BONUS_PERKS.barbedSpeed, 100), s: time };
  return plan('barbedHarpoons', 'Barbed harpoons', 1, text, figures, { barbedHeads: time });
}

interface BranchPlan {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly look: BranchLook;
  readonly rows: readonly (readonly Plan[])[];
}

function branch(key: string, name: string, text: string, look: BranchLook, rows: Plan[][]): BranchPlan {
  return { key, name, text, look, rows };
}

/** The points a row takes in full: of one of two, the smaller, which is all the branch asks of the captain */
function fullRow(plans: readonly Plan[]) {
  let points = 0;
  for (const p of plans) {
    const rival = plans.find((q) => q.key === p.rival);
    if (!rival) points += p.maxRank;
    // Counted once, at the first of the two
    else if (plans.indexOf(p) < plans.indexOf(rival)) points += Math.min(p.maxRank, rival.maxRank);
  }
  return points;
}

/** A ship's tree from its plan: every talent's id, and its rival's and what it needs by theirs; when each row opens */
function tree(ship: ShipClassId, rowPoints: number, plans: readonly BranchPlan[]): TalentTree {
  const keys = new Set(plans.flatMap((b) => b.rows.flat().map((p) => p.key)));
  const id = (key: string): BranchTalentId => {
    // A mistyped key would leave a talent no one can take: the tree is wrong, not the player
    if (!keys.has(key)) throw new Error(`No talent ${key} in the ${ship}'s tree`);
    return `${ship}.${key}`;
  };
  // What a talent needs is of an earlier row (talents are taken again row by row), not one of two (its rival taken
  // would shut the talent for good), and has the ranks
  const placed = new Map(
    plans.flatMap((b) => b.rows.flatMap((plansInRow, row) => plansInRow.map((p) => [p.key, { p, row }] as const))),
  );
  for (const b of plans) {
    b.rows.forEach((plansInRow, row) => {
      for (const { key, needs: need } of plansInRow) {
        if (!need) continue;
        const needed = placed.get(need.key);
        if (!needed || needed.row >= row || needed.p.rival !== null || need.rank > needed.p.maxRank) {
          throw new Error(`The ${ship}'s ${key} needs what it can't have: ${need.rank} of ${need.key}`);
        }
      }
    });
  }
  const branches = plans.map(({ key, name, text, look, rows }) => {
    const last = rows.length - 1;
    const whole = rows.slice(0, last).reduce((sum, plansInRow) => sum + fullRow(plansInRow), 0);
    return {
      key,
      name,
      text,
      look,
      talents: rows.flatMap((plansInRow, row) =>
        plansInRow.map((p): BranchTalent => ({
          id: id(p.key),
          kind: 'branch',
          ship,
          branch: key,
          row,
          opens: row === last ? whole : row * rowPoints,
          maxRank: p.maxRank,
          name: p.name,
          text: p.text,
          figures: p.figures,
          effects: p.effects,
          rival: p.rival === null ? null : id(p.rival),
          needs: p.needs === null ? null : { id: id(p.needs.key), rank: p.needs.rank },
        })),
      ),
    };
  });
  return { rowPoints, branches };
}

// The starter sloop, up to level 10 (7 points): one branch of 7 ranks, all of it by the last level; the guns first,
// then the hull and the sails, a rank at a time as a new captain learns them
const SLOOP = tree('sloop', 2, [
  branch('crew', 'The crew', 'Guns, sails and the hull: what a new captain learns first', 'seamanship', [
    [
      rank('quickHands', 'Quick hands', 2, 'cannonReload', 0.05),
      rank('harpoonDrill', 'Harpoon drill', 1, 'harpoonReload', 0.08),
    ],
    [rank('tarredPlanks', 'Tarred planks', 1, 'hull', 0.08), rank('lightRigging', 'Light rigging', 1, 'speed', 0.04)],
    [rank('shipsCarpenter', "Ship's carpenter", 1, 'repairRate', 0.3)],
    [rank('steadyAim', 'Steady aim', 1, 'dieBonus', 1)],
  ]),
]);

// Tier 1, up to level 10 (7 points): the classic three branches of 7 points each, a row every 2 points spent and one
// of two at the end, so the points take any one of them to its end, or some of each. A branch in full is worth about
// the same in a fight, weighed as how much quicker the ship sinks a foe times how much longer it lasts against one, on
// Cannon I and Cannonball I: the gunnery's ×1.42 damage of both weapons; the hull's ×1.5 hull in a fight of 30 s (it
// mends itself, and hull buys less than damage: a foe sunk no sooner hits for as long); the seamanship's ×1.24 damage
// at a distance and ×1.11 hull against guns, with the speed and the reach to pick its fights. Each has something
// besides: shots for free, quicker repairs, the speed or the prize
const COASTAL_BARK = tree('coastalBark', 2, [
  branch('gunnery', 'Gunnery', 'Quick reloads and harder hits', 'gunnery', [
    [
      rank('quickLoaders', 'Quick loaders', 1, 'cannonReload', 0.06),
      rank('heavyShot', 'Heavy shot', 1, 'cannonDamage', 0.05),
      rank('harpoonDrill', 'Harpoon drill', 1, 'harpoonReload', 0.1),
    ],
    [
      rank('steadyHands', 'Steady hands', 1, 'dieBonus', 1),
      rank('powderMonkeys', 'Powder monkeys', 1, 'freeShot', 0.1),
    ],
    [rank('keenEye', 'Keen eye', 1, 'critSooner', 1)],
    [...or(chainShot(), rank('grapeshot', 'Grapeshot', 1, 'pointBlank', 0.15))],
  ]),
  branch('seamanship', 'Seamanship', 'Speed, reach and the far shot', 'seamanship', [
    [
      rank('swift', 'Swift', 1, 'speed', 0.05),
      rank('nimble', 'Nimble', 1, 'turn', 0.12),
      rank('chaseGuns', 'Chase guns', 1, 'cannonRange', 0.06),
    ],
    [rank('marksmen', 'Marksmen', 2, 'marksman', 0.12)],
    [rank('evasiveSailing', 'Evasive sailing', 1, 'cannonGuard', 0.1)],
    [
      ...or(
        windward('weatherGauge', 'Weather gauge', 0.06, 0.1),
        rank('bountyHunter', 'Bounty hunter', 1, 'bounty', 0.25),
      ),
    ],
  ]),
  branch('hull', 'Hull and crew', 'A stouter hull, mended even in a fight', 'hull', [
    [
      rank('thickHull', 'Thick hull', 1, 'hull', 0.08),
      rank('ironBow', 'Iron bow', 1, 'biteGuard', 0.1),
      rank('carpenters', 'Carpenters', 1, 'repairRate', 0.3),
    ],
    [
      rank('reinforcedSides', 'Reinforced sides', 1, 'cannonGuard', 0.08),
      rank('bilgePumps', 'Bilge pumps', 1, 'combatTime', 2),
    ],
    [rank('damageControl', 'Damage control', 1, 'patchRate', 0.004)],
    [...or(secondWind(0.2), oakAndIron(0.25))],
  ]),
]);

// Tier 2, up to level 20 (15 points): a raider's, quick guns and the chase; three branches of 15 points each, deeper
// ranks, a row every 3 points spent and one of two at the end, so the points take any one of them to its end. Weighed
// as the tier 1 tree's, on Cannon II and Cannonball II: the guns' ×1.69 damage with every third volley's thunder; the
// hull's ×1.85 hull in a fight of 30 s; the sea wolf's ×1.38 damage at a distance and ×1.18 hull against guns (×1.62),
// with the speed to chase or get away
const CORSAIR = tree('corsair', 3, [
  branch('raidersGuns', "Raider's guns", 'Quick reloads and raking fire', 'gunnery', [
    [
      rank('quickLoaders', 'Quick loaders', 2, 'cannonReload', 0.05),
      rank('hotShot', 'Hot shot', 2, 'cannonDamage', 0.05),
    ],
    [
      rank('steadyHands', 'Steady hands', 2, 'dieBonus', 1),
      rank('powderMonkeys', 'Powder monkeys', 2, 'freeShot', 0.08),
    ],
    [rank('keenEye', 'Keen eye', 1, 'critSooner', 1), rank('harpoonCrews', 'Harpoon crews', 2, 'harpoonDamage', 0.06)],
    [rank('rollingThunder', 'Rolling thunder', 3, 'rollingThunder', 0.1)],
    [...or(hotBarrels(), rank('rakingFire', 'Raking fire', 1, 'pointBlank', 0.2))],
  ]),
  branch('seaWolf', 'Sea wolf', 'The chase, the getaway and the prize', 'seamanship', [
    [rank('rakedMasts', 'Raked masts', 2, 'speed', 0.04), rank('sharpHelm', 'Sharp helm', 2, 'turn', 0.06)],
    [rank('marksmen', 'Marksmen', 2, 'marksman', 0.1), rank('crowdSail', 'Crowd sail', 2, 'cruiseSpeed', 0.08)],
    [rank('evasiveSailing', 'Evasive sailing', 3, 'cannonGuard', 0.05)],
    [
      rank('chaseGuns', 'Chase guns', 1, 'cannonRange', 0.08),
      rank('sharpshooters', 'Sharpshooters', 2, 'marksman', 0.09),
    ],
    // The prize: more of it, or kept when the chase goes wrong
    [...or(rank('plunderer', 'Plunderer', 1, 'secondChest', 0.6), hiddenHold())],
  ]),
  branch('hull', 'Hull and crew', "A raider's hull: light, but quick to mend", 'hull', [
    [rank('oakPlanking', 'Oak planking', 2, 'hull', 0.06), rank('bosunsMates', "Bosun's mates", 2, 'repairRate', 0.15)],
    [
      rank('reinforcedSides', 'Reinforced sides', 2, 'cannonGuard', 0.05),
      rank('ironBow', 'Iron bow', 2, 'biteGuard', 0.06),
    ],
    [rank('damageControl', 'Damage control', 3, 'patchRate', 0.0015)],
    [rank('tarredSeams', 'Tarred seams', 2, 'hull', 0.04), rank('bilgePumps', 'Bilge pumps', 1, 'combatTime', 2)],
    [...or(secondWind(0.15), ironKeel(0.15))],
  ]),
]);

// Tier 3, up to level 30 (23 points): the navy's eyes, the fight at a distance; three branches of 23 points each, a
// row every 4 points spent, a sixth row, and a choice of two in the middle of each branch as well as at its end, the
// two alike in points, so the points still take any one branch to its end. Weighed as the tier 1 tree's, on Cannon III
// and Cannonball III: the long guns' ×1.96 damage at a distance (×1.82 and Raking fire's up close); the hull's ×2.06
// hull in a fight of 30 s; the navy's eyes' ×1.52 damage at a distance and ×1.22 hull against guns (×1.85), with the
// speed and the sight to pick its fights
const FRIGATE = tree('frigate', 4, [
  branch('longGuns', 'Long guns', 'Reach and aim: the fight at a distance', 'gunnery', [
    [longGuns('longBarrels', 'Long barrels', 3, 0.03), rank('gunDrill', 'Gun drill', 2, 'cannonReload', 0.05)],
    [rank('keenEye', 'Keen eye', 2, 'critSooner', 1), rank('heavyShot', 'Heavy shot', 3, 'cannonDamage', 0.03)],
    // The far fight or the close one
    [
      ...or(
        rank('marksmen', 'Marksmen', 4, 'marksman', 0.05),
        rank('rakingFire', 'Raking fire', 4, 'pointBlank', 0.05),
      ),
    ],
    [
      rank('steadyHands', 'Steady hands', 2, 'dieBonus', 1),
      rank('harpoonCrews', 'Harpoon crews', 2, 'harpoonDamage', 0.08),
    ],
    [rank('rollingThunder', 'Rolling thunder', 4, 'rollingThunder', 0.06)],
    [...or(chainShot(), rank('doubleShotted', 'Double-shotted', 1, 'cannonDamage', 0.12))],
  ]),
  branch('navysEyes', "The navy's eyes", 'Sight, speed and staying unseen', 'seamanship', [
    [rank('crowsNest', "Crow's nest", 2, 'sight', 0.06), rank('cleanHull', 'Clean hull', 3, 'speed', 0.03)],
    [rank('weatherHelm', 'Weather helm', 2, 'turn', 0.06), rank('chaseGuns', 'Chase guns', 3, 'cannonRange', 0.04)],
    [rank('sharpshooters', 'Sharpshooters', 4, 'marksman', 0.08)],
    [rank('evasiveSailing', 'Evasive sailing', 4, 'cannonGuard', 0.045)],
    // Unseen, or quick off the mark
    [
      ...or(
        rank('darkLanterns', 'Dark lanterns', 4, 'stealth', 0.1),
        rank('gatheringWay', 'Gathering way', 4, 'acceleration', 0.1),
      ),
    ],
    [...or(rank('eagleEye', 'Eagle eye', 1, 'marksman', 0.2), windward('weatherGauge', 'Weather gauge', 0.06, 0.1))],
  ]),
  branch('hull', 'Hull and crew', 'Light, strong and quickly mended', 'hull', [
    [rank('tarredSeams', 'Tarred seams', 3, 'hull', 0.04), rank('carpenters', 'Carpenters', 2, 'repairRate', 0.15)],
    [
      rank('reinforcedSides', 'Reinforced sides', 3, 'cannonGuard', 0.04),
      rank('ironBow', 'Iron bow', 2, 'biteGuard', 0.06),
    ],
    // Mended in a fight, or more to mend
    [
      ...or(
        rank('damageControl', 'Damage control', 4, 'patchRate', 0.0012),
        rank('bulwarks', 'Bulwarks', 4, 'hull', 0.04),
      ),
    ],
    [rank('oakPlanking', 'Oak planking', 3, 'hull', 0.04), rank('bilgePumps', 'Bilge pumps', 1, 'combatTime', 2)],
    [rank('holdFast', 'Hold fast', 4, 'guard', 0.025)],
    [...or(secondWind(0.15), ironKeel(0.15))],
  ]),
]);

// Tier 4, up to level 40 (31 points): treasure and guns in one deep hull; four branches of 15 points each, a row every
// 3 points spent, six rows, one of two in the middle of a branch and at its end, the two alike in points, so the
// points take any two branches to their ends, with one to spare: the treasure's Prize crew needs the oak walls'
// Shipwrights, the spare point when the oak walls aren't one of the two. Weighed as the tier 1 tree's, on the 24-pounder and
// Heated shot, a full broadside of the same gun in every slot: the broadsides' ×1.78 damage (×1.65 with Keen eye and
// Chain shot); the oak walls' ×1.88 hull in a fight of 30 s; seamanship's ×1.45 damage at a distance and ×1.16 hull
// against guns (×1.69), with the speed and the reach; the treasure's ×1.53, a tenth of the hull back for every kill,
// and the prizes: more room, gold in the chests or goods in the wrecks, and more gold of all or a little more damage
const ROYAL_GALLEON = tree('royalGalleon', 3, [
  branch('broadsides', 'Broadsides', 'Heavy guns, fired all at once', 'gunnery', [
    [rank('heavyShot', 'Heavy shot', 2, 'cannonDamage', 0.04), rank('gunCrews', 'Gun crews', 2, 'cannonReload', 0.04)],
    [rank('fullBroadside', 'Full broadside', 3, 'fullBroadside', 0.05)],
    // Every die harder, or more of them crits
    [...or(rank('steadyHands', 'Steady hands', 3, 'dieBonus', 1), rank('keenEye', 'Keen eye', 3, 'critSooner', 1))],
    [rank('rollingThunder', 'Rolling thunder', 2, 'rollingThunder', 0.1)],
    [rank('harpoonCrews', 'Harpoon crews', 2, 'harpoonDamage', 0.08)],
    [...or(chainShot(), rank('doubleShotted', 'Double-shotted', 1, 'cannonDamage', 0.1))],
  ]),
  branch('seamanship', 'Seamanship', 'A deep hull that still answers the helm: the far fight', 'seamanship', [
    [rank('mainCourses', 'Main courses', 2, 'speed', 0.03), rank('bigRudder', 'Big rudder', 2, 'turn', 0.06)],
    [longGuns('longGuns', 'Long guns', 3, 0.04)],
    [rank('sharpshooters', 'Sharpshooters', 3, 'marksman', 0.1)],
    [rank('evasiveSailing', 'Evasive sailing', 2, 'cannonGuard', 0.07)],
    // Quick off the mark, or hard to slow
    [
      ...or(
        rank('gatheringWay', 'Gathering way', 2, 'acceleration', 0.1),
        rank('heavyWeather', 'Heavy weather', 2, 'holedSpeed', 0.1),
      ),
    ],
    [...or(rank('eagleEye', 'Eagle eye', 1, 'marksman', 0.15), windward('weatherGauge', 'Weather gauge', 0.05, 0.1))],
  ]),
  branch('oakWalls', 'Oak walls', 'A hull built to take a broadside', 'hull', [
    [rank('oakPlanking', 'Oak planking', 2, 'hull', 0.06), rank('shipwrights', 'Shipwrights', 2, 'repairRate', 0.15)],
    [rank('reinforcedSides', 'Reinforced sides', 3, 'cannonGuard', 0.045)],
    // Mended in a fight, or more to mend
    [
      ...or(
        rank('damageControl', 'Damage control', 3, 'patchRate', 0.0015),
        rank('bulwarks', 'Bulwarks', 3, 'hull', 0.06),
      ),
    ],
    [rank('ironBow', 'Iron bow', 1, 'biteGuard', 0.1), rank('bilgePumps', 'Bilge pumps', 1, 'combatTime', 2)],
    [rank('holdFast', 'Hold fast', 2, 'guard', 0.035)],
    [...or(secondWind(0.15), ironKeel(0.15))],
  ]),
  // Gold for the captain and the crew: a little less of a fight than the others, the rest in prizes
  branch('treasure', 'Treasure', 'Gold, prizes and the crews they pay for', 'treasure', [
    [rank('deepHold', 'Deep hold', 2, 'hold', 0.1), rank('finePowder', 'Fine powder', 2, 'cannonDamage', 0.06)],
    [reloadAll('doublePay', 'Double pay', 3, 0.05)],
    // The wrecks' goods, or the chests' gold
    [
      ...or(
        rank('salvagers', 'Salvagers', 3, 'wreckGoods', 0.12),
        rank('gildedChests', 'Gilded chests', 3, 'chestGold', 0.12),
      ),
    ],
    // The prize crew are the oak walls' shipwrights
    [needs(rank('prizeCrew', 'Prize crew', 2, 'prizeCrew', 0.05), 'shipwrights', 1)],
    [rank('hiredMarines', 'Hired marines', 2, 'guard', 0.04)],
    [
      ...or(
        plan(
          'royalTreasury',
          'Royal treasury',
          1,
          '+{n}% gold from bounties, chests, quests and the market',
          { n: 15 },
          {
            gold: 0.15,
          },
        ),
        rank('letterOfMarque', 'Letter of marque', 1, 'damage', 0.08),
      ),
    ],
  ]),
]);

// Tier 5, up to level 50 (39 points): a flagship, its officers and drill; four branches of 19 points each, a row every
// 4 points spent, six rows, ranks up to 4, one of two in the middle of a branch and at its end, so the points take any
// two branches to their ends, with one to spare: command's Fighting tops needs the flag gunnery's Heavy shot, the spare
// point when the flag gunnery isn't one of the two. Weighed as the tier 4 tree's, on the 32-pounder and Explosive shell:
// the flag gunnery's ×1.96 damage (×1.81 with Keen eye and Chain shot); the hull's ×2.04 hull in a fight of 30 s;
// seamanship's ×1.53 damage at a distance and ×1.2 hull against guns (×1.83), with the speed and the reach; command's
// ×1.6 with a Battle cry up 60% of a fight, and every ability 27% sooner (about an eighth more of their damage)
const ADMIRAL = tree('admiral', 4, [
  branch('flagGunnery', 'Flag gunnery', "The flagship's guns: every volley counted", 'gunnery', [
    [rank('gunDrill', 'Gun drill', 3, 'cannonReload', 0.035), rank('heavyShot', 'Heavy shot', 2, 'cannonDamage', 0.05)],
    [rank('fullBroadside', 'Full broadside', 4, 'fullBroadside', 0.045)],
    // Every die harder, or more of them crits
    [...or(rank('steadyHands', 'Steady hands', 4, 'dieBonus', 1), rank('keenEye', 'Keen eye', 4, 'critSooner', 1))],
    [rank('rollingThunder', 'Rolling thunder', 3, 'rollingThunder', 0.08)],
    [rank('harpoonCrews', 'Harpoon crews', 2, 'harpoonDamage', 0.08)],
    [...or(rank('thunderOfTheFlag', 'Thunder of the flag', 1, 'fullBroadside', 0.12), chainShot())],
  ]),
  branch('seamanship', 'Seamanship', 'Speed, reach and the weather gauge: the far fight', 'seamanship', [
    [rank('cleanHull', 'Clean hull', 3, 'speed', 0.02), rank('bigRudder', 'Big rudder', 2, 'turn', 0.05)],
    [longGuns('longGuns', 'Long guns', 4, 0.03)],
    [rank('sharpshooters', 'Sharpshooters', 4, 'marksman', 0.095)],
    [rank('evasiveSailing', 'Evasive sailing', 3, 'cannonGuard', 0.055)],
    // Quick off the mark, or unseen
    [
      ...or(
        rank('gatheringWay', 'Gathering way', 2, 'acceleration', 0.1),
        rank('darkLanterns', 'Dark lanterns', 2, 'stealth', 0.1),
      ),
    ],
    [...or(rank('eagleEye', 'Eagle eye', 1, 'marksman', 0.15), windward('windward', 'Windward', 0.05, 0.1))],
  ]),
  branch('hull', 'Hull and crew', 'The flagship must not strike its colours', 'hull', [
    [rank('oakPlanking', 'Oak planking', 3, 'hull', 0.05), rank('shipwrights', 'Shipwrights', 2, 'repairRate', 0.12)],
    [rank('reinforcedSides', 'Reinforced sides', 4, 'cannonGuard', 0.04)],
    // Mended in a fight, or more to mend
    [
      ...or(
        rank('damageControl', 'Damage control', 4, 'patchRate', 0.0012),
        rank('bulwarks', 'Bulwarks', 4, 'hull', 0.05),
      ),
    ],
    [rank('ironBow', 'Iron bow', 1, 'biteGuard', 0.1), rank('bilgePumps', 'Bilge pumps', 2, 'combatTime', 1)],
    [rank('holdFast', 'Hold fast', 2, 'guard', 0.04)],
    [...or(ironKeel(0.15), secondWind(0.15))],
  ]),
  // The abilities: sooner, and every one a Battle cry for the guns
  branch('command', 'Command', "Officers, drill and the ship's abilities", 'command', [
    [
      rank('drillMaster', 'Drill master', 3, 'cooldown', 0.05),
      rank('veteranOfficers', 'Veteran officers', 2, 'xp', 0.05),
    ],
    [rank('battleCry', 'Battle cry', 4, 'battleCry', 0.06)],
    // The guns, or the hull
    [
      ...or(
        rank('flagCaptain', 'Flag captain', 4, 'damage', 0.05),
        rank('holdTheLine', 'Hold the line', 4, 'guard', 0.035),
      ),
    ],
    [rank('signalFlags', 'Signal flags', 3, 'cooldown', 0.04)],
    // Marksmen in the tops, drilled at the guns
    [needs(rank('fightingTops', 'Fighting tops', 2, 'damage', 0.03), 'heavyShot', 1)],
    [
      ...or(
        flagOfficer('admiralsFlag', "Admiral's flag", 0.06, 0.06, 0.03),
        rank('drumsOfWar', 'Drums of war', 1, 'battleCry', 0.12),
      ),
    ],
  ]),
]);

// Tier 6, up to level 60 (47 points): three gun decks of royal thunder; four branches of 23 points each, a row every 4
// points spent, seven rows, ranks up to 4, one of two in the middle of a branch and at its end, so the points take any
// two branches to their ends, with one to spare: the quarterdeck's Fighting tops needs the lower deck's Heavy shot, the
// spare point when the lower deck isn't one of the two. Weighed as the tier 4 tree's, on the 42-pounder and Royal shot:
// the lower deck's ×2.05 damage up close (×2.02 with Rolling thunder at any reach); the upper deck's ×1.97 (×1.87 its
// harpoons; ×1.78 with Keen eye and Barbed harpoons, for monsters); the oak walls' ×2.19 hull in a fight of 30 s (×2.01
// with Damage control and Iron keel); the quarterdeck's ×1.6–1.7 with a Battle cry up 60% of a fight, every ability a
// quarter sooner, and the speed and the helm
const SHIP_OF_THE_LINE = tree('shipOfTheLine', 4, [
  branch('lowerDeck', 'Lower gun deck', 'The heaviest guns: one broadside to break a ship', 'gunnery', [
    [rank('heavyShot', 'Heavy shot', 3, 'cannonDamage', 0.035), rank('fullCharges', 'Full charges', 2, 'dieBonus', 1)],
    [rank('fullBroadside', 'Full broadside', 4, 'fullBroadside', 0.04)],
    // A run of volleys at one ship, or the guns run out close
    [
      ...or(
        rank('rollingThunder', 'Rolling thunder', 4, 'rollingThunder', 0.06),
        rank('rakingFire', 'Raking fire', 4, 'pointBlank', 0.05),
      ),
    ],
    [rank('ironRain', 'Iron rain', 2, 'cannonCrit', 1), rank('gunDrill', 'Gun drill', 2, 'cannonReload', 0.03)],
    [rank('redHotShot', 'Red-hot shot', 3, 'cannonDamage', 0.035)],
    [rank('broadsideDrill', 'Broadside drill', 2, 'fullBroadside', 0.05)],
    [...or(rank('thunderOfThreeDecks', 'Thunder of three decks', 1, 'fullBroadside', 0.12), chainShot())],
  ]),
  branch('upperDeck', 'Upper gun deck', 'Quick guns, and the harpoons', 'harpoons', [
    [
      rank('quickLoaders', 'Quick loaders', 3, 'cannonReload', 0.035),
      rank('harpoonCrews', 'Harpoon crews', 2, 'harpoonDamage', 0.06),
    ],
    [longGuns('longGuns', 'Long guns', 4, 0.03)],
    // More of the dice crit, or every one harder
    [...or(rank('keenEye', 'Keen eye', 4, 'critSooner', 1), rank('steadyHands', 'Steady hands', 4, 'dieBonus', 1))],
    [reloadAll('gunCaptains', 'Gun captains', 4, 0.025)],
    [rank('swivelCrews', 'Swivel crews', 3, 'damage', 0.05)],
    [reloadAll('twinBatteries', 'Twin batteries', 2, 0.035)],
    [...or(reloadAll('gunDeckDiscipline', 'Gun deck discipline', 1, 0.08), barbedHarpoons())],
  ]),
  branch('oakWalls', 'Oak walls', 'Two feet of oak between the crew and the sea', 'hull', [
    [rank('oakPlanking', 'Oak planking', 3, 'hull', 0.05), rank('shipwrights', 'Shipwrights', 2, 'repairRate', 0.1)],
    [rank('reinforcedSides', 'Reinforced sides', 4, 'cannonGuard', 0.035)],
    // Mended in a fight, or more to mend
    [
      ...or(
        rank('damageControl', 'Damage control', 4, 'patchRate', 0.0013),
        rank('bulwarks', 'Bulwarks', 4, 'hull', 0.05),
      ),
    ],
    [rank('ironBow', 'Iron bow', 2, 'biteGuard', 0.06), rank('bilgePumps', 'Bilge pumps', 2, 'combatTime', 1)],
    [rank('holdFast', 'Hold fast', 3, 'guard', 0.025)],
    [rank('secondPlanking', 'Second planking', 2, 'hull', 0.04)],
    [...or(oakAndIron(0.2), ironKeel(0.2))],
  ]),
  // The abilities: sooner, and every one a Battle cry for the guns
  branch('quarterdeck', 'Quarterdeck', "The captain's deck: the helm, the officers, the abilities", 'command', [
    [rank('bigRudder', 'Big rudder', 3, 'turn', 0.04), rank('mainCourses', 'Main courses', 2, 'speed', 0.025)],
    [rank('drillMaster', 'Drill master', 4, 'cooldown', 0.04)],
    // The guns, or the hull
    [
      ...or(
        rank('flagCaptain', 'Flag captain', 4, 'damage', 0.05),
        rank('holdTheLine', 'Hold the line', 4, 'guard', 0.035),
      ),
    ],
    [rank('battleCry', 'Battle cry', 4, 'battleCry', 0.07)],
    [rank('signalFlags', 'Signal flags', 3, 'cooldown', 0.03)],
    // Marksmen in the tops, drilled at the guns
    [needs(rank('fightingTops', 'Fighting tops', 2, 'damage', 0.035), 'heavyShot', 1)],
    [
      ...or(
        flagOfficer('prideOfTheLine', 'Pride of the line', 0.08, 0.08, 0.03),
        rank('drumsOfWar', 'Drums of war', 1, 'battleCry', 0.14),
      ),
    ],
  ]),
]);

/** The trees of the classes players sail; a class with none (a bot's hull) has NO_TREE */
export const TALENT_TREES: Partial<Readonly<Record<ShipClassId, TalentTree>>> = {
  sloop: SLOOP,
  coastalBark: COASTAL_BARK,
  corsair: CORSAIR,
  frigate: FRIGATE,
  royalGalleon: ROYAL_GALLEON,
  admiral: ADMIRAL,
  shipOfTheLine: SHIP_OF_THE_LINE,
};
