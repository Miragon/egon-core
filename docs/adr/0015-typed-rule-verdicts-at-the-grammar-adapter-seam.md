# 0015 — Typed rule verdicts at the grammar↔adapter seam

- Status: accepted
- Date: 2026-07-26

## Context

The Domain Storytelling grammar lives in `src/story/domain/modelingRules.ts`
(pure, framework-free); `src/modeler/infrastructure/rules/DomainStoryRules.ts`
is the diagram-js `RuleProvider` that wires it into the modeler. The seam between
them was untyped in **both** directions:

- the grammar spoke three ad-hoc dialects — `boolean` (`canResize`, `canCreate`,
  `isForbiddenAnnotationEdge`), `false | { type }` (`canConnect`), and
  `null | false` (`canStartConnection`);
- the adapter returned whatever it liked into diagram-js' rule protocol, with no
  compiler check that its answer matched what the grammar had said. It also
  invented framework tri-states of its own (a private `canCreate` that turned "no
  hover target" into `undefined`).

diagram-js distinguishes **four** rule return values (verified against
diagram-js 15.22 — `lib/features/rules/Rules.js`, `lib/command/CommandStack.js`,
`lib/features/global-connect/GlobalConnect.js:51`,
`lib/features/connect/ConnectPreview.js:61`):

| rule returns        | `Rules.allowed` yields | meaning                                               |
| ------------------- | ---------------------- | ----------------------------------------------------- |
| `true` / `{ type }` | itself                 | allowed (the object doubles as connection attributes) |
| `false`             | `false`                | denied                                                |
| `undefined`         | `true`                 | defer to lower-priority providers; **default-allow**  |
| `null`              | `null`                 | ignore — consumers skip marking entirely              |

The `undefined` row is a trap, and issue
[#66](https://github.com/Miragon/egon-core/issues/66) is what falling into it
looks like: the grammar correctly said "this activity↔annotation edge is
forbidden", the `connection.reconnect` adapter returned `undefined`, and
`Rules.allowed` read that as "nobody objected" — so `BendpointMove` accepted an
edge the notation forbids. It was fixed by hand in #73. Nothing structurally
prevented the next one: any rule that forgot a `return` silently permitted its
action.

## Decision

Introduce a discriminated **verdict** type owned by the domain, and map it to
diagram-js at exactly one point.

`src/story/domain/ruleVerdict.ts` (pure domain) names outcomes, never wire
values:

```ts
export type RuleVerdict =
    | { readonly kind: "allowed"; readonly connectionType?: ElementTypes }
    | { readonly kind: "denied" }
    | { readonly kind: "noOpinion"; readonly reason: NoOpinionReason }
    | { readonly kind: "ignored"; readonly reason: IgnoredReason };

type NoOpinionReason = "noHoverTarget" | "noShapesSelected";
type IgnoredReason = "missingElement" | "labelOwnedByAnotherElement";
```

**Four kinds, not three.** `null` and `undefined` are not interchangeable:
`connection.start` returns `null` for a label or a missing element, and
`GlobalConnect` special-cases `null` to skip its OK/NOT_OK marker. Returning
`undefined` there would map to `true` and let a global-connect drag start from a
label. Folding the two into one kind would also force every reader to memorise a
reason→wire mapping table.

**The reason literals are the teeth.** An adapter can no longer defer "just
because" — deferring means naming a situation the grammar already recognises as
legitimate. Adding a new deferral is therefore a deliberate edit to a domain
type, visible in review.

The grammar functions are renamed `judge*` (`judgeConnection`, `judgeCreation`,
`judgeResize`, `judgeConnectionStart`, `judgeReconnect`): they no longer answer
yes/no, so `can*` would read as a lie. `isForbiddenAnnotationEdge` stays a
predicate (it is one, and a browser spec asserts it directly), with the new
`judgeReconnect` composing it with `judgeConnection` — a composition the adapter
used to hand-roll, and got wrong. `clampGroupBounds` is untouched: a computation,
not a verdict.

`src/modeler/infrastructure/rules/ruleVerdictAdapter.ts` is the single
translation point — an exhaustive `switch` over `kind` with **no `default`
arm** — and `DomainStoryRules.addVerdictRule(action[, priority], judge)` is the
only way a rule is registered. With the callback typed `=> RuleVerdict`, a bare
`return false` / `return undefined` inside a rule does not compile.

**The lock depends on `noImplicitReturns: true` (`tsconfig.json`).** Deleting a
`case` arm makes the function's end reachable, and TypeScript reports
_"Not all code paths return a value" (TS7030)_. Without that flag the error would
be suppressed, because `undefined` is assignable to `DiagramJsRuleResult`. A
`default` arm would suppress it too. Both are load-bearing absences.

No public-API change: `modelingRules` is not exported from `src/index.ts`, so the
frozen surface (architecture rule G) is untouched.

## Alternatives considered

- **Return raw diagram-js values from the domain** (let `judgeConnection` return
  `false | { type } | null | undefined` directly) — rejected: it puts framework
  wire semantics inside `story/domain/`, violating domain purity (rule C), and
  keeps the trap intact rather than removing it. `undefined` would still mean
  "allowed" at the far end.
- **An architecture-test scan** for rules that can return `undefined` — rejected:
  the invariant is a type relationship ("every rule answers with a verdict"),
  which the compiler checks precisely and a regex only approximates. It would
  also fail _after_ the fact, in the test suite, instead of at the call site.
- **Fold `null` and `undefined` into one `deferred` kind** and derive the wire
  value from the reason — rejected: it hides a semantic difference diagram-js
  genuinely acts on behind a lookup table nobody can see at the call site.
- **Three kinds plus a boolean flag** (`allowed/denied/ignored` + `soft`) —
  rejected for the same reason: a flag is a worse discriminant than a kind.

## Consequences

- An unhandled verdict kind, or a rule that answers with a raw diagram-js value,
  is a **compile error**. The #66 class of bug — a forgotten `return` collapsing
  to default-allow — is no longer expressible.
- Every deferral in the codebase is now named. `elements.move` defers with
  `noShapesSelected`/`noHoverTarget`; nothing else defers at all.
- One deliberate asymmetry is now explicit instead of accidental: a `noOpinion`
  collapses to **denied** under `elements.create` (min-dash `every` coerced the
  old `undefined` to falsy) while it stays a **deferral** under `elements.move`.
  That is pre-existing behaviour, documented at the fold rather than silently
  "fixed" — changing it is a separate, testable decision.
- **No runtime behaviour changed.** The acceptance criterion was that
  `rules/__tests__/DomainStoryRules.spec.ts` and
  `ActivityConnections.browser.spec.ts` stay green _unmodified_; both do.
- Accepted cost: two extra indirections (a verdict object per rule evaluation and
  one `switch`) on a path that runs on every drag frame. Negligible against the
  DOM work diagram-js does per frame.
- The `judge*` names have no upstream counterpart (the grammar extraction is
  local-only, see `SYNC.md`), so the rename costs nothing in sync reviewability.
