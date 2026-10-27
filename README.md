# Pirate Game

Frontend of a browser naval game in the style of _Pirate Storm: Death or Glory_.
Click on the sea and your ship sails there, steering around islands.
The world is drawn in pseudo-3D with an isometric camera.

Built with TypeScript, [Pixi.js v8](https://pixijs.com/) and [Vite](https://vite.dev/).

## Requirements

- **Node.js** `20.19+` or `22.12+` (required by Vite). Node 22 LTS or newer is recommended.
  Check your version with `node -v`.
- **npm** — comes with Node.js.
- **Git**.
- A modern browser with WebGL (Chrome, Firefox, Safari, Edge).

## Getting started

1. Clone the repository:

   ```bash
   git clone git@github.com:Eugene-Superman/pirates.git
   cd pirates
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

   The game opens in your browser automatically at <http://localhost:5173>.
   Code changes reload the page on save.

4. Seas: the starting waters are the first of fifteen, one to three a tier of ship. Each has gates at its west and east
   edges to the sea before and after it: sail into one to go (a sea of a higher tier than your ship's stays closed).
   N, or the Seas button, opens the world chart: every sea, its gates, what sails it; for now its button takes you to
   any sea at once, for testing.
5. Play: click (or tap) on the sea to set a course; the ship finds its way round islands. Hold the button and drag to
   steer continuously. Bots sail the sea: fishing boats, merchants and turtles leave you alone, smugglers and sea
   serpents attack when you come near. Click one to pick it out (its hull shows at the top), double-click it or press
   Space to fire the selected weapon at it, Escape to stop. Kills and quests give experience: every ship has its own
   level, from 1, up to ten a tier: the starter sloop's and a tier 1 ship's go up to 10, a tier 6 ship's to 60. Each level from 2 gives a talent point for three branches (Gunnery, Seamanship, Hull and crew),
   ranked, a branch's next row opening with points spent in it; levels 5, 10, 15 and 20 (those a ship reaches) offer
   one of two signature talents instead (the level 5 one is an ability, F; ships of tier 4 and up will have a second at
   level 25, tier 6 a third at 45). A ship bought at the shipyard comes with no guns: fit yours from the hold. K opens the tree; a button by your ship's frame lights up when
   something waits to be picked; the shipwright forgets them all for a little gold. R repairs the hull out of combat,
   for a little gold (1 for every 10 hull; the shipwright in port does it at once, for more); L opens the loadout
   (the ship's gun slots, its ammo at hand and what waits in the hold: click or drag a gun into a slot, drag ammo onto
   a place at hand or onto the bar at the bottom); the chat in the bottom-left corner has a tab for the combat log (every blow
   dealt and taken with its dice, kills, repairs, cargo, totals; J unfolds it) and tabs for the chat's channels
   (general, zone, group, guild, private), empty until the online game. The minimap in the bottom-right corner shows the islands round you and
   everyone in sight; a click on it (or M) opens the sea chart: the whole sea, 8 × 8 squares from A1 to H8, with the
   islands, your ship, the Smuggler Baron's lair and your lost cargo. The bar at the bottom picks the weapon (or Q for
   the cannons, E for the harpoons; the new weapon's guns reload first) and which of its two ammo at hand is loaded
   (or Z and X).

   Every kill pays gold (under your ship's hull, top left, beside your doubloons), and the wreck may leave goods
   floating (fish, cloth, rum, turtle shell…), a ship's with a chest of gold: sail over them to haul them into your
   hold (how full it is shows under your gold). H, or a click on the hold, opens it: throw goods overboard to make room for better ones. Goods are sold at the port's
   market; if your ship goes down, its cargo floats where it sank, marked on your charts, for a few minutes.
   The port in the middle of the map (sail into its bay between the breakwaters, or click its island) shows the
   harbour with a medallion over each building: the tavern, where you take bounty quests ("hunt five turtles") and
   turn them in; the market; the workshop: the outfit (sails, hull planking, rudders and lookouts in three tiers, each
   with sidegrades, fitted there and then: speed, turning, hull, sight) and the shipwright's repair; the shipyard; and
   the arsenal: guns (they go to the hold; fit them in the loadout, L) and ammo, which it also buys back for a quarter
   of the price (a gun from the hold). Every item's card has an info button with all its figures and its legend; an
   ammo's picks how many to buy or sell, from 1 to 1000. The guild hall and the auction house open with the online game.
   Escape goes back from a building to the harbour; Set sail (or Escape again) leaves port.

   The goal of the starting waters is the next ship, the Coastal Bark (the European line's tier 1): the Captain's path
   in the top-right corner, under your quests, lists what the shipyard asks (a first kill, a talent, a repair at sea, a sale; quests turned in, a
   level, the Smuggler Baron sunk, the price). The Baron's brig sails in the north-east with two smugglers; his mortar
   marks red circles on the water where its shells will land — sail out of them. With every term met, the shipyard
   sells the Coastal Bark: it starts at level 1 (up to 10) with talents of its own, and your sloop stays in port with
   everything on it. Then the path leads on to the Corsair, the line's tier 2: a three-master with three tiers of guns,
   for the Coastal Bark at level 10, twelve quests and 9,000 gold; to the Frigate, its tier 3, a bigger, faster ship
   under orange and lilac sails, for the Corsair at level 20, twenty quests and 24,000 gold; to the Royal Galleon, its
   tier 4, a wide four-master under silver sails and gilt crowns, for the Frigate at level 30, thirty quests and 60,000
   gold; to the Admiral, its tier 5, a black and gold three-decker under towering black sails, for the Royal Galleon
   at level 40, forty-five quests and 150,000 gold; and to the Imperial Ship of the Line, its tier 6 and last, a
   golden three-decker under the tallest sails afloat with a gilt shark's tail, for the Admiral at level 50,
   sixty-five quests and 375,000 gold. The shipyard's My ships lists your ships: take the helm of any of them there. A
   tab for each line shows its ships (the Forbidden Fleets four a tier, each with how it will be won and in what
   currency), and Buy the masterworks, for doubloons; all but the European line are planned, with provisional figures
   and their legends.

   Your ship's hull, level, gold, doubloons and hold are in the top-left corner, speed and FPS under it; the quests
   you have taken (✕ gives one up, once you say yes) and the Captain's path are in the top-right corner, each folded
   by a click on its header. The four buttons on top of the minimap's frame open the hold, the loadout, the talents
   and the captain's mastery (P: the account's own tree of passives for every ship you sail, round the captain; a
   look ahead until the online game brings its points). The two small medallions in the minimap frame's top corners
   are the settings and the full screen. The settings open every other control (the language, camera, fog,
   clouds, range rings, damage and speed tuning, gold for testing, navigation debug) and picks which of them also stay
   on the screen. The game speaks English (the default), Ukrainian or Russian; a new language reloads the page.

   Your progress (gold, guns, ammo, quests, cargo, talents, the Captain's path, where your ship is) and every setting
   are kept in the browser (IndexedDB) until there is a server: a reload carries on where you were. Settings → Debug →
   New game starts over (in the same language).

## Scripts

| Command           | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Dev server with hot reload, opens the browser                   |
| `npm run check`   | Type check, lint and formatting check — run before every commit |
| `npm run format`  | Formats all files with Prettier                                 |
| `npm run lint`    | Lints with Oxlint only                                          |
| `npx tsc`         | Type check only (no output files)                               |
| `npm run build`   | Type check, then production build into `dist/`                  |
| `npm run preview` | Serves the `dist/` build locally to check it before deploying   |

## Building for production

```bash
npm run build
```

The result is static files in `dist/` (`index.html` + `assets/`). They can be hosted on any static
hosting or CDN — there is no backend yet.

## Development

- Architecture, code conventions and project rules are described in [CLAUDE.md](CLAUDE.md)
  (also used as context by Claude Code). Detailed rules per area are in [.claude/rules/](.claude/rules/).
- There are no automated tests yet: run `npm run check` and check changes in the browser.
- Ship sprite atlases in `public/sprites/ships/` (the players' ships and the bots', in damage stages and looks) are rendered in [Blender](https://www.blender.org/) from a source kept outside this repo — don't edit them
  by hand. Ship lines and how to add a ship: [docs/ships.md](docs/ships.md).
- Code is formatted by [Prettier](https://prettier.io/) and linted by [Oxlint](https://oxc.rs/docs/guide/usage/linter)
  (ESLint's TypeScript parser doesn't support TypeScript 7 yet). In VS Code, install the recommended extensions
  (Prettier, Oxc) — the project settings format files on save.
- Changes go to `main` through pull requests only. Branches: `feature/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`;
  commit messages: `[FEATURE]: short description`.
- With Claude Code: `/code-review` reviews your changes, `/git-push` reviews them and opens a pull request.
