# 0035 — Use TypeScript 7 with a compatible JavaScript tooling API

- Status: accepted
- Date: 2026-09-14

## Context

The dependency update adopts TypeScript 7.0.2. Its native compiler does not
provide the JavaScript Compiler API used by typescript-eslint, vite-plugin-dts,
and the ID-factory source-analysis tests. The old CommonJS/node10 resolution
and baseUrl configuration also prevents TypeScript 7 from checking the project.

## Decision

Keep TypeScript 7 for typechecking, as explicitly requested for this migration.
Pin `@typescript/native` to `npm:typescript@7.0.2` and alias `typescript` to
`npm:@typescript/typescript6@6.0.2`. The native package provides `tsc`; the
compatibility package provides `tsc6` and the JavaScript API. Yarn locks the
compatibility package's underlying TypeScript 6 dependency as well.

Use ESNext modules and Bundler resolution for library, spec, and demo checks.
Remove baseUrl and unused decorator options; retain explicit relative demo
paths. Test-only libraries include ES2022 and Vite's asset declarations because
the tests run on Node 24 and current Chromium. Keep the library's existing
JavaScript target and library declarations.

The isolated consumer harness installs the native alias and checks the packed
public declarations with TypeScript 7. Declaration emission and linting use
the compatible JavaScript API. This extends the toolchain in ADR 0004 without
changing the ESM package exports or the host-independent runtime.

## Alternatives considered

- Revert TypeScript — rejected by the user, who requested retaining version 7.
- Install only the compatibility package alongside an unaliased TypeScript 7 —
  insufficient because typescript-eslint imports `typescript` directly.

## Consequences

- Typechecking uses the native compiler while JavaScript tooling remains usable.
- Two compiler implementations are installed. Future upgrades must verify both
  the CLI and API paths; their package names deliberately differ.
- `yarn typecheck`, lint, unit source-analysis tests, library build, and
  `yarn test:package` validate this split without relaxing architecture rules.
