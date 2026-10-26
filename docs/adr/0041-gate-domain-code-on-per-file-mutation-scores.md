# 0041 — Gate domain code on per-file Stryker mutation scores

- Status: accepted
- Date: 2026-10-26

## Context

At `32075e3` the domain layers reached 99.1% statement coverage but an 85.1%
Stryker mutation score: 124 surviving mutants, of which 52 point at missing
assertions. Coverage cannot see a missing rule: the group-as-activity-source
bug (#181) sits in a domain function at 99% branch coverage.

Stryker's `thresholds.break` applies to the whole run only. A global threshold
lets a new file at 60% pass behind the legacy average. Raising it to 100%
today would block every PR until the existing survivors are resolved.

Outside the domain, mutation testing is not ready to gate. The service layer
scores 69.4% in the unit tier, with 166 mutants that no unit test reaches. The
browser tier costs about one second per mutant per worker.

## Decision

Adopt Stryker (`@stryker-mutator/core`, `vitest-runner`, and
`typescript-checker`, exactly pinned per ADR 0004) as the quality gate for
`src/**/domain/**` only.

- **Runner setup.** Stryker uses its own Vitest config containing only the
  unit project, with `perTest` coverage analysis, the TypeScript checker, and
  `ignoreStatic: false`. `src/architecture.spec.ts` is excluded because it
  scans raw sources.
- **Per-file gate.** A script reads Stryker's JSON report and checks every
  domain file against `mutation-baseline.json`. The score is
  `(killed + timeout) / (killed + timeout + survived + no coverage)`; ignored
  and compile-error mutants do not count.
    - A file missing from the baseline (a new file) must score 100%.
    - A listed file must not fall below its floor.
    - Stale entries fail the gate.
    - The global `break` threshold remains as a backstop.
- **Ratchet.** Floors only move up. A PR that raises a file's score raises its
  floor in the same PR. Lowering a floor requires an ADR. A moved file keeps
  its floor only through a visible baseline edit.
- **Equivalent mutants.** First remove them by simplifying the code: delete
  redundant guards and use exact comparisons. Otherwise annotate with
  `// Stryker disable next-line <Mutator>[,<Mutator>]: <reason>`. Block-wide,
  file-wide, and `all` disables are not allowed in domain code. A raw-source
  rule in `src/architecture.spec.ts` enforces this.
- **Test-first.** A domain change starts with a failing spec: a new object
  with its specification, a bug with its regression test. No tool can prove
  test-first; surviving mutants are the evidence that code was written ahead
  of its tests.
- **Where it runs.** Locally, use incremental runs for the TDD loop. In CI,
  every PR gets a full, non-incremental domain run plus the gate, as a job
  under the `ci` aggregate. Incremental mode cannot see changes to unmutated
  files that domain specs import, or to dependencies.

Setup details and the rollout are tracked in #175.

## Alternatives considered

- **Coverage thresholds only.** Rejected because they measure execution, not
  assertions. The domain already has 99% coverage and still contained #181.
- **A global `break` threshold only.** Rejected because new files can hide
  behind the average, and the threshold cannot express "new code at 100%".
- **Mutate service and infrastructure on every PR.** Rejected for now. Most of
  it is reachable only from the browser tier, which costs too much per mutant;
  a weekly, non-gating run may follow.
- **Incremental runs in CI.** Rejected because the gate could go stale
  silently, as described above.

## Consequences

- Assertion strength is measured where logic is pure and tests are cheap.
  This rewards moving policy into the domain (ADR 0020, ADR 0040).
- The opposite pressure is real: keeping logic out of `domain/` avoids the
  gate. Review applies ADR 0020's classification to counter it.
- Domain code reachable only through browser tests scores as "no coverage"
  and needs unit specs. This is intended.
- CI gains a job of several minutes (about 3 minutes locally at `32075e3`) and
  three pinned dev dependencies.
- Annotated equivalent mutants add comments to production code, each with a
  reviewed reason.
