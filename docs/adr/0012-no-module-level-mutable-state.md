# 0012 — Mutable state lives on didi-instantiated classes; module scope stays pure

- Status: accepted
- Date: 2026-07-23

## Context

The library must support several `EgonClient` instances on one page — multiple
VS Code webview editors, Angular route reuse, side-by-side diffs. Each diagram
already gets its own didi injector, so DI-registered services are isolated per
instance. But four pieces of mutable state lived at **module scope**, in the JS
module realm shared by every instance (issue #12):

- `IconDictionaryService` — the custom-icon pool (`const customIcons`)
- `DomainStoryIdFactory` — the id-uniqueness list (`const idList`)
- `DomainStoryRenderer` — the SVG-marker id counter (`const RENDERER_IDS`)
- `DomainStoryLabelEditingProvider` — the activity-number stash (`let numberStash`
  / `let stashUse`, exposed as free functions the renderer imported)

Two clients therefore cross-contaminated: both drew from one custom-icon pool,
one id list, one number stash. This is a latent bug even single-instance — test
suites already worked around the shared icon pool by keeping icon names distinct
per test. Everything else at module scope was already immutable (string consts,
frozen config literals, pure functions, didi module descriptors).

## Decision

Mutable state lives on didi-instantiated classes, so each injector owns its own
copy. Module scope is reserved for pure functions and frozen config. The four
offenders moved onto instances:

- `customIcons` and `idList` became `private readonly` instance fields.
- `RENDERER_IDS` became a per-instance `new Ids().next()`; the `ids` package
  draws random ids, so per-instance stays unique across diagrams.
- The number stash became a new passive didi service,
  `DomainStoryNumberStash` (`number-stash/`), injected into both the labeling
  provider (writer) and the renderer (reader). didi dedupes the module across
  dependents, so both share one stash per injector — the hand-off they rely on.
  The renderer no longer imports the labeling provider at all.

Upstream WPS/egon.io carries this stash as module-level free functions
(`getNumberStash` / `toggleStashUse`). Converting that state into an injected
service — rather than keeping it as module globals — is the general rule for
ported upstream state. `DomainStoryNumberStash.toggleStashUse` is kept (though
vestigial even upstream) so sync diffs stay reviewable.

The invariant is enforced by **rule H** in `src/architecture.spec.ts`: a raw
line scan that bans column-0 `let`/`var`, `const X = new …`, and
`const X = []` in non-test source. It carries an empty allowlist for future,
deliberately reviewed exceptions.

## Alternatives considered

- **Keep module state, reset it between instances** — rejected: there is no
  reliable teardown hook to clear it, and shared mutable state is a bug even
  with one instance (the test-pollution workaround proves it).
- **Enforce with an ESLint rule** (`no-restricted-syntax`) instead of an
  architecture test — rejected: the repo concentrates structural invariants in
  `architecture.spec.ts` (rules A–G); a second mechanism would fragment
  enforcement and its rationale.

## Consequences

- Two `EgonClient` instances no longer cross-contaminate; each injector owns its
  icon pool, id list, number stash, and renderer id. Covered by
  `MultiInstanceIsolation.spec.ts`.
- A full two-client boot/render regression test is infeasible under jsdom
  (rendering needs `getBBox`, which jsdom's SVG lacks), so the regression is
  proven at the didi-injector level. Once state is injector-owned, non-leakage
  is structural — rule H locks it in.
- Rule H is a regression lock: a new module-level mutable binding breaks CI.
  Per the repo's architecture-test policy, fix the code — never relax the rule.
- Accepted limitation: rule H is pattern-based, so it catches the realistic
  offenders (`let`, `new`, empty-array accumulator) but not every conceivable
  form (e.g. `const o = {}` mutated later). The patterns can be extended if a
  new shape appears; they are not a complete proof of purity.
