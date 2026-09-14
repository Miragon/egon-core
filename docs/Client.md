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

| Field          | Type                             | Description                                            |
| -------------- | -------------------------------- | ------------------------------------------------------ |
| `container`    | `HTMLElement`                    | The element to render the diagram into.                |
| `width`        | `string?`                        | Canvas width (default `"100%"`).                       |
| `height`       | `string?`                        | Canvas height (default `"100%"`).                      |
| `viewport`     | `ViewportData?`                  | Initial viewport (scroll + zoom).                      |
| `textRenderer` | `DomainStoryTextRendererConfig?` | Label typography overrides.                            |
| `colorPicker`  | `ColorPickerProvider \| false`   | Built-in when omitted; custom provider; or no actions. |

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

## Static image export

```ts
exportSVG(options?: SvgExportOptions): Promise<SvgExportResult>
exportPNG(options?: PngExportOptions): Promise<PngExportResult>
```

`exportSVG` returns `{ svg, width, height }`; `exportPNG` returns
`{ bytes: Uint8Array, width, height }`, so the host can create a Blob or write
the bytes through its own file API. Both render the complete story from one
captured document revision, independent of scroll, zoom, selection, replay,
editing overlays, and passive color previews. They never call `alignToOrigin`,
change geometry, dirty the story, or add history.

| Option               | SVG default | PNG default | Meaning                                     |
| -------------------- | ----------- | ----------- | ------------------------------------------- |
| `padding`            | `20`        | `20`        | Non-negative space around rendered content. |
| `background`         | transparent | `"white"`   | CSS background color.                       |
| `includeTitle`       | `false`     | `false`     | Render document title above the story.      |
| `includeDescription` | `false`     | `false`     | Render document description above it.       |
| `embedDocument`      | `true`      | n/a         | Embed EGN v4 in the SVG.                    |
| `scale`              | n/a         | `1`         | Positive finite output pixel scale.         |
| `signal`             | n/a         | none        | Optional host `AbortSignal`.                |

Empty stories still receive a positive content box. SVG embedding uses WPS's
hidden-text `<DST>` convention and preserves Unicode, XML characters, double
hyphens, and literal delimiter-like text. PNG uses the same prepared SVG but
omits embedded document data before browser decoding.

```ts
const { bytes } = await client.exportPNG({
    scale: 2,
    signal: abortController.signal,
});
const png = new Blob([bytes], { type: "image/png" });
```

Cancellation rejects with an error whose `name` is `"AbortError"`. A successful
document replacement or `destroy()` also cancels pending PNG exports; a failed
import leaves them active. Decoding, measurement, and encoding failures reject
normally.

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
| `labels.changed`   | `(labels: LabelDictionary) => void`  | The editable label set changes.  |
| `replay.changed`   | `(state: ReplayState) => void`       | Headless replay state changes.   |
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

### Color-picker providers

With no `colorPicker` setting, the client opens its built-in anchored popover.
It has an alpha-capable picker, a labeled hex field, checkerboard swatch, Apply
and Cancel controls, keyboard-operable sliders, focus restoration, and an
explanation that custom non-SVG artwork keeps its original colors. Drafting and
cancellation do not touch exports, dirty state, notifications, or undo history.

Set `colorPicker: false` to omit both single- and multi-selection color actions.
To replace the UI, provide this framework-independent contract:

```ts
type ColorPickerProvider = (request: ColorPickerRequest) => ColorPickerHandle;

interface ColorPickerRequest {
    readonly requestId: string;
    readonly elementIds: readonly string[];
    readonly color: string;
    readonly anchor: { readonly x: number; readonly y: number };
    readonly signal: AbortSignal;
}

interface ColorPickerHandle {
    readonly result: Promise<string | null>;
    dispose(): void;
}
```

The anchor is in browser-viewport coordinates. Resolve `result` with `#RGB`,
`#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)`, or `rgba(r, g, b, a)` where
RGB channels are 0–255 and alpha is 0–1. Whitespace around the whole result,
named colors, percentages, modern space/slash RGB syntax, and out-of-range
channels are invalid; invalid results cancel without commands. Resolve `null`
for ordinary cancellation.

```ts
const client = await EgonClient.create({
    container,
    colorPicker(request) {
        const picker = hostPicker.open(request.color, request.anchor);
        return { result: picker.result, dispose: () => picker.close() };
    },
});
```

The signal aborts and `dispose()` runs exactly once when the result settles or
the request is replaced/invalidated by selection, context-pad closure, deletion,
replacement, an unrelated command (including undo/redo), successful import, or
client destruction. A failed import retains it. Late results are ignored even
if a provider disregards cancellation. Throws, rejected results, invalid
handles, and cleanup failures are contained and reported through the platform's
`reportError` (or `console.error` fallback).

