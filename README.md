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
   Space to fire the selected weapon at it, Escape to stop. R repairs the hull out of combat; L opens the loadout
   (guns in the slots, ammo); J opens the combat log in the bottom-left corner (every blow dealt and taken with its
   dice, kills, repairs, totals). The minimap in the bottom-right corner shows the islands round you and everyone in
   sight; a click on it (or M) opens the sea chart: the whole sea, 8 × 8 squares from A1 to H8, with the islands
   and your ship. The bar at the bottom picks the weapon and the ammo.

   Every kill pays gold (top right), and some leave a chest: sail over it for more. The port in the middle of the map
   (click its island to sail in) has a tavern, where you take bounty quests ("hunt five turtles") and turn them in, and
   a shop: guns (they go to the hold; fit them in the loadout, L), packs of ammo and the shipwright's repair. Leave port
   with its button or Escape.

   Speed and FPS are in the top-left corner; the Settings button opens every other control (camera, fog, range rings,
   damage and speed tuning, gold for testing, navigation debug) and picks which of them also stay on the screen.

   Your progress (gold, guns, ammo, quests, where your ship is) and every setting are kept in the browser (IndexedDB)
   until there is a server: a reload carries on where you were. Settings → Debug → New game starts over.

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
- Ship sprite atlases in `public/sprites/ships/` are rendered in [Blender](https://www.blender.org/) from a source kept
  outside this repo — don't edit them by hand. Ship lines and how to add a ship: [docs/ships.md](docs/ships.md).
- Code is formatted by [Prettier](https://prettier.io/) and linted by [Oxlint](https://oxc.rs/docs/guide/usage/linter)
  (ESLint's TypeScript parser doesn't support TypeScript 7 yet). In VS Code, install the recommended extensions
  (Prettier, Oxc) — the project settings format files on save.
- Changes go to `main` through pull requests only. Branches: `feature/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`;
  commit messages: `[FEATURE]: short description`.
- With Claude Code: `/code-review` reviews your changes, `/git-push` reviews them and opens a pull request.
