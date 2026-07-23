# 0011 — Adopt `@bpmn-io/align-to-origin`; expose `alignToOrigin()` and `fitToScreen()`

- Status: accepted
- Date: 2026-07-23

## Context

Domain stories can place elements at negative coordinates (drag an actor above
or left of the origin). Upstream egon.io (WPS/egon.io #205, commits `67835488` +
`5c6dadba`) found that such stories break when external tools re-export the
diagram, and fixed it by bundling `@bpmn-io/align-to-origin` as a modeler module
and making its "fit story to screen" action run `alignToOrigin.align()` followed
by `canvas._fitViewport({ x: 0, y: 0 })`.

Our core had neither. The plugin did not register the module, and hosts could
only get/set the raw viewbox — they had no way to "fit the story to screen" or
"keep coordinates positive for export" without reaching into diagram-js
internals, which the host-independence boundary (see `CLAUDE.md`) forbids.

`align()` is not free of side effects: it runs through the command stack, so it
is undoable and fires `commandStack.changed` — the event `EgonClient` surfaces
as `story.changed`. The documented host save pattern is
`on("story.changed", () => export())`, so an align that hosts cannot control
would re-dirty a document on every save.

## Decision

Bundle `@bpmn-io/align-to-origin@0.7.0` (exact pin, matching repo convention and
the version upstream ships) as a module inside the plugin, and expose two new
`EgonClient` / `ModelerPort` methods next to the viewport operations:

- `alignToOrigin()` — align only. Shifts contents to positive coordinates. Hosts
  call it before a visual (SVG/PNG) export.
- `fitToScreen()` — align, then `canvas.zoom("fit-viewport", { x: 0, y: 0 })`.
  Upstream `fitStoryToScreen` parity, for a "fit to screen" UI button.

`fitToScreen` deliberately uses the **public** `canvas.zoom("fit-viewport",
center)` API rather than upstream's private `canvas._fitViewport(center)`. In
diagram-js 15.22.0 `zoom("fit-viewport", center)` delegates straight to
`_fitViewport(center)`, so it is behaviourally identical but typed; a comment at
the call site references upstream for sync-diff reviewability.

**No auto-align inside `export()`.** Upstream only aligns for its visual export,
not JSON export. Aligning implicitly on every `export()` would fire
`story.changed` and re-trigger the host save loop, dirtying documents after every
save. Alignment is therefore an explicit host action, never a hidden side effect
of reading the model.

Adding methods to the already-exported `EgonClient` does not widen the frozen
public surface (ADR 0010 rule G governs `src/index.ts`'s import/export list, not
`EgonClient`'s method set), so no frozen-list change is required.

## Alternatives considered

- **Auto-align inside `export()`** — rejected: `align()` fires `story.changed`,
  which re-triggers the documented `on("story.changed", () => export())` save
  pattern and dirties host documents after every save. Alignment must stay an
  explicit, host-controlled action.
- **Expose only `fitToScreen()`** — rejected: hosts doing a headless SVG/PNG
  export need the coordinate fix without the zoom-to-fit, so `alignToOrigin()` is
  exposed on its own too.
- **Reimplement alignment in-house** — rejected: upstream ships this exact
  dependency against a modern diagram-js, so runtime compatibility is already
  proven; a hand-rolled version would diverge from upstream and complicate the
  sync (epic #13).
- **Call the private `canvas._fitViewport`** — rejected: the public
  `zoom("fit-viewport", center)` is byte-identical in diagram-js 15.22.0, typed,
  and does not depend on a private method that could change.

## Consequences

- Stories with negative coordinates can be aligned to positive space before
  export, unblocking external tools.
- `alignToOrigin()` / `fitToScreen()` may fire `story.changed` by design (command
  stack, undoable). Documented in `docs/Client.md`: dirty-flag hosts align
  _before_ save/export rather than reacting to the event.
- A new runtime dependency, MIT-licensed (GPL-3.0-or-later compatible), with no
  peer deps. Its `alignOnSave` hook listens for the bpmn-js-only `saveXML.start`
  event and is inert in plain diagram-js. Defaults: offset `{ x: 150, y: 75 }`,
  tolerance 50 (repeat aligns within tolerance are no-ops).
- The dependency is unmaintained since 2021 — accepted, because upstream egon.io
  runs the same version against current diagram-js, so it is proven in practice.
- Ships no types, so an ambient declaration lives in
  `src/types/AlignToOrigin.d.ts` (mirroring `src/types/Minimap.d.ts`).