For a webview, create one Promise per request, post only serializable request
fields, resolve it from the matching webview reply, post cancellation when the
signal aborts, and remove listeners in `dispose()`. Migration from the old API
requires deleting `colorPicker.requested`/`colorPicker.closed` listeners and all
`previewPickedColor`/`confirmPickedColor`/`cancelColorPicker` calls; the provider
returns only the final decision. No document-level compatibility events exist.

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
a small offset). It remains useful before passing a document to external tools
that reject negative geometry; EgonClient's own SVG/PNG exports do not require
it. `fitToScreen`
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
getIconConfiguration(): IconConfiguration
setIconOrder(category: IconCategory, names: readonly string[]): void
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

`getIconConfiguration()` adds the information that selection-only `getIcons()`
does not expose:

```ts
interface IconConfiguration {
    name: string;
    catalog: IconMap;
    selected: { actor: readonly string[]; workObject: readonly string[] };
    used: { actor: readonly string[]; workObject: readonly string[] };
}
```

`catalog` includes all retained custom artwork, including assets kept for live
shapes after removal from the creation selection. `selected` is the current
palette order and `used` lists distinct names referenced by the story.
`setIconOrder` requires an exact permutation of the selected names in one
category. Duplicates, omissions, and extras throw before mutation; an unchanged
order is a no-op and does not emit `icons.changed`.

Existing methods compose the rest of a configuration workflow:

- Add or replace artwork/membership with `addIcon`; remove membership with
  `removeIcon`; query it with `hasIcon`.
- Apply/import a selection with `loadIcons`; read selected artwork with
  `getIcons`.
- Rename the set with `loadIcons({ ...client.getIcons(), name })`.
- Build drafts, filter a built-in catalog, cancel edits, and define reset policy
  in the host, then apply the result once.

Selection order is reliable within an editor session. EGN v4 stores icon maps
as object keys, so integer-like icon names may be reordered by JavaScript during
a save/open round trip; the file format is intentionally unchanged.

## Label dictionary

```ts
getLabelDictionary(): LabelDictionary
renameLabels(changes: readonly LabelRename[]): readonly string[]
```

The dictionary is a detached current snapshot with `activities` and
`workObjects` arrays. Entries are deduplicated by exact label text and sorted
case-insensitively. A work-object entry may include representative `icon`
artwork; missing artwork never hides the label.

Each rename is `{ category: "activity" | "workObject", originalName, name }`.
All matches are resolved before changes begin, so swaps and chains are
simultaneous. An empty `name` clears the label. Unchanged and unmatched entries
are no-ops. Conflicting replacements for the same category/original text throw
before mutation. The returned IDs are the changed elements.

The whole effective batch is one undoable operation using the existing label
layout commands, so activity numbers and layout behavior are preserved.
`labels.changed` provides a fresh snapshot after rename, undo/redo, and every
successful import.

## Headless replay

```ts
getReplayState(): ReplayState
startReplay(options?: { showGroups?: boolean }): ReplayState
stopReplay(): ReplayState
nextReplayStep(): ReplayState
previousReplayStep(): ReplayState
seekReplayStep(index: number): ReplayState
setReplayShowGroups(value: boolean): ReplayState
```

Replay groups actor-originating activities by numeric sequence number; equal
numbers are one parallel step and gaps remain playable. Each step traces through
downstream work objects with cycle guards and stops at actors. Reveal is
cumulative and includes annotations and labels; the current step is highlighted.
Groups default to hidden and can be toggled independently.

Every call returns a detached state:

```ts
interface ReplayState {
    active: boolean;
    stepIndex: number | null; // zero-based; null while inactive
    stepCount: number;
    activityNumber: number | null;
    hasGroups: boolean;
    showGroups: boolean;
}
```

Starting shows the first step. Empty/non-replayable stories remain inactive;
navigation clamps at both ends. Starting closes transient direct editing,
selection/context-pad, and color-picker UI. A successful import, any
modeling/undo/redo command, or destruction stops replay and restores normal
presentation without changing geometry or history. Failed imports preserve it.

The core has no playback timer. Hosts may call `nextReplayStep()` on their own
schedule and must stop that timer whenever `replay.changed` reports
`active: false`.

## Lifecycle

```ts
destroy(): void
```

Tears down the modeler and releases its resources. Call it before removing the
container from the DOM. Destruction is idempotent and cancels pending PNG
exports without delivering later host events.

## Advanced integration

The raw plugin is intentionally not public. Pass diagram-js modules through
`EgonClient.create(config, additionalModules)` when a host needs an extension;
all persistence, dialogs, notifications, downloads, configuration drafts, and
playback controls remain host-owned.
