import type { ShipClassId } from '../../game';

// The bestiary's flavour and advice: what each of the bots' hulls is and how it is fought. Flavour only, so the client
// keeps it; English here, translated where it is shown. A sea's bots of a hull are as tough as the sea asks, but they
// fight the same way everywhere

/** A bot's hull: what it is and how to fight it */
export const HULL_LORE: Readonly<Partial<Record<ShipClassId, string>>> = {
  fishingBoat:
    'Nets and fish, and not a gun aboard: it runs from whoever attacks it. Easy gold for a captain who can catch it.',
  merchantSloop:
    'A trader with a swivel gun on its rail that reaches less far than a ship’s cannons: keep your distance and it cannot answer. Gold and goods in its hold.',
  smugglerSloop:
    'Fast and quick to anger: it goes for any ship that comes near and circles at its gun’s reach. A boss keeps a pair of them at its side.',
  baronBrig:
    'The Smuggler Baron, the master of the starting waters: a slow brig with swivel guns and a mortar. He marks where his shells will fall, so sail out of the red circles, and sink his two smugglers first.',
  seaTurtle:
    'Slow and peaceful until it is hurt. Its jaws reach only a ship alongside: keep away and harpoon it without a scratch.',
  seaSerpent:
    'A hunter of the open sea, a little slower than a sound sloop: you can get away from it, unless your hull is badly holed. Harpoons hurt it most.',
  pirateBrig:
    'The pirates of every sea past the starting waters, three cannons a side: they attack whoever comes near and circle at their guns’ reach.',
  warship:
    'Seldom met, and as strong as a captain’s ship of its sea’s tier: six cannons behind a thick hull. Half a minute’s fight and half your hull, with your tier’s guns.',
  flagship:
    'A sea’s boss when it is a ship: slow, with four cannons and a mortar like the Baron’s. Keep out of the marked circles and sink its escort first.',
  giantCrab:
    'A slow, armoured brawler of the shallows: it leaves alone whoever leaves it alone, and its claws reach only a ship alongside.',
  shark:
    'Quick and hungry, it hunts the open sea: faster than the starter sloop, slower than a ship of tier 1. Harpoons hurt it most.',
  kraken:
    'A sea’s boss when it is a monster: its arms reach far round it and its bite is the hardest at sea. The sea’s grazers keep it company.',
};
