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

To install the built `0.1.0` package from its versioned GitHub Release:

```bash
yarn add egon-core@https://github.com/Miragon/egon-core/releases/download/v0.1.0/egon-core-0.1.0.tgz
```

Use the URL for the version your host pins. A GitHub Release becomes
installable after its **Release archive** workflow validates and attaches the
`.tgz`; the automatically generated source archives are not built packages. See
[docs/Releasing.md](docs/Releasing.md) for the release and recovery process.

The package ships as ESM. `diagram-js`, Preact, and the companion packages
(`diagram-js-direct-editing`, `didi`, `ids`, `min-dash`, `min-dom`, `tiny-svg`)
are regular dependencies today; a consuming app should have a bundler that can
resolve ESM.

## Usage

Import the client, optional starter icons, and the stylesheet, then mount it
into a DOM container:

```ts
import { EgonClient } from "egon-core";
import { defaultIcons } from "egon-core/icons";
import "egon-core/style.css";

const client = await EgonClient.create({
    container: document.getElementById("canvas")!,
    defaultIcons,
});

client.on("story.changed", () => {
    const document = client.export();
    // persist `document` ...
});
```

Omit `defaultIcons`, or set it to `false`, to keep the palette empty. The
explicit `egon-core/icons` import lets application bundlers exclude the
`Person` and `Document` starter artwork when a host supplies its own icons.

The client runtime (`dist/index.js`), optional icon entry (`dist/icons.js`),
their type declarations, and the compiled `dist/style.css` are emitted to
`dist/`. The exported stylesheet includes diagram-js's required editor
layout, the BPMN icon font, and egon-core's built-in SVG masks. Hosts only need
to give the canvas container a usable size. See
[docs/Client.md](docs/Client.md) for the full `EgonClient` API.

## Color picker

Plain clients include an anchored, keyboard-accessible color picker. A host can
replace it with a provider or remove both single- and multi-selection color
actions with `false`.

```ts
const client = await EgonClient.create({
    container,
    colorPicker: (request) => {
        const picker = hostPicker.open(request.color, request.anchor);
        return {
            result: picker.result, // Promise<string | null>
            dispose: () => picker.close(),
        };
    },
});

const readOnly = await EgonClient.create({ container, colorPicker: false });
```

Providers receive copied IDs, the initial color, an opaque request ID, viewport
anchor coordinates, and an `AbortSignal`; they receive no diagram services or
mutable elements. Resolve with short/full hex (optional alpha) or RGB/RGBA to
apply, and `null` to cancel. See [docs/Client.md](docs/Client.md) for lifecycle,
validation, and migration details.

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

Typechecking uses TypeScript 7 (`yarn tsc`, supplied by `@typescript/native`).
The `typescript` dependency aliases the TypeScript 6 compatibility API needed
by ESLint, declaration generation, and source-analysis tests. The isolated
package consumer also typechecks with TypeScript 7; see
[ADR 0035](docs/adr/0035-typescript-native-compiler-and-compatible-tooling-api.md).

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

The demo opts into the packaged `Person` and `Document` starter icons. Its
canvas palette creates actors and work objects. Select an element to use its
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
and serves the production build for Playwright. GitHub's **Release archive**
workflow performs the same check against a selected commit's downloaded source
archive. Published releases upload only after validation; manual runs validate
by default and can recover an upload for an existing matching version release.

## Architecture

Significant decisions are recorded as ADRs in [docs/adr](docs/adr/README.md).
The layout and layering rules from
[ADR 0005](docs/adr/0005-module-layout-and-architecture-tests.md) are enforced
by executable architecture tests (`src/architecture.spec.ts`, run as part of
`yarn test`).

## License

[GPL-3.0-or-later](LICENSE)
