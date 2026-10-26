# Architecture decisions

The decisions that shape egon-core, grouped by topic. Each topic file holds
the decisions **currently in force** for its area. Read the relevant topic
before making a structural change.

| Topic                                                   | Covers                                                   | Decisions     |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| [Foundations](foundations.md)                           | Scope, license, relationship to upstream egon.io         | FND-1 – FND-3 |
| [Architecture](architecture.md)                         | Code layout, dependency rules, runtime invariants        | ARC-1 – ARC-6 |
| [Public API](public-api.md)                             | The `EgonClient` contract: surface, events, side effects | API-1 – API-3 |
| [Story documents](documents.md)                         | EGN format, import, export, visual export                | DOC-1 – DOC-3 |
| [Icons](icons.md)                                       | Icon names, content safety, selection, artwork, starters | ICO-1 – ICO-5 |
| [Editor features](editor-features.md)                   | Alignment, color picking, label renames, replay          | EDT-1 – EDT-4 |
| [Testing](testing.md)                                   | Test tiers, coverage, installed-package journeys         | TST-1 – TST-3 |
| [Engineering practices](engineering-practices.md)       | Toolchain, formatting, Node and demo routing             | ENG-1 – ENG-3 |
| [Release and distribution](release-and-distribution.md) | Package contents, release process                        | REL-1 – REL-2 |

## How this log works

The log used to be one numbered file per decision. By 0039 it had become hard
to answer the question "what is in force?". Several ADRs only amended or
superseded others, and the current rule often had to be pieced together from
two or three files. Topic files state the current decision for each area in
one place.

### Decision IDs

Every decision has a stable ID: a topic prefix plus a number, such as `ARC-4`.
Code comments, tests, and other documents cite the ID (`ADR ARC-4`), never a
heading text or a line. Links use the explicit anchor
(`architecture.md#arc-4`). IDs are never reused or renumbered. A new decision
takes the next free number in its topic.

### Format

```markdown
## <a id="arc-4"></a>ARC-4 — Rendering is read-only

- Status: accepted
- History: 2026-07-27 decided (#74); 2026-11-02 <what changed and why> (#123)
- Enforced by: <architecture rule, test, or lint rule>, if any

**Context.** The forces at play, stated as neutral facts.

**Decision.** What is in force now.

**Rejected alternatives.** Optional. One entry per serious alternative and
the reason it lost. This is what stops the next reader from proposing it
again.

**Consequences.** Good and bad, with the accepted trade-offs named.
```

The status is `accepted` or `proposed`. State each heading as a decision, for
example "Rendering is read-only", not "Rendering".

### Rules

- **Record only decisions someone might re-litigate.** That means constraints
  on future work, choices that are costly to reverse, trade-offs that are
  invisible in the code, and new dependencies or infrastructure. Bug fixes,
  refactors within existing boundaries, and dependency bumps without
  behavioral consequences do not get an entry.
- **Write the decision in the same PR as the change**, in the topic it belongs
  to. Create a new topic only when a decision fits none of the existing ones,
  and add it to the table above.
- **Change decisions in place.** When the direction changes, rewrite the
  decision so it states what is in force now. Then append a dated `History`
  entry that says what changed and why. Do not keep superseded wording in the
  file.
- **Retire decisions visibly.** When a decision no longer applies, remove it
  from its topic and add a line to that topic's `## Retired` section (create
  the section if needed). The line gives the ID, what the decision was, and
  what replaced it.
- **Keep each decision to about a page.** It is a record for a reader who
  must not re-litigate it, not a design document.
- **Pair enforceable rules with their enforcement.** Name the architecture
  rule, test, or lint rule under `Enforced by`, and cite the decision ID where
  the rule is enforced.

The accepted trade-off: because decisions are edited in place, a topic file
is not an immutable record. Git history is the audit trail
(`git log -p docs/adr/<topic>.md`), and the `History` line points to the
changes that matter.

## Former numbered ADRs

Until 2026-10, decisions were recorded as numbered ADRs 0001–0039.
`CHANGELOG.md` and older commits still cite them. The original files remain in
git history. For example:
`git show 32075e3:docs/adr/0016-rendering-is-read-only.md`.

| Former ADR                                                   | Now                 |
| ------------------------------------------------------------ | ------------------- |
| 0001 Record architecture decisions                           | this README         |
| 0002 Standalone core extracted from egon.io                  | FND-1, FND-3        |
| 0003 GPL-3.0-or-later license                                | FND-2               |
| 0004 Standalone toolchain                                    | ENG-1, REL-1        |
| 0005 Module layout and architecture tests (superseded)       | ARC-1, ARC-2        |
| 0006 Prettier code formatting                                | ENG-2               |
| 0007 Adopt EGN v4 file format                                | DOC-1, DOC-2        |
| 0008 Verbatim icon names, CSS-only sanitization              | ICO-1               |
| 0009 Icon-set import replaces selection                      | ICO-3               |
| 0010 Flat DDD feature layout and frozen public API           | ARC-1, ARC-2, API-1 |
| 0011 Adopt align-to-origin                                   | EDT-1, API-3        |
| 0012 No module-level mutable state                           | ARC-5               |
| 0013 Two-tier test architecture                              | TST-1               |
| 0014 Canvas-driving specs are browser tier                   | TST-2               |
| 0015 Typed rule verdicts at the grammar↔adapter seam         | ARC-3               |
| 0016 Rendering is read-only                                  | ARC-4               |
| 0017 Expose import repair as a host event                    | DOC-2, API-2        |
| 0018 Idempotent event subscriptions                          | API-2               |
| 0019 Reject unknown public event names                       | API-2               |
| 0020 Infrastructure translates domain decisions              | ARC-3               |
| 0021 Public-consumer Playwright journeys (superseded)        | TST-3               |
| 0022 Node 24 and portless demo routing                       | ENG-3               |
| 0023 Sanitize imported SVG icons                             | ICO-2               |
| 0024 Stage document imports in editor sessions               | ARC-6, DOC-2        |
| 0025 Retain live icon assets on export                       | ICO-4, DOC-3        |
| 0026 Client-scoped color-picker requests (superseded)        | EDT-2               |
| 0027 Refresh shared icon artwork on add                      | ICO-4               |
| 0028 Isolated package consumer validation                    | TST-3, REL-1        |
| 0029 Release Please and GitHub package archives              | REL-2               |
| 0030 Export static SVG from a captured session               | DOC-3               |
| 0031 Rasterize PNG with cancellable host-neutral work        | DOC-3, API-3        |
| 0032 Batch label renames through one parent command          | EDT-3               |
| 0033 Expose retained icon configuration and explicit order   | ICO-3               |
| 0034 Headless replay with domain traversal                   | EDT-4               |
| 0035 TypeScript native compiler and compatible tooling API   | ENG-1               |
| 0036 Vitest 4 browser provider and coverage                  | TST-1               |
| 0037 Test release config against action and upgraded library | REL-2               |
| 0038 Bundled color picker and provider contract              | EDT-2, REL-1        |
| 0039 Publish optional starter icons                          | ICO-5, API-1        |
