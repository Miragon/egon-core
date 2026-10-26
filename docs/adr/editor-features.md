# Editor features

Decisions behind specific editor features: alignment, color picking, label
renames, and replay.

## <a id="edt-1"></a>EDT-1 — Bundle align-to-origin; alignment is an explicit host action

- Status: accepted
- History: 2026-07-23 decided (ADR 0011)

**Context.** Stories can contain elements at negative coordinates, and
external tools break when they re-export such stories (upstream
WPS/egon.io #205). Upstream bundles `@bpmn-io/align-to-origin` and aligns the
story before fitting it to the screen. Hosts here had only raw viewbox access.
`align()` runs through the command stack, so it fires `story.changed`.

**Decision.** Bundle `@bpmn-io/align-to-origin`, pinned to the exact version
upstream ships. `EgonClient` exposes two methods:

- `alignToOrigin()` moves the contents to positive coordinates. Hosts call it
  when downstream tools need positive coordinates.
- `fitToScreen()` aligns, then calls
  `canvas.zoom("fit-viewport", { x: 0, y: 0 })`. That public call behaves the
  same as upstream's private `_fitViewport`.

The core never aligns implicitly ([API-3](public-api.md#api-3)).

**Rejected alternatives.**

- **Align automatically inside `export()`:** this would retrigger the host's
  save loop.
- **Expose only `fitToScreen()`:** a host doing a headless export needs to
  align without zooming.
- **Reimplement the alignment:** this would diverge from upstream
  ([FND-3](foundations.md#fnd-3)).
- **Call the private `canvas._fitViewport`:** the public `zoom` call behaves
  the same and is typed.

**Consequences.**

- Both methods are undoable and may fire `story.changed`. Hosts that track
  dirty state align before saving instead of reacting to the event
  (`docs/Client.md`).
- The dependency is MIT-licensed and has no peer dependencies. It ships no
  types, so an ambient declaration lives in `src/types/AlignToOrigin.d.ts`.
- It has not been maintained since 2021. This is accepted because upstream
  runs the same version against current diagram-js.
- Its `alignOnSave` hook listens for an event that only bpmn-js fires, so it
  does nothing here.

## <a id="edt-2"></a>EDT-2 — Color picking is a bundled default behind a provider contract

- Status: accepted
- History: 2026-09-11 client-scoped requests and passive previews (ADR 0026);
  2026-09-13 bundled default picker and provider contract replace the public
  request protocol (ADR 0038)

**Context.** Color picking first used document-level `openColorPicker`,
`defaultColor`, and `pickedColor` events with no client identity. Two modelers
on one page could both act on the same result, and a late result could
recolor a deleted or replaced element.

The next design was a host-only protocol: request and closed events plus
preview, confirm, and cancel methods. With it, a plain `EgonClient` showed a
color action that did nothing, and every host reimplemented the same picker.

Previews must not be persisted. Writing them into the model would mark the
story dirty, add undo entries, and break [ARC-4](architecture.md#arc-4).

**Decision.**

- `EgonClientConfig.colorPicker` selects the mode:
    - omitted: the built-in, anchored picker is used
    - a `ColorPickerProvider`: it replaces the built-in picker
    - `false`: color actions are removed
- A provider synchronously returns a handle with one final
  `Promise<string | null>` and a `dispose()` method. It receives copied ids,
  the initial color, a request id, a viewport anchor, and an `AbortSignal`. It
  receives no model or diagram services.
- A per-client controller validates hex, RGB, and RGBA results. It handles
  aborting, disposes each handle exactly once, contains provider errors, and
  rejects late results.
- An internal coordinator, scoped to the editor session, records the exact
  selected elements when the color action is clicked. It accepts a result only
  while those elements and the selection are unchanged. Only one request is
  active per client. The request becomes invalid when any of these happen:
    - the selection or the context pad changes
    - a target element is replaced or deleted
    - any other command runs, including undo and redo
    - a new editor session takes over
    - a newer request starts
    - the client is destroyed
- Previews are kept in session-local state, keyed by element. The renderer
  reads this state before the persisted color and repaints through
  `element.changed`. Previews cause no model writes and no commands.
- Confirming retires the request, clears the previews, and then runs one
  undoable `element.colorChange` command per target. The built-in popover
  keeps its drafts local.
- The built-in picker bundles `react-colorful`. It renders through
  diagram-js's Preact runtime, using a React-compatible adapter on
  `diagram-js/lib/ui`, so both widgets share one Preact instance. Preact is a
  direct runtime dependency, and consumers never need React
  ([REL-1](release-and-distribution.md#rel-1)).

**Rejected alternatives.**

- **Keep the global events and add a client id:** this neither ties a result
  to one selection snapshot nor stops a reused stale id.
- **Write previews into the model and revert on cancel:** observers, export,
  dirty tracking, and undo would all see temporary state.
- **Keep the host event protocol and add a default listener:** two pickers
  could open, or a color could be applied twice.
- **Bundle React:** this adds a second component runtime next to diagram-js's
  Preact.
- **Show a disabled color action:** an action known to do nothing is
  misleading and inaccessible.

**Consequences.**

- Plain clients get working recoloring with alpha support and keyboard
  access. Custom presentation needs only one final-result abstraction.
- Clients cannot consume each other's results, even when element ids are
  identical.
- Provider work is aborted and disposed whenever a request becomes invalid,
  and before the client's ports are destroyed. A failed import keeps it alive.
- The earlier public events and response methods were removed without a
  compatibility bridge.
- The renderer depends read-only on session-local preview state. This is an
  accepted exception to rendering only persisted colors. It is not an
  exception to ARC-4.

## <a id="edt-3"></a>EDT-3 — Rename labels in one parent command over a derived dictionary

- Status: accepted
- History: 2026-09-11 decided (ADR 0032)

**Context.** The extracted label dictionary kept cached state built for a
dialog, and it had no working rename path. Hosts need a current snapshot and
atomic bulk renames, including swaps and chains, with undo and the existing
label layout.

**Decision.**

- `getLabelDictionary()` recomputes the activity and work-object entries on
  every call and returns a detached copy. Exact label text is the
  deduplication key, and display order is case-insensitive. Work objects
  without retained artwork still appear.
- `renameLabels()` validates the category and old-to-new name mappings, then
  finds every matching live element before changing anything. A
  `labels.renameBatch` parent command runs the existing `element.updateLabel`
  for each element in `preExecute`. The rename is one undo step, and the
  existing layout and activity-number behavior are preserved.
- `labels.changed` publishes a fresh snapshot after every command or history
  change that has an effect, and after every successful import.

**Rejected alternatives.**

- **One top-level command per replacement:** one host action would need
  several undo steps.
- **Rename while scanning:** swaps and chains would rename the same element
  twice.

**Consequences.**

- Conflicts are rejected before anything changes. Mappings that change nothing
  or match nothing create no history.
- An empty replacement string intentionally clears the label.
- Hosts own dialog state, drafts, filtering, and cancellation.

## <a id="edt-4"></a>EDT-4 — Replay is headless: domain traversal, host-owned timing

- Status: accepted
- History: 2026-09-11 decided (ADR 0034)

**Context.** Upstream replay mixes Angular signals, snackbars, timers, and
document-wide DOM queries with the story traversal. The core needs
predictable replay without owning playback controls or timing, and two clients
on one page must not affect each other.

**Decision.**

- The traversal is pure `story/domain` code:
    - Activities that start at an actor are grouped by sequence number, and the
      groups are sorted numerically.
    - From each activity, the traversal follows the story through work objects,
      with visited-id guards, and stops at actors.
    - Steps reveal elements cumulatively and include attached annotations.
    - Groups are an optional presentation set, off by default.
- Each editor session has one replay controller. It hides, reveals, and
  highlights elements and their label graphics using diagram-js markers and
  the session's own registry and canvas, never global DOM selectors.
- The public controls are start, stop, next, previous, seek, and toggle
  groups. They are synchronous and return the new state. `replay.changed`
  publishes a detached copy of the state.
- Starting a replay closes direct editing, the selection and context pad, and
  the color picker.
- Any command or history change, a successful import, or `destroy()` stops the
  replay. Model geometry and history are unchanged.

**Rejected alternatives.**

- **Port upstream's timers and controls:** timing and UI are host concerns.
- **Use global DOM selectors:** clients with overlapping element ids would
  interfere with each other.

**Consequences.**

- Gaps in the numbering are still playable, and equal numbers form parallel
  steps.
- Malformed graphs with cycles terminate safely.
- Hosts own the timers and must stop them when replay becomes inactive.
