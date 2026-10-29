import type { LineShipId, PlayerLineId } from '../../game';

// The shipyard's flavour: how each line's ships look and where they come from, and each ship's legend, for its info
// window. Flavour only, so the client keeps it; English here, translated where it is shown

/** What a line's ships look like and where they come from, under its name in the shipyard */
export const LINE_STYLE: Readonly<Record<PlayerLineId, string>> = {
  starter: 'Small, plain and light: the ship every captain learns the sea on.',
  european:
    'Spain, England, France and the Netherlands: classic sailing ships, heavy guns, bronze ornaments and royal crests.',
  eastern: 'China, Japan and Southeast Asia: junks, decks in tiers, red sails, dragons and lacquered wood.',
  pirate: 'The Caribbean and the pirate republics: rebuilt ships, black sails, trophies, uneven sides and odd weapons.',
  northern: 'Norse myth and the northern seas: long hulls, carved beast heads, fur, runes and steel.',
  legendary:
    'Powers beyond nature and civilisations older than history: ghostly hulls, glowing runes, cursed guns, strange silhouettes.',
  premium:
    'The finest work of the master shipwrights, each in the manner of a line: gilded, carved, set with gems and painted to be envied in every port.',
};

/** A ship's legend */
export const SHIP_LORE: Readonly<Record<LineShipId, string>> = {
  sloop:
    'One mast, a handful of guns and a crew that has just signed on. Every captain of Saltwind starts on one, and the old ones still speak of theirs fondly.',
  coastalBark:
    "Built in the yards of Saltwind to carry the crown's word along the coasts: white sails on two masts, a hull banded in royal blue and gilt, the royal crest over its stern. Where it drops anchor the king's law has come, with twice a sloop's guns behind it.",
  corsair:
    'Named for the beast that lives in fire unharmed, it sails under canvas the orange of flame, a crowned gilt salamander leaning over the iron ram at its bow. A raider under a royal letter of marque, it goes through broadsides as its namesake goes through fire.',
  frigate:
    'Named for the swiftest of falcons: a long, fine hull, raked masts and sharp sails in the orange and lilac of dawn. It sights its prey first and stoops on it out of the rising sun, as the falcon does, a gilt lance aimed from the sunburst at its beak.',
  royalGalleon:
    "The king's own treasure galleon: a crimson hull under gilt, silver sails on four masts, a crowned lion at its beak and a great gilt crown over its stern. It brings the treasure fleets' silver home, and the pirates who know what it carries know its broadside too.",
  admiral:
    "A flagship built to strike fear: three gun decks of black banded in gold, towering black sails hemmed with gilt and a gilt eagle spreading its wings at its head. When it rises on the horizon, the crown's squadrons form up behind it and the enemy's scatter.",
  shipOfTheLine:
    "The mightiest ship afloat, gold from waterline to truck: cloth-of-gold sails, emerald strakes along three gun decks and a great gilt sun over its stern. Its fins and tail are a shark's, cast in gold, for it rules the sea as the shark rules the deep.",
  riverJunk:
    'A flat-bottomed junk from the great rivers, with ribbed red sails and an eye painted on its bow to see the way. It slips through shallows where deeper keels run aground.',
  seaMerchant:
    'A merchant junk whose hold is built in watertight compartments: holed in one, it sails on the rest. It trades silk and porcelain and carries just enough guns to make pirates think twice.',
  dragonSentinel:
    'A coastguard junk with a dragon carved round its stern and lacquered shields along its sides. It watches the straits of the empire, and few who sail them unasked sail out again.',
  celestialFrigate:
    "Slender and swift, its red sails battened like a dragon's wings. Its navigators read the stars as other captains read charts, and nothing its size turns faster.",
  imperialJunk:
    "A floating palace of five decks in red and gold lacquer, built for the emperor's own admirals. Fire lances, rockets and rows of guns wait behind its painted shields.",
  dragonArmada:
    'The flagship of the dragon fleets, so great that whole squadrons sail in its shadow. Its sails bear the golden dragon, and coasts that see it on the horizon surrender without a shot.',
  smuggler:
    'A quick little ship with a false bottom and a hold that never shows on the papers. Its captain knows every hidden cove and is long gone before the customs cutter rounds the cape.',
  seaWolf:
    "A rebuilt sloop of war with patched black sails and a crew that hunts in packs. It waits behind the islands for a fat merchant and is on it before the merchant's crew reaches the guns.",
  blackCorsair:
    'A captured warship, its colours burnt and its sails dyed black. Trophies from every prize hang from its rails, and its broadside is heavier than any honest ship of its size dares to carry.',
  avenger:
    'Built by a captain with a score to settle, from the timbers of the ships that wronged her. It hits hard, holds on, and never lets go of the one it hunts.',
  stormPhantom:
    'It comes out of the rain under black sails and no lights, fires once and is gone into the storm again. Sailors swear it has no crew, and its captain lets them think so.',
  abyssLord:
    'The flagship of the pirate republics, a fortress of black wood and stolen bronze. Its broadside is the heaviest on the seas, and every captain of the Brotherhood answers its signal.',
  breaker:
    'A long, low ship of the northern clans that rides the breakers instead of fighting them. Its oak keel takes a beating that would split a southern hull, and its crew sings while it bails.',
  seaRaider:
    'A raider of the fjords with shields along its rails and a carved head at its bow. It runs up on a coast at dawn, and by noon it is out at sea again with whatever it came for.',
  wolfShip:
    "A wolf's head snarls at its bow and an iron ram waits under it. The clans steer it straight at their enemies: what the ram doesn't break, the axes on its deck do.",
  iceJarl:
    "A jarl's hall made into a ship: a hull shod in steel, cabins lined with fur and runes of warding cut into every beam. It breaks the pack ice in winter and the enemy's line in summer.",
  stormPetrel:
    'Named after the bird that flies ahead of a storm, it is the fastest ship of the north. The clans send it out when the sky turns black, and it is home before the storm breaks.',
  jormungandr:
    "Named after the serpent that circles the world. Its hull is plated in steel, its ram is a serpent's head, and the skalds say its keel was laid on the bones of a sea dragon.",
  forgotten:
    'A ship that went down a hundred years ago and came back up with its lanterns lit. Its pale crew see through fog and darkness, and nobody remembers the name on its stern.',
  cursedGalleon:
    'A galleon that robbed a drowned temple and has carried its gold ever since. The gold glows green in its hold, and its guns fire shot that never cools.',
  soulReaper:
    'Its sails are grey as the mist and its hull is cold to the touch. Of the ships it sinks, only their crews come back up, and they sail on in its wake.',
  blackOracle:
    'Carved from the black stone of an island that sank before history began. Its runes glow when danger is near, and its captain sees a battle before it begins.',
  seaDevourer:
    'Its bow opens like jaws and its harpoons fire from its sides like teeth. What it catches, it drags under, and only the bubbles show where.',
  abyssThrone:
    'The throne of the drowned kings, raised from the deepest trench of the sea. Its runes burn like coals, its guns were cast in no forge of this world, and the sea itself makes way for it.',
  // The rest of the Forbidden Fleets
  shellback:
    'Its hull is the shell of a giant turtle older than the port, hollowed out and decked over by a shipwright who never said where he found it. Shot glances off it, and it carries its crew as calmly as it once carried the turtle.',
  duelist:
    'A slim black brig whose captain fought a hundred duels at sea and never lost one. They say she still stands at its helm, and the brig turns to face every ship that challenges it.',
  willOWisp:
    'A small ship that sails by its own lantern, a blue flame no rain puts out. Sailors who followed that light into the fog came out in waters no chart knew; its captain goes wherever the flame leads, and always finds the way back.',
  baronsShadow:
    "Rebuilt from the timbers of the Smuggler Baron's brig, hauled up after it went down for the twenty-fifth time. His red sails came with it, and on foggy nights his old mortar still coughs at the stern all by itself.",
  oathkeeper:
    "Its crew are sworn on their guild's banner, and the oath is cut into its mainmast in a hundred hands. As long as one of them is aboard, the ship will not strike its colours.",
  aurora:
    'Built in the far north for the Long Night, when the sun does not rise for a month. Its sails catch the northern lights and glow green and violet in the dark, and ships lost in the polar night steer home by it.',
  gladiator:
    'A galley built for the arena of the free ports, its sides scarred by a thousand fights. The crowd roars when it comes in, and its captain fights best with the enemy close enough to see their eyes.',
  serpentSpine:
    "Its keel is the spine of a sea serpent the hunters chased for a week, and its ribs are the serpent's own. Serpents still sense their kin in it and come close, which is what its harpoons are for.",
  ironCovenant:
    "Three guilds that fought each other for years paid for it together and swore never to fight again. Its iron plates are riveted with all three guilds' marks, and so far the covenant holds.",
  sirensSong:
    'A siren is carved at its bow, and when the wind is right her song carries across the water. Crews who hear it steer towards it without knowing why, straight into the reach of its guns.',
  conqueror:
    'A heavy warship the arena gives to the captains of its gold league. Its broadside has ended more arena fights than anyone has counted, and its sails carry the laurel of every season it won.',
  bastion:
    'Less a ship than a fort that learned to sail: stone-grey plates, towers fore and aft, and guns enough to hold a harbour. A guild that keeps a sea fort for a week is given one to keep the next.',
  paleAdmiral:
    'The flagship of an admiral who drowned with his whole squadron in the northern ice. He still sails it, pale as frost; sink him, and the ship is left to whoever dares to take its helm.',
  phoenix:
    "Its sails are dyed the colours of fire, and every summer, at the Festival of Suns, it burns to the waterline and rises from the ashes newer than before. Its crew don't fear a burning deck.",
  champion:
    "The arena's crown, given to the captains who finish a season among its hundred best. Gold letters on its stern list every champion who sailed it, and there is room for many more.",
  eternalArmada:
    "The flagship of a guild that won a whole season of battles. Every time it sinks, the guild's shipwrights raise it again, so its hull is a patchwork of a hundred victories and of every defeat it came back from.",
  leviathan:
    "Built inside the ribs of the Leviathan itself, the oldest creature in the sea, after a hunt the taverns still sing about. Monsters flee from its shadow, and those that don't are what its harpoons are for.",
  starfall:
    'Forged of a star that fell into the sea, found by piecing together thirty torn treasure maps. Its hull shines faintly at night, it sails faster than the wind should allow, and it sees farther than any lookout.',
  // The masterworks
  gildedSwallow:
    'A European yacht with gilded rails and swallow-tailed pennants, built for a duke who wanted to be the fastest guest at every regatta. It sails as gracefully as it looks.',
  jadeLotus:
    'A pleasure junk of the Eastern court, lacquered jade green, with lotus flowers carved along its galleries. Princes sailed it on the palace lakes; its new captains take it out to sea.',
  velvetRose:
    'The brig of a pirate queen who wore crimson velvet to every boarding. Its sails are dyed rose red, and the rose painted on its stern is the last thing many merchants ever saw.',
  silverFjord:
    "A northern longship whose beast head and shield rims are chased in silver. It was a jarl's wedding gift, and it still flashes in the sun like a fjord in spring.",
  crownJewel:
    "A royal frigate set with gems where other ships have brass, its figurehead wearing a crown of real gold. The king's own jeweller fitted it out, and every port stares when it comes in.",
  moonlitDragon:
    "An Eastern frigate whose dragon-scale lacquer glows silver under the moon. In the court's legends it carried the moon princess home, and it still sails best at night.",
  rubyCorsair:
    "A pirate warship painted ruby red and trimmed with stolen gold, its broadside as heavy as its owner's purse. Pirates salute it, and merchants pay before it asks.",
  valhalla:
    'A northern hull built like a hall of heroes, its shields painted with the deeds of every jarl who sailed it. The clans say the fallen feast aboard it and fight beside its crew.',
  sunKing:
    'A European flagship covered in gold leaf, a golden sun on every sail. It was built for a king who wanted the sea itself to see him coming, and it does.',
  empressOfWaves:
    "The flagship of an empress, its silk sails embroidered with golden cranes and its decks hung with lanterns. The empire's admirals bowed to it, and its guns were as fine as its silks.",
  midnightSun:
    'A giant of the northern clans, built where the sun never sets in summer. Its gilded shields catch the midnight sun and blind its enemies, and its steel hull fears no ice.',
  mirage:
    'A ship of glass and starlight that seems to shimmer in and out of the air. Nobody knows who built it; those who sail it say it is real enough, and its guns certainly are.',
};
