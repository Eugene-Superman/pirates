/**
 * The items the market sells, for doubloons only: scrolls, charms, powders, flags and other things a captain takes to
 * sea, used from the skill bar's quick slots (items/quickSlots.ts). What each is to do is only planned for now, its text
 * and figures saying what and how much: bought and put on the bar, an item does nothing yet. docs/items.md tells how
 * each is to work, and what must be decided first. Figures are provisional
 */

/** The groups the market shows the items in */
export type ItemCategory =
  'experience' | 'defence' | 'escape' | 'movement' | 'control' | 'strike' | 'scouting' | 'loot' | 'artifact' | 'looks';

export interface ItemGroup {
  readonly name: string;
  /** What its items are for, for the player */
  readonly text: string;
}

export const ITEM_CATEGORIES: Readonly<Record<ItemCategory, ItemGroup>> = {
  experience: {
    name: 'Experience and quests',
    text: "More experience, and quests done sooner: it adds to the talents' and the mastery's",
  },
  defence: {
    name: 'Repairs and defence',
    text: 'The hull mended in a fight, blows turned aside, the way home after a wreck',
  },
  escape: { name: 'Hiding and getting away', text: 'Out of sight, out of the fight, back in port' },
  movement: { name: 'Seamanship', text: 'Leaps, turns and getting free: never more speed, which the talents give' },
  control: {
    name: 'Holding the foe',
    text: 'The foe held, silenced, blinded, thrown back or won over: no talent does it',
  },
  strike: { name: 'Strikes and help', text: 'Fire, venom, lightning, and ships that come to fight beside you' },
  scouting: { name: 'Scouting', text: 'The fog lifted, the bots found, the boss foretold' },
  loot: { name: 'Loot and gold', text: 'Bounties, chests, treasures and trade at sea, each its own way' },
  artifact: { name: 'Artifacts', text: 'Rare things that work a long while: one at a time' },
  looks: { name: 'Looks', text: 'For the eye and the ear only: they change nothing in a fight' },
};

export const ITEM_CATEGORY_IDS: readonly ItemCategory[] = [
  'experience',
  'defence',
  'escape',
  'movement',
  'control',
  'strike',
  'scouting',
  'loot',
  'artifact',
  'looks',
];

export type ItemId =
  | 'cabinBoysScroll'
  | 'navigatorsScroll'
  | 'captainsScroll'
  | 'watchLog'
  | 'oldBosunsWisdom'
  | 'fleetLog'
  | 'letterOfRecommendation'
  | 'trophyPennant'
  | 'couriersSeal'
  | 'canvasPatch'
  | 'spareTimbers'
  | 'shipyardWarrant'
  | 'poseidonsAegis'
  | 'stElmosCharm'
  | 'mirrorBrass'
  | 'boardingNets'
  | 'shipsBell'
  | 'charonsObol'
  | 'smokePots'
  | 'fogCloak'
  | 'whiteFlag'
  | 'homewardCompass'
  | 'admiraltyPass'
  | 'decoyRaft'
  | 'lighthouseInABottle'
  | 'bottledGale'
  | 'galleySweeps'
  | 'kedgeAnchor'
  | 'riggingGrease'
  | 'ghostShipNail'
  | 'grapplingHooks'
  | 'soakedPowder'
  | 'whaleboneNet'
  | 'hornOfDread'
  | 'flashPowder'
  | 'jollyRoger'
  | 'neptunesWrath'
  | 'whirlpoolFlask'
  | 'oilSlick'
  | 'towHarpoon'
  | 'phosphorPaint'
  | 'tamersWhistle'
  | 'bribePurse'
  | 'greekFire'
  | 'jellyfishVenom'
  | 'skippingShot'
  | 'blessedShot'
  | 'thunderbolt'
  | 'fireship'
  | 'hiredSloop'
  | 'phantomFrigate'
  | 'hourglassOfTides'
  | 'signalFlare'
  | 'gullsEye'
  | 'huntersCompass'
  | 'barometer'
  | 'lookoutParrot'
  | 'luckyCoin'
  | 'goldenHook'
  | 'blackSpot'
  | 'wantedPoster'
  | 'challengeHorn'
  | 'mapScrap'
  | 'treasureMap'
  | 'mysteryStrongbox'
  | 'billOfExchange'
  | 'fishingNets'
  | 'powderTender'
  | 'sailorsCharm'
  | 'stormOrb'
  | 'drownedKingsCrown'
  | 'enchantedWheel'
  | 'phoenixFeather'
  | 'fireworks'
  | 'sailDye'
  | 'captainsBanner'
  | 'colouredWake'
  | 'portraitFrame'
  | 'shantySingers'
  | 'dolphinEscort';

