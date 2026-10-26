import type { CurrencyId } from '../economy/currencies';
import { SHIP_CLASSES, type PlayerLineId, type ShipClass, type ShipClassId } from './shipClasses';

/**
 * Every ship of the lines players sail, built or planned. A built one is a class of SHIP_CLASSES (its own model,
 * atlases and figures); a planned one has only a name, a role, provisional figures and how it will be got, for the
 * shipyard to show until it is built. Building one: its class in SHIP_CLASSES under the same id (docs/ships.md), its
 * row of PLANNED gone
 */
export type LineShipId =
  | 'sloop'
  | 'coastalBark'
  | 'corsair'
  | 'frigate'
  | 'royalGalleon'
  | 'admiral'
  | 'shipOfTheLine'
  | 'riverJunk'
  | 'seaMerchant'
  | 'dragonSentinel'
  | 'celestialFrigate'
  | 'imperialJunk'
  | 'dragonArmada'
  | 'smuggler'
  | 'seaWolf'
  | 'blackCorsair'
  | 'avenger'
  | 'stormPhantom'
  | 'abyssLord'
  | 'breaker'
  | 'seaRaider'
  | 'wolfShip'
  | 'iceJarl'
  | 'stormPetrel'
  | 'jormungandr'
  | 'forgotten'
  | 'shellback'
  | 'duelist'
  | 'willOWisp'
  | 'cursedGalleon'
  | 'baronsShadow'
  | 'oathkeeper'
  | 'aurora'
  | 'soulReaper'
  | 'gladiator'
  | 'serpentSpine'
  | 'ironCovenant'
  | 'blackOracle'
  | 'sirensSong'
  | 'conqueror'
  | 'bastion'
  | 'seaDevourer'
  | 'paleAdmiral'
  | 'phoenix'
  | 'champion'
  | 'abyssThrone'
  | 'eternalArmada'
  | 'leviathan'
  | 'starfall'
  | 'gildedSwallow'
  | 'jadeLotus'
  | 'velvetRose'
  | 'silverFjord'
  | 'crownJewel'
  | 'moonlitDragon'
  | 'rubyCorsair'
  | 'valhalla'
  | 'sunKing'
  | 'empressOfWaves'
  | 'midnightSun'
  | 'mirage';

/** A ship not built yet: its id once it is, while it isn't a class */
type PlannedShipId = Exclude<LineShipId, ShipClassId>;

/** A line players sail: its name, what it is for in a fight, and its ships, tier 1 first */
export interface ShipLine {
  readonly id: PlayerLineId;
  readonly name: string;
  readonly role: string;
  readonly ships: readonly LineShipId[];
}

/** The figures the shipyard shows of a ship: the class's own, before outfit and talents */
export interface ShipFigures {
  readonly hp: number;
  /** World units per second */
  readonly maxSpeed: number;
  /** Radians per second */
  readonly turnSpeed: number;
  readonly cannons: number;
  readonly harpoons: number;
  readonly hold: number;
  readonly viewRange: number;
}

/**
 * Where a ship is got: the starter, the shipyard's ladder (gold and the Captain's path), the Forbidden Fleets' six ways,
 * each paid in its own currency, and the masterworks, bought with doubloons
 */
export type ShipSourceId = 'starter' | 'shipyard' | 'hunt' | 'boss' | 'craft' | 'arena' | 'event' | 'guild' | 'premium';

export interface ShipSource {
  readonly name: string;
  /** What its ships are paid in; null: given */
  readonly currency: CurrencyId | null;
}

export const SHIP_SOURCES: Readonly<Record<ShipSourceId, ShipSource>> = {
  starter: { name: "Every captain's first ship", currency: null },
  shipyard: { name: 'The shipyard', currency: 'gold' },
  hunt: { name: 'Sea monster hunts', currency: 'pearls' },
  boss: { name: 'Boss fights', currency: 'seals' },
  craft: { name: 'Treasure maps', currency: 'relics' },
  arena: { name: 'The arena', currency: 'glory' },
  event: { name: 'Events', currency: 'tokens' },
  guild: { name: 'Guild battles', currency: 'honour' },
  premium: { name: 'Doubloons', currency: 'doubloons' },
};

