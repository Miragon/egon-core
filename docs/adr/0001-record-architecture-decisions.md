# 0001 — Record architecture decisions

- Status: accepted
- Date: 2026-07-20

## Context

egon-core was extracted from egon.io into a standalone library at a moment
when many structural decisions (scope, license, tooling, module layout) were
made in quick succession. Without a record, future contributors — and future
us — have to reverse-engineer the reasoning from git history, or worse,
re-litigate decisions that were already settled.

## Decision

We record architecturally significant decisions as Architecture Decision
Records in `docs/adr/`, using this lightweight format (status, date, context,
decision, consequences). Files are numbered sequentially
(`NNNN-short-title.md`).

Rules of the game:

- One ADR per decision someone might reasonably re-litigate. Routine choices
  do not get an ADR.
- An ADR is written when the decision is made, not long after.
- Accepted ADRs are never edited into a different decision. A change of
  direction gets a new ADR that marks the old one as `superseded by NNNN`.

## Consequences

- The "why" behind structural choices survives team and agent turnover.
- Small ongoing writing cost per significant decision.
- Stale decisions are visible as such (status field) instead of silently
  lingering.
