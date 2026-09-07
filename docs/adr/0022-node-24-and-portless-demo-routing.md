# 0022 — Use Node 24 and portless for demo routing

- Status: accepted
- Date: 2026-09-06

## Context

A fixed Vite port collides when several linked worktrees run at once, while a
random port is awkward for people and browser automation. Portless provides
stable named `.localhost` routes and automatically prefixes linked worktrees,
but the selected portless 0.15.6 release requires Node 24. Local development
and CI must select the same runtime or startup failures will be environment
dependent.

The default portless HTTPS listener also requires local certificate setup and a
privileged port. Neither is useful for a loopback-only demo or unattended CI.
A launcher must not stop the daemon after a run because the proxy can be shared
by other worktrees and applications.

## Decision

Pin Node 24 in `.nvmrc` and make the shared CI setup read that file. Pin
portless 0.15.6 and run the demo through loopback HTTP on proxy port 1355 by
default, with `PORTLESS_PORT` as the caller override, `.localhost` routing, LAN
mode off, and hosts-file synchronization disabled.

Keep egon-core's proxy state in a shared temporary directory (overridable with
`PORTLESS_STATE_DIR`). This lets portless auto-start the configured proxy while
coexisting with an unrelated default portless proxy instead of discovering and
trying to reconfigure it.

Use distinct `egon-core-demo` and `egon-core-e2e` base names. Portless adds the
worktree prefix. A shared launcher checks the active Node major, forwards
shutdown signals to the routed child process, and leaves the shared proxy
running. Vite emits `EGON_DEMO_READY <PORTLESS_URL>` only after its HTTP server
listens; Playwright captures that dynamic URL from stdout and provides it via
the `baseURL` fixture.

## Alternatives considered

- **Fixed Vite ports** — rejected because parallel worktrees contend for the
  same port or require manual coordination.
- **Random ports without named routing** — rejected because URLs become
  disposable output and the e2e runner needs a separate port-discovery path.
- **Default portless HTTPS** — rejected for this harness because certificate
  trust and privileged-port setup add friction without improving loopback test
  coverage.
- **Change the contributor's nvm default** — rejected; `.nvmrc` selects Node for
  this repository only.

## Consequences

- Contributors run `nvm install` and `nvm use` before installing dependencies;
  Node 22 and older receive an actionable startup error.
- Manual and automated demos can run simultaneously in the same worktree, and
  the same route names remain independent across linked worktrees.
- The portless proxy may remain alive after demo shutdown by design. Routes are
  removed when their child processes exit, while other proxy users continue.
