# 0021 — Add a public-consumer Playwright journey tier

- Status: accepted
- Date: 2026-09-06

## Context

The chromium Vitest tier from [ADR 0013](0013-two-tier-test-architecture.md)
proves real rendering and command behavior, but its fixtures may import
infrastructure classes and operate through the diagram-js injector. That is the
right seam for focused integration tests and the wrong seam for proving that a
host can build a useful editor from the published `EgonClient` contract.

Issue #57 also needs confidence in palette, context-pad, popup, direct-editing,
keyboard, and import/export behavior as a user experiences them. Covering every
variation through full browser journeys would make failures slow and difficult
to diagnose; the existing focused tiers should remain the primary regression
suite.

## Decision

Add a thin Playwright tier containing exactly four user journeys under
`demo/__tests__/`: draw/number, connect/renumber/undo/redo, label editing with
autocomplete, and export/reset/import (including malformed input). Tests create
stories exclusively through mouse and keyboard input. They may inspect DOM
attributes, rendered bounds, and exported JSON, but may not reach modeler
internals or seed a story programmatically.

Back the tier with a minimal Vite demo under `demo/`. The page imports library
code and types only from `src/index.ts`; library and diagram-js stylesheets are
the deliberate stylesheet exceptions. The scoped ESLint restriction in
`eslint.config.mjs` enforces that consumer boundary. The demo remains outside
the library build and the package's `files: ["dist"]` publication boundary, and
its Vite configuration does not generate declarations.

## Alternatives considered

- **Extend the chromium Vitest tier only** — rejected because injector-level
  fixtures can pass while the public API or real user interactions are broken.
- **Move browser integration coverage to Playwright** — rejected because the
  many focused command and rendering cases are faster and clearer in their
  existing harness. Playwright is a small acceptance layer, not a replacement.
- **Expose test hooks from `EgonClient`** — rejected because UI journeys should
  validate the same contract as a real host, without expanding the frozen API.

## Consequences

- CI downloads Chromium for a distinct `test-e2e` job, builds the library, and
  runs the four journeys serially with one retry in CI.
- Every test receives a fresh browser context. Failure screenshots and traces
  are retained and uploaded by CI.
- The demo is useful for manual exploration and HMR, but deliberately has no
  persistence, dialogs, downloads, clipboard integration, or new public APIs.
