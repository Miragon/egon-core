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

| upstream (wps/egon.io) | local |
| --- | --- |
| `src/app/tools/modeler/diagram-js/features/*` | `src/modeler/infrastructure/*` (change-icon→`replace`, copyPaste→`copy-paste`, shortcuts→`keyboard`+`editor-actions`, numbering→`popup`+`number-stash`, util/TextRenderer→`text-renderer`) |
| `src/app/domain/entities/*` | `src/story/domain/*` (icon types→`src/iconSet/domain`, label entries→`src/labelDictionary/domain`) |
| `src/app/domain/services` + `src/app/tools/modeler/services` | `src/modeler/service/*` (ModelerService/InitializerService ≈ `EgonClient`/`DiagramJsModelerAdapter`) |
| `src/app/tools/icon-set-config/{domain,services}` | `src/iconSet/{domain,service,infrastructure}` |
| `src/app/tools/{import,export}/services` | `src/story/service/*` |
| `src/app/tools/label-dictionary/services` | `src/labelDictionary/service/*` |
| `src/app/utils` | `src/shared/domain/*` (pure helpers), `src/shared/infrastructure/*` (DOM/diagram-js-touching) |

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

## Standing skip reasons

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
