---
name: adr
description: Record architecture decisions as Architecture Decision Records (ADRs). Use whenever a decision with lasting consequences is being made or implemented — adding or swapping a dependency, framework, or technology, changing module layout or public API surface, adopting a protocol, license, platform, or toolchain, introducing infrastructure like caches, queues, or databases — even when the user only asks for the implementation and never mentions documentation. Also use when the user asks to document a decision, set up ADRs or a decision log, or asks why a past architectural choice was made.
---

# Recording Architecture Decisions

## Why this skill exists

Decisions rot faster than code. The code shows _what_ was chosen; six months
later nobody remembers _why_, and teams re-litigate settled questions or
silently undo deliberate trade-offs. An ADR written at decision time — while
the alternatives and constraints are still fresh — is the cheapest insurance
against that. Your job when this skill triggers: make sure the decision leaves
a record, without turning documentation into a tax.

The failure mode this skill guards against is not "bad ADRs" — it is _no_
ADR, because the task was phrased as "add X" rather than "decide X" and
nobody noticed a decision was being made.

## Does this decision need an ADR?

Write one when the decision is something a competent new contributor would
look at and ask _"why is it like this?"_:

- It constrains future work (module layout rules, public API surface,
  supported platforms or versions).
- It is costly to reverse (database, framework, protocol, license).
- It embodies a trade-off that is invisible in the code (chose X _despite_ Y).
- It introduces or removes a dependency, service, or piece of infrastructure.

Do **not** write one for routine work: bug fixes, refactors that keep
boundaries intact, naming, formatting, dependency bumps without behavioral
consequences. A repo where every third commit carries an ADR trains readers
to ignore the log entirely — selectivity is what keeps it trustworthy.

If you are mid-task and realize the work embodies a significant decision the
user never asked you to document, write the ADR as part of the same change
and point it out in your summary. That is the entire point of this skill:
the record must not depend on someone remembering to ask for it.

## Follow the house convention first

Before writing anything, look for an existing decision log: `docs/adr/`,
`docs/decisions/`, `adr/`, `doc/adr/`, or files matching `ADR-*`/`NNNN-*.md`
anywhere under docs. If one exists, read one or two entries and match them
exactly — heading style, numbering scheme, file naming, status vocabulary,
index file — and continue their sequence. A decision log in two formats is
worse than either format alone, so the house convention always beats the
template below.

Only when no log exists, bootstrap `docs/adr/` using the default format. When
bootstrapping, make ADR 0001 the meta-decision ("record architecture
decisions": the format and the rules of the game), so the practice itself is
documented, and link the directory once from the project README so it gets
found. Backfilling two or three foundational decisions that are still fresh
(license, extraction, core layout) is worthwhile at bootstrap time — but
don't attempt archaeology beyond that; a fabricated rationale is worse than
an honest gap.

## Default format

One file per decision: `docs/adr/NNNN-short-kebab-title.md`, numbered
sequentially from 0001.

```markdown
# NNNN — <The decision, stated as a decision — "Use PostgreSQL", not "Database">

- Status: accepted | proposed | superseded by [NNNN](NNNN-title.md)
- Date: YYYY-MM-DD

## Context

The situation that forces a choice, as neutral facts: constraints, forces,
what breaks or hurts if nothing is decided. No advocacy here.

## Decision

What was decided, in one or two paragraphs.

## Alternatives considered

Optional — include only when there was a real contest. One short block per
serious alternative: what it was and the one reason it lost. This section is
what stops the next reader from proposing the alternative all over again.

## Consequences

What follows from the decision — good _and_ bad. Name the accepted trade-offs
explicitly ("this limits adoption in proprietary products — known and
accepted"), because the uncomfortable consequence is exactly the part the
next reader needs.
```

Rules that keep the log trustworthy:

- **One ADR per decision.** If a change embodies two decisions, write two.
- **Written when decided, not later.** The bootstrap backfill above is the
  one exception.
- **Accepted ADRs are immutable.** A change of direction gets a _new_ ADR
  that sets the old one's status to `superseded by NNNN`. Editing history
  destroys the log's value as a record.
- **Maintain the index.** If the log has a README/index, add a row for every
  new ADR. If bootstrapping, create one (a small table: number, decision,
  status).

## Writing the content

Keep an ADR to roughly a page. It is a record for a future reader, not a
design document: compress to what someone would need in order to _not_
re-litigate the decision. If a rule from the ADR is mechanically enforceable
(layout rules, dependency bans), say in the ADR where the enforcement lives
(lint rule, architecture test), and reference the ADR from that enforcement —
the pairing keeps both honest.

When you made the decision on the user's behalf during a task, say so in the
ADR review summary and flag rationale you _inferred_ rather than were told —
the user must be able to correct the "why" before it hardens into the record.

## When the user asks "why is X like this?"

Check the decision log before doing git archaeology — that is what it is for.
If the answer is there, cite the ADR. If it isn't and you reconstruct the
answer from history, offer to capture it as a (dated, clearly retrospective)
ADR so the next person doesn't repeat the dig.
