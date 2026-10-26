# AGENTS.md

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
- `yarn typecheck` — checks library, spec, and demo tsconfigs; run it, not bare `tsc`
- Yarn 4 (pinned via `packageManager`) — never use npm/npx

## Architecture (enforced, not just documented)

- ADRs in `docs/adr/` are the source of truth. They are grouped into topic
  files (`architecture.md`, `public-api.md`, `testing.md`, …), and each
  decision has a stable ID such as `ARC-4`. Read the relevant topic before
  structural changes. Record new lasting decisions in their topic, or edit the
  existing decision in place with a `History` entry, as described in
  `docs/adr/README.md`. Cite decisions by ID (`ADR ARC-4`).
- `src/architecture.spec.ts` runs executable layout rules (archunit graph +
  raw-source scans) in the normal test suite. **Rules are regression locks:
  fix the code, never relax a rule to make CI pass.**
- Domain purity is path-based: every `**/domain/` folder imports only relative
  modules and only other domain files — no diagram-js, no DOM, no packages.
  Framework access goes through ports defined in `domain/`, implemented outside.
- Flat DDD feature layout (ADR ARC-1): `modeler/ story/ iconSet/
labelDictionary/ shared/`, each feature with up to three layers (`domain/`,
  `service/`, `infrastructure/`).
- Multi-instance safety: no module-level mutable state (ADR ARC-5, rule H).
  State lives on didi-instantiated services.

## Domain code: test-first, mutation-gated

Use the `domain-tdd` skill (`.agents/skills/domain-tdd/`) for any change
under `**/domain/**`.

- **Test-first.** Write the failing spec before the code. A bug fix starts
  with its regression test.
- **Domain objects own invariants and return decisions** (ADR ARC-7).
  Infrastructure applies those decisions through diagram-js commands, so
  undo stays with diagram-js.
- **Mutation gate per file** (ADR TST-4; tooling arrives with #175).
    - A new domain file needs a 100% Stryker score.
    - An existing file must not fall below its floor in
      `mutation-baseline.json`, and floors only go up.
    - Remove equivalent mutants by simplifying the code first. Otherwise mark
      them `// Stryker disable next-line <Mutator>: <reason>`.
- **Mutation testing covers only domain code.** Service and infrastructure
  code get normal unit or browser tests.

## Delivery: trunk-based (ADR ENG-4)

- Use short-lived branches and small PRs, merged within about two days. There
  are no long-lived feature branches.
- Hide unfinished work in this order:
    1. inert code (unwired domain objects);
    2. branch by abstraction;
    3. an internal feature flag, only for a user-visible change that cannot land
       in one PR.
- Bug fixes never go behind a flag.
- Flags are instance-scoped and default off.
    - They are never in `domain/`, `EgonClientConfig`, or `src/index.ts`.
    - The service or infrastructure caller chooses between two domain
      implementations.
    - Every flag has a removal issue.

## Upstream sync

This repo mirrors bug fixes from `WPS/egon.io`. The synced-through baseline,
the upstream→local path mapping, and the round process live in `SYNC.md`.
Keep it truthful: a PR that renames, moves, or restructures modules must
update the mapping table in the same PR; bump the recorded baseline after
each sync round. Where names are arbitrary, match upstream naming so sync
diffs stay reviewable.

## Conventions

- Tests are colocated in `__tests__/` folders next to their subjects.
- PR titles must be conventional-commit style — `feat|fix|refactor|docs|chore`
  (enforced by CI); commits follow the same pattern.
- License is GPL-3.0-or-later — only compatible code may be ported in.

## Gotchas

- `yarn tsc` uses TypeScript 7 via `@typescript/native`; the `typescript`
  alias supplies the TypeScript 6 JavaScript API for linting and declarations.
  Shared configs use ESNext modules with Bundler resolution.
- `sideEffects` in package.json only lists styles — keep runtime modules free
  of import-time side effects or bundlers will tree-shake incorrectly.
