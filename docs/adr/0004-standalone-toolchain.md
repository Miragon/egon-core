# 0004 — Standalone build, test, and lint toolchain

- Status: accepted
- Date: 2026-07-20

## Context

The extracted code originally built inside the egon.io Angular workspace. As a
standalone library, egon-core must build, test, and verify itself with no host
application present, and its output must be consumable by arbitrary bundlers.

## Decision

- **Build**: Vite in library mode, emitting ESM (`dist/index.js`), a `.d.ts`
  tree (`vite-plugin-dts`), and compiled styles (`dist/style.css`). No CJS
  build — consumers are expected to use a bundler that resolves ESM.
- **Test**: Vitest with jsdom, so diagram-js code that touches the DOM is
  testable without a browser.
- **Static checks**: ESLint (flat config, typescript-eslint) plus a `tsc
  --noEmit` typecheck over both the library (`tsconfig.lib.json`) and the test
  files (`tsconfig.spec.json`).
- **Package manager**: Yarn 4 via corepack, pinned in `package.json`
  (`packageManager`), so CI and contributors resolve identical dependency
  trees.

## Consequences

- `yarn build && yarn test && yarn lint && yarn typecheck` is the complete
  verification story; CI needs nothing from egon.io.
- ESM-only output is a compatibility cut: consumers on legacy CJS setups need
  a bundler. Accepted, since the library targets browser apps with bundlers
  anyway.
