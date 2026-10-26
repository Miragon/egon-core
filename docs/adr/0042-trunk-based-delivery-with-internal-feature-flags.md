# 0042 — Trunk-based delivery with internal feature flags outside the domain

- Status: accepted
- Date: 2026-10-26

## Context

Release Please (ADR 0029) cuts releases from `main`, so every merge reaches the
VS Code host and, later, the WPS web app with the next release. Epic #173
reworks the core across many weeks (ADR 0040). Long-lived branches would
conflict with each other and with upstream sync rounds (`SYNC.md`), and would
integrate late.

The public API is frozen to `EgonClient` and its types (ADR 0010), so any
option on `EgonClientConfig` is a public promise. Runtime state must be
instance-scoped (ADR 0012), and every editor session builds its own diagram-js
injector (ADR 0024).

## Decision

Work lands on `main` in small pull requests from short-lived branches, merged
within about two days, through the full CI gate. There are no long-lived
feature branches.

Unfinished work is hidden by the cheapest technique that works, in this order:

1. **Inert code.** A new domain object merges unwired. Nothing calls it, so
   no flag is needed.
2. **Branch by abstraction.** A behaviour-preserving move swaps the
   implementation behind the existing seam once characterization tests pass.
   No flag is needed.
3. **Internal feature flag.** Used only for a user-visible behaviour change
   that cannot land in one small PR.

Bug fixes land directly with their regression test and are never placed
behind a flag.

Feature flags follow these rules:

- **One typed registry.** All flags are defined in one typed registry, every
  flag defaults to `false`, and the registry lives outside every `domain/`
  folder.
- **Instance-scoped.** The registry is a value in the client's injector, like
  `config.textRenderer`, and it reaches every editor session.
- **Read outside the domain.** Only service and infrastructure code read
  flags. The domain never sees one: the adapter or service chooses between two
  domain implementations, and each implementation has a single behaviour.
- **Not public API.** Flags are not part of `EgonClientConfig` or
  `src/index.ts`. Tests switch them on through the internal injection point.
  Exposing a flag to hosts is a public API change and needs its own ADR.
- **Tested in both states.** While a flag exists, the affected tests run with
  the flag off and on.
- **Removed on schedule.** Each flag is opened together with the issue that
  removes it. The flag and the old path are deleted once the flipped default
  has shipped in one release without regression.

Commit types follow the user-visible effect. Inert code, branch by
abstraction, and flag removal are `refactor:`. The PR that flips a default is
`feat:` or `fix:`, so the changelog describes the change once.

The registry is introduced with the first change that needs a flag (#207);
until then no flag code exists.

## Alternatives considered

- **Long-lived feature branches per phase.** Rejected because of late
  integration, merge conflicts with sibling work and with upstream syncs, and
  reviews too large to read.
- **Host-facing runtime flags in `EgonClientConfig`.** Rejected because each
  flag would be a semver promise on a frozen API, and hosts would see
  half-finished behaviour.
- **Build-time flags (Vite `define`).** Rejected because one published build
  serves all hosts, and both states could not run in one test run.
- **Flags inside domain code.** Rejected because Stryker mutates both branches
  and both must be killed (ADR 0041), and one of them is deleted later.
- **A third-party flag service.** Rejected because it adds a runtime
  dependency and network access to a host-independent library.

## Consequences

- Diffs stay small, `main` is always releasable, and sync rounds rebase onto
  current code.
- The existing architecture rules already enforce the key constraints. Domain
  purity keeps the registry out of `domain/`, and the public-surface freeze
  keeps it out of `src/index.ts`.
- While a flag lives, published packages contain an unreachable code path and
  the affected tests run twice.
- Flag debt is possible if removal slips. Only the removal issue and review
  guard against it; no tool does.
- Hosts cannot try a flagged change before its default flips. This is
  accepted.
