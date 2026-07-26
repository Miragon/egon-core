# Upstream sync — wps/egon.io

This repo mirrors bug fixes from [WPS/egon.io](https://github.com/WPS/egon.io)
(tracking epic: [#13](https://github.com/Miragon/egon-core/issues/13)). This file
records how far we are synced, how upstream paths map onto this repo, and the
process for the next sync round.

## Baseline

**Synced through upstream `main` commit `8d506470`** (2026-07-23).

Every upstream change from the original extraction point (`65c59291`, 2025-07-24)
through the baseline has been ported, skipped with a recorded reason (see below),
or is Angular-host-only. Bump this commit after each completed sync round.

## Path mapping (upstream → local)

Upstream keeps the modeler embedded in an Angular app; this repo restructured the
extracted core into a flat DDD feature layout (ADR 0010). File names may differ —
where names were arbitrary we match upstream so diffs stay reviewable.

| upstream (wps/egon.io)                                       | local                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/tools/modeler/diagram-js/features/*`                | `src/modeler/infrastructure/*` (change-icon→`replace`, copyPaste→`copy-paste`, shortcuts→`keyboard`+`editor-actions`, numbering→`popup`+`number-stash`, util/TextRenderer→`text-renderer`, rules→`rules` adapter + the pure grammar/predicates extracted to `src/story/domain/{elementPredicates,modelingRules}` and the numbering math extracted to `src/story/domain/activityNumbering`, which have no upstream counterpart) |
| `src/app/domain/entities/*`                                  | `src/story/domain/*` (icon types→`src/iconSet/domain`, label entries→`src/labelDictionary/domain`)                                                                                                                                                                                                                                                                                                                             |
| `src/app/domain/services` + `src/app/tools/modeler/services` | `src/modeler/service/*` (ModelerService/InitializerService ≈ `EgonClient`/`DiagramJsModelerAdapter`)                                                                                                                                                                                                                                                                                                                           |
| `src/app/tools/icon-set-config/{domain,services}`            | `src/iconSet/{domain,service,infrastructure}`                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/app/tools/{import,export}/services`                     | `src/story/service/*` (the pure repair rules of `import-repair.service.ts` extracted to `src/story/domain/importRepair.ts`, mirroring the `elementPredicates`/`modelingRules`/`activityNumbering` extractions above; `ImportRepairService` remains as a thin facade keeping upstream's four method names so sync diffs stay reviewable)                                                                                        |
| `src/app/tools/label-dictionary/services`                    | `src/labelDictionary/service/*`                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/utils`                                              | `src/shared/domain/*` (pure helpers), `src/shared/infrastructure/*` (DOM/diagram-js-touching)                                                                                                                                                                                                                                                                                                                                  |

Not extracted (host concerns, no local counterpart): dialogs, snackbars,
properties panel, replay, storage/autosave, drag&drop, download helpers, the
`builtInIcons` catalogue, and everything under `src/app/workbench`.

## Process

1. Diff `<baseline>..upstream/main` per mapped path
   (e.g. `git log --oneline <baseline>..upstream/main -- src/app/tools/modeler`).
2. Classify each commit: **BUGFIX** / **BEHAVIOR** / **REFACTOR**.
3. Port BUGFIX and BEHAVIOR changes only — upstream refactors (renames,
   TS-ification, constant extractions) don't apply to this already-TypeScript,
   already-restructured codebase and only create noise.
4. Record skips with a reason (here or in the port PR) so the next round doesn't
   re-review them.
5. Bump the baseline above and note the round in the tracking issue.

## Fixed locally, ahead of upstream

These are live bugs in upstream `main` at the recorded baseline. They are fixed
here as a deliberate divergence — **do not re-import the upstream lines** in a
future round. Offer the fixes upstream separately.

- **`import-repair.service.ts` prunes only the first dangling activity.**
  `checkForUnreferencedElementsInActivitiesAndRepair` does
  `elements = elements.splice(activityIndex, 1)`. `splice` returns the _removed_
  items, so the local is rebound to a one-element throwaway and every dangling
  edge after the first survives into `addConnection`, where
  `elementRegistry.get(...)` yields `undefined` and diagram-js gets a connection
  with undefined endpoints. Fixed locally by `pruneUnreferencedConnections` in
  `src/story/domain/importRepair.ts`, which builds a new array and mutates
  nothing. It also **returns the dropped edges instead of a `boolean`** — the
  boolean was discarded at upstream's only call site, so a story silently lost
  elements; locally the import service fires `dst.import.repaired` with them.
- **`import-domain-story.service.ts` passes a `NaN` `parentIndex`.**
  `canvas.addShape(shape, parentShape, Number(parentShape.id))` —
  `Number("shape_1683")` is `NaN`. diagram-js' `Collections.add` normalizes only
  non-numbers to `-1` (`typeof idx !== 'number'`), which `NaN` passes, so it
  reaches `splice(NaN, 0, el)` and coerces to index 0: group children are
  prepended in reverse instead of appended. Fixed locally by dropping the third
  argument — diagram-js appends when `parentIndex` is omitted, which is the
  intent.
- **`copy-paste.service.ts` loses a pasted annotation's height.** It stashes
  `oldBusinessObject.height`, but nothing on a live canvas ever writes that
  field for an annotation: `drawAnnotation` persists the height as
  `businessObject.number` (the documented "the keyword height is not exported"
  hack) and only the _export_ pass copies it onto `height`. So copy-pasting an
  annotation drawn in the current session dropped its height; it only worked for
  one round-tripped through a file, which is why the mock-based spec never saw
  it. Fixed locally by falling back to `number` in
  `DomainStoryPasteRestore.pasteElement`. Locked by
  `CopyPasteIntegration.browser.spec.ts`, which asserts the precondition
  (`number` set, `height` absent) so the two cannot drift apart again. Note the
  local port already diverges on the apply side — it assigns `element.height`,
  where upstream assigns `businessObject.height` and so leaves the shape at its
  default size.
- **`util.ts` calls Array-less methods on `element.children`.**
  `reworkGroupElements` did `innerShape.children.remove(shape)` and
  `undoGroupRework` did `parent.children.remove(shape)` /
  `superParent.children.add(shape)`. diagram-js `element.children` is a **plain
  Array** — neither method exists, so both the group-reparenting branch and the
  whole "undo group deletion" path threw `TypeError`. Upstream gets away with it
  because moddle collections do carry those methods. Fixed locally with `add`/
  `remove` from `diagram-js/lib/util/Collections` (already used by
  `DomainStoryUpdater`), as issue [#8](https://github.com/Miragon/egon-core/issues/8)
  anticipated. Note upstream's own "fix" here (wps/egon.io@fa55d12f,
  `children.set(undefined, shape)`) is equally broken — see the skip list below.
  Locked by the group cases in `ModelingCommands.browser.spec.ts`.
- **Import state is never reset between imports.** Upstream keeps an array used
  as a string-keyed map of group shapes and never clears it, so a second import
  parents new children onto shapes the first import's `diagram.clear` already
  destroyed. Fixed locally with a `Map` cleared at the top of `import()`; the
  write-only `elements` field was deleted outright.
- **`DomainStoryRenderer.checkIfPointOverlapsText` persists its overlap nudge into the saved file.**
  `checkIfPointOverlapsText` does `point.y += lineOffset` on a point taken out of
  `element.waypoints` to keep an activity's start clear of its source actor's
  label. For an _imported_ story that array **is** `businessObject.waypoints` —
  `import-domain-story.service.ts` aliases them via
  `assign({ businessObject: bo }, bo)` and nothing on the import path clones — so
  merely drawing writes 5px into the persisted model and the next open re-applies
  it. The fixture family records
  the creep: `connection_8174`'s start `y` is 172 / 177 / 182 / 187 across
  v1.1.0→v1.4.0, until the guard's `source.y + 75 + offset` ceiling stops it.
  Silent, unbounded corruption of the file format caused by rendering. Fixed
  locally by making overlap avoidance render-time and **copy-based**:
  `adjustForTextOverlap` → `waypointsClearOfSourceLabel` (returns a `slice()`)
  and `checkIfPointOverlapsText` → `pointClearOfSourceLabel` (returns a fresh
  point); the copy is threaded through all three consumers — the line, the label
  and the number — so the whole activity is drawn on the same geometry. Accepted
  consequence: the drawn line diverges from `element.waypoints` by the offset, so
  the hit path, bendpoint handles and selection outline follow the model, not the
  paint. That is invisible in practice (the divergence is well inside the 15px
  `djs-hit-stroke`, and the divergent stretch lies inside the source shape's own
  hit area); aligning them properly needs a `connection.layout` command and is
  deferred. Upstream's `fixConnectionInHTML` was **deleted, not ported forward**:
  it re-pointed a second `<polyline>`, and diagram-js has emitted `<path>` for
  both the drawn line and the hit area for many majors, so it has been dead for
  years — and re-pointing the hit `<path>` instead would desync it from
  `Bendpoints`, which positions handles from `connection.waypoints`. The renamed
  methods keep their upstream names in their doc comments so the next sync round
  can still pair them. Issue
  [#65](https://github.com/Miragon/egon-core/issues/65); locked by
  `RendererModelPurity.browser.spec.ts` and by the now byte-strict
  `FormatCompatibilityMatrix.browser.spec.ts`.
- **`DomainStoryRenderer` writes its default colour onto the model.**
  `drawGroup` assigned `pickedColor = "#000000"` and `useColorForActivity`
  assigned `pickedColor = "black"` — two writers, disagreeing on the literal — so
  a colourless pre-v1.1.0 file gained the field on save. Fixed locally by
  treating `pickedColor` as what it is: **the user's choice, nullable, absent
  meaning "the renderer decides"**. Both writers now read
  `pickedColor ?? DEFAULT_COLOR`, and the three remaining bare `?? "black"`
  fallbacks (DS connection stroke, annotation bracket, annotation label fill)
  were folded onto the same constant. Consumers already coped with an absent
  value (`DomainStoryContextPadProvider`, `DomainStoryPasteRestore`). One knock-on
  had to be fixed with it: `marker()` builds the arrowhead's DOM id from the
  colour, so the default id now carries a `#`, and diagram-js'
  `PreviewSupport.getMarker` looks markers up with
  `querySelector("marker#" + id)` — which throws `SyntaxError` on an unescaped
  `#` and kills the drag. Upstream only ever hit that on a _coloured_ activity;
  making `#000000` the default would have broken every activity drag, so
  `markerId` now folds anything a CSS identifier cannot carry to `_`. Note
  `getIconSvg`'s `pickedColor !== DEFAULT_COLOR` check still mis-reads a
  persisted literal `"black"` as a custom colour — pre-existing, tracked in
  [#74](https://github.com/Miragon/egon-core/issues/74). Issue [#65](https://github.com/Miragon/egon-core/issues/65); locked
  by `RendererModelPurity.browser.spec.ts` and the byte-strict matrix. Neither
  fix repairs history: a file that already accumulated drift keeps it (the v4.0.0
  fixture's `y: 370` against `original.y: 337`) — this stops the creep.
- **A forbidden activity↔annotation reconnect was permitted** (issue
  [#66](https://github.com/Miragon/egon-core/issues/66)). Two defects, both still
  present upstream, and fixing either alone is not enough:
  (1) the `connection.reconnect` adapter returned `undefined` on a denial, and
  diagram-js' `Rules.allowed` maps `undefined` to **`true`** ("no rules
  objected") — no lower-priority `connection.reconnect` provider exists for that
  "no opinion" to defer to; (2) the grammar's `canConnectToAnnotation` guarded
  only the **target**, so a bare `return false` would have handed the same
  illegal edge back reversed — `false` is precisely what _enters_
  `BendpointMove`'s swapped-endpoint retry, which would then have been allowed.
  Fixed locally by renaming that predicate to `isForbiddenAnnotationEdge` with
  inverted polarity and a symmetric activity clause (either endpoint an
  annotation), plus `return false` in the adapter. Locked by a real bendpoint
  drag in `ActivityConnections.browser.spec.ts` — the rule-level assertions go
  green on the adapter half alone, only the drag catches the swap retry.
  Side effect worth knowing on a sync: a _pre-existing_ illegal edge in a legacy
  file now denies in both orientations, so `BendpointMove.start` returns early
  and its bendpoints can no longer be dragged. The edge stays selectable and
  deletable.

### Known, still shared with upstream

**Not** fixed here — each needs a design decision rather than a one-liner, so
they are pinned instead: the spec named on each row asserts the _current_ broken
behaviour, so a fix on either side turns that spec red rather than passing
silently. Fixing one means inverting its assertions.

Found while building the modeling-command suite (#55):

- **Undoing a number edit does not restore the edited activity's own number.**
  `DomainStoryPopupService.handleUpdate` writes
  `element.businessObject.number = number` _before_ executing
  `activity.changed`. `ActivityChangedHandler.preExecute` then snapshots
  `getNumbersAndIDs()` and `context.oldNumber` from an already-mutated model, and
  `modeling.updateNumber` no-ops because the number already matches — so no
  nested `element.updateLabel` records the old value either. Measured with three
  activities numbered 1/2/3 and the third edited to 1: the edit yields
  `{a3:1, a1:2, a2:3}` correctly, but undo yields `{a1:1, a2:2, a3:1}` — the
  cascade reverts, the edit does not, and two activities end up numbered 1. Fix
  is to execute the command first and let the handler own the mutation, which
  changes command semantics and so is left for a focused change.
  `ActivityNumbering.browser.spec.ts` asserts only the cascade revert (what
  `restoredNumberAssignments` exists for) and states the gap, deliberately not
  asserting the buggy value — so a fix will not require editing that spec.
- **`handleUpdate` mis-splices on an `indexOf` miss.**
  `activitiesFromActors.splice(indexOf(element), 1)` removes the _last_ entry
  when `indexOf` returns `-1`, reachable if the edited element is not in
  `getActivitiesFromActors()` (e.g. a work-object-sourced activity). Latent, not
  pinned.
- **Undoing "Remove Group without Child-Elements" throws, and re-adopts
  nothing.** `elementUpdateHandler.js`'s `removeGroupWithoutChildren.revert`
  fires `shape.added` with no `gfx`, and diagram-js' `InteractionEvents`
  listener dereferences `event.gfx` → `TypeError: Cannot read properties of
undefined (reading 'appendChild')`, which escapes `commandStack.undo()`. Even
  with that fixed the body is a no-op: it iterates `element.children`, which
  `execute` has already emptied via `undoGroupRework`, instead of the
  `context.children` snapshot `preExecute` took for exactly this purpose. So the
  group's contents are never returned to it. A correct fix must also restore the
  SVG re-parenting `undoGroupRework` performed, which is why it is not done here.
  Pinned by `UpdateHandlerCommands.browser.spec.ts` ("undo of the custom command
  throws and re-adopts nothing").
- **Debounced host callbacks fire after `destroy()`.**
  `DiagramJsModelerAdapter.destroy()` clears its callback registry but never
  cancels the pending `setTimeout` from `createDebouncedCallback`, and
  `DiagramJsIconAdapter` has no `destroy()` at all — so its timer cannot be
  cancelled. A host that disposes within the 100 ms window still gets
  `story.changed`/`icons.changed`, and the icons callback reads services off a
  destroyed injector. (Local-only shape: upstream's Angular host owns the
  debounce, so there is no upstream line to re-import.) `EgonClient.browser.spec.ts`
  scopes its `destroy` case to listeners with nothing in flight and says so.
- **`destroy()` leaves the `#iconsCss` style node in the host container.**
  `initializeContainer` appends it to the _host's_ element; `diagram.destroy()`
  only removes diagram-js' own `.djs-container`. A host reusing one container
  across sessions keeps the previous session's icon rules. Low severity — the
  `#iconsCss` id guard prevents duplicates — but it is not a clean teardown.

## Standing skip reasons

- **Nothing to port (upstream spec)**: `import-repair.service.spec.ts` is a
  15-line `should be created` stub. `import-domain-story.service.spec.ts` is
  mock-heavy Angular TestBed covering only `exportToDomainStory` (parser level,
  already pinned locally by `ExportFileParser.spec.ts`) plus filename→title
  derivation, a host concern this repo does not have. Local coverage lives in
  `src/story/domain/__tests__/importRepair.spec.ts`,
  `src/story/service/__tests__/{ImportRepairService,DomainStoryImportService}.spec.ts`
  and `FormatCompatibilityMatrix.browser.spec.ts`.
- **Pure rename/formatting**: kebab-case file renames, `diagramJSConstants.js`
  extraction, `type-interfaces/*` (local uses real diagram-js typings),
  var→const sweeps.
- **Already correct locally**: fixes for bugs that upstream refactors introduced
  after the extraction (e.g. the `EVENT_BENDPOINT_MOVE_END` quoting bug from the
  constants extraction — local literals were never wrong).
- **Angular-host-only**: anything touching components, signals, Material
  styling, or the workbench shell.
- **Do not port (upstream bug)**: `children.set(undefined, shape)` in
  `undoGroupRework` (wps/egon.io@fa55d12f) — see
  [#8](https://github.com/Miragon/egon-core/issues/8).
- **Do not port (upstream bug)**: upstream `replaceOptions.js` builds its option
  arrays by sparse index assignment (leaving holes once the current type is
  filtered out) and labels work-object entries with the actor action prefix
  (`replace-with-actor-`). Both are fixed locally in
  `DomainStoryReplaceOption.ts` (dense `push`, `replace-with-workobject-`) as a
  deliberate divergence (issue #52) — do not re-import the upstream shape.
- **Do not port (upstream bug)**: upstream `numbering.js`
  `updateExistingNumbersAtGeneration` + its `setTimeout(…, 10)` were removed
  locally (issue #53). `generateAutomaticNumber` always picks an unused number,
  so the deferred `activity.changed` commands re-assign each activity its own
  old number — a no-op that only pollutes the undo stack with phantom entries.
- **Do not port (upstream bug)**: upstream `activityUpdateHandlers.js`
  `revertAutomaticNumberGenerationChange` sets `j = -5` before
  `iDWithNumber.splice(j, 1)` (removing an arbitrary tail entry instead of the
  matched one) and matches ids by substring `includes`. Fixed locally via
  `restoredNumberAssignments` in `src/story/domain/activityNumbering.ts`
  (exact-id matching, consume-once) as a deliberate divergence (issue #53).
