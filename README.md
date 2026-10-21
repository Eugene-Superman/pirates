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

4. Play: click (or tap) on the sea to set a course. Hold the button and drag to steer continuously.
   Speed and FPS are shown in the top-left corner.

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
- Code is formatted by [Prettier](https://prettier.io/) and linted by [Oxlint](https://oxc.rs/docs/guide/usage/linter)
  (ESLint's TypeScript parser doesn't support TypeScript 7 yet). In VS Code, install the recommended extensions
  (Prettier, Oxc) — the project settings format files on save.
- Changes go to `main` through pull requests only. Branches: `feature/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`;
  commit messages: `[FEATURE]: short description`.
- With Claude Code: `/code-review` reviews your changes, `/git-push` reviews them and opens a pull request.
