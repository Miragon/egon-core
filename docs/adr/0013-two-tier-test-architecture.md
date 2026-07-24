# 0013 — Two-tier test architecture: unit (jsdom) + browser (chromium)

- Status: accepted
- Date: 2026-07-24

## Context

Every spec so far runs under a single jsdom vitest environment, and every one
that touches the modeler mocks the ports or mocks diagram-js itself. A genuine
`EgonClient.create()` boot cannot run under jsdom: diagram-js lays out shapes by
measuring SVG with `getBBox`, which jsdom returns as zero, so the canvas never
renders. That leaves the real bootstrap path — the adapter wiring diagram-js to
a host container — completely unexercised. The test-harness epic
([#15](https://github.com/Miragon/egon-core/issues/15)) needs a tier that boots
the real thing, and the dependent tier issues should not each reinvent bootstrap
and fixture-loading code.

The local `yarn test` loop must stay fast: contributors run it constantly, and a
browser download plus real rendering on every run would be a tax that pushes
people to skip tests.

## Decision

**Split vitest into two projects and share one test-infrastructure location.**

- `unit` (jsdom) is the default tier: `yarn test`, `test:watch`, and
  `test:coverage` all target `--project unit`. It excludes `*.browser.spec.ts`.
  Ports and diagram-js stay mocked here.
- `browser` runs real chromium through `@vitest/browser` + `playwright`
  (`provider: "playwright"`, headless). It includes only `*.browser.spec.ts` and
  is the sole tier where a real boot renders. Run via `yarn test:browser`; in CI
  it is a dedicated `test-browser` job so the unit job needs no browser download.
- Shared helpers and fixtures live under `src/__tests__/` — a `__tests__` path so
  the architecture spec's raw-source scans skip them (they legitimately import
  `EgonClient`/diagram-js, which production source may not). `importFixture`
  loads fixtures as JSON modules (not `node:fs`) so the same registry works in
  node, jsdom, and browser; `createTestDiagram` boots a real client and is
  browser-tier only.
- Coverage runs unit-only and gates just the framework-free domain model
  (`src/**/domain/**`) via a glob threshold. The browser tier adds no coverage.
  Toolchain and dependency pins are exact per ADR 0004; new deps are pinned.

## Alternatives considered

- **One environment for everything (happy-dom / a heavier jsdom shim)** —
  rejected: no DOM shim computes real SVG geometry, so the boot path stays
  untested. Only a real browser proves it.
- **Coverage thresholds across all of `src`** — rejected for now: large swaths
  (infrastructure adapters) are only reachable from the browser tier, which
  carries no coverage, so a global gate would either be trivially low or force
  brittle unit mocks. Gating the pure domain keeps the signal honest; widen
  later by ratcheting the glob upward, never by lowering a number to pass CI.

## Consequences

- CI gains a `test-browser` job (chromium via `playwright install --with-deps`)
  appended to the `ci` aggregate gate. Slower and heavier than the unit job, but
  isolated from it; the fast local loop is unchanged.
- The harness immediately earned its keep: the first real boot showed the
  adapter passed the container at the top level, but diagram-js injects
  `config.canvas`, so the canvas had been rendering into `document.body` and the
  `width`/`height` were ignored — fixed in the same change.
- New browser specs must end in `.browser.spec.ts` or they run under jsdom and
  fail on `getBBox`. Fixtures are shared JSON modules; a spec that mutates one
  must clone it (`importFixture` clones on every call).
- The domain coverage thresholds are a regression lock, paired with the glob in
  `vite.config.mts`; raising them is a deliberate ratchet.
