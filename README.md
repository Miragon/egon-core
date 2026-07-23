# egon-core

A [diagram-js](https://github.com/bpmn-io/diagram-js)-based rendering and
modeling plugin for [Domain Storytelling](https://domainstorytelling.org/)
diagrams. It is the standalone core extracted from
[egon.io](https://github.com/WPS/egon.io) — the domain-story editor — and
provides an embeddable client (`EgonClient`) plus the underlying diagram-js
module (`EgonPlugin`).

## Install

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

| Script               | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `yarn build`         | Production build → `dist/` (ESM, `.d.ts` tree, styles) |
| `yarn dev`           | Build in development mode                              |
| `yarn test`          | Run the test suite (Vitest, jsdom)                     |
| `yarn test:watch`    | Run tests in watch mode                                |
| `yarn test:coverage` | Run tests with coverage                                |
| `yarn typecheck`     | Type-check without emitting (`tsc --noEmit`)           |
| `yarn lint`          | Lint with ESLint                                       |

## Architecture

Significant decisions are recorded as ADRs in [docs/adr](docs/adr/README.md).
The layout and layering rules from
[ADR 0005](docs/adr/0005-module-layout-and-architecture-tests.md) are enforced
by executable architecture tests (`src/architecture.spec.ts`, run as part of
`yarn test`).

## License

[GPL-3.0-or-later](LICENSE)
