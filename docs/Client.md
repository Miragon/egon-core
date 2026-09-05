# EgonClient API

`EgonClient` is the primary entry point for embedding a Domain Storytelling
diagram in an application. It acts as an application-service facade over the
diagram-js modeler, exposing a small, domain-focused API and hiding the
infrastructure (adapters, ports) behind it.

```ts
import { EgonClient } from "egon-core";
import "egon-core/style.css";
```

## Creating a client

```ts
static create(
    config: EgonClientConfig,
    additionalModules?: ModuleDeclaration[],
    ports?: EgonClientPorts,
): Promise<EgonClient>
```

`create` is asynchronous because the diagram-js adapters are loaded via dynamic
`import()` (works in both browser and Node ESM environments).

### `EgonClientConfig`

| Field       | Type            | Description                             |
| ----------- | --------------- | --------------------------------------- |
| `container` | `HTMLElement`   | The element to render the diagram into. |
| `width`     | `string?`       | Canvas width (default `"100%"`).        |
| `height`    | `string?`       | Canvas height (default `"100%"`).       |
| `viewport`  | `ViewportData?` | Initial viewport (scroll + zoom).       |

`additionalModules` accepts extra diagram-js
[`ModuleDeclaration`](https://github.com/nikku/didi)s. `ports` is intended for
testing — when supplied, the client uses the injected `modelerPort`/`iconPort`
instead of creating diagram-js adapters.

```ts
const client = await EgonClient.create({
    container: document.getElementById("canvas")!,
    viewport: { x: 0, y: 0, width: 1200, height: 800 },
});
```

## Document operations

```ts
import(document: DomainStoryDocument): void
export(): DomainStoryDocument
```

`import` loads a domain story into the diagram (icons referenced by the
document's domain section are loaded automatically). `export` returns the
current diagram state as a `DomainStoryDocument`.

## Events

```ts
on<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void
off<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void
```

| Event              | Callback signature                   | Fired when …                     |
| ------------------ | ------------------------------------ | -------------------------------- |
| `story.changed`    | `() => void`                         | The diagram content changes.     |
| `viewport.changed` | `(viewport: ViewportData) => void`   | The user scrolls or zooms.       |
| `icons.changed`    | `(icons: IconSet) => void`           | The registered icon set changes. |
| `import.repaired`  | `(repair: ImportRepairData) => void` | A damaged import is repaired.    |

Passing any other event name throws `TypeError` with the message
`Unknown Egon event: <name>`. TypeScript rejects unknown names at compile time;
the runtime check protects JavaScript callers and deliberate type escapes.
Calling `off` with a supported event and an unregistered callback is harmless.

```ts
client.on("story.changed", () => {
    const doc = client.export();
    // persist doc ...
});
```

## Viewport

```ts
getViewport(): ViewportData
setViewport(viewport: ViewportData): void
alignToOrigin(): void
fitToScreen(): void
```

`getViewport()` and every `viewport.changed` callback return a fresh plain
object containing exactly `{ x, y, width, height }`. Internal diagram-js
viewbox fields such as scale and inner/outer bounds are never exposed.

`alignToOrigin` shifts all diagram contents to positive coordinates (origin plus
a small offset). Stories with elements at negative coordinates break exports in
external tools, so call it before a host-side SVG/PNG export. `fitToScreen`
aligns to origin and then scales the whole story to fit the visible canvas — the
action to wire to a "fit to screen" UI button.

> **Both may fire `story.changed`.** Aligning runs through the command stack (it
> is undoable), which fires `story.changed`. Hosts that treat that event as a
> dirty signal — for example the documented save pattern below — should align
> _before_ a save/export, not react to it, or every export would re-dirty the
> document.

## Icon management

```ts
loadIcons(icons: Partial<IconSetData>): void
addIcon(category: IconCategory, name: string, svg: string): void
removeIcon(category: IconCategory, name: string): void
getIcons(): IconSet
hasIcon(category: IconCategory, name: string): boolean
```

`loadIcons` merges the given actors/work-objects into the current set,
overwriting entries with the same name.

## Lifecycle

```ts
destroy(): void
```

Tears down the modeler and releases its resources. Call it before removing the
container from the DOM.

## Advanced: the raw plugin module

For custom diagram-js integrations that need direct control over the modeler,
the underlying module is exported as `EgonPlugin`:

```ts
import { EgonPlugin } from "egon-core";
```

Prefer `EgonClient` for application use; `EgonPlugin` is for advanced,
custom-integration scenarios.
