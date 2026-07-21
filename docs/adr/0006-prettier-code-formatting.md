# 0006 — Format code with Prettier, configured to the existing style

- Status: accepted
- Date: 2026-07-21

## Context

The repo had `eslint-config-prettier` installed (disabling ESLint's stylistic
rules in anticipation of a formatter) but no formatter actually wired up: no
config, no script, no CI gate. Style consistency rested on contributor
discipline, and the CI overhaul (format-check job) needed a formatter to
enforce. The codebase already had a de-facto style — 4-space indentation,
double quotes, semicolons, most lines under 80 characters — that any
formatter config would either codify or destroy.

## Decision

Adopt Prettier with an explicit `.prettierrc.json` that codifies the existing
style rather than imposing Prettier's defaults:

- `tabWidth: 4` — the one deviation from Prettier defaults; the codebase is
  uniformly 4-space indented.
- `printWidth: 80`, `semi: true`, `singleQuote: false`,
  `trailingComma: "all"` — Prettier defaults, spelled out so the choices are
  documented rather than implicit.

`yarn format` writes, `yarn format:check` verifies, and CI runs the check on
every PR (`format-check` job). Build output, lockfile, and `LICENSE` are
excluded via `.prettierignore`.

## Alternatives considered

- **Prettier defaults (`tabWidth: 2`)** — would have reindented essentially
  every source file, destroying `git blame` across the whole repo to enforce
  a style nobody had chosen. Matching the existing style reduced the one-time
  reformat from ~116 files to 15.
- **ESLint stylistic rules instead of a formatter** — ESLint has deprecated
  its formatting rules, and `eslint-config-prettier` being present already
  signaled the Prettier direction.
- **No formatter** — leaves style to review comments; rejected as review
  noise that a machine handles better.

## Consequences

- `yarn format:check` is part of the CI verification story; unformatted code
  fails the PR.
- Contributors run `yarn format` (or use editor integration) before pushing;
  there is no pre-commit hook — CI is the backstop.
- Position-dependent suppressions can break when Prettier rewraps lines: a
  one-line `@ts-expect-error` in `IconDictionaryService` stopped covering its
  statement after wrapping and was replaced with a typed cast. Prefer typed
  fixes over line-position suppressions for the same reason.
- The config is a commitment: changing it later means another repo-wide
  reformat and `git blame` churn, so it should be treated as settled.
