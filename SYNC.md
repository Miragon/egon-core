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

### Known, still shared with upstream

Found while building the format compatibility matrix; **not** fixed here because
they change what the canvas draws, not what the format means. Recorded as exact
per-row expectations in `FormatCompatibilityMatrix.browser.spec.ts` so a fix on
either side turns that spec red rather than passing silently.

- `DomainStoryRenderer` writes its default colour back onto any business object
  that carried none, so a colourless pre-v1.1.0 file gains `pickedColor` on save.
- `checkIfPointOverlapsText` nudges an activity's start waypoint down _in place_
  during rendering. The connection shares the business object's `waypoints`
  array, so the nudge is persisted — visible in the fixture family itself, where
  v1.1.0→v1.4.0 record `connection_8174`'s start `y` as 172, 177, 182, 187.

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
