# CLAUDE.md

## What this is

A [diagram-js](https://github.com/bpmn-io/diagram-js) plugin for Domain
Storytelling diagrams — the standalone core extracted from
[WPS/egon.io](https://github.com/WPS/egon.io). It must stay **host-independent**:
the core owns canvas, model, and domain logic; persistence, dialogs,
notifications, and file downloads belong to hosts (VS Code webview today, the
WPS web app as the end goal). `EgonClient` is the public API; consumers import
only from `src/index.ts`.

## Commands

- `yarn build` — vite library build (ESM + `.d.ts` via vite-plugin-dts + style.css)
- `yarn test` / `yarn test:watch` / `yarn test:coverage` — vitest, jsdom environment, config lives in `vite.config.mts`
- `yarn lint` / `yarn format` — eslint / prettier
- `yarn typecheck` — checks both `tsconfig.lib.json` and `tsconfig.spec.json`; run it, not bare `tsc`
- Yarn 4 (pinned via `packageManager`) — never use npm/npx

## Architecture (enforced, not just documented)

- ADRs in `docs/adr/` are the source of truth — read the relevant ones before
  structural changes; record new lasting decisions as ADRs (`docs/adr/README.md`).
- `src/architecture.spec.ts` runs executable layout rules (archunit graph +
  raw-source scans) in the normal test suite. **Rules are regression locks:
  fix the code, never relax a rule to make CI pass.**
- Domain purity is path-based: every `**/domain/` folder imports only relative
  modules and only other domain files — no diagram-js, no DOM, no packages.
  Framework access goes through ports defined in `domain/`, implemented outside.
- Restructure in flight: epic #14 (steps #26–#30) migrates to a flat DDD
  feature layout — `modeler/ story/ iconSet/ labelDictionary/ shared/`, each
  feature with up to three layers (`domain/`, `service/`, `infrastructure/`).
  Check those issues before moving files; restructure PRs stay move-only.
- Multi-instance safety: no new module-level singletons (see #12 — existing
  ones in renderer/labeling are being removed).

## Upstream sync

This repo mirrors bug fixes from `WPS/egon.io` (epic #13, baseline `65c59291`).
Where names are arbitrary, match upstream naming so sync diffs stay reviewable.

## Conventions

- Tests are colocated in `__tests__/` folders next to their subjects.
- PR titles must be conventional-commit style — `feat|fix|refactor|docs|chore`
  (enforced by CI); commits follow the same pattern.
- License is GPL-3.0-or-later — only compatible code may be ported in.

## Gotchas

- The base tsconfig typechecks with `module: commonjs`, so `import.meta` is
  rejected in spec files — use `__dirname` (vitest's vite-node provides it).
- `sideEffects` in package.json only lists styles — keep runtime modules free
  of import-time side effects or bundlers will tree-shake incorrectly.
