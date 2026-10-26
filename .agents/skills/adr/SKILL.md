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

## This repository's convention: topic-based ADRs

egon-core keeps its decisions in topic files under `docs/adr/`, not in one
file per decision. `docs/adr/README.md` is the authority. Read it first,
because it lists the topics, the format, and the rules. In short:

- **Find the topic.** The topics are `foundations`, `architecture`,
  `public-api`, `documents`, `icons`, `editor-features`, `testing`,
  `engineering-practices`, and `release-and-distribution`. Put the decision in
  the topic it belongs to. Create a new topic only when nothing fits, and add
  it to the README table.
- **Use a stable ID.** Each decision is a `## <a id="arc-7"></a>ARC-7 — <the
decision, stated as a decision>` section. It takes the next free number in
  its topic. IDs are never reused or renumbered. Cite decisions by ID
  (`ADR ARC-7`) in code comments, tests, and docs.
- **Follow the format.** A `Status` line (`accepted` | `proposed`), a
  `History` line (dated entries with PR references), an optional
  `Enforced by` line, and then **Context**, **Decision**, optional **Rejected
  alternatives**, and **Consequences**.
- **Extend or change before you add.** If the new decision refines an
  existing one, edit that decision in place so it states what is in force now,
  and append a dated `History` entry. Do not leave superseded wording behind.
  Git history is the audit trail.
- **Retire decisions visibly.** When a decision no longer applies, remove it
  and add one line to the topic's `## Retired` section: the ID, what it was,
  and what replaced it.
- **Keep the index current.** Update the decision range for the topic in the
  `docs/adr/README.md` table.

The former numbered ADRs (0001–0042) live only in git history. The README maps
each one to its current decision ID.

## Writing the content

Keep a decision to roughly a page. It is a record for a future reader, not a
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
