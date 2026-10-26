---
name: domain-tdd
description: >-
    Test-first workflow for egon-core domain code (any `src/**/domain/**`
    file). Write the failing spec first, implement, check the file's Stryker
    mutation score (100% for new files, never below the baseline floor for
    existing ones), and deliver in small trunk-based PRs, putting the wiring
    behind an internal feature flag only when user-visible behaviour changes.
    Use this skill whenever you create, change, fix, or extract anything in a
    `domain/` folder. That includes moving notation policy or geometry out of
    adapters, command interceptors, or renderers into domain objects (epic
    #173 Phase 3: ElementType, ActivitySequence, GroupTree, IconCatalog,
    StoryGraph, label projection), fixing a modelingRules or activityNumbering
    bug, killing surviving mutants, running `yarn test:mutation`, adding or
    removing a feature flag, or splitting domain work into PRs. Use it even
    when the request only says "fix this rule". Not for changes confined to
    service or infrastructure code.
---

# Domain TDD with mutation testing and trunk-based delivery

The domain folders import nothing but other domain files; `architecture.spec.ts`
enforces this. That makes them cheap to test exhaustively, so the bar is high
there and nowhere else. This skill applies only to domain code. Service and
infrastructure code get ordinary unit or browser tests (ADR TST-1, ADR TST-2).

Decisions behind this workflow:

| ADR                                                       | Decision                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ARC-7](../../../docs/adr/architecture.md#arc-7)          | Domain objects own invariants and return decisions; diagram-js stays the system of record. |
| [TST-4](../../../docs/adr/testing.md#tst-4)               | Per-file mutation gate and the rules for annotating equivalent mutants.                    |
| [ENG-4](../../../docs/adr/engineering-practices.md#eng-4) | Trunk-based delivery; feature flags only outside the domain.                               |
| [ARC-3](../../../docs/adr/architecture.md#arc-3)          | Which conditionals belong in the domain at all.                                            |

## Tooling status

The gate arrives with #175 and the flag registry with #207. Check that
`yarn test:mutation` exists in `package.json` before relying on it.

If it is missing, do the test-first loop anyway and tell the user that no
mutation score could be measured. Never report a score you did not run.

## 1. Classify the change first

The class decides how the work is delivered, and whether a flag is involved at
all.

| Change                                                        | Delivery                                                                                                | Flag? |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| New domain object, not yet called                             | Merge it unwired (inert code).                                                                          | No    |
| Moving logic out of an adapter or interceptor, same behaviour | Branch by abstraction: write characterization tests, then swap the call site.                           | No    |
| Bug in domain logic                                           | Write the regression test first, then fix it directly.                                                  | Never |
| User-visible behaviour change too big for one small PR        | Wire the new path behind an internal flag.                                                              | Yes   |
| Only service or infrastructure code                           | Outside this skill. If the logic is pure policy or geometry, move it into the domain first (ADR ARC-3). | —     |

Most Phase 3 work is extraction or new objects, and needs no flag. When you
reach for one, say why the change cannot land atomically.

## 2. Shape of a domain object (ADR ARC-7)

- **Own an invariant.** If nothing needs protecting, a pure function is fine;
  don't wrap functions in classes for style.
- **Return a decision.** That is the set of changes a command should apply. The
  infrastructure command handler applies it through diagram-js so undo keeps
  working. The domain never mutates elements.
- **Take snapshots as input.** Use plain records built by infrastructure, not
  `businessObject` bags, `host`, `attachers`, or anything typed `any`.
- **Have one behaviour.** Never pass a feature flag or a "legacy mode" boolean
  into a domain object. When old and new behaviour must coexist, write two
  implementations and let the caller choose (see
  `references/feature-flags.md`).
- **Keep upstream names.** When logic leaves an upstream-mapped file, keep
  upstream's names and update `SYNC.md` in the same PR.

## 3. The loop

1. **Red.** Write the spec first, in `__tests__/` next to the subject. Name the
   tests in domain language ("an activity from a group is denied"), not in
   implementation terms. Run only that spec, for example:

    ```bash
    yarn test src/story/domain/__tests__/ActivitySequence.spec.ts
    ```

    Check that it fails for the reason you intended. An import error is not a
    red test.

2. **Green.** Write the least code that passes. Code without a test asking for
   it becomes a surviving mutant later.
3. **Refactor**, with the tests green.
4. **Mutate the file**, after green or refactor, never after red:

    ```bash
    yarn test:mutation --mutate src/story/domain/ActivitySequence.ts
    ```

    Runs are incremental locally, typically 20–40 s. Survivors are listed in
    the clear-text output and in `reports/mutation/mutation.html`.

5. **Triage every survivor** with `references/mutant-triage.md`. Either add the
   assertion it reveals, or simplify the code so the mutant disappears.
   Annotate only as a last resort.
6. Repeat until the file reaches **100%** (new file) or **at least its floor**
   in `mutation-baseline.json` (existing file).
7. **Run the gate** over the full domain set:

    ```bash
    yarn test:mutation
    yarn test:mutation:gate
    ```

    If a score went up, run `yarn test:mutation:gate --update` and commit the
    raised floor. Floors only go up; lowering one needs an ADR.

### Writing specs that kill mutants

- **Assert exact values.** Use `toEqual(...)` and `toBe(3)`. `toBeTruthy()` and
  `toBeDefined()` let most mutants survive.
- **Test boundaries on both sides.** Cover n − 1, n and n + 1 for every
  comparison, and the empty, one and many cases for collections.
- **Cover rule matrices completely.** Write source × target × verdict tables
  with `it.each`. Partial matrices are how #181 survived 99% coverage.
- **Test through the object's public API.** Don't export helpers only to test
  them; an unreachable branch is dead code, so delete it.
- **No mocks in domain specs.** If you need one, a dependency is in the wrong
  layer; it belongs behind a port.

## 4. Slicing into trunk-based PRs (ADR ENG-4)

Each PR stays small, merges within about two days, and passes the full CI gate
on its own.

1. `refactor:` adds the domain object and its specs at 100%, not wired in.
2. `refactor:` wires it in.
    - If behaviour stays the same, the characterization and browser tests prove
      that.
    - If behaviour changes, put the new path behind a flag, default off, with
      tests in both states.
3. `feat:` or `fix:` turns the flag on by default. This is the one changelog
   entry users see.
4. `refactor:` deletes the flag, the old path, and the tests for both states.
   Do this once the flipped default has shipped in one release.

A bug fix is one `fix:` PR: the regression test and the fix together.

## 5. Done checklist

- [ ] The spec was written first and failed for the intended reason.
- [ ] The file scores 100% (new) or at least its floor, which you raised if
      the score went up.
- [ ] Every `// Stryker disable next-line <Mutator>: <reason>` names a mutator
      and gives a reason. There are no block, file, or `all` disables.
- [ ] The domain contains no flag, framework type, or `any`-typed snapshot
      field.
- [ ] `yarn test`, `yarn typecheck` and `yarn lint` pass. When wiring changed,
      `yarn test:browser` passes too.
- [ ] `SYNC.md` is updated if logic left an upstream-mapped file.
- [ ] A lasting design decision got an ADR (`docs/adr/`).
