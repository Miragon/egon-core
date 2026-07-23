# 0010 — Flat DDD feature layout, feature public surfaces, and a frozen public API

- Status: accepted
- Date: 2026-07-22

## Context

ADR 0005 froze the post-extraction structure as two rings — a diagram-js
"plugin ring" (`src/features/*`, `src/import`, `src/export`, …) around a shared
`src/domain`, and a hexagonal "client ring" in `src/client`. That layout carried
the extraction's history rather than the domain: the same concept (icons, labels,
the story itself) was split across a feature folder, the shared domain, and the
client context. ADR 0005 also deliberately deferred feature-to-feature isolation
("siblings only via barrels") "until the feature folders settle", and left the
public API carrying `EgonPlugin` plus six deprecated service exports.

Epic #14 (PRs #32–#35) settled the folders into a flat, per-feature layout. This
ADR records the target that migration converged on and the invariants that lock
it — the closing step (#30) of the epic.

## Decision

### Flat DDD feature layout

Code is organized by **feature**, not by extraction origin. Each feature is a
top-level folder under `src/` with up to three layers:

- `modeler/` — the canvas/model context and `EgonClient` (the public entry).
- `story/` — the domain story: its model plus import/export services.
- `iconSet/` — icon dictionary and icon-set import/export.
- `labelDictionary/` — activity/work-object label collection.
- `shared/` — the shared kernel (see below).

Within a feature: `domain/` is the framework-free core (model, ports),
`service/` is the use-case / didi-service surface, `infrastructure/` holds the
diagram-js and DOM adapters that implement the domain ports.

### `shared/` is a shared kernel, not a bounded context

`shared/domain` (pure helpers: sanitizer, math, color) is importable from any
layer of any feature. `shared/infrastructure` (DOM/UI: `VersionBox`, popup,
numbering) plus the ambient `src/types` and `src/assets` are importable only
from `infrastructure/` files. `shared` has no `service` barrel and is not a
sibling feature.

### Public API frozen to `EgonClient` + types

`src/index.ts` is the sole public entry (`exports["."]`). It exposes `EgonClient`
and the port / wire-format **types**, and nothing else. `EgonPlugin` and the six
formerly-deprecated service exports (`DomainStoryImportService`,
`DomainStoryExportService`, `ElementRegistryService`, `DirtyFlagService`,
`IconDictionaryService`, `LabelDictionaryService`) are **removed**.

Rationale: no host imports them (the VS Code webview host uses only `EgonClient`,
`DomainStoryDocument`, `ViewportData`). `EgonClient.create(config,
additionalModules)` is the advanced-integration escape hatch — a consumer that
needs custom diagram-js modules passes them there. Re-adding a named export later
is non-breaking; keeping `EgonPlugin` public, by contrast, would freeze the whole
`modeler/infrastructure` type surface against the deep refactors this core still
needs. The barrel imports deep type paths on purpose so it never pulls a
feature's didi default module into the package entry (which would defeat
`EgonClient`'s lazy adapter loading).

### A feature's public surface = its `domain/**` + its `service` barrel

Cross-feature imports may target any file under another feature's `domain/**`
(pure by the domain-purity rules) or **exactly** that feature's `service` barrel
(`src/<feature>/service`). Another feature's `infrastructure/` is always
off-limits, as is a sibling's concrete `service/<file>`.

This is a **pragmatic deviation** from issue #30's literal "one `index.ts` barrel
per feature as the only public surface". A single feature-root barrel
re-exporting the service _and_ infrastructure layers would (a) create a
service→infrastructure graph edge that breaks the hexagon rules, and (b) pull
didi default modules and their diagram-js dependencies into any importer,
undermining `EgonClient`'s dynamic-import composition. Exposing `domain` files
directly is safe precisely because domain purity is already enforced, so the
extra barrel would add ceremony without adding protection.

### One composition root per feature (allowlist)

Only a feature's composition root may wire infrastructure adapters onto domain
ports. The allowlist is exactly:

- `modeler/service/EgonClient.ts` — dynamic `import()` of the diagram-js adapters.
- `iconSet/service/index.ts` — wires `IconCssInjector` (`IconStyleSheetPort`).
- `story/service/importModule.ts` — wires `VersionBoxBanner` (`VersionBannerPort`).

### Invariants are executable (regression locks)

`src/architecture.spec.ts` runs the rules as CI gates. Alongside the inherited
A–D rules (graph sanity, no cycles, domain purity, framework-free modeler
service), this ADR adds:

- **E. Generalized hexagon** — no `service` file depends on `infrastructure`,
  as a static graph edge (E1) or a raw specifier that names `infrastructure`
  (E2, which also closes the dynamic-`import()` blind spot), outside the
  composition-root allowlist. Applies to every feature.
- **F. Sibling isolation** — a raw scan (independent of archunit's re-export
  edge semantics): every cross-feature relative import must resolve to another
  feature's `domain/**`, exactly its `service` barrel, `shared/domain`, or
  `shared/infrastructure`/`assets`/`types` (from `infrastructure/` files only).
  Importing `src/index` internally is always forbidden.
- **G. Public surface freeze** — `src/index.ts` imports exactly the frozen
  specifier list with no `infrastructure` path (G1), re-exports exactly the five
  runtime values `DomainPurity`, `EgonClient`, `Granularity_Goal`,
  `Granularity_Grain`, `PointInTime` (G2), and `package.json` `exports`/`files`
  stay locked to the barrel (G3).

As with all rules here, a red gate is fixed in the code, never relaxed in the
rule.

## Alternatives considered

- **Keep the two-ring layout (ADR 0005)** — rejected: it organized code by
  extraction origin, scattering each concept across three places and making the
  upstream sync (epic #13) harder to reason about, not easier.
- **Literal one-barrel-per-feature public surface** — rejected for the
  service+infrastructure reasons above; the domain layer is already safe to
  expose directly, so the barrel-only rule would add ceremony without protection.
- **Keep `EgonPlugin` / the deprecated services exported** — rejected: unused by
  hosts, and keeping them public freezes the entire `modeler/infrastructure` type
  surface. `additionalModules` covers the real advanced-integration need, and
  re-adding an export later is non-breaking.
- **Enforce framework-free services for every feature** — rejected for now:
  `story`/`labelDictionary` services _are_ didi-registered diagram-js services by
  nature, so the strict "no framework packages in `service`" rule stays
  modeler-only. Generalizing it is deferred future work.

## Consequences

- The layout mirrors the domain; a contributor finds everything about a concept
  under one feature folder, and upstream diffs map onto features.
- Cross-feature coupling is now enforced, not just intended: a deep import into a
  sibling's service or infrastructure breaks CI immediately.
- The public API is small and stable. Widening it is a deliberate edit to the
  frozen lists in `architecture.spec.ts` plus this ADR — it cannot slip through
  review by accident.
- Adding an infrastructure dependency to a service still requires a domain port
  and a composition-root wire-up — intentional friction that keeps the hexagon
  intact.
- Deferred: framework-free enforcement for `story`/`labelDictionary` services.

Supersedes ADR 0005.
