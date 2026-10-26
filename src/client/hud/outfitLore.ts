import type { OutfitId } from '../../game';

// A piece of outfit's legend, for its info window: a little of where it came from and what sailors say of it. Flavour
// only, so the client keeps it (the game's data has no use for it); English here, translated where it is shown

export const OUTFIT_LORE: Readonly<Record<OutfitId, string>> = {
  canvasSails:
    'Plain canvas, sewn by the sailmakers of Saltwind from flax grown on the island. Every ship starts with it, and plenty never need more.',
  patchedJib:
    'Cut down from a sail that lost to a storm and patched where the shot went through. Small, but it swings round quicker than any square sail.',
  cottonSails:
    'Woven from cotton brought up from the south and stiffened with leather at the corners. It takes the lightest breeze and asks for more.',
  stormSails:
    "A junk's sail, ribbed with bamboo battens: holed in ten places, it still keeps its shape and draws. The rig came from the far east with a trader who never went home.",
  silkSails:
    "Violet silk from a merchant prince's wedding fleet, still sewn with his crescent moon. Light as air, it catches every breath of wind.",
  lateenRig:
    'A triangle of red canvas on a long slanting yard, the rig of the southern raiders. It turns on a coin and gathers way in a heartbeat.',
  admiraltySails:
    "The navy's own canvas, doubled and bound with gold thread round the compass rose. The Admiralty swears none of its ships was ever left dead in the water.",
  dragonSails:
    'Green as deep water, with a golden dragon that seems to uncoil when the wind fills it. Crews say it pulls the ship along by itself.',
  krakenSails:
    'Woven with the kraken in gold thread by a sailmaker who swore he had seen it. Ships under it turn as if something steered them from below.',
  oakPlanking:
    "Seasoned oak from the island's own hills, bound in bundles and fitted plank by plank. Solid, honest wood.",
  pinePlanking:
    'Pale pine, quick to work and light to carry. It gives a little where oak would hold, but the ship rides higher and runs a little faster.',
  doublePlanking:
    'Two skins of planking with iron strips between them. A ball that breaks the first has little left for the second.',
  copperSheathing:
    'Copper sheets nailed below the waterline keep the weed and the worm off. A clean bottom slips through the water, and to a sailor the green on it is only polish.',
  tarredPlanking:
    'Black with pine tar boiled in until the wood could drink no more. It hardly leaks, so a holed ship keeps more of its way.',
  teakHull:
    "Red teak from the far south, so hard it blunts the shipwright's tools. It shrugs off shot that would splinter oak.",
  ironPlates:
    'Rough iron plates riveted over the hull. Nothing short of a heavy gun dents them, but the ship sits low and answers the helm slowly.',
  steelPlates:
    'Blued steel, thinner than iron and just as hard: the armour of captains who still mean to catch what they chase.',
  brassPlating:
    'Brass plates stamped with the compass rose, bolted over tarred planking. Holed, the ship still keeps its way, as if the compass held it on course.',
  krakenPlating:
    'Black plates inlaid with a turquoise kraken, from a forge nobody will name. The sea seems to part for the hull that wears them.',
  tiller:
    'A plain rudder and a long oak tiller. The helmsman leans on it with all his weight, and the ship comes round.',
  seaAnchor:
    'A canvas cone on a line, thrown over the stern: it fills with water and drags the ship to a stop. Fishermen ride out gales on one.',
  shipsWheel:
    'A wheel and ropes to the rudder, so one hand does what took two men on a tiller. Iron at the joints, oak everywhere else.',
  dragAnchor:
    'A great red drogue of sailcloth and iron hoops. Let go, it stops the ship short, and its broadside stays where it was aimed.',
  ironRudder:
    'An iron-plated rudder hung on brass hinges. Shot that would shatter a wooden blade glances off it, and the stern is the safer for it.',
  balancedRudder:
    'Part of its blade stands ahead of the hinge, so the water itself helps to turn it. The helm is light, and the ship turns quickest of all.',
  captainsWheel:
    'Mahogany and brass, with a compass set in its hub. It was made for a captain who liked to turn and stop in the same breath.',
  krakenWheel:
    'Brass tentacles wind round its spokes and a turquoise star burns in its hub. Turn it hard and the sea seems to grip the hull.',
  leviathanRudder:
    'An iron blade inlaid with sea serpents, forged for a ship that hunted the leviathan. It turns quick and takes a beating.',
  spyglass: 'A wooden spyglass with one good lens. The lookout sees a sail a little sooner, and that is often enough.',
  brassSpyglass:
    'Brass and stitched leather, three draws long. Through it the lookout reads the water ahead and calls the helm before the waves do.',
  crowsNest:
    'A railed platform high on the mast, with a ladder and a rope to hold on to. From up there the horizon moves back a long way.',
  coveredNest:
    "A crow's nest with a canvas roof, so the lookout stays up through rain and sun. He calls the gusts before they reach the sails.",
  officersGlass:
    "An officer's glass of brass and red wood, polished every watch. It sees far, and its owner calls the turns before the danger shows.",
  telescope:
    'A long navy telescope on a brass tripod, a compass at its foot. It shows what the long guns can reach, and a little more.',
  admiralsGlass:
    'A heavy red glass with a gold anchor on it, carried by admirals who never ran aground. It finds the shoals before the keel does.',
  starTelescope:
    'Engraved with the stars it was made to follow. By night it steers by them, and by day it reads the wind on the water.',
  krakenEye:
    'Gold tentacles hold a lens of turquoise glass. Through it, they say, the sea hides nothing, and the helm never answers late.',
};
