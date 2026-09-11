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
`dist/style.css`. The exported stylesheet includes diagram-js's required editor
layout, the BPMN icon font, and egon-core's built-in SVG masks. Hosts only need
to give the canvas container a usable size. See
[docs/Client.md](docs/Client.md) for the full `EgonClient` API.

## Host integration: color picker

Recoloring UI is host-owned and communicates with the core through a
client-scoped request protocol. A host without a picker still shows the pad's
color button, but clicking it has no visual effect.

```ts
const requested = ({ requestId, color }) => {
    picker.open({ color });
    picker.onPreview((next) => client.previewPickedColor(requestId, next));
    picker.onConfirm((final) => client.confirmPickedColor(requestId, final));
    picker.onCancel(() => client.cancelColorPicker(requestId));
};
const closed = ({ requestId }) => picker.close(requestId);

client.on("colorPicker.requested", requested);
client.on("colorPicker.closed", closed);

// During host teardown, close the UI and remove subscriptions before destroy.
picker.close();
client.off("colorPicker.requested", requested);
client.off("colorPicker.closed", closed);
client.destroy();
```

Preview calls may be repeated. They repaint without changing the exported
story, dirty state, or undo history. Confirmation applies one existing color
command per selected element; cancellation restores the persisted appearance.
Unknown, expired, other-client, and destroyed-client request IDs return `false`.
The core still dispatches `errorColoringOnlySvg` when a color is applied to an
element whose custom icon is not SVG (raster icons cannot be recolored). The
host may surface this as a notification. See [docs/Client.md](docs/Client.md)
for webview routing and lifecycle details.

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
| `yarn test:e2e`        | Run public Playwright journeys and stylesheet checks   |
| `yarn test:e2e:headed` | Run the Playwright journeys in a visible browser       |
| `yarn test:package`    | Pack and test an isolated installed-package consumer   |
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

To exercise those same journeys against the package contents rather than the
source aliases, run:

```bash
yarn test:package
yarn test:package --archive /path/to/egon-core.tgz
```

Without `--archive`, the runner calls `yarn pack` (and therefore the package's
`prepack` build). It stages the demo in a temporary project outside this
repository, installs only the archive plus pinned Vite/TypeScript tooling,
type-checks and builds that consumer, validates packaged CSS asset references,
and serves the production build for Playwright. GitHub's **Release archive
validation** workflow performs the same check against a selected commit's
downloaded source archive and runs automatically for published releases.

## Architecture

Significant decisions are recorded as ADRs in [docs/adr](docs/adr/README.md).
The layout and layering rules from
[ADR 0005](docs/adr/0005-module-layout-and-architecture-tests.md) are enforced
by executable architecture tests (`src/architecture.spec.ts`, run as part of
`yarn test`).

## License

[GPL-3.0-or-later](LICENSE)
