# EgonClient API

`EgonClient` is the primary entry point for embedding a Domain Storytelling
diagram in an application. It acts as an application-service facade over the
diagram-js modeler, exposing a small, domain-focused API and hiding the
infrastructure (adapters, ports) behind it.

```ts
import { EgonClient } from "egon-core";
import "egon-core/style.css";
```

The stylesheet is the complete editor stylesheet: it contains diagram-js's
base palette, context-pad, canvas, and interaction rules together with the BPMN
icon font and egon-core's group, color-picker, and direction masks. Do not add a
separate `diagram-js/assets/diagram-js.css` import in the host. The host remains
responsible for sizing the container (directly or through `width` and `height`);
the stylesheet cannot infer the available application layout.

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

Each additional-module instance belongs to one editor session. Import creates a
new instance for its candidate, including candidates that ultimately fail.
Extensions must release listeners, timers, and DOM in `diagram.destroy`.
External effects and mutable shared `value` providers cannot be rolled back by
the core transaction.

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

Import treats every element, metadata field, scope value, and icon source as
untrusted at runtime, even when a caller has typed the value as
`DomainStoryDocument`. It accepts the current EGN v4 envelope and the supported
legacy `domain`/`dst` and bare-array formats. Historical type/icon spelling,
BPMN leftovers, annotation heights, missing activity numbers, dangling edges,
and invalid group parents are repaired as documented by `import.repaired`.
Malformed records, duplicate or reserved ids, unsupported element families,
invalid metadata/scope, non-finite geometry, non-positive supplied dimensions,
and retained connections with fewer than two valid waypoints are rejected.

The replacement is atomic: parsing, icon preparation, module construction, and
rendering happen in an isolated editor session. If any of them throws, the
current story, icons, metadata, viewport, undo/redo history, subscriptions, and
live element identities remain unchanged. A successful replacement preserves
the viewport and starts with an empty undo/redo history.

## Events

```ts
on<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void
off<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void
```

| Event                   | Callback signature                          | Fired when …                        |
| ----------------------- | ------------------------------------------- | ----------------------------------- |
| `story.changed`         | `() => void`                                | The diagram content changes.        |
| `viewport.changed`      | `(viewport: ViewportData) => void`          | The user scrolls or zooms.          |
| `icons.changed`         | `(icons: IconSet) => void`                  | The registered icon set changes.    |
| `import.repaired`       | `(repair: ImportRepairData) => void`        | A damaged import is repaired.       |
| `colorPicker.requested` | `(request: ColorPickerRequestData) => void` | A color button is clicked.          |
| `colorPicker.closed`    | `(closed: ColorPickerClosedData) => void`   | Its request ends or is invalidated. |

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

### Host-owned color picker

```ts
previewPickedColor(requestId: string, color: string): boolean
confirmPickedColor(requestId: string, color: string): boolean
cancelColorPicker(requestId: string): boolean
```

The core creates a request only when the context pad's color button is clicked.
`colorPicker.requested` synchronously supplies an opaque `requestId`, a copied
`elementIds` array, and the initial `color`. Preview may be called repeatedly;
it repaints the selected elements, activity markers, and annotation connectors
without writing the model, marking the story dirty, emitting `story.changed`,
or adding undo history. Confirmation persists the final color through one
`element.colorChange` command per selected element. Cancellation clears every
preview. Both terminal actions synchronously emit `colorPicker.closed`.

Only the originating live client accepts a response. Unknown, expired,
other-client, and destroyed-client IDs return `false` without changing state.
A request also expires when its selection changes, its pad closes, a target is
removed or replaced, another command (including undo/redo) runs, another picker
request opens, a successful import replaces the editor session, or the client
is destroyed. A failed import leaves it active. Reselecting the original
elements never revives an expired request.

```ts
const requested = ({ requestId, color }: ColorPickerRequestData) => {
    picker.open({ requestId, color });
    picker.onPreview((nextColor) =>
        client.previewPickedColor(requestId, nextColor),
    );
    picker.onConfirm((finalColor) =>
        client.confirmPickedColor(requestId, finalColor),
    );
    picker.onCancel(() => client.cancelColorPicker(requestId));
};
const closed = ({ requestId }: ColorPickerClosedData) => {
    picker.close(requestId);
};

client.on("colorPicker.requested", requested);
client.on("colorPicker.closed", closed);

// Component cleanup
client.off("colorPicker.requested", requested);
client.off("colorPicker.closed", closed);
```

For a webview, retain both the originating client and request ID instead of
broadcasting a global color message:

```ts
const clients = new Map<string, EgonClient>();

function wirePicker(clientKey: string, client: EgonClient) {
    clients.set(clientKey, client);
    client.on("colorPicker.requested", (request) =>
        webview.postMessage({
            type: "colorPicker.requested",
            clientKey,
            request,
        }),
    );
}

window.addEventListener("message", ({ data }) => {
    const client = clients.get(data.clientKey);
    if (!client) return;
    if (data.type === "colorPicker.preview")
        client.previewPickedColor(data.requestId, data.color);
    if (data.type === "colorPicker.confirm")
        client.confirmPickedColor(data.requestId, data.color);
    if (data.type === "colorPicker.cancel")
        client.cancelColorPicker(data.requestId);
});
```

Hosts must close their picker as part of their own teardown before calling
`client.destroy()`; teardown deliberately invokes no host callbacks after it
begins. A future bundled/default picker must consume this same protocol.

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

`loadIcons` replaces the selected icon set; omitted categories become empty.
`addIcon` adds one actor or work-object icon to that selection.

Icon names are preserved verbatim. Icon markup is treated as untrusted input and
may be normalized when stored or exported. Static SVG artwork is supported,
including shapes, text, transforms, gradients, clipping, masks, presentation
attributes and a restricted set of inline presentation styles. Scripts, event
handlers, `foreignObject`, animation, embedded stylesheets and executable or
external references are removed. Malformed or fully removed artwork is retained
under its original name as an empty inert SVG. Supported base64 PNG, JPEG, GIF
and WebP data URLs are preserved after validation.

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
