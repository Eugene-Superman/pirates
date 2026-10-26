import type { AmmoId, GunId } from '../../game';

// A gun's or an ammo's legend, for its info window: a little of where it came from and what sailors say of it. Flavour
// only, so the client keeps it (the game's data has no use for it); English here, translated where it is shown

export const GUN_LORE: Readonly<Record<GunId, string>> = {
  cannon1:
    'Cast by the dozen in the Saltwind foundry, it has fired at every foe the sea has to offer. Captains call it the only hand aboard who never asks for a share.',
  swivelGun:
    "Pinned to the rail on an iron fork, the swivel gun turns faster than the bosun's temper. Fishermen keep one aboard to see off gulls and smugglers alike.",
  cannon2:
    'Its bronze came from the bells of a drowned chapel. Old gunners swear that after a good volley it still rings at midnight.',
  carronade:
    'Sailors call it the smasher: short, fat and furious, made for an enemy close enough to spit at. It misses often, but a ship it hits remembers it.',
  longNine:
    'A slender nine-pounder bored true by a gunsmith who never touched rum. In steady hands it brings down a topmast at three cables.',
  cannon3:
    'Banded in blue steel in the Admiralty yards, it was made for ships of the line. It is the gun a captain fits when he means to stay.',
  pounder24:
    'Too heavy for most decks, it is hauled aboard by forty hands and a prayer. A pair of them settled the battle of the Grey Shoals in a single broadside.',
  culverin:
    'Long and chased in silver, the culverin was made for duels at the edge of sight. Its makers etched the name of every ship it sank along the barrel, until they ran out of room.',
  pounder32:
    "Cast for a governor's flagship and lost at cards the night it was finished. Wherever it fires, some harbour goes quiet.",
  pounder42:
    "Only three were ever cast, and the queen's goldsmith gilded each one. Sailors say its roar calms storms: the thunder simply keeps away.",
  harpoonGun1:
    'A whaler’s gun turned to war when the sea began to bite back. Its line is spliced by hand, and every crew swears by its own knots.',
  deckCrossbow:
    'Light enough for one sailor to swing on its pin, the crossbow shoots before a serpent has finished rising. Fishermen keep it oiled under a tarpaulin.',
  harpoonGun2:
    'Its iron was quenched in water drawn from the deepest trench on the charts. Harpooners say it pulls towards whatever lives down there.',
  whalingGun:
    'Built to stop a bull whale with one shot, it kicks like a mule and misses as often. When it does bite, nothing swims away.',
  harpoonGun3:
    "Blued and balanced in the Admiralty yards, it was the first harpoon gun to fly the navy's colours. Its barbs are numbered, and every one is accounted for.",
  ballista:
    'An old siege engine taught to fish: long arms, tarred ropes and a bolt that flies farther than any harpoon. Its crew winds it to a sea shanty, a verse a turn.',
  barbedLauncher:
    'Every barb on its heads was filed by hand, and no two point the same way. What it catches stays caught.',
  twinLauncher:
    'Two spears ride its rack: one is in the air while the next drops into place, and the gunner never has to wait. A smith made it after losing a bet to a sea serpent, and wanted a rematch.',
  leviathanLance:
    'A lance as long as a longboat, flung by black powder. It was made to hunt the leviathan that sank half the fishing fleet, and it found it.',
  krakenBane:
    'Forged from the anchor chain of a ship the kraken took, it is the only weapon the kraken is said to fear. Sailors touch it for luck before a long voyage.',
};

export const AMMO_LORE: Readonly<Record<AmmoId, string>> = {
  ball1:
    "Rough iron from the bottom of the foundry's ladle, left to rust in the rain until a ship needs it. It isn't pretty, but it still knocks a hole in a plank.",
  chainShot:
    'Two half-balls in iron bands that spring apart in flight, a fathom of chain between them. They were made for masts and rigging, and gunners swear they hum as they fly.',
  ball2:
    "Turned smooth on a lathe and blacked with oil, it flies truer than the foundry's rough shot. Quartermasters count them like coins.",
  ball3:
    "The Admiralty's own shot, its anchor stamped deep in the bronze. Every one is weighed twice before it leaves the arsenal.",
  heatedShot:
    'Heated in a furnace below decks until it glows, then rammed home on wet wadding. Tar and canvas catch at the first touch.',
  explosiveShell:
    'A shell of black glass in a brass cage, packed with powder and a slow fuse. When the cage gives way, the glass does the rest.',
  royalShot:
    "A sapphire as big as a fist, banded with the compass star of the royal fleet. It was once the crown's alone; now any captain with the gold can fire a jewel.",
  harpoon1:
    'A plain iron head on an ash shaft, the harpoon whalers have thrown for a hundred years. It holds as long as the rope does.',
  barbedHarpoon: "Barbs all along its head, filed back like a fish's fins. Once it is in, the only way out is through.",
  harpoon2:
    'A tempered head on a shaft bound in braided leather, so it never slips from a wet hand. Harpooners hand them down from father to son.',
  harpoon3:
    "Bronze-headed and chased with sea vines in the navy's workshops. It is heavy enough to drive through a turtle's shell.",
  poisonHarpoon:
    'Its head is steeped in the ink of a deep-sea squid, and its marks glow violet in the dark. Sailors wash their hands twice after loading one.',
  explosiveHarpoon:
    'A hollow head packed with powder, its fuse lit by the shot itself. It bursts a moment after it strikes.',
  leviathanHarpoon:
    'Forged from the bronze of a sunken temple, its head sprouts tentacles of verdigris. Old hands say the deep knows its own, and lets it through.',
};