/** How a ship is got: where, for how much of that source's currency (null: not set yet), and what else it asks */
export interface ShipTerms {
  readonly source: ShipSourceId;
  readonly price: number | null;
  /** In a few words, English (translated where shown); empty when the source's own rule says it all */
  readonly terms: string;
}

/** A ship of a line as the shipyard shows it */
export interface LineShip {
  readonly id: LineShipId;
  readonly line: PlayerLineId;
  /** 1 to 6 */
  readonly tier: number;
  readonly name: string;
  /** What it is for, in a few words */
  readonly role: string;
  /** Its class once built: null while it is planned, and its figures are provisional */
  readonly built: ShipClass | null;
  readonly figures: ShipFigures;
  readonly obtain: ShipTerms;
}

export const SHIP_LINES: Readonly<Record<PlayerLineId, ShipLine>> = {
  starter: { id: 'starter', name: 'Starter ships', role: 'The first ship of every captain', ships: ['sloop'] },
  european: {
    id: 'european',
    name: 'Royal Navies',
    role: 'All-rounders: guns, speed and hull in balance',
    ships: ['coastalBark', 'corsair', 'frigate', 'royalGalleon', 'admiral', 'shipOfTheLine'],
  },
  eastern: {
    id: 'eastern',
    name: 'Empires of the East',
    role: 'Agile and fast, with special abilities',
    ships: ['riverJunk', 'seaMerchant', 'dragonSentinel', 'celestialFrigate', 'imperialJunk', 'dragonArmada'],
  },
  pirate: {
    id: 'pirate',
    name: 'Brotherhood of the Black Flag',
    role: 'Heavy broadsides, ambushes and aggressive play',
    ships: ['smuggler', 'seaWolf', 'blackCorsair', 'avenger', 'stormPhantom', 'abyssLord'],
  },
  northern: {
    id: 'northern',
    name: 'Clans of the Frozen Seas',
    role: 'Tough hulls, rams and fierce attacks up close',
    ships: ['breaker', 'seaRaider', 'wolfShip', 'iceJarl', 'stormPetrel', 'jormungandr'],
  },
  legendary: {
    id: 'legendary',
    name: 'Forbidden Fleets',
    role: 'Unique effects and rare abilities, hard to obtain',
    // prettier-ignore
    ships: [
      'forgotten', 'shellback', 'duelist', 'willOWisp',
      'cursedGalleon', 'baronsShadow', 'oathkeeper', 'aurora',
      'soulReaper', 'gladiator', 'serpentSpine', 'ironCovenant',
      'blackOracle', 'sirensSong', 'conqueror', 'bastion',
      'seaDevourer', 'paleAdmiral', 'phoenix', 'champion',
      'abyssThrone', 'eternalArmada', 'leviathan', 'starfall',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Masterworks',
    role: 'Bought with doubloons: as strong as their tier, finer to look at',
    // prettier-ignore
    ships: [
      'gildedSwallow', 'jadeLotus', 'velvetRose', 'silverFjord', 'crownJewel', 'moonlitDragon',
      'rubyCorsair', 'valhalla', 'sunKing', 'empressOfWaves', 'midnightSun', 'mirage',
    ],
  },
};

/** The lines a player goes on in after the starter sloop, in the shipyard's order: the masterworks last */
export const SHIPYARD_LINES: readonly PlayerLineId[] = [
  'european',
  'eastern',
  'pirate',
  'northern',
  'legendary',
  'premium',
];

// The planned ships' provisional figures: the European line's ladder (the Coastal Bark's own figures at tier 1, then
// about 1.5 times the hull and the guns a tier, the hold and the sight growing slower, the turn slower), each line
// leaning its own way. Guns: about as many harpoon guns as cannons in the European line; the East 15% fewer guns, a
// little more than half of them harpoon guns; the pirates a tenth more, about two cannons to each harpoon gun; the
// North about two harpoon guns to each cannon; the Forbidden Fleets a twentieth more, each ship its own way (the Sea
// Devourer three harpoon guns to a cannon, the Cursed Galleon nearly two cannons to a harpoon gun). The rest: the
// East a sixth less hull for 1.5 knots and a quarter more turn; the pirates a tenth less hull; the North a third
// more hull for half a knot and some sight; the Forbidden Fleets a tenth more of nearly everything for a smaller
// hold (they are hard to obtain). A ship leans a little further its own way (the Sea Merchant's hold, the Black
// Oracle's sight, the Shellback's hull). A masterwork has the figures of its line's ship of its tier, give or take a
// little: what is paid for is its looks. To be balanced when each is built
// prettier-ignore
const PLANNED: Readonly<Record<PlannedShipId, { readonly name: string; readonly tier: number } & ShipFigures>> = {
  // The Royal Navies (the Coastal Bark, tier 1, is built)
  corsair:          { name: 'Corsair',                   tier: 2, hp: 1300, maxSpeed: 130, turnSpeed: 1.45, cannons: 12, harpoons: 12, hold:  80, viewRange: 640 },
  frigate:          { name: 'Frigate',                   tier: 3, hp: 1900, maxSpeed: 140, turnSpeed: 1.35, cannons: 20, harpoons: 16, hold: 100, viewRange: 700 },
  royalGalleon:     { name: 'Royal Galleon',             tier: 4, hp: 3150, maxSpeed: 125, turnSpeed: 1.20, cannons: 30, harpoons: 25, hold: 150, viewRange: 700 },
  admiral:          { name: 'Admiral',                   tier: 5, hp: 4300, maxSpeed: 135, turnSpeed: 1.10, cannons: 36, harpoons: 36, hold: 160, viewRange: 740 },
  shipOfTheLine:    { name: 'Imperial Ship of the Line', tier: 6, hp: 6000, maxSpeed: 135, turnSpeed: 1.00, cannons: 50, harpoons: 50, hold: 200, viewRange: 780 },
  // The Empires of the East
  riverJunk:        { name: 'River Junk',                tier: 1, hp:  700, maxSpeed: 140, turnSpeed: 1.95, cannons:  6, harpoons:  7, hold:  55, viewRange: 640 },
  seaMerchant:      { name: 'Sea Merchant',              tier: 2, hp: 1100, maxSpeed: 145, turnSpeed: 1.80, cannons: 10, harpoons:  7, hold:  95, viewRange: 680 },
  dragonSentinel:   { name: 'Dragon Sentinel',           tier: 3, hp: 1900, maxSpeed: 145, turnSpeed: 1.70, cannons: 12, harpoons: 18, hold:  90, viewRange: 720 },
  celestialFrigate: { name: 'Celestial Frigate',         tier: 4, hp: 2400, maxSpeed: 150, turnSpeed: 1.60, cannons: 20, harpoons: 24, hold: 115, viewRange: 760 },
  imperialJunk:     { name: 'Imperial Junk',             tier: 5, hp: 3650, maxSpeed: 150, turnSpeed: 1.40, cannons: 28, harpoons: 34, hold: 145, viewRange: 780 },
  dragonArmada:     { name: 'Dragon Armada',             tier: 6, hp: 5100, maxSpeed: 150, turnSpeed: 1.25, cannons: 38, harpoons: 47, hold: 180, viewRange: 820 },
  // The Brotherhood of the Black Flag
  smuggler:         { name: 'Smuggler',                  tier: 1, hp:  700, maxSpeed: 135, turnSpeed: 1.65, cannons: 10, harpoons:  5, hold:  80, viewRange: 600 },
  seaWolf:          { name: 'Sea Wolf',                  tier: 2, hp: 1150, maxSpeed: 135, turnSpeed: 1.50, cannons: 18, harpoons:  8, hold:  90, viewRange: 640 },
  blackCorsair:     { name: 'Black Corsair',             tier: 3, hp: 1800, maxSpeed: 140, turnSpeed: 1.40, cannons: 30, harpoons: 12, hold: 110, viewRange: 680 },
  avenger:          { name: 'Avenger',                   tier: 4, hp: 2700, maxSpeed: 135, turnSpeed: 1.25, cannons: 40, harpoons: 17, hold: 145, viewRange: 700 },
  stormPhantom:     { name: 'Storm Phantom',             tier: 5, hp: 3500, maxSpeed: 150, turnSpeed: 1.20, cannons: 56, harpoons: 24, hold: 175, viewRange: 760 },
  abyssLord:        { name: 'Lord of the Abyss',         tier: 6, hp: 5650, maxSpeed: 135, turnSpeed: 1.05, cannons: 90, harpoons: 30, hold: 220, viewRange: 780 },
  // The Clans of the Frozen Seas
  breaker:          { name: 'Breaker',                   tier: 1, hp: 1050, maxSpeed: 120, turnSpeed: 1.55, cannons:  6, harpoons:  9, hold:  60, viewRange: 560 },
  seaRaider:        { name: 'Sea Raider',                tier: 2, hp: 1700, maxSpeed: 125, turnSpeed: 1.40, cannons:  6, harpoons: 16, hold:  80, viewRange: 600 },
  wolfShip:         { name: 'Wolf Ship',                 tier: 3, hp: 2600, maxSpeed: 130, turnSpeed: 1.30, cannons: 10, harpoons: 24, hold: 100, viewRange: 640 },
  iceJarl:          { name: 'Ice Jarl',                  tier: 4, hp: 4300, maxSpeed: 120, turnSpeed: 1.15, cannons: 18, harpoons: 32, hold: 130, viewRange: 660 },
  stormPetrel:      { name: 'Storm Petrel',              tier: 5, hp: 5050, maxSpeed: 140, turnSpeed: 1.15, cannons: 24, harpoons: 35, hold: 160, viewRange: 720 },
  jormungandr:      { name: 'Jörmungandr',               tier: 6, hp: 7800, maxSpeed: 130, turnSpeed: 0.95, cannons: 28, harpoons: 66, hold: 200, viewRange: 740 },
  // The Forbidden Fleets, four to a tier
  forgotten:        { name: 'The Forgotten',             tier: 1, hp:  900, maxSpeed: 135, turnSpeed: 1.70, cannons:  8, harpoons:  8, hold:  50, viewRange: 700 },
  shellback:        { name: 'Shellback',                 tier: 1, hp: 1050, maxSpeed: 125, turnSpeed: 1.55, cannons:  6, harpoons: 11, hold:  50, viewRange: 660 },
  duelist:          { name: 'Duelist',                   tier: 1, hp:  800, maxSpeed: 140, turnSpeed: 1.90, cannons: 10, harpoons:  7, hold:  50, viewRange: 660 },
  willOWisp:        { name: "Will-o'-the-Wisp",          tier: 1, hp:  800, maxSpeed: 145, turnSpeed: 1.70, cannons:  8, harpoons:  8, hold:  50, viewRange: 700 },
  cursedGalleon:    { name: 'Cursed Galleon',            tier: 2, hp: 1450, maxSpeed: 140, turnSpeed: 1.60, cannons: 16, harpoons:  9, hold:  65, viewRange: 700 },
  baronsShadow:     { name: "Baron's Shadow",            tier: 2, hp: 1450, maxSpeed: 140, turnSpeed: 1.60, cannons: 18, harpoons:  9, hold:  65, viewRange: 700 },
  oathkeeper:       { name: 'Oathkeeper',                tier: 2, hp: 1550, maxSpeed: 140, turnSpeed: 1.60, cannons: 12, harpoons: 13, hold:  65, viewRange: 700 },
  aurora:           { name: 'Aurora',                    tier: 2, hp: 1450, maxSpeed: 145, turnSpeed: 1.60, cannons: 12, harpoons: 13, hold:  65, viewRange: 740 },
  soulReaper:       { name: 'Soul Reaper',               tier: 3, hp: 2200, maxSpeed: 145, turnSpeed: 1.50, cannons: 22, harpoons: 15, hold:  80, viewRange: 740 },
  gladiator:        { name: 'Gladiator',                 tier: 3, hp: 2300, maxSpeed: 145, turnSpeed: 1.50, cannons: 20, harpoons: 17, hold:  80, viewRange: 740 },
  serpentSpine:     { name: "Serpent's Spine",           tier: 3, hp: 2200, maxSpeed: 150, turnSpeed: 1.55, cannons: 12, harpoons: 26, hold:  80, viewRange: 740 },
  ironCovenant:     { name: 'Iron Covenant',             tier: 3, hp: 2550, maxSpeed: 140, turnSpeed: 1.50, cannons: 20, harpoons: 17, hold:  80, viewRange: 740 },
  blackOracle:      { name: 'Black Oracle',              tier: 4, hp: 3150, maxSpeed: 140, turnSpeed: 1.30, cannons: 24, harpoons: 25, hold: 105, viewRange: 860 },
  sirensSong:       { name: "Siren's Song",              tier: 4, hp: 3300, maxSpeed: 140, turnSpeed: 1.45, cannons: 22, harpoons: 27, hold: 105, viewRange: 800 },
  conqueror:        { name: 'Conqueror',                 tier: 4, hp: 3300, maxSpeed: 140, turnSpeed: 1.30, cannons: 36, harpoons: 24, hold: 105, viewRange: 760 },
  bastion:          { name: 'Bastion',                   tier: 4, hp: 3950, maxSpeed: 130, turnSpeed: 1.20, cannons: 28, harpoons: 27, hold: 105, viewRange: 760 },
  seaDevourer:      { name: 'Sea Devourer',              tier: 5, hp: 5300, maxSpeed: 140, turnSpeed: 1.20, cannons: 18, harpoons: 57, hold: 130, viewRange: 800 },
  paleAdmiral:      { name: 'Pale Admiral',              tier: 5, hp: 4750, maxSpeed: 145, turnSpeed: 1.20, cannons: 50, harpoons: 33, hold: 130, viewRange: 820 },
  phoenix:          { name: 'Phoenix',                   tier: 5, hp: 4500, maxSpeed: 155, turnSpeed: 1.35, cannons: 38, harpoons: 38, hold: 130, viewRange: 800 },
  champion:         { name: 'Champion',                  tier: 5, hp: 4750, maxSpeed: 145, turnSpeed: 1.20, cannons: 40, harpoons: 40, hold: 130, viewRange: 800 },
  abyssThrone:      { name: 'Throne of the Abyss',       tier: 6, hp: 6600, maxSpeed: 145, turnSpeed: 1.10, cannons: 52, harpoons: 52, hold: 160, viewRange: 840 },
  eternalArmada:    { name: 'Eternal Armada',            tier: 6, hp: 7250, maxSpeed: 140, turnSpeed: 1.10, cannons: 56, harpoons: 55, hold: 160, viewRange: 840 },
  leviathan:        { name: 'Leviathan',                 tier: 6, hp: 7600, maxSpeed: 140, turnSpeed: 1.10, cannons: 26, harpoons: 79, hold: 160, viewRange: 840 },
  starfall:         { name: 'Starfall',                  tier: 6, hp: 6250, maxSpeed: 155, turnSpeed: 1.10, cannons: 58, harpoons: 47, hold: 160, viewRange: 900 },
  // The masterworks, two to a tier, each built in a line's manner and with its figures
  gildedSwallow:    { name: 'Gilded Swallow',            tier: 1, hp:  750, maxSpeed: 130, turnSpeed: 1.65, cannons:  8, harpoons:  8, hold:  60, viewRange: 600 },
  jadeLotus:        { name: 'Jade Lotus',                tier: 1, hp:  700, maxSpeed: 140, turnSpeed: 1.95, cannons:  6, harpoons:  7, hold:  55, viewRange: 640 },
  velvetRose:       { name: 'Velvet Rose',               tier: 2, hp: 1150, maxSpeed: 135, turnSpeed: 1.60, cannons: 18, harpoons:  8, hold:  90, viewRange: 640 },
  silverFjord:      { name: 'Silver Fjord',              tier: 2, hp: 1700, maxSpeed: 125, turnSpeed: 1.40, cannons:  6, harpoons: 16, hold:  80, viewRange: 600 },
  crownJewel:       { name: 'Crown Jewel',               tier: 3, hp: 2000, maxSpeed: 135, turnSpeed: 1.35, cannons: 18, harpoons: 18, hold: 110, viewRange: 680 },
  moonlitDragon:    { name: 'Moonlit Dragon',            tier: 3, hp: 1700, maxSpeed: 150, turnSpeed: 1.70, cannons: 14, harpoons: 17, hold:  90, viewRange: 740 },
  rubyCorsair:      { name: 'Ruby Corsair',              tier: 4, hp: 2700, maxSpeed: 135, turnSpeed: 1.25, cannons: 40, harpoons: 17, hold: 145, viewRange: 700 },
  valhalla:         { name: 'Valhalla',                  tier: 4, hp: 4100, maxSpeed: 125, turnSpeed: 1.15, cannons: 14, harpoons: 35, hold: 130, viewRange: 660 },
  sunKing:          { name: 'Sun King',                  tier: 5, hp: 4300, maxSpeed: 135, turnSpeed: 1.10, cannons: 36, harpoons: 36, hold: 160, viewRange: 740 },
  empressOfWaves:   { name: 'Empress of the Waves',      tier: 5, hp: 3650, maxSpeed: 150, turnSpeed: 1.40, cannons: 28, harpoons: 34, hold: 145, viewRange: 780 },
  midnightSun:      { name: 'Midnight Sun',              tier: 6, hp: 7800, maxSpeed: 130, turnSpeed: 0.95, cannons: 28, harpoons: 66, hold: 200, viewRange: 740 },
  mirage:           { name: 'Mirage',                    tier: 6, hp: 6600, maxSpeed: 145, turnSpeed: 1.10, cannons: 52, harpoons: 52, hold: 160, viewRange: 840 },
};

// How the Forbidden Fleets and the masterworks are got. Each of the six ways pays its own currency: the prices grow
// with the tier, and the terms say what else it takes. A masterwork asks for a ship of another line at the last level
// of its tier first (economy/shipyard.ts, tierMastered). The ladder of the other lines is the shipyard's, for gold:
// their prices are set when they are built
// prettier-ignore
const OBTAIN: Partial<Readonly<Record<LineShipId, ShipTerms>>> = {
  forgotten:      { source: 'event', price: 300, terms: 'During the Night of Drowned Lanterns, in autumn' },
  shellback:      { source: 'hunt', price: 300, terms: 'Sink 100 giant turtles' },
  duelist:        { source: 'arena', price: 1500, terms: 'Win 25 arena duels' },
  willOWisp:      { source: 'craft', price: 6, terms: 'And 5,000 gold to the shipwright' },
  cursedGalleon:  { source: 'craft', price: 10, terms: 'Follow the map to the drowned temple, and 15,000 gold to the shipwright' },
  baronsShadow:   { source: 'boss', price: 20, terms: 'Sink the Smuggler Baron 25 times' },
  oathkeeper:     { source: 'guild', price: 2000, terms: 'A month in a guild' },
  aurora:         { source: 'event', price: 500, terms: 'During the Long Night, in winter' },
  soulReaper:     { source: 'boss', price: 40, terms: 'Sink the Reaper, the ghost ship of the southern fogs' },
  gladiator:      { source: 'arena', price: 4000, terms: 'Reach the Silver league of the arena' },
  serpentSpine:   { source: 'hunt', price: 900, terms: 'Sink 150 sea serpents' },
  ironCovenant:   { source: 'guild', price: 5000, terms: 'Win 10 guild battles' },
  blackOracle:    { source: 'craft', price: 16, terms: 'Find the sunken island, and 40,000 gold to the shipwright' },
  sirensSong:     { source: 'event', price: 1000, terms: "During the Siren's Moon, in spring" },
  conqueror:      { source: 'arena', price: 8000, terms: 'Reach the Gold league of the arena' },
  bastion:        { source: 'guild', price: 9000, terms: 'Your guild holds a sea fort for a week' },
  seaDevourer:    { source: 'hunt', price: 2500, terms: 'Sink 25 krakens' },
  paleAdmiral:    { source: 'boss', price: 100, terms: 'Sink the Pale Admiral in the northern waters' },
  phoenix:        { source: 'event', price: 1600, terms: 'During the Festival of Suns, in summer' },
  champion:       { source: 'arena', price: 14000, terms: 'Finish an arena season in the top hundred' },
  abyssThrone:    { source: 'boss', price: 160, terms: 'Sink the Drowned King with your guild' },
  eternalArmada:  { source: 'guild', price: 25000, terms: 'Your guild wins a season of guild battles' },
  leviathan:      { source: 'hunt', price: 5000, terms: 'Sink the Leviathan, the oldest thing in the sea' },
  starfall:       { source: 'craft', price: 30, terms: 'Piece together the star map, and 150,000 gold to the shipwright' },
  gildedSwallow:  { source: 'premium', price: 600, terms: '' },
  jadeLotus:      { source: 'premium', price: 600, terms: '' },
  velvetRose:     { source: 'premium', price: 1200, terms: '' },
  silverFjord:    { source: 'premium', price: 1200, terms: '' },
  crownJewel:     { source: 'premium', price: 2000, terms: '' },
  moonlitDragon:  { source: 'premium', price: 2000, terms: '' },
  rubyCorsair:    { source: 'premium', price: 3200, terms: '' },
  valhalla:       { source: 'premium', price: 3200, terms: '' },
  sunKing:        { source: 'premium', price: 4800, terms: '' },
  empressOfWaves: { source: 'premium', price: 4800, terms: '' },
  midnightSun:    { source: 'premium', price: 7000, terms: '' },
  mirage:         { source: 'premium', price: 7000, terms: '' },
};

/** What each ship is for, in a few words: the shipyard's card */
const ROLES: Readonly<Record<LineShipId, string>> = {
  sloop: 'Small and light: a ship to learn the sea on',
  coastalBark: 'A sturdy all-rounder of the coastal patrols',
  corsair: 'A royal raider, quick for its guns',
  frigate: "Fast and far-sighted: the navy's eyes",
  royalGalleon: 'Treasure and guns in one deep hull',
  admiral: 'A flagship that leads a squadron',
  shipOfTheLine: 'Three gun decks of royal thunder',
  riverJunk: 'Nimble in shallows and along the coast',
  seaMerchant: 'A trader with the deepest hold of its line',
  dragonSentinel: 'Guards the straits: tough for its line',
  celestialFrigate: 'Swift, keen-eyed and quick to turn',
  imperialJunk: "An emperor's warship, many decks high",
  dragonArmada: 'The flagship of the dragon fleets',
  smuggler: 'Fast, with a hold the customs never see',
  seaWolf: 'Hunts in packs, strikes from ambush',
  blackCorsair: 'A heavy broadside under black sails',
  avenger: 'Built for a grudge: hits hard, never lets go',
  stormPhantom: 'Out of the storm, a broadside, and gone',
  abyssLord: 'The heaviest broadside on the seas',
  breaker: 'A sturdy longship that rides the surf',
  seaRaider: 'Raids the coasts, fights up close',
  wolfShip: 'A beast head at the bow, a ram under it',
  iceJarl: "A jarl's hall afloat, shod in steel",
  stormPetrel: 'The fastest of the north, ahead of the storm',
  jormungandr: 'The world serpent: the toughest hull afloat',
  forgotten: 'A ghost ship that sees through the fog',
  shellback: "Built on a giant turtle's shell: tough and slow",
  duelist: 'Quick and nimble, made for fights one on one',
  willOWisp: 'Sails by its own light, far into the fog',
  cursedGalleon: 'Cursed gold, cursed guns',
  baronsShadow: "The Baron's brig, risen from its wreck",
  oathkeeper: "A guild's sworn guardian",
  aurora: 'Its sails glow with the northern lights',
  soulReaper: 'Its sunk foes sail on in its wake',
  gladiator: 'An arena fighter, at its best up close',
  serpentSpine: "Built on a sea serpent's spine: a monster hunter",
  ironCovenant: "A guild's warship, armoured in iron",
  blackOracle: 'Sees what is coming, far over the sea',
  sirensSong: 'Its song draws foes onto its guns',
  conqueror: "A heavy broadside for the arena's top leagues",
  bastion: 'A floating fortress of a guild',
  seaDevourer: 'Harpoons like teeth, a bow like jaws',
  paleAdmiral: "A drowned admiral's flagship",
  phoenix: 'Burns, and rises again from its ashes',
  champion: "The arena's crowned champion",
  abyssThrone: 'The throne of the deep, risen to the surface',
  eternalArmada: "A guild's flagship that never stays sunk",
  leviathan: 'The greatest monster hunter afloat',
  starfall: 'Forged of a fallen star: fast and far-sighted',
  gildedSwallow: 'A gilded European yacht, quick and graceful',
  jadeLotus: 'An Eastern junk in jade-green lacquer',
  velvetRose: "A pirate queen's brig in crimson velvet",
  silverFjord: 'A northern longship chased in silver',
  crownJewel: 'A royal frigate set with gems',
  moonlitDragon: 'An Eastern frigate that glows under the moon',
  rubyCorsair: 'A pirate warship in ruby red and gold',
  valhalla: 'A hall of heroes on a northern hull',
  sunKing: 'A European flagship of gold, a sun on every sail',
  empressOfWaves: "An empress's junk of silk and gold",
  midnightSun: 'A northern giant lit by the midnight sun',
  mirage: 'A ship of glass and starlight',
};

/** Whether a ship of a line is built: a class of SHIP_CLASSES */
function isBuilt(id: LineShipId): id is LineShipId & ShipClassId {
  return Object.hasOwn(SHIP_CLASSES, id);
}

/** A class's figures, as the shipyard shows them */
export function classFigures(shipClass: ShipClass): ShipFigures {
  const { hp, maxSpeed, turnSpeed, slots, hold, viewRange } = shipClass;
  return { hp, maxSpeed, turnSpeed, cannons: slots.cannon.length, harpoons: slots.harpoon.length, hold, viewRange };
}

/** The starter's sloop is given; the rest of the ladders are the shipyard's, their prices set once they are built */
const GIVEN: ShipTerms = { source: 'starter', price: null, terms: '' };
const SHIPYARD: ShipTerms = { source: 'shipyard', price: null, terms: '' };

/**
 * A ship of a line: its class's figures once built, its provisional ones while it is planned, and how it is got (a
 * built one the shipyard sells has its offer's price: economy/shipyard.ts)
 */
export function lineShip(id: LineShipId): LineShip {
  const line = Object.values(SHIP_LINES).find((l) => l.ships.includes(id)) ?? SHIP_LINES.starter;
  const role = ROLES[id];
  const obtain = OBTAIN[id] ?? (line.id === 'starter' ? GIVEN : SHIPYARD);
  if (isBuilt(id)) {
    const built = SHIP_CLASSES[id];
    return { id, line: line.id, tier: built.tier, name: built.name, role, built, figures: classFigures(built), obtain };
  }
  const { name, tier, ...figures } = PLANNED[id];
  return { id, line: line.id, tier, name, role, built: null, figures, obtain };
}

/** Whether a class is a ship of a line players sail (not a bot's hull) */
export function isLineShip(id: ShipClassId): id is LineShipId & ShipClassId {
  return Object.values(SHIP_LINES).some((line) => line.ships.some((ship) => ship === id));
}
