import type { ShipClassId } from '../../game';

// The bestiary's flavour and advice: what each of the bots' hulls is and how it is fought. Flavour only, so the client
// keeps it; English here, translated where it is shown. A sea's bots of a hull are as tough as the sea asks, but they
// fight the same way everywhere

/**
 * The legends of the bosses and the mini-bosses, by their hulls: what the sea tells of them, under their boards. Told
 * by the people of their sea, so a rumour, never the story's truth (docs/story.md)
 */
export const BOSS_LEGENDS: Readonly<Partial<Record<ShipClassId, string>>> = {
  baronBrig:
    'Before the Fall he weighed other men’s cargo on Saltwind’s quay and kept none of it. The night the Moon came down he rowed out alone, and came back at dawn with a sack that glowed through the canvas. He bought a brig with it, then the smugglers of the reefs, then their silence. The fishermen say he has been sunk more times than they can count, and every time the sea gives him back with the next tide, his coat dry and his powder fresh. Nobody asks who pays for all the glass he buys. The few who did are on the seabed, and they have not come back.',
  inkmother:
    'Old fishermen remember her as a squid no longer than a rowing boat, who stole the bait off the night boats and was cursed for it. Then the Moon fell, and a shard of it sank into her cave. She swallowed it, and she has not stopped growing since. Her ink is as black as a night without a Moon, with a light deep in it: boats caught in it turn up a week later, empty and dry, miles from where they went down. Every spring the reef folk set a lantern adrift for her, so that she takes the light and leaves the men. The pearl she grew round the shard is said to be the size of a fist, and to sing at the hour the tide should turn.',
};

/** A bot's hull: what it is and how to fight it */
export const HULL_LORE: Readonly<Partial<Record<ShipClassId, string>>> = {
  fishingBoat:
    'Nets and fish, and not a gun aboard: it runs from whoever attacks it. Easy gold for a captain who can catch it.',
  merchantSloop:
    'A trader with a swivel gun on its rail that reaches less far than a ship’s cannons: keep your distance and it cannot answer. Gold and goods in its hold.',
  smugglerSloop:
    'Fast and quick to anger: it goes for any ship that comes near and circles at its gun’s reach. A boss keeps a pair of them at its side.',
  jackalCutter:
    'A light cutter with a swivel gun on its rail, and never alone: they hunt in packs of four, fall on a ship together and circle it, all firing at once. One alone sinks in a few volleys. Come with your hull whole, open fire from beyond their guns’ reach, sink the nearest first, and keep running while your ship is faster than theirs: a holed one is not.',
  baronBrig:
    'The Smuggler Baron, the master of the starting waters: a slow brig with swivel guns and a mortar that rains grapeshot. The water glows red where it will fall, so sail out of the glow, and sink his two smugglers first.',
  seaTurtle:
    'Slow and peaceful until it is hurt. Its jaws reach only a ship alongside: keep away and harpoon it without a scratch.',
  seaSerpent:
    'A hunter of the open sea, a little slower than a sound sloop: you can get away from it, unless your hull is badly holed. Harpoons hurt it most.',
  inkmother:
    'A squid that swallowed a shard of the Moon and never stopped growing: the starting waters’ mini-boss, alone at its lair in the south-west. It is slow, but keeping away won’t save you: it dives and comes up under your keel, its arms striking all round, where the water glows dark a moment before. Turn hard out of the glow, don’t stop. As it is hurt it clouds the water with ink that blinds a crew: sail out of it. At half its hull its young come up round it, quicker than your ship: harpoon them first. The pearl it grew round the glass is worth the hunt.',
  inkling:
    'One of the Inkmother’s brood, as long as a rowing boat: it comes up round her when she is hurt and goes back to the deep with her. Quicker than a sloop, but two volleys of harpoons put it down.',
  pirateBrig:
    'The pirates of every sea past the starting waters, three cannons a side: they attack whoever comes near and circle at their guns’ reach.',
  warship:
    'Seldom met, and as strong as a captain’s ship of its sea’s tier: six cannons behind a thick hull. Half a minute’s fight and half your hull, with your tier’s guns.',
  flagship:
    'A sea’s boss when it is a ship: slow, with four cannons and a mortar like the Baron’s. Keep out of the red glow on the water and sink its escort first.',
  giantCrab:
    'A slow, armoured brawler of the shallows: it leaves alone whoever leaves it alone, and its claws reach only a ship alongside.',
  shark:
    'Quick and hungry, it hunts the open sea: faster than the starter sloop, slower than a ship of tier 1. Harpoons hurt it most.',
  kraken:
    'A sea’s boss when it is a monster: its arms reach far round it and its bite is the hardest at sea. The sea’s grazers keep it company.',
};