/** The numbers an item's text shows, by their names in it (`{n}`) */
export type ItemFigures = Readonly<Record<string, number>>;

export interface Item {
  readonly id: ItemId;
  readonly category: ItemCategory;
  readonly name: string;
  /** What it is to do, for the player: English, its figures by name */
  readonly text: string;
  readonly figures: ItemFigures;
  /** Doubloons a piece: items are never sold for gold, which a player farms */
  readonly price: number;
}

function item(
  id: ItemId,
  category: ItemCategory,
  name: string,
  price: number,
  text: string,
  figures: ItemFigures = {},
): Item {
  return { id, category, name, text, figures, price };
}

// What no talent, signature or passive of the captain's mastery does, but more experience, which adds to theirs: no
// item gives a share more speed, damage, hull, reload, reach, gold or room, a slow, a share of damage taken off, the
// hull mended a second or a blow that leaves the ship afloat. Times are in the text: seconds (s), minutes (min), hours
// (h), days (d)
// prettier-ignore
export const ITEMS: Readonly<Record<ItemId, Item>> = {
  cabinBoysScroll: item('cabinBoysScroll', 'experience', "Cabin boy's scroll", 3, '+{n}% experience for the ships and monsters you sink, for {min} min', { n: 10, min: 30 }),
  navigatorsScroll: item('navigatorsScroll', 'experience', "Navigator's scroll", 8, '+{n}% experience for the ships and monsters you sink, for {min} min', { n: 25, min: 30 }),
  captainsScroll: item('captainsScroll', 'experience', "Captain's scroll", 25, '+{n}% experience for the ships and monsters you sink and for quests, for {min} min', { n: 50, min: 60 }),
  watchLog: item('watchLog', 'experience', 'Watch log', 15, '×{n} experience for the next {k} ships and monsters you sink', { n: 2, k: 25 }),
  oldBosunsWisdom: item('oldBosunsWisdom', 'experience', "Old bosun's wisdom", 6, 'For {min} min, the bots of your tier give all their experience, however many levels below your ship they are', { min: 30 }),
  fleetLog: item('fleetLog', 'experience', 'Fleet log', 12, 'For {min} min, a ship of yours laid up in port, the one you pick, earns {n}% of the experience your ship does', { min: 60, n: 30 }),
  letterOfRecommendation: item('letterOfRecommendation', 'experience', 'Letter of recommendation', 4, 'The next quest you turn in gives ×{n} experience', { n: 2 }),
  trophyPennant: item('trophyPennant', 'experience', 'Trophy pennant', 10, 'For {min} min, every ship and monster you sink counts twice for your quests', { min: 30 }),
  couriersSeal: item('couriersSeal', 'experience', "Courier's seal", 2, 'Turns a quest that is done in at sea, with no need to sail to port'),

  canvasPatch: item('canvasPatch', 'defence', 'Canvas patch', 1, 'Mends {n}% of the hull at once, in a fight too. Once every {s} s', { n: 15, s: 60 }),
  spareTimbers: item('spareTimbers', 'defence', 'Spare timbers', 2, 'Mends {n}% of the hull at once, in a fight too. Once every {min} min', { n: 35, min: 2 }),
  shipyardWarrant: item('shipyardWarrant', 'defence', 'Shipyard warrant', 3, 'Mends the whole hull at once, at sea, out of combat'),
  poseidonsAegis: item('poseidonsAegis', 'defence', "Poseidon's aegis", 4, 'For {s} s, a shield over the hull takes blows worth {n}% of it before the hull does', { s: 10, n: 30 }),
  stElmosCharm: item('stElmosCharm', 'defence', "St. Elmo's charm", 10, 'For {s} s, no blow does your ship any damage. Once every {min} min', { s: 3, min: 3 }),
  mirrorBrass: item('mirrorBrass', 'defence', 'Mirror brass', 3, 'For {s} s, {n}% of the damage you take strikes back at whoever dealt it', { s: 10, n: 30 }),
  boardingNets: item('boardingNets', 'defence', 'Boarding nets', 2, 'For {s} s, nothing can stop your ship, silence its guns, pull it or throw it back', { s: 20 }),
  shipsBell: item('shipsBell', 'defence', "Ship's bell", 1, "For {min} min, a boss's mortar shells marked under you land twice as late", { min: 2 }),
  charonsObol: item('charonsObol', 'defence', "Charon's obol", 2, 'Your ship, sunk, is back by the port at once, with no wait'),

  smokePots: item('smokePots', 'escape', 'Smoke pots', 2, 'For {s} s, nobody sees or aims at your ship: foes lose it, shots on their way fall into the sea. Firing ends it', { s: 5 }),
  fogCloak: item('fogCloak', 'escape', 'Fog cloak', 8, 'For {s} s, nobody sees your ship until it fires: bots sail by', { s: 20 }),
  whiteFlag: item('whiteFlag', 'escape', 'White flag', 4, 'Ends the fight at once: whoever attacked you sails off, and you hold fire for {s} s. Once every {min} min', { s: 10, min: 5 }),
  homewardCompass: item('homewardCompass', 'escape', 'Homeward compass', 1, 'Stand still out of combat for {s} s, and your ship is back by the port', { s: 10 }),
  admiraltyPass: item('admiraltyPass', 'escape', 'Admiralty pass', 2, 'The next gate lets you through in a fight too'),
  decoyRaft: item('decoyRaft', 'escape', 'Decoy raft', 2, 'Drops a raft with a scarecrow astern: for {s} s, every foe within {r} fires at it, not at you', { s: 6, r: 300 }),
  lighthouseInABottle: item('lighthouseInABottle', 'escape', 'Lighthouse in a bottle', 6, 'Sets a buoy where your ship is: for {h} h, you can be back at it in an instant, once', { h: 1 }),

  bottledGale: item('bottledGale', 'movement', 'Bottled gale', 2, 'Your ship leaps {n} ahead at once. Once every {s} s', { n: 150, s: 30 }),
  galleySweeps: item('galleySweeps', 'movement', 'Galley sweeps', 2, 'For {s} s, your ship turns on the spot and loses no speed in turns', { s: 20 }),
  kedgeAnchor: item('kedgeAnchor', 'movement', 'Kedge anchor', 1, 'Turns your ship about at once'),
  riggingGrease: item('riggingGrease', 'movement', 'Rigging grease', 1, 'Clears every slow off your ship, and none takes hold for {s} s', { s: 15 }),
  ghostShipNail: item('ghostShipNail', 'movement', 'Ghost ship nail', 4, 'For {h} h, your ship sails through other ships', { h: 1 }),

  grapplingHooks: item('grapplingHooks', 'control', 'Grappling hooks', 2, 'The target, within {r}, is held still for {s} s', { r: 150, s: 3 }),
  soakedPowder: item('soakedPowder', 'control', 'Soaked powder', 3, 'The ship you aim at cannot fire for {s} s', { s: 4 }),
  whaleboneNet: item('whaleboneNet', 'control', 'Whalebone net', 2, 'The monster you aim at cannot bite for {s} s', { s: 5 }),
  hornOfDread: item('hornOfDread', 'control', 'Horn of dread', 3, 'For {s} s, every foe within {r} reloads {n}% slower', { s: 8, r: 300, n: 40 }),
  flashPowder: item('flashPowder', 'control', 'Flash powder', 3, "For {s} s, half the target's dice miss", { s: 6 }),
  jollyRoger: item('jollyRoger', 'control', 'Jolly Roger', 2, 'The bots of lower levels within {r} flee from you for {s} s', { r: 300, s: 5 }),
  neptunesWrath: item('neptunesWrath', 'control', "Neptune's wrath", 3, 'A wave throws every foe within {r} back by {n}', { r: 200, n: 150 }),
  whirlpoolFlask: item('whirlpoolFlask', 'control', 'Whirlpool flask', 5, 'A whirlpool for {s} s draws every foe within {r} into its middle and spins it round', { s: 5, r: 120 }),
  oilSlick: item('oilSlick', 'control', 'Oil slick', 2, 'Leaves a slick astern for {s} s: a foe that sails into it cannot steer for {k} s', { s: 12, k: 3 }),
  towHarpoon: item('towHarpoon', 'control', 'Tow harpoon', 2, 'Pulls the target {n} towards you', { n: 120 }),
  phosphorPaint: item('phosphorPaint', 'control', 'Phosphor paint', 2, 'For {s} s, the target shows through the fog and cannot hide', { s: 60 }),
  tamersWhistle: item('tamersWhistle', 'control', "Tamer's whistle", 6, 'The monster you aim at, not a boss, fights on your side for {s} s', { s: 15 }),
  bribePurse: item('bribePurse', 'control', 'Bribe purse', 10, "A boss's escort stays out of this fight"),

  greekFire: item('greekFire', 'strike', 'Greek fire', 3, 'Your next {k} cannon volleys set the target alight: {n}% more of their damage over {s} s', { k: 3, n: 50, s: 5 }),
  jellyfishVenom: item('jellyfishVenom', 'strike', 'Jellyfish venom', 3, 'Your next {k} harpoon volleys poison a monster: {n}% more of their damage over {s} s', { k: 3, n: 60, s: 6 }),
  skippingShot: item('skippingShot', 'strike', 'Skipping shot', 2, 'Your next volley skips on to one more foe within {r}, with half its damage', { r: 150 }),
  blessedShot: item('blessedShot', 'strike', 'Blessed shot', 2, 'For {s} s, none of your dice miss', { s: 60 }),
  thunderbolt: item('thunderbolt', 'strike', 'Thunderbolt', 4, 'Lightning strikes the target, not a boss, for {n}% of its whole hull', { n: 6 }),
  fireship: item('fireship', 'strike', 'Fireship', 7, 'A burning boat sails at the target by itself, blows up and leaves the sea round it on fire for {s} s', { s: 6 }),
  hiredSloop: item('hiredSloop', 'strike', 'Hired sloop', 5, 'For {s} s, a ship of your tier sails with you and fires at your target', { s: 20 }),
  phantomFrigate: item('phantomFrigate', 'strike', 'Phantom frigate', 20, 'For {s} s, a ghost ship twice as strong sails with you: nothing can hit it', { s: 30 }),
  hourglassOfTides: item('hourglassOfTides', 'strike', 'Hourglass of tides', 12, "Every one of your ship's abilities (F, G, T) is ready at once. Once every {min} min", { min: 10 }),

  signalFlare: item('signalFlare', 'scouting', 'Signal flare', 1, 'Lifts the fog for {s} s within {r} of where you point', { s: 20, r: 600 }),
  gullsEye: item('gullsEye', 'scouting', "Gull's eye", 2, 'For {min} min, the sea chart shows every bot of the sea', { min: 5 }),
  huntersCompass: item('huntersCompass', 'scouting', "Hunter's compass", 1, 'For {min} min, an arrow points to the nearest bot your quests ask for', { min: 15 }),
  barometer: item('barometer', 'scouting', 'Barometer', 1, "Tells when and where the sea's boss comes"),
  lookoutParrot: item('lookoutParrot', 'scouting', 'Lookout parrot', 5, 'For {h} h, it cries out when a hostile bot comes at you out of the fog', { h: 2 }),

  luckyCoin: item('luckyCoin', 'loot', 'Lucky coin', 5, 'For {min} min, a ship or monster you sink has a {n}% chance to pay ×{k} its bounty', { min: 30, n: 5, k: 10 }),
  goldenHook: item('goldenHook', 'loot', 'Golden hook', 5, 'For {min} min, the monsters you sink leave chests of gold too', { min: 30 }),
  blackSpot: item('blackSpot', 'loot', 'Black spot', 4, 'Marks the target, not a boss: sunk within {s} s, it pays ×{n} its bounty and leaves a chest', { s: 30, n: 3 }),
  wantedPoster: item('wantedPoster', 'loot', 'Wanted poster', 8, "A wanted captain comes near, stronger than the sea's elite: ×{n} the bounty and a chest", { n: 5 }),
  challengeHorn: item('challengeHorn', 'loot', 'Challenge horn', 15, "The sea's boss comes at once, if its lair is empty"),
  mapScrap: item('mapScrap', 'loot', 'Map scrap', 2, 'Marks a small treasure of this sea on the chart'),
  treasureMap: item('treasureMap', 'loot', 'Treasure map', 12, 'Marks a great treasure of this sea on the chart, guarded by pirates; later with ancient relics in it'),
  mysteryStrongbox: item('mysteryStrongbox', 'loot', 'Mystery strongbox', 6, 'Opened, it gives gold, one of these items or, now and then, doubloons'),
  billOfExchange: item('billOfExchange', 'loot', 'Bill of exchange', 1, 'Sells everything in the hold at sea, for {n}% of what the market pays', { n: 75 }),
  fishingNets: item('fishingNets', 'loot', 'Fishing nets', 1, 'For {min} min, out of combat, a fish comes into the hold every {s} s', { min: 30, s: 20 }),
  powderTender: item('powderTender', 'loot', 'Powder tender', 1, "Buys ammo at sea once, at the arsenal's prices"),

  sailorsCharm: item('sailorsCharm', 'artifact', "Sailor's charm", 10, 'For {h} h, the first blow at you every {min} min misses', { h: 2, min: 5 }),
  stormOrb: item('stormOrb', 'artifact', 'Storm orb', 20, 'For {h} h, lightning strikes the nearest foe within {r} every {s} s', { h: 1, r: 300, s: 15 }),
  drownedKingsCrown: item('drownedKingsCrown', 'artifact', "Drowned king's crown", 30, 'For {h} h, every ship you sink rises as a ghost and fights for you for {s} s', { h: 1, s: 10 }),
  enchantedWheel: item('enchantedWheel', 'artifact', 'Enchanted wheel', 12, 'For {h} h, your ship keeps the best distance from the target it attacks by itself', { h: 1 }),
  phoenixFeather: item('phoenixFeather', 'artifact', 'Phoenix feather', 40, 'Once a day, your ship, sunk, rises where it went down {s} s later, its hull whole', { s: 5 }),

  fireworks: item('fireworks', 'looks', 'Fireworks', 1, 'A salute in the sky over your ship, for everyone round to see'),
  sailDye: item('sailDye', 'looks', 'Sail dye', 50, "A colour of your choice for a ship's sails, for good"),
  captainsBanner: item('captainsBanner', 'looks', "Captain's banner", 30, 'A flag of your own on the mast, for good'),
  colouredWake: item('colouredWake', 'looks', 'Coloured wake', 15, "A colour for your ship's wake, for {d} days", { d: 7 }),
  portraitFrame: item('portraitFrame', 'looks', 'Portrait frame', 20, "A gold or a silver frame round your captain's portrait, for good"),
  shantySingers: item('shantySingers', 'looks', 'Shanty singers', 2, 'Sea shanties aboard your ship for {h} h', { h: 1 }),
  dolphinEscort: item('dolphinEscort', 'looks', 'Dolphin escort', 5, 'Dolphins swim beside your ship for {h} h', { h: 1 }),
};

/** Every item, in the market's order: by its group, as ITEM_CATEGORY_IDS, then as listed */
export const ITEM_IDS: readonly ItemId[] = Object.values(ITEMS).map((it) => it.id);

export function isItem(value: unknown): value is ItemId {
  return typeof value === 'string' && Object.hasOwn(ITEMS, value);
}
