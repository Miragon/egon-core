# 0037 — Test release configuration against the action and upgraded library

- Status: accepted
- Date: 2026-09-14

## Context

The dependency upgrade pins release-please 17.11.2, but the released GitHub
action pinned in our workflow bundles 17.6.0. Changing the test's expected
version alone would stop verifying the implementation that creates releases.
The migration request retains the dependency upgrades, and changing release
automation is outside its scope.

## Decision

Retain release-please 17.11.2 and add the development-only alias
`release-please-action-implementation` pinned to `npm:release-please@17.6.0`.
Run the same release configuration and version calculation tests against both
implementations. Keep the exact-version assertion for the action alias and
keep the workflow action SHA unchanged.

When the action pin changes, update the alias and expected action version from
the new action commit's lockfile. This supplements ADR 0029's validation.
The alias is a migration choice inferred from the user's request to retain
upgrades while preserving the existing release regression checks.

## Alternatives considered

- Revert release-please to the action version — simpler, but would discard a
  requested bump.
- Change the expected version without testing the action implementation —
  would remove the existing guarantee.

## Consequences

- Release behavior is checked against both the installed upgrade and actual CI
  implementation without changing release automation.
- The development dependency tree temporarily includes two Release Please
  versions. Remove the alias when the workflow and direct dependency align.
