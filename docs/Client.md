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
    viewport: { scroll: { x: 0, y: 0 }, zoom: 1 },
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

| Event              | Callback signature                 | Fired when …                     |
| ------------------ | ---------------------------------- | -------------------------------- |
| `story.changed`    | `() => void`                       | The diagram content changes.     |
| `viewport.changed` | `(viewport: ViewportData) => void` | The user scrolls or zooms.       |
| `icons.changed`    | `(icons: IconSet) => void`         | The registered icon set changes. |

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
```

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
