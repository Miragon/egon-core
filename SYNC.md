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

| upstream (wps/egon.io)                                       | local                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/tools/modeler/diagram-js/features/*`                | `src/modeler/infrastructure/*` (change-icon→`replace`, copyPaste→`copy-paste`, shortcuts→`keyboard`+`editor-actions`, numbering→`popup` (the `number-stash` half was deleted with #74 — upstream's stash has no local counterpart any more), util/TextRenderer→`text-renderer`, rules→`rules` adapter + `rules/ruleVerdictAdapter` (the single verdict→wire mapping, ADR 0015) + the pure grammar/predicates/verdicts extracted to `src/story/domain/{elementPredicates,modelingRules,ruleVerdict}` and the numbering math extracted to `src/story/domain/activityNumbering`, which have no upstream counterpart) |
| `src/app/domain/entities/*`                                  | `src/story/domain/*` (icon types→`src/iconSet/domain`, label entries→`src/labelDictionary/domain`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/domain/services` + `src/app/tools/modeler/services` | `src/modeler/service/*` (ModelerService/InitializerService ≈ `EgonClient`/`DiagramJsModelerAdapter`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/app/tools/icon-set-config/{domain,services}`            | `src/iconSet/{domain,service,infrastructure}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/app/tools/{import,export}/services`                     | `src/story/service/*` (the pure repair rules of `import-repair.service.ts` extracted to `src/story/domain/importRepair.ts`, mirroring the `elementPredicates`/`modelingRules`/`activityNumbering` extractions above; `ImportRepairService` remains as a thin facade keeping upstream's four method names so sync diffs stay reviewable)                                                                                                                                                                                                                                                                           |
| `src/app/tools/label-dictionary/services`                    | `src/labelDictionary/service/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/app/utils`                                              | `src/shared/domain/*` (pure helpers), `src/shared/infrastructure/*` (DOM/diagram-js-touching)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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

- **`import-domain-story.service.ts` drops persisted group membership on open.**
  The importer captures `businessObject.parent`, deletes it before calling the
  element factory (correct: diagram-js needs a live shape reference, not a
  serialized id), but never restores it after `canvas.addShape` has resolved
  the parent group. An untouched open → save therefore loses memberships,
  including nested groups. Fixed locally by loading groups parent-before-child
  with bounded dependency passes, then restoring the saved id only on a shape
  that was actually added to that group. Missing/non-group parents and cycles
  fall back to the canvas root with no stale id. `children` remains omitted:
  diagram-js owns the live inverse collection. Locked by
  `DomainStoryImportService.spec.ts`,
  `FormatCompatibilityMatrix.browser.spec.ts`, and
  `RenderFreeRoundTrip.browser.spec.ts`.

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
  elements; locally the import service fires `dst.import.repaired` with them,
  which `EgonClient` re-emits to hosts as the public `import.repaired` event
  carrying the dropped ids (ADR 0017).
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
  it. Note the local port already diverges on the apply side — it assigns
  `element.height`, where upstream assigns `businessObject.height` and so leaves
  the shape at its default size.

    **Superseded by #74 — read that entry, not this fix.** The local fix was a
    `?? number` fallback in `DomainStoryPasteRestore.pasteElement`; the field it
    fell back on no longer exists, and the stash turned out to be redundant
    outright (diagram-js carries `descriptor.height` and the element factory
    honours it), so the whole height stash is gone. The upstream _bug_ is still
    real and still must not be re-imported — it is just fixed by deletion now
    rather than by a fallback.

- **`util.ts` calls Array-less methods on `element.children`.**
  `reworkGroupElements` did `innerShape.children.remove(shape)`, which throws
  `TypeError` whenever `innerShape` carries no `children` at all, killing the
  group-reparenting branch. Fixed locally with `remove` from
  `diagram-js/lib/util/Collections` (already used by `DomainStoryUpdater`), as
  issue [#8](https://github.com/Miragon/egon-core/issues/8) anticipated. Note
  upstream's own "fix" here (wps/egon.io@fa55d12f,
  `children.set(undefined, shape)`) is equally broken — see the skip list below.
  Locked by the group cases in `ModelingCommands.browser.spec.ts`. The sibling
  half of this row, `undoGroupRework`, no longer exists — see the
  "Remove Group without Child-Elements" entry below.

    Caveat recorded while fixing #67: the original diagnosis ("`element.children`
    is a **plain Array**, neither method exists") is **not true of diagram-js
    15.22.0**. `ShapeImpl` binds `parent`↔`children` through `object-refs`, so
    `children` is a refs collection that does carry `.add()`/`.remove()`, and
    **assigning `element.parent` maintains the inverse by itself** — it splices the
    shape out of the old parent's `children` and into the new one's. Only elements
    without a `children` binding (connections, labels) lack the methods. Anything
    reasoning about "a shape left in two `children` arrays" is reasoning about a
    state diagram-js does not produce.

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
  `markerId` now folds anything a CSS identifier cannot carry to `_`.
  Issue [#65](https://github.com/Miragon/egon-core/issues/65); locked
  by `RendererModelPurity.browser.spec.ts` and the byte-strict matrix. Neither
  fix repairs history: a file that already accumulated drift keeps it (the v4.0.0
  fixture's `y: 370` against `original.y: 337`) — this stops the creep.
- **The activity number edit is split across three places, so undo and redo both
  corrupt the sequence.** Upstream still spreads one edit over
  `DomainStoryPopupService.handleUpdate` (which writes
  `businessObject.number`/`multipleNumberAllowed` and the registry's
  "multiple" flag _before_ the command), `ActivityChangedHandler` (whose
  `preExecute` therefore snapshots an already-mutated model, and whose
  `modeling.updateNumber` no-ops because the number already matches), and a
  renumbering cascade run _after_ `commandStack.execute`. Three defects follow:
  undo does not restore the edited activity's own number — measured with
  activities 1/2/3 and the third edited to 1, the edit gives `{a3:1, a1:2, a2:3}`
  but undo gives `{a1:1, a2:2, a3:1}`, **two activities numbered 1**; redo re-runs
  `execute` only, so the cascade is not re-applied and the duplicates return; and
  the registry's multiple-number flags are never undone at all. Fixed locally by
  making `activity.changed` the whole transaction: `preExecute` snapshots (label,
  number, allowance, `getNumbersAndIDs()`, and a **copy** of the multiple-number
  registry), `execute` applies the edit _and_ the cascade, `revert` restores all
  of it. The popup now only builds the command context and touches nothing.
  Consequently `renumberOnNumberEdit` takes an `ActivityNumberEdit` descriptor
  (`{ id, number, multipleAllowed }`) and owns the multiple-allowed suppression
  upstream keeps in the caller — which also kills upstream's
  `activitiesFromActors.splice(indexOf(element), 1)`, whose `-1` miss removed the
  _last_ activity when the edited one was not actor-sourced; the domain now
  excludes it by id instead. One deliberate behaviour change rides along:
  `multipleAllowedByNumber` is read **pre-edit**, so a shifted activity keeps the
  allowance it had rather than losing it to the popup's early write. Issue
  [#68](https://github.com/Miragon/egon-core/issues/68); locked by
  `ActivityNumbering.browser.spec.ts` (undo→redo→undo end to end),
  `activityUpdateHandler.spec.ts`, `DomainStoryPopupService.spec.ts` and the
  domain/registry specs. Two `PopupMenu` attributes were needed to make the
  round trip exercisable at all: `checked` on the multiple checkbox (it always
  opened unchecked, so re-saving silently cleared the allowance) and `min="1"` on
  the number input.
- **`DomainStoryRenderer` writes to the model it is only asked to paint — six
  more times.** #65 stopped the two writes that _corrected_ something (the
  overlap nudge, the default colour) and left the six that _own_ something,
  because each needed a decision about who should own it instead. All six are
  live upstream: `drawShape`/`drawConnection` stamp `businessObject.type`;
  `renderExternalNumber` **mints** an activity number when an actor-sourced
  activity has none and **clears** it for every other activity;
  `drawAnnotation` mirrors the box height onto `businessObject.number`; and both
  draw entry points flip the host's unsaved-changes flag. A repaint is not a user
  action, runs an unbounded number of times, and — because
  `import-domain-story.service.ts` aliases the business objects onto the elements
  — writes straight into what the next export emits. Fixed locally by moving each
  write to an owner undo can see: `DomainStoryCopyPaste` carries the `type` (paste
  is the only path that left it unset); a new `DomainStoryActivityNumbering`
  `CommandInterceptor` on `connection.create`/`connection.reconnect` owns the
  number; the annotation height needed no owner at all (`element.height` was
  already correct and the export pass already persists it); and a new
  `DomainStoryDirtyFlagUpdater` derives the dirty flag from
  `commandStack.changed` + `canUndo()`. Recorded as
  [ADR 0016](docs/adr/0016-rendering-is-read-only.md) and locked twice — a
  raw-source rule in `architecture.spec.ts` (rule I) and the repaint-and-diff
  cases in `RendererModelPurity.browser.spec.ts`, which previously passed
  _vacuously_ for four of the six because no fixture carries an annotation and
  every fixture activity already holds the number the renderer would write.
  Issue [#74](https://github.com/Miragon/egon-core/issues/74).

    **Two format changes ride along, and a reader on either side must know
    them.** Annotations no longer carry `number` — a pre-#74 file's value is
    translated into `height` by `useLegacyAnnotationNumberAsHeight` on import and
    then dropped, so it does not round-trip back out. And
    `activity.directionChange` passes `null` instead of `0` for "no number":
    upstream's `0` only ever worked because the following repaint laundered it
    into `null`, and without that it would export as `"number": 0`.

    **Two behaviours existed _only_ because a repaint ran, and had to be
    re-homed** or the change would have been a silent regression. A hand-made
    file's missing numbers were minted by the first paint; they are filled once
    on import by `numberActivitiesFromActors`. And `element.updateLabel` blanks
    an activity's number (upstream's `DomainStoryModeling` maps both
    `updateLabel` and `updateNumber` onto that one command, each supplying half),
    which the repaint put back — so upstream, renaming an activity drops it out
    of the sequence for exactly as long as it is not drawn. Locally that whole
    split is gone: `updateNumber` was removed as dead (#84 — its one caller,
    `ActivityDirectionChangedHandler.preExecute`, passed a business object where
    an Element was expected, so it never wrote anything), and
    `DomainStoryUpdateLabelHandler` is label-only. That also retires the
    `context.name` workaround `ActivityDirectionChangedHandler` carried for the
    mirror-image name bug.

    Three deletions go with it, all upstream-live code with no local counterpart
    left to port into. `DomainStoryRenderer.getActivityPath` — no callers, not a
    diagram-js contract name, body a no-op `map`. The **whole number-stash
    mechanism** (`DomainStoryNumberStash`, its didi module, the
    `stashNumber` call in `DomainStoryLabelEditingProvider`): it carried an
    activity's number across the redraw that direct-editing triggers, its `use`
    flag was only ever set by tests, and it became dead when #77 made
    `activity.changed` one atomic command. And `DomainStoryPasteRestore`'s height
    stash, which upstream still keeps — diagram-js copies `x/y/width/height` onto
    the paste descriptor and `DomainStoryElementFactory` honours a supplied
    height, so it was only ever needed because it read
    `businessObject.height`/`number`, neither of which a live canvas maintains.
    Verified by disabling the restore against
    `CopyPasteIntegration.browser.spec.ts`, not by reading the diagram-js source.
    Note this supersedes the "copy-paste.service.ts loses a pasted annotation's
    height" row above: the local `?? number` fallback recorded there is gone,
    because the field it fell back on no longer exists.

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
  The seam that let defect (1) through was closed structurally afterwards (issue
  [#71](https://github.com/Miragon/egon-core/issues/71), ADR 0015): the grammar's
  `can*` functions became `judge*` returning a `RuleVerdict`, and every diagram-js
  rule goes through one exhaustive `toRuleResult` mapping — so a rule can no
  longer hand diagram-js a raw `undefined`. That shape has no upstream
  counterpart, so there is nothing to reconcile on a sync; the `judge*` names are
  the local equivalents of upstream's `can*` grammar helpers.
- **`canConnect` invented an activity out of an annotation source** (issue
  [#72](https://github.com/Miragon/egon-core/issues/72), the follow-up #66
  deliberately left out). Upstream still has the asymmetry: `canConnect` guards
  only the annotation _target_, so `canConnect(annotation, actor)` answers
  `{ type: ACTIVITY }` — a shape neither the context pad (annotations get only
  delete + colour, so they can never _start_ a connection) nor
  `elementUpdateHandler` (reads an annotation's edge as `incoming[0]`) can
  represent. Fixed locally by one guard in `judgeConnection`
  (`src/story/domain/modelingRules.ts` — the local `judge*` equivalent of
  upstream's `canConnect`, per the bullet above): deny when the source is an
  annotation and the target is not.
  `isForbiddenAnnotationEdge` is unchanged — the gap is closed downstream of it,
  so each predicate keeps its own responsibility. The observable change is a
  `connection.reconnect` denial that `isForbiddenAnnotationEdge` misses: for
  `(source=annotation, target=workObject, connection=CONNECTION)` its activity
  clause needs an activity, its two-annotation clause needs an annotation
  target, and its third clause needs an actor/work-object source — none match,
  so `judgeReconnect` fell through to `judgeConnection` and the verdict reached
  diagram-js as **allowed**. Reachable only for a _pre-existing_
  annotation-sourced edge (legacy or hand-edited file), the same legacy-edge
  caveat the #66 bullet carries. Deliberately out of scope:
  `annotation → annotation` still yields `allowedAs(ElementTypes.CONNECTION)`
  from `judgeConnection` (`isForbiddenAnnotationEdge` clause 2 denies it on
  reconnect).
- **"Remove Group without Child-Elements" was hand-rolled, and undoing it threw.**
  `elementUpdateHandler.js`'s `removeGroupWithoutChildren` did its own teardown:
  `execute` called `undoGroupRework` (raw `document.querySelector` SVG surgery)
  per child, and `revert` fired `shape.added` with no `gfx` — diagram-js'
  `InteractionEvents` dereferences `event.gfx`, so undo died with
  `TypeError: Cannot read properties of undefined (reading 'appendChild')`. Even
  past that, `revert` iterated `element.children`, which `execute` had already
  emptied, so nothing was re-adopted; and `modeling.removeGroup` executed the
  command _then_ `removeElements`, making one UI action cost two undos.
  **Fixed locally by deleting the mechanism, not repairing it** (issue
  [#67](https://github.com/Miragon/egon-core/issues/67)): the handler is now
  preExecute-only and expresses the teardown as nested modeling calls — a
  `moveShape`/`moveConnection` per child onto the group's own parent, then
  `removeElements([group])`. Nested commands inherit the outer action id, so the
  whole thing is one commandStack entry, and diagram-js' own handlers own both
  the gfx re-parenting (`GraphicsFactory.updateContainments`, driven from
  `element.parent`) and the inverse. `undoGroupRework` was deleted outright.
  Two details are load-bearing and easy to undo by accident: the children are
  moved **individually with `layout: false`**, not through
  `modeling.moveElements` — `MoveHelper.moveClosure` routes a connection with
  only one moved endpoint through `modeling.layoutConnection` → `BaseLayouter`,
  which returns exactly two points and would flatten every bendpoint into the
  saved file (the corruption class of #65); and connections are moved
  **separately**, because `moveClosure` never re-parents them, so an activity
  drawn from inside the group (`Modeling.connect` parents it to `source.parent`)
  would be deleted with the group. Carried with it: a shape lifted out of a group
  now has `businessObject.parent` **cleared**, where the updater previously only
  ever set it — a stale `parent: <deletedGroupId>` used to survive into the
  export. And the teardown's internal moves carry a `groupTeardown` hint that
  suppresses `reworkGroupElements`, whose parent/children rewrites happen outside
  the command stack and would otherwise survive the undo. Locked by the
  `shape.removeGroupWithoutChildren` cases in
  `UpdateHandlerCommands.browser.spec.ts` (one undo re-adopts; bendpoints
  survive; a group-parented activity survives; no sibling gets swallowed) and by
  the group cases in `ModelingCommands.browser.spec.ts`.

    Still shared with upstream and **out of scope**: `reworkGroupElements` mutates
    `parent`/`children` outside any command, so group adoption from _moving or
    creating_ a group remains non-undoable.

- **Debounced host callbacks outlived `destroy()`, and the debounce did not
  debounce.** _Local-only, no upstream counterpart — upstream's Angular host owns
  the debounce._ Each adapter kept a private `createDebouncedCallback` whose
  `timeoutId` was closure-private, so nothing could cancel an armed timer:
  `DiagramJsModelerAdapter.destroy()` cleared its registry but left the timers
  running, and `DiagramJsIconAdapter` had no `destroy()` at all. A host disposing
  inside the 100 ms window still got `story.changed`/`icons.changed`, and the
  icons callback read services off a destroyed injector. `onStoryChanged`
  additionally built a **fresh** debouncer per event, so nothing coalesced — the
  window was pure added latency. Fixed locally by one cancellable
  `createDebouncedCallback` in `src/shared/infrastructure/debounce.ts`, hoisted
  per subscription; `IconPort` gained `destroy()` and `EgonClient.destroy()` now
  tears down the icon port before the modeler port (which disposes the injector
  both read from). `off*()` cancels too, so unsubscribing cannot orphan a timer.
  The modeler adapter's registry is split into one map per event kind: a zero-arg
  function is assignable to both `story.changed` and `viewport.changed`, and a
  single union-keyed map lost the first handle on the second `on()`. Issue
  [#69](https://github.com/Miragon/egon-core/issues/69); locked by
  `debounce.spec.ts`, the debounce/teardown cases in `DiagramJsModelerAdapter.spec.ts`
  and `DiagramJsIconAdapter.spec.ts`, and the `destroy` cases in
  `EgonClient.browser.spec.ts`.
- **`destroy()` left the icon `<style>` node behind, and two instances shared one
  sheet.** _Local-only, no upstream counterpart — upstream's Angular host owns the
  container._ `initializeContainer` appended `<style id="iconsCss">` to the
  _host's_ element, which `diagram.destroy()` never removes (`Canvas._destroy`
  takes out only its own `.djs-container`), so a host reusing a container kept the
  previous session's rules. The id also made it document-global: `IconCssInjector`
  resolved it with `document.getElementById`, so with two clients the **first**
  node won and instance B wrote into instance A's sheet — which is why
  remove-on-destroy could not land alone. Fixed locally by creating one
  unmarked-by-id `[data-egon-icons-css]` node per adapter, handing it to that
  instance's `IconCssInjector` by reference through diagram-js' DI config
  (`config.domainStoryIconStyleSheet`, the mechanism `config.canvas.container`
  already uses), and removing it in `destroy()`. Note this is ownership, not CSS
  isolation — the rules stay document-global, so selector prefixing is still open
  as [#12](https://github.com/Miragon/egon-core/issues/12). Issue
  [#69](https://github.com/Miragon/egon-core/issues/69); locked by
  `IconCssInjector.spec.ts`, the sheet-isolation case in
  `MultiInstanceIsolation.spec.ts`, and the container-empty case in
  `EgonClient.browser.spec.ts`.
- **`getCurrentConfigurationForExport` needed _both_ icon categories to be
  non-empty.** `if (actors.length > 0 && workObjects.length > 0)` is
  upstream-verbatim and harmless there, because upstream always has its default
  icon set loaded. Here a half-empty icon set is legal, so the `&&` made
  `hasIcon()`/`getIcons()` report `{}` right after a successful `addIcon()` and
  made an export write `EMPTY_ICON_SET` over the half that did exist. Changed to
  `||`; neither half populated still yields `undefined`, which is what keeps
  `EMPTY_ICON_SET` for a genuinely empty set. Locked by the half-empty cases in
  `IconSetImportExportService.spec.ts`.
- **The work-object autocomplete never tore its listeners down.** Upstream's
  `dsLabelUtil.js` removes the `input` listener only on Enter-commit or a
  list-closing outside click, adds one `document` click listener per session that
  is never removed, and overwrites `editingBox.onkeydown` only for work objects.
  Because the direct-editing box is one recycled node, an actor session inherited
  the previous work object's keydown handler — whose guard tests the _captured_
  element, so Enter renamed that work object outside the command stack. Fixed
  locally by resetting `onkeydown` before the non-work-object early return and by
  a `teardown()` wired to `directEditing.complete`/`cancel`. Locked by the
  "session teardown" cases in `labeling/__tests__/utils.spec.ts`.
- **Bendpoint-drag hiding was not undone on ESC.** Upstream's renderer removes
  its `djs-element-hidden` marker only on `bendpoint.move.end`; a cancelled drag
  fires `.cancel` instead (Dragging.js:283 vs :374), leaving the activity
  invisible. diagram-js' own `BendpointMovePreview` listens to both, and so do we
  now. Locked by `DomainStoryRenderer.spec.ts`.
- **The ctrl-drop "open replace menu" listener ran before selection.** Registered
  at the default priority 1000, it always observed a closed context pad, because
  it is diagram-js' `SelectionBehavior` (priority 500) that selects the new shape
  and thereby opens the pad. Registered at 250 locally, which is what bpmn-js
  does. Locked by the ctrl-drop cases in `DomainStoryContextPadProvider.spec.ts`.
- **`generateAutomaticNumber` wrote the number it computed.** Upstream mints the
  number into `businessObject` as a side effect, so the context pad's
  `changeDirection` handed `activity.directionChange` an already-mutated model to
  snapshot and an undo restored the _new_ number. Made a pure query locally, with
  each caller writing inside its own command. Same class as
  [#74](https://github.com/Miragon/egon-core/issues/74). Locked by
  `DomainStoryNumberingRegistry.spec.ts`, the change-direction case in
  `DomainStoryContextPadProvider.spec.ts`, and the `activity.directionChange`
  case in `ActivityNumbering.browser.spec.ts`.
- **A cancelled paste leaked its stash onto the next create.** _Local-only
  mechanism (`DomainStoryPasteRestore`), but the upstream host code it ports has
  the same hole._ The stash was cleared only when the next paste started, so
  Escape (or a rejected drop) left it for a plain palette create to consume.
  Reset on `create.cancel`/`create.rejected`, filtered by the paste's
  `hints.createElementsBehavior === false` marker so an unrelated drag that
  `dragging.init` aborts cannot wipe a stash the paste just filled. Locked by the
  cancel/rejected cases in `DomainStoryPasteRestore.spec.ts`.
- **The `pickedColor` document listener was never removed.** _Local-only seam —
  upstream's Angular host owns the color picker._ Removed on `diagram.destroy`,
  same reasoning as the `<style>` node above ([#12](https://github.com/Miragon/egon-core/issues/12)).
  Locked by the destroy case in `DomainStoryContextPadProvider.spec.ts`.
- **`addDelete` asked the rules a question no rule can answer, then threw.** It
  called `rules.allowed("elements.delete", { elements: { element: elements } })`
  — a nested context no diagram-js/bpmn-js rule matches — and compared an array
  verdict against its own local wrapper array (`deleteAllowed[0] === elements`,
  never true). On denial it threw, and `getContextPadEntries` has no catch, so
  registering any denying `elements.delete` rule would have killed the _whole_
  context pad rather than one entry. Latent upstream only because no such rule
  exists (`Rules.allowed` → `true` with no matching rule). Fixed locally per
  [#85](https://github.com/Miragon/egon-core/issues/85): canonical flat
  `{ elements }` context, array verdict read as the deletable subset, and denial
  omits the entry instead of throwing. Locked by the delete-entry cases in
  `DomainStoryContextPadProvider.spec.ts`.
- **`selectedElement` was never cleared, so the host's color reply could recolor
  a stale element.** _The bug is upstream's; the document-level `pickedColor`
  seam is local (upstream's Angular host owns the picker)._ Only `addColorChange`
  writes the field, and the connection branch of `getContextPadEntries` emits a
  delete entry alone, so the previously selected shape stayed reachable — and an
  async picker reply arriving after the pad closed recolored it, possibly after
  deletion, minting an undo entry for a detached element.
  `notifyColorPickerOfCurrentElementColor` likewise pre-seeded the picker with
  the stale color, contradicting its own doc comment. Cleared locally on pad
  re-entry and on `contextPad.close` per
  [#85](https://github.com/Miragon/egon-core/issues/85) — both hooks are needed,
  since `contextPad.close` misses direct `getEntries()` queries and the re-entry
  clear misses "pad closed, picker replies later". Ordering is safe because
  diagram-js' `ContextPad#open()` closes before it repopulates the providers.
  Locked by the stale-selection cases in
  `DomainStoryContextPadProvider.spec.ts`.

- **`domainStoryPalette.js` keys work-object entries as actors, and its title
  fallback is unreachable.** Both live upstream at the recorded baseline
  (`src/app/tools/modeler/diagram-js/features/palette/domainStoryPalette.js`,
  lines 59 and 101). `addCanvasObjectTypes(name, "actor", WORKOBJECT)` builds the
  key `domainStory-actor<Name>` for work objects too, so an icon assigned as
  **both** an actor and a work object silently loses its actor entry — the later
  work-object write overwrites it in the flat entries record, and the survivor
  creates a `domainStory:workObject<Name>` shape from the actor slot. Fixed
  locally by passing `"workObject"`, which namespaces the key and puts the entry
  in the group its separator already uses (visual order is unchanged). The
  second: `"Create " + title || "Create " + shortType` parses as
  `("Create " + title) || …`, always truthy, so the `shortType` fallback is dead;
  fixed to `"Create " + (title || shortType)`. Locked by
  `palette/__tests__/DomainStoryPalette.spec.ts`. Issue
  [#86](https://github.com/Miragon/egon-core/issues/86). A third fix in the same
  file needs no entry here — the `dst.config.changed` listener calling
  `palette._update()` (which bypasses `_rebuild()`'s `_diagramInitialized`,
  providers-present and lazy-`_init()` guards) is local-only code; upstream has
  no such listener.
- **Activity-label selection iterated one waypoint past the segment list.**
  Upstream's `selectPartOfActivity` loops over every waypoint but reads both
  `angleActivity[i]` and `waypoints[i + 1]`; the final waypoint has neither a
  corresponding segment angle nor a following point. Fixed locally by stopping
  at `waypoints.length - 1`, preserving the last-qualifying-horizontal-segment
  rule and segment-zero fallback. Locked by the boundary and guarded
  out-of-range cases in `labeling/__tests__/utils.spec.ts`. Issue
  [#89](https://github.com/Miragon/egon-core/issues/89).
- **Annotation colour undo restored its connector from the wrong snapshot.**
  Upstream snapshots only the annotation's `pickedColor`, then writes that value
  to both annotation and incoming connection on undo. If their original colours
  differ, undo corrupts the connector; looking up `incoming[0]` again also means
  the command does not own the exact object it changed. Fixed locally by
  snapshotting the annotation colour, first incoming connection reference, and
  connection colour independently during initial execution, then using those
  snapshots for execute/revert (including `undefined`). Locked by the
  recolour/undo/redo cases in `UpdateHandlerCommands.browser.spec.ts`. Issue
  [#89](https://github.com/Miragon/egon-core/issues/89).
- **`rgbaToHex` extracted any numbers from any string and assumed an alpha
  channel existed.** A named colour or malformed picker result threw on the
  non-null `match`, while opaque `rgb()` produced `NaN` alpha and unrestricted
  numeric extraction could manufacture a colour from unsupported syntax. Fixed
  locally with complete, case-insensitive parsing of comma-separated `rgb()` and
  `rgba()`, range checks, rounded byte channels, and unchanged passthrough for
  everything outside that targeted syntax. The shared hex validator now also
  accepts exactly 3, 4, 6, or 8 digits instead of accidentally accepting seven.
  The context-pad trigger remains deliberately unchanged: conversion happens
  only when the previous colour contains hex alpha. Locked by
  `colorConverter.spec.ts` and actual `pickedColor` events in
  `DomainStoryContextPadProvider.spec.ts`. Issue
  [#90](https://github.com/Miragon/egon-core/issues/90).
- **Replacement options matched icon names by substring instead of full element
  type.** With registered `Person` and `SalesPerson`, a current
  `domainStory:actorSalesPerson` filtered out both; the same defect affected work
  objects and could also collide across category prefixes. Fixed locally by
  comparing the current type with the category prefix plus the candidate's exact
  icon name. Registration order, dense arrays and menu metadata stay unchanged.
  Locked by `DomainStoryReplaceOption.spec.ts`. Issue
  [#90](https://github.com/Miragon/egon-core/issues/90).
- **The SVG text sanitizer behavior specified by issue #90 is implemented
  locally.** `sanitizeTextForSVGExport` now maps angle brackets to `&lt;` and
  `&gt;` while retaining its legacy `--` to `––` substitution; the paired
  `unsanitizeTextForSVGExport` reverses those three mappings. This is deliberately
  not a general XML codec and is lossy for literal entities and en-dash pairs.
  Label editing and export pipelines are unchanged, as are desktop-filename and
  CSS sanitization. The upstream baseline object was unavailable for comparison,
  so this records the issue-specified behavior without claiming a verified
  upstream copy. Locked by `sanitizer.spec.ts`. Issue
  [#90](https://github.com/Miragon/egon-core/issues/90).

### Known, still shared with upstream

**Not** fixed here — each needs a design decision rather than a one-liner, so
they are pinned instead: the spec named on each row asserts the _current_ broken
behaviour, so a fix on either side turns that spec red rather than passing
silently. Fixing one means inverting its assertions.

Found while building the modeling-command suite (#55):

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
- **`handleUpdate` mis-splices on an `indexOf` miss.**
  `activitiesFromActors.splice(indexOf(element), 1)` removes the _last_ entry
  when `indexOf` returns `-1`, reachable if the edited element is not in
  `getActivitiesFromActors()` (e.g. a work-object-sourced activity). Latent, not
  pinned.

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
  [#8](https://github.com/Miragon/egon-core/issues/8). The instruction stands,
  but note the local `undoGroupRework` no longer exists (deleted with #67), so
  the upstream hunk has **no local counterpart** to port it into: the whole
  function is a skip, not just that line.
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
