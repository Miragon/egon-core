# 0005 — Module layout, DDD layering, and executable architecture tests

- Status: superseded by [0010](0010-flat-ddd-feature-layout-and-frozen-public-api.md)
- Date: 2026-07-20

## Context

The extraction inherited two coexisting structures: diagram-js-style feature
modules (`src/features/*`, `src/import`, `src/export`, …) around a shared
domain (`src/domain`), and a hexagonal client context (`src/client`). Held
only by discipline, the boundaries were already eroding — a domain service
imported diagram-js directly, and the domain entities carried import cycles.
Rules that live in people's heads do not survive contributors, agents, or
time.

## Decision

### Layout: two rings

1. **Plugin ring** (`EgonPlugin`): diagram-js modules — `src/features/*`,
   `src/import`, `src/export`, `src/icon-set-config`, `src/label-dictionary`,
   `src/ui`, `src/utils` — around the shared plugin domain `src/domain`
   (`entities`, `ports`, `service`). These modules are diagram-js-coupled by
   nature; only the domain inside them is not.
2. **Client ring** (`EgonClient`): a ports-and-adapters context in
   `src/client` — `domain` (model, events), `application` (use-case surface +
   `ports`), `infrastructure` (diagram-js adapters implementing the ports).

### Rules

- **Domain purity**: every `domain/` layer (`src/domain`, `src/client/domain`,
  `src/label-dictionary/domain`, and any future one) imports only relative
  modules and depends only on other domain files. Framework access goes
  through ports defined in the domain and implemented outside it
  (e.g. `ElementRegistryPort`, satisfied structurally by diagram-js's
  `ElementRegistry` that didi injects at runtime).
- **No import cycles** anywhere in `src/`. Mutually recursive domain types
  (`CanvasObject` / `ActivityCanvasObject` / `RootObject`) are therefore
  colocated in one file — splitting them would force a cycle.
- **Client hexagon**: `application` never imports `infrastructure` statically
  and names no framework module. The single sanctioned exception is
  `EgonClient` itself, which doubles as the composition root: it wires the
  adapters via dynamic `import()` and carries the type-only `didi` surface of
  `EgonClientConfig.additionalModules`.

### Enforcement

The rules are executable: `src/architecture.spec.ts` runs them in the normal
test suite using [archunit](https://www.npmjs.com/package/archunit) for
graph-based rules (cycles, folder dependencies) plus raw-source scans for what
archunit's graph cannot see — external package imports and dynamic `import()`
calls produce no edges under this tsconfig, and a graph-sanity test guards
against the resolver silently degrading. Rules are regression locks: a red
architecture test is fixed in the code, not relaxed in the rule.

Feature-to-feature isolation (siblings only via `index.ts` barrels) is
deliberately **not** enforced yet — the plugin ring's internal structure is
still in flux post-extraction; a future ADR can add it once the feature
folders settle.

## Consequences

- Boundary regressions break CI immediately instead of accumulating.
- Adding a framework dependency to a domain file now requires writing a port —
  intentional friction.
- The composition-root exception is explicit and testable rather than folklore.
- archunit's blind spots are compensated in the spec; if a future tsconfig
  change alters graph extraction, the sanity test fails loudly.
