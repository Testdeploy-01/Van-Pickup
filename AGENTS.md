# AGENTS.md - Van Pickup Route Planner

## Project Overview

A static front-end web app (no build step, no bundler, no Node.js runtime) that plans
optimal van pickup routes in southern Thailand. Users mark a start point, choose a
destination (bus terminal), drop pickup points on a Leaflet map, and the app computes
the fastest route using Dijkstra's algorithm with a greedy pickup ordering heuristic.
Road data comes from the public OSRM API.

Language: **Thai** UI, **English** code identifiers.

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Runtime      | Browser only - vanilla JS ES modules (`type="module"`) |
| Map          | Leaflet 1.9.4 (loaded via CDN `unpkg.com`)       |
| Routing API  | OSRM public demo (`router.project-osrm.org`)     |
| CSS          | Single `style.css`, no preprocessor              |
| Fonts        | IBM Plex Sans Thai (Google Fonts)                 |
| Build tools  | **None** - open `index.html` directly in a browser |
| Package mgr  | **None** - no `package.json`                      |
| Tests        | **None** - no test framework configured           |

## Directory Structure

```
Mini Project Web/
  index.html              # Single HTML entry point
  style.css               # All styles (1668 lines, responsive, CSS custom props)
  js/
    main.js               # App entry point - init, state, DOM wiring, event handlers
    dijkstra.js           # Dijkstra's shortest path algorithm
    greedy.js             # Greedy nearest-pickup route planner (uses Dijkstra)
    osrm.js               # OSRM API integration (nearest/table/route)
    simulation.js         # Route simulation controller (van animation)
    pickup.js             # Pickup point manager (markers, CRUD)
    destination.js        # Bus terminal destination helpers
    map-colors.js         # Color palette for map segments
    gps.js                # Browser geolocation wrapper
    complexity.js         # Renders algorithm complexity analysis table
    data/
      bks.js              # Static data: 14 southern Thailand bus terminals
  output/                 # Playwright CLI output (generated, not source)
  .playwright-cli/        # Playwright CLI logs (generated, not source)
```

## How to Run

```sh
# No build step. Serve the directory with any static file server:
npx serve .
# or
python -m http.server 8000
# Then open http://localhost:8000 (or the port shown) in a browser.
#
# Alternatively, open index.html directly if the browser allows file:// ES modules.
```

There is **no** `npm install`, `npm run build`, `npm test`, or similar command.

## How to Lint / Test

There are no configured linters, formatters, or test runners in this project.
If you add tooling, update this section.

## Code Style Guidelines

### General

- Pure vanilla JavaScript ES modules; no TypeScript, no JSX, no framework.
- No build step - all JS runs directly in the browser via `<script type="module">`.
- The HTML file loads Leaflet from CDN; all other code is local ES modules under `js/`.
- The global `L` (Leaflet) is referenced directly without import.

### File Organization

- One module per concern (algorithm, API layer, UI manager, data).
- `main.js` is the orchestrator: it owns the app state object, wires DOM events,
  and calls into other modules. Other modules are pure logic or factory functions.
- Static data lives in `js/data/`.

### Naming Conventions

- **Files**: lowercase kebab-case (`map-colors.js`, `dijkstra.js`).
- **Functions**: camelCase, verb-first (`computeGreedyRoute`, `runDijkstra`,
  `createPickupManager`, `resolveNearestPoint`, `formatDistance`).
- **Factory functions**: `create*` prefix returns an object with methods
  (`createSimulationController`, `createPickupManager`, `createState`).
- **Constants**: UPPER_SNAKE_CASE for module-level constants
  (`DEFAULT_CENTER`, `STORAGE_KEY`, `SPEED_PRESETS`, `SOUTHERN_BKS`).
- **DOM helpers**: `getDom()` returns a flat object of DOM element references keyed
  by their camelCase id.
- **Parameters**: camelCase. Destructured option objects for optional params
  (`{ silentPersist = false } = {}`).
- **Node/point objects**: use `id`, `type`, `lat`, `lng`, `label`, `rawLat`, `rawLng`,
  `snapKey`, `nearestName`, `nearestNodeIds`, `source`, `terminalId`.

### Imports / Exports

- Named exports only (`export function ...`, `export const ...`). No default exports.
- Import paths use relative `./` with `.js` extension (required for native ES modules).
- Group imports at the top of each file, sorted roughly by domain.

### Formatting

- 2-space indentation.
- Semicolons at end of statements.
- Double quotes for strings.
- Trailing commas in multi-line function args and object/array literals.
- Max line length ~120 characters (soft limit, not enforced by tooling).
- Single blank line between function declarations.
- Inline comments use `//` with a space. Block comments use `/* */`.

### Functions and Patterns

- Prefer pure functions that take explicit parameters over closures with shared state.
- Factory functions (`create*`) return plain objects with methods (no classes).
- State is a single mutable object created in `main.js` and threaded through functions.
- Async/await for all OSRM API calls; Promises used for concurrency
  (`Promise.all`, `runWithConcurrency`).
- Error handling: try/catch at API boundaries; surface user-facing error messages
  via DOM (`dom.statusBanner.textContent`).
- DOM manipulation is direct (`document.querySelector`, `createElement`,
  `classList.toggle`, `textContent`).

### CSS

- CSS custom properties defined on `:root` for theming (`--primary`, `--foreground`, etc.).
- BEM-ish class naming (`.step-summary__title`, `.map-pin__dot`, `.sim-van-marker__body`).
- Utility class `.hidden` uses `display: none !important`.
- Responsive breakpoints at 1180px, 960px, 640px, and 420px.
- Animations via `@keyframes` (no JS animation libraries).

### Algorithm Implementation

- `dijkstra.js`: Classic Dijkstra with a `Set` as the unvisited queue (no priority heap).
  Comments reference the professor's pseudocode line-by-line.
- `greedy.js`: Greedy nearest-neighbor heuristic that runs Dijkstra (k+1) times to
  pick the closest unvisited pickup at each step, then routes to the destination.
- `osrm.js`: Wraps OSRM Nearest/Table/Route APIs with retry logic, timeout handling,
  caching (`nearestCache`, `tableCache`, `routeCache`), and a route-fallback strategy.
- `complexity.js`: Renders a line-by-line frequency-count complexity analysis table.

### Error Handling

- Wrap external API calls in try/catch; display errors to the user via status text.
- Use `Number.POSITIVE_INFINITY` for unreachable nodes (not `Infinity` literal).
- Background resolution (`resolve*InBackground`) silently catches errors and updates
  the status banner without breaking the main flow.

### UI Text

- All user-facing strings are in Thai.
- Code identifiers, comments, and documentation are in English.

### Things to Avoid

- Do not introduce a build system, bundler, or transpiler without explicit agreement.
- Do not use classes; the codebase uses factory functions and plain objects.
- Do not add npm dependencies; all third-party code is loaded via CDN `<script>` tags.
- Do not use default exports; the codebase uses named exports exclusively.
- Do not use `var`; use `const` by default, `let` only when reassignment is needed.
