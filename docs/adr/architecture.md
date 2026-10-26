# Architecture

How the code is laid out, which dependencies are allowed, and the runtime
invariants that every feature relies on.

## <a id="arc-1"></a>ARC-1 — Organize code as flat DDD features with three layers

- Status: accepted
- History: 2026-07-20 two-ring layout (ADR 0005); 2026-07-22 replaced by the
  flat feature layout (ADR 0010); 2026-10-26 features named as modules of one
  bounded context (ADR 0040)
- Enforced by: architecture rules B–F ([ARC-2](#arc-2))

**Context.** The extraction inherited two structures side by side:
diagram-js feature modules around a shared domain, and a hexagonal client
context. Code was organized by where it came from in the extraction rather
than by domain concept. Each concept (icons, labels, the story) was split
across three places, which also made upstream sync harder to reason about.

**Decision.** Features are top-level folders under `src/`. They are modules
of **one** bounded context, Domain Storytelling, not separate bounded
contexts:

- `modeler/`: the application and adapter layer for the canvas, and
  `EgonClient`.
- `story/`: the domain story, with its model, grammar, import, and export.
- `iconSet/`: the icon dictionary and icon-set import/export.
- `labelDictionary/`: activity and work-object labels.
- `shared/`: the shared kernel. It is not a feature.

Each feature has up to three layers:

- `domain/` is the framework-free core: model, policy, and ports. It imports
  only relative modules and only other domain files, so it uses no diagram-js,
  no DOM, and no packages. Framework access goes through ports defined here and
  implemented in infrastructure.
- `service/` holds use cases and didi services.
- `infrastructure/` holds diagram-js, DOM, and SVG adapters that implement
  domain ports.

Dependency rules:

- No import cycles anywhere in `src/`. Mutually recursive domain types share
  one file instead of being split into a cycle.
- No `service` file depends on `infrastructure`, except a feature's
  composition root. The allowlist is exactly `modeler/service/EgonClient.ts`
  (dynamic `import()` of the diagram-js adapters),
  `iconSet/service/index.ts`, and `story/service/importModule.ts`.
- `modeler/service` is also framework-free: the only framework reference it
  may make is didi types in the composition root. `story` and `labelDictionary`
  services are didi-registered diagram-js services by nature, so this stricter
  rule applies only to the modeler for now.
- A feature's public surface is its `domain/**` plus exactly its `service`
  barrel. Another feature's `infrastructure/` and concrete `service/<file>`
  are off-limits. Nothing inside `src/` imports `src/index.ts`.
- `shared/domain` (pure helpers) can be imported from anywhere.
  `shared/infrastructure`, `src/types`, and `src/assets` can be imported only
  from `infrastructure/` files.

**Rejected alternatives.**

- **Keep the two-ring layout:** it organizes code by extraction origin and
  scatters each concept.
- **One feature-root `index.ts` barrel as the only public surface:**
  re-exporting service and infrastructure creates a service→infrastructure
  edge. It also pulls didi modules and diagram-js into every importer, which
  defeats `EgonClient`'s lazy adapter loading. Domain files are safe to expose
  directly because domain purity is enforced.
- **Framework-free services in every feature:** deferred (see above).

**Consequences.**

- Everything about a concept lives under one feature folder, and upstream
  diffs map onto features (`SYNC.md`).
- To give domain code framework access you must add a port and wire it in a
  composition root. This friction is intentional.

## <a id="arc-2"></a>ARC-2 — Architecture rules are executable regression locks

- Status: accepted
- History: 2026-07-20 decided (ADR 0005); rules added with ADRs 0010 (E–G),
  0012 (H), 0016 (I), 0020 (J) and 0039 (G, icons entry)

**Context.** Rules kept by discipline alone were already eroding at the
extraction: a domain service imported diagram-js, and the domain entities had
import cycles. Rules that exist only in people's heads do not survive new
contributors, agents, or time.

**Decision.** `src/architecture.spec.ts` runs the rules as part of the normal
unit suite. Graph rules (cycles, folder dependencies) use archunit's import
graph. Raw-source scans cover what the graph cannot see: under this tsconfig,
external package imports and dynamic `import()` calls produce no edges. A
sanity rule fails loudly if the graph degrades to having no edges.

When a rule fails, fix the code, never the rule. Allowlists only shrink.
Widening a frozen list is a deliberate change to both the list and the
decision that owns it.

| Rule | Locks                                                          | Decision                     |
| ---- | -------------------------------------------------------------- | ---------------------------- |
| A    | the import graph is not empty (sanity check)                   | ARC-2                        |
| B    | no import cycles                                               | [ARC-1](#arc-1)              |
| C    | domain purity                                                  | [ARC-1](#arc-1)              |
| D    | the modeler service is framework-free                          | [ARC-1](#arc-1)              |
| E    | service → infrastructure only in composition roots             | [ARC-1](#arc-1)              |
| F    | sibling isolation                                              | [ARC-1](#arc-1)              |
| G    | frozen public surface: both entries, package `exports`/`files` | [API-1](public-api.md#api-1) |
| H    | no module-level mutable state                                  | [ARC-5](#arc-5)              |
| I    | renderers do not write to the model                            | [ARC-4](#arc-4)              |
| J    | infrastructure imports of element predicates only shrink       | [ARC-3](#arc-3)              |

**Rejected alternatives.**

- **ESLint rules (`no-restricted-syntax`) for structural invariants:** keeping
  invariants and their rationale in one place matters. A second mechanism
  would split enforcement.

**Consequences.**

- Boundary regressions break CI immediately instead of accumulating.
- The raw scans are syntactic. They catch the realistic patterns but are not
  complete: an aliased write slips past rule I, and some mutable shapes slip
  past rule H. They are ratchets, not proofs. Where proof matters, behavioral
  specs provide it.
- The scans skip `__tests__/` folders. Test helpers may legitimately import
  `EgonClient` and diagram-js.

## <a id="arc-3"></a>ARC-3 — Domain decides; infrastructure translates

- Status: accepted
- History: 2026-07-26 typed rule verdicts (ADR 0015); 2026-09-06 extended to
  all adapters with the predicate-import ratchet (ADR 0020); 2026-10-26
  extended to domain objects that own invariants ([ARC-7](#arc-7))
- Enforced by: the compiler (`noImplicitReturns`, an exhaustive `switch`);
  architecture rule J

**Context.** The grammar lives in `story/domain/modelingRules.ts`, and
`modeler/infrastructure/rules/DomainStoryRules.ts` wires it into diagram-js.
That seam was untyped, and diagram-js distinguishes four rule results:

- `true` or `{ type }`: allowed.
- `false`: denied.
- `undefined`: no opinion, which `Rules.allowed` reads as **allowed**.
- `null`: ignore.

Because of the `undefined` case, a forgotten `return` silently allowed an
action the notation forbids (#66). More broadly, infrastructure adapters
imported domain predicates and made notation policy themselves, and pure
geometry lived in infrastructure (#70).

**Decision.** A branch is classified by its effect. Notation policy and pure,
framework-free geometry belong in domain. Framework translation,
presentation, and type dispatch stay in infrastructure.

At the rules seam:

- The domain returns a `RuleVerdict` (`story/domain/ruleVerdict.ts`) with four
  kinds: `allowed` (with an optional connection type), `denied`, `noOpinion`,
  and `ignored`. Each deferral carries a named reason. The grammar functions
  are named `judge*` because they no longer answer yes or no.
- `modeler/infrastructure/rules/ruleVerdictAdapter.ts` is the only place that
  translates verdicts into diagram-js values. It is an exhaustive `switch` with
  no `default` arm. Rules can be registered only through
  `DomainStoryRules.addVerdictRule`, so a raw `return false` or
  `return undefined` does not compile.
- `noImplicitReturns: true` in `tsconfig.json` and the missing `default` arm
  are both load-bearing: together they turn a deleted case into error TS7030.

For all other adapters:

- Direct infrastructure imports of `story/domain/elementPredicates` are frozen
  in an allowlist that can only shrink. A stale entry also fails the rule. A
  new adapter gets a domain-facing decision API instead of a predicate
  import, even when it only needs legitimate type dispatch.
- `docs/infrastructure-decision-audit.md` classifies the remaining adapter
  branches and lists candidates for extraction.

**Rejected alternatives.**

- **Return raw diagram-js values from the domain:** this puts wire semantics
  in domain code and keeps the trap where `undefined` means allowed.
- **Fold `null` and `undefined` into one kind, or use three kinds plus a
  flag:** this hides a difference diagram-js acts on. `GlobalConnect` skips its
  marker on `null`, but `undefined` would let a global-connect drag start from
  a label.
- **An architecture-test scan for `undefined` returns:** the invariant is a
  type relationship. The compiler checks it precisely, at the call site.
- **Ban conditionals, or all predicate imports, in infrastructure:** adapters
  must branch on framework state and concrete types. A one-off ban would also
  bundle unrelated redesigns into a single change.

**Consequences.**

- A forgotten `return` can no longer default to "allowed". Every deferral is
  named, so adding one means a visible edit to a domain type.
- A `noOpinion` collapses to "denied" under `elements.create` but stays a
  deferral under `elements.move`. This behavior predates the decision and is
  now explicit where the result is folded. Changing it is a separate decision.
- Rule J limits only direct dependencies. It cannot prove that adapters are
  free of policy, so review and the audit are still needed.

## <a id="arc-4"></a>ARC-4 — Rendering is read-only; model writes are commands

- Status: accepted
- History: 2026-07-27 decided (ADR 0016)
- Enforced by: architecture rule I; `RendererModelPurity.browser.spec.ts`

**Context.** `DomainStoryRenderer` wrote to the model it painted. Some writes
were corrections (the activity overlap nudge, the default color). Others
assigned ownership (element type, activity numbers, annotation height, the
dirty flag). Each was a defect, for three reasons:

- A repaint is not a user action, so the write bypassed undo and
  transactions.
- Repaints run an unbounded number of times, so a correction that reads its
  own output accumulates. #65 measured 5 px of file corruption per open.
- Imported stories share business objects with the file, so drawing wrote
  directly into the next export.

**Decision.** Drawing is a read. No file under a `renderer/` folder may mutate
an element, its business object, or any service that records state. Every
model mutation belongs to one of three places, all visible to undo and review:

- a command handler or command interceptor
- an import repair
- the export projection

The renderer may read session-local presentation state, such as color
previews ([EDT-2](editor-features.md#edt-2)), but never writes it.

**Consequences.**

- Behavior that existed only because a repaint ran had to move somewhere
  explicit:
    - Activity numbering is a `CommandInterceptor` on `connection.create`,
      `connection.reconnect` and `activity.directionChange`.
    - Missing numbers in hand-made files are filled once, on import.
    - Any new path that changes an activity's source must also be added to
      numbering. `popup/__tests__/ActivityNumbering.browser.spec.ts` covers this.
- The dirty flag means "the undo stack is not empty", not "differs from the
  last save". That is coarser but honest. A host that needs a save marker
  needs a new API.
- A repaint that needs new artwork
  ([ICO-4](icons.md#ico-4)) fires `elements.changed` without a command. It is a
  read of unchanged business objects.
- Rule I is syntactic. The browser spec, which repaints and diffs every
  business object, is the proof.

## <a id="arc-5"></a>ARC-5 — Mutable state is per instance; module scope stays pure

- Status: accepted
- History: 2026-07-23 decided (ADR 0012)
- Enforced by: architecture rule H; `MultiInstanceIsolation.spec.ts`

**Context.** Several `EgonClient` instances must work on one page: multiple
VS Code webview editors, route reuse, side-by-side diffs. Each diagram gets its
own didi injector. Mutable state at module scope (the custom-icon pool, the id
list, the renderer's marker counter, a number stash) was shared by every
instance anyway, so clients contaminated each other (#12).

**Decision.**

- Mutable state lives on didi-instantiated classes, so each injector, and
  therefore each editor session ([ARC-6](#arc-6)), owns its own copy. Module
  scope holds only pure functions and frozen configuration.
- Upstream module-level state is ported as an injected service
  ([FND-3](foundations.md#fnd-3)).
- Instance-scoped work never queries the global document. Replay, for example,
  uses its session's registry and canvas, not document-wide selectors.
- Rule H bans column-0 `let`/`var`, `const x = new …`, and `const x = []` in
  non-test source. Its allowlist is empty, and any entry would be a reviewed
  exception.

**Rejected alternatives.**

- **Keep module state and reset it between instances:** there is no reliable
  teardown hook, and shared state is a bug even with one instance.

**Consequences.**

- Clients no longer contaminate each other. Isolation is proven at the
  injector level because a two-client render is not possible under jsdom.
- Rule H is pattern-based. It does not catch every shape, for example a
  `const o = {}` that is mutated later. Extend the patterns when a new shape
  appears.

## <a id="arc-6"></a>ARC-6 — Editor sessions are the lifecycle unit and are replaced atomically

- Status: accepted
- History: 2026-09-08 decided for imports (ADR 0024); 2026-09-11 reused for
  visual export, replay and color picking (ADRs 0026, 0030, 0031, 0034)

**Context.** A diagram-js injector owns its stateful modules, DOM, listeners,
command stack, icon registries, and renderers as one unit. The importer used
to clear the active diagram and rebuild it in place. Any exception after the
clear left a partial replacement and destroyed the original elements and the
undo history. Restoring an exported snapshot cannot bring back object
identity, undo/redo state, extension state, pending notifications, viewport,
or icon pool.

**Decision.** `EditorSessionOwner` (modeler infrastructure) owns the active
session. Work that replaces or renders a whole document first builds a
complete candidate session in a hidden, measurable container. The candidate
uses the same configuration, text renderer, and additional modules as the
active session. It has its own DOM, inactive icon stylesheet, and injector,
and a copy of the sanitized custom-icon pool.

Only after every step succeeds does a synchronous swap promote the candidate:

1. Subscriptions move to the new event bus.
2. Pending deliveries that no longer apply are cancelled.
3. Public notifications are published.
4. The previous session is destroyed.

A failure before the swap destroys only the candidate. Session-scoped work
(color-picker requests, replay, pending PNG exports) is invalidated by a
successful swap or by destruction. A failed import does not invalidate it.

**Rejected alternatives.**

- **Snapshot and restore the active editor:** a snapshot does not contain the
  undo history, object identity, extension state, or pending deliveries.
- **Validate first, then import into the active editor:** sanitizers, custom
  modules, renderers, and DOM operations can still throw after validation.
- **Make import asynchronous:** this changes the public contract, and
  construction and promotion are synchronous anyway.

**Consequences.**

- A failed import leaves the active editor and its subscriptions untouched.
- During import and visual export, the core briefly holds two complete
  sessions, roughly doubling peak memory and construction work. This is
  accepted in exchange for true atomicity.
- `additionalModules` are session-scoped and may be constructed for attempts
  that fail, so they must clean up on `diagram.destroy`. The core can roll
  back only effects the session owns. Extensions manage their own external
  effects.
- Errors in host observers or in cleanup of the old session happen after the
  swap. They are reported through browser error reporting (with a console
  fallback) and do not make a successful import look like a failure.

## <a id="arc-7"></a>ARC-7 — Domain objects own invariants and return decisions; diagram-js stays the system of record

- Status: accepted
- History: 2026-10-26 decided (ADR 0040)

**Context.** The domain layers were a functional core of interfaces and free
functions, and no domain object owned an invariant. The architecture review
for epic #173 found the cost of that:

- Activity numbering was spread over seven or more sites, and three
  infrastructure sites each restated "a step is an actor-sourced activity".
- Group nesting, cycle prevention, and adoption lived entirely in
  `DomainStoryUpdater`, a diagram-js `CommandInterceptor`.
- `CanvasObject` (`story/domain/canvasObject.ts`) mirrors diagram-js's element
  graph (`host: any`, `attachers: any`, `incoming`, `outgoing`). The
  import-based purity rule cannot detect framework leakage through a type's
  shape.
- `BusinessObject` serves as the wire DTO, the domain record, and the
  diagram-js attribute bag at once. This is the root of the #65/#74 class of
  bugs.

diagram-js owns element identity, mutation, and undo through its command
stack. Upstream sync depends on keeping upstream's file and method names
reviewable ([FND-3](foundations.md#fnd-3)).

**Decision.** Domain objects own invariants and return **decisions**: the
changes a command should make. Infrastructure command handlers and
interceptors apply those decisions through diagram-js, so identity, mutation,
and undo stay with diagram-js. This extends [ARC-3](#arc-3) from free
functions to objects that protect an invariant.

- **Inputs are domain snapshots**, not framework-shaped objects. A
  `StoryGraph` and persisted element records are built by infrastructure from
  the element registry, and they replace `CanvasObject` (#201).
- **A classic aggregate only where diagram-js does not own the state.**
  `IconCatalog` (#200) owns the icon pool. Everything element-shaped stays in
  the registry.
- **Planned objects:** `ElementType` (#196), `ActivitySequence` (#197),
  `GroupTree` (#198), the label-dictionary projection (#199), `IconCatalog`
  (#200), and `StoryGraph` (#201).
- **Classes only for invariants.** Pure functions that own no invariant stay
  functions.
- **Upstream names survive moves.** Logic moved out of an upstream-mapped file
  keeps upstream's names where they exist, and `SYNC.md` records where it went.
- **Test-first and mutation-gated.** Domain objects are written test-first and
  gated per file ([TST-4](testing.md#tst-4)). Unfinished objects land through
  trunk-based delivery without flags in the domain
  ([ENG-4](engineering-practices.md#eng-4)).

**Rejected alternatives.**

- **A `DomainStory` aggregate that owns elements alongside diagram-js:** every
  built-in diagram-js command would need two-way synchronization, undo would
  have to be reimplemented, and upstream sync would become far more expensive.
- **A domain event bus:** the command stack already is the event source. #203
  types the existing events instead.
- **Keep the functional core unchanged:** without an owner, invariants keep
  being restated at each call site. That is how the group-source (#181) and
  hidden-number (#182) bugs slipped through near-total line coverage.
- **Move ports into an `application/` folder:** a rename with no behavioral
  gain, which would churn imports and the sync mapping.

**Consequences.**

- Invariants become testable without a canvas, and the mutation gate applies
  to them.
- Adapters and interceptors shrink to translation. Adapter size is a progress
  measure alongside the mutation score.
- Snapshots must be built from the registry for each decision. Build them per
  command, not per render, to keep large diagrams responsive.
- There are two representations, snapshot and element, and their mapping
  lives in infrastructure. The mutation gate does not cover that mapping, so
  it needs its own browser-tier tests ([TST-2](testing.md#tst-2)).
- Upstream fixes may now land in different local files than before, and
  `SYNC.md` carries the extra mapping.
