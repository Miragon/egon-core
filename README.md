# egon-core

A [diagram-js](https://github.com/bpmn-io/diagram-js)-based rendering and
modeling plugin for [Domain Storytelling](https://domainstorytelling.org/)
diagrams. It is the standalone core extracted from
[egon.io](https://github.com/WPS/egon.io) — the domain-story editor — and
provides an embeddable client (`EgonClient`) plus the underlying diagram-js
module (`EgonPlugin`).

## Install

Use the repository's Node version without changing your nvm default, then
install dependencies:

```bash
nvm install
nvm use
yarn install
```

Node 24 is required by the local demo router. CI reads the same `.nvmrc`.

To install only the published package in another project:

```bash
yarn add egon-core
```

The package ships as ESM. `diagram-js` and its companion packages
(`diagram-js-direct-editing`, `didi`, `ids`, `min-dash`, `min-dom`, `tiny-svg`)
are regular dependencies today; a consuming app should have a bundler that can
resolve ESM.

## Usage

Import the client and the stylesheet, then mount it into a DOM container:

```ts
import { EgonClient } from "egon-core";
import "egon-core/style.css";

const client = await EgonClient.create({
    container: document.getElementById("canvas")!,
});

client.on("story.changed", () => {
    const document = client.export();
    // persist `document` ...
});
```

Both the runtime (`dist/index.js`) and its type declarations
(`dist/index.d.ts`) are emitted to `dist/`, and the compiled styles to
`dist/style.css`. See [docs/Client.md](docs/Client.md) for the full
`EgonClient` API.

## Host integration: color picker

Recoloring an element is host-owned: the core dispatches and listens for
document-level `CustomEvent`s, and the host supplies the actual color picker
UI. Wire a picker to these events; a host without one still shows the pad's
color button, but it does nothing.

- **Core dispatches `openColorPicker`** when the pad's color button is clicked.
  The host should open its picker in response.
- **Core dispatches `defaultColor`** (`detail.color`) whenever a context pad
  opens, carrying the current selection's color so the host can pre-select the
  matching swatch.
- **Core listens for `pickedColor`** (`detail.color`) and applies the color to
  the selected element(s) — one undo step per element on a multi-select.
- **Core dispatches `errorColoringOnlySvg`** when a color is applied to an
  element whose custom icon is not SVG (raster icons cannot be recolored). The
  host may surface this as a notification.

## Scripts

| Script                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `yarn build`           | Production build → `dist/` (ESM, `.d.ts` tree, styles) |
| `yarn dev`             | Build in development mode                              |
| `yarn demo`            | Start the public-API demo through portless             |
| `yarn test`            | Run the unit suite (Vitest, jsdom)                     |
| `yarn test:watch`      | Run unit tests in watch mode                           |
| `yarn test:coverage`   | Run unit tests with coverage                           |
| `yarn test:browser`    | Run browser-tier Vitest integration specs              |
| `yarn test:e2e`        | Run the four headless Playwright journeys              |
| `yarn test:e2e:headed` | Run the Playwright journeys in a visible browser       |
| `yarn typecheck`       | Type-check library, tests, demo, and e2e code          |
| `yarn lint`            | Lint with ESLint                                       |

## Demo and end-to-end journeys

After `nvm install`, `nvm use`, and `yarn install`, start the demo with:

```bash
yarn demo
```

Portless prints the worktree-aware URL. The main checkout uses a route based on
`egon-core-demo.localhost`; linked worktrees gain their branch name as a
subdomain. The proxy uses loopback HTTP on port `1355` and does not edit
`/etc/hosts`. Override the proxy port with `PORTLESS_PORT=<port> yarn demo`.
Its temporary proxy state is shared by egon-core worktrees and may be overridden
with `PORTLESS_STATE_DIR` when needed.

The canvas palette creates actors and work objects. Select an element to use its
context pad, double-click shapes or activities to edit them, and use Ctrl/Cmd+Z
and Ctrl/Cmd+Shift+Z for undo/redo. Export and import use the in-page JSON panel
only; **New story** resets the canvas while retaining that text.

Install the pinned Chromium build once, then run the journeys:

```bash
yarn playwright install chromium
yarn test:e2e
# or: yarn test:e2e:headed
```

## Architecture

Significant decisions are recorded as ADRs in [docs/adr](docs/adr/README.md).
The layout and layering rules from
[ADR 0005](docs/adr/0005-module-layout-and-architecture-tests.md) are enforced
by executable architecture tests (`src/architecture.spec.ts`, run as part of
`yarn test`).

## License

[GPL-3.0-or-later](LICENSE)
