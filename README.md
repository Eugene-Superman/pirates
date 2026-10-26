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

4. Play: click (or tap) on the sea to set a course; the ship finds its way round islands. Hold the button and drag to
   steer continuously. Bots sail the sea: fishing boats, merchants and turtles leave you alone, smugglers and sea
   serpents attack when you come near. Click one to pick it out (its hull shows at the top), double-click it or press
   Space to fire the selected weapon at it, Escape to stop. Kills and quests give experience: every ship has its own
   level, from 1: the starter sloop's go up to 10, a line's ships' to 20. Each level from 2 gives a talent point for three branches (Gunnery, Seamanship, Hull and crew),
   ranked, a branch's next row opening with points spent in it; levels 5, 10, 15 and 20 (those a ship reaches) offer
   one of two signature talents instead (the level 5 one is an ability, F). K opens the tree; a button by your ship's frame lights up when
   something waits to be picked; the shipwright forgets them all for a little gold. R repairs the hull out of combat,
   for a little gold (1 for every 20 hull; the shipwright in port does it at once, for more); L opens the loadout
   (guns in the slots, ammo); J opens the combat log in the bottom-left corner (every blow dealt and taken with its
   dice, kills, repairs, cargo, totals). The minimap in the bottom-right corner shows the islands round you and
   everyone in sight; a click on it (or M) opens the sea chart: the whole sea, 8 × 8 squares from A1 to H8, with the
   islands, your ship, the Smuggler Baron's lair and your lost cargo. The bar at the bottom picks the weapon (or Q for
   the cannons, E for the harpoons; the new weapon's guns reload first) and the ammo.

   Every kill pays gold (top right), and the wreck may leave goods floating (fish, cloth, rum, turtle shell…), a
   ship's with a chest of gold: sail over them to haul them into your hold (its places show beside your gold). H, or
   a click on the hold, opens it: throw goods overboard to make room for better ones. Goods are sold at the port's
   market; if your ship goes down, its cargo floats where it sank, marked on your charts, for a few minutes.
   The port in the middle of the map (sail into its bay between the breakwaters, or click its island) shows the
   harbour with a medallion over each building: the tavern, where you take bounty quests ("hunt five turtles") and
   turn them in; the market; the workshop: the outfit (sails, hull planking, rudders and lookouts in three tiers, each
   with sidegrades, fitted there and then: speed, turning, hull, sight) and the shipwright's repair; the shipyard; and
   the arsenal: guns (they go to the hold; fit them in the loadout, L) and packs of ammo. Every item's card has an
   info button with all its figures and its legend. The guild hall and the auction house open with the online game.
   Escape goes back from a building to the harbour; Set sail (or Escape again) leaves port.

   The goal of the starting waters is the next ship, the Coastal Bark (the European line's tier 1): the Captain's path
   under your gold lists what the shipyard asks (a first kill, a talent, a repair at sea, a sale; quests turned in, a
   level, the Smuggler Baron sunk, the price). The Baron's brig sails in the north-east with two smugglers; his mortar
   marks red circles on the water where its shells will land — sail out of them. With every term met, the shipyard
   sells the Coastal Bark: it starts at level 1 (up to 20) with talents of its own, and your sloop stays in port with
   everything on it. The shipyard's My ships lists your ships: take the helm of any of them there. A tab for each line
   shows its ships (the Forbidden Fleets four a tier, each with how it will be won and in what currency), and Buy the
   masterworks, for doubloons; all but the Coastal Bark are planned, with provisional figures and their legends.

   Your ship's hull is in the top-left corner, speed and FPS under it; the button in the top-right corner puts the
   game on the whole screen and back. The Settings button opens every other control (the language, camera, fog, range
   rings, damage and speed tuning, gold for testing, navigation debug) and picks which of them also stay on the
   screen. The game speaks English (the default), Ukrainian or Russian; a new language reloads the page.

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
