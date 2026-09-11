# 0028 — Validate shared journeys through an isolated package consumer

- Status: accepted
- Date: 2026-09-11

## Context

ADR 0021 added four useful public-consumer journeys, but the demo imported the
source barrel and both source and dependency stylesheets directly. Those
exceptions could hide missing package files, broken exports, invalid CSS asset
URLs, undeclared runtime dependencies, and incomplete `egon-core/style.css`.
A source-based Vite build therefore did not prove that an archive installed by
a host produced the editor exercised by Playwright.

Release source archives add another seam: the generated package must be built
from the exact archived commit rather than from the workflow checkout or a
separately published asset.

## Decision

The demo imports runtime values and types from `egon-core` and editor styles
only from `egon-core/style.css`. Exact Vite aliases and TypeScript paths resolve
those two public specifiers to the source entrypoint and stylesheet for local
development. ESLint rejects direct source imports, dependency stylesheet
imports, and other `egon-core` subpaths.

The public stylesheet includes diagram-js's base stylesheet before egon-core's
font, minimap, and mask rules. JavaScript dependencies remain externalized in
the library build; CSS and its assets form one host-facing stylesheet contract.

`test:package` either packs the checkout or accepts one `.tgz`. It stages only
the demo application in a unique temporary project outside the repository,
installs the archive with exactly pinned Vite and TypeScript, validates the
installed stylesheet's asset URLs, type-checks and production-builds the
consumer, and runs the same Playwright suite against that build on a distinct
portless route. No workspace link, source alias, or repository `node_modules`
fallback participates in consumer resolution. Failure artifacts live outside
the disposable consumer directory.

Published releases and manual selected refs resolve to a commit, download that
commit's GitHub source archive, install it immutably, pack it, and pass that
exact package archive to the same runner.

## Alternatives considered

- **Keep source imports and add CSS assertions** — rejected because behavior
  could pass while the package export, dependency graph, or archive contents
  remained unusable.
- **Maintain a second package-only demo or Playwright suite** — rejected because
  journey drift would weaken the comparison between source and installed modes.
- **Validate a release asset** — rejected because release publishing and asset
  upload remain out of scope; building the downloaded source archive tests the
  release commit with the repository's existing package lifecycle.

## Consequences

- The four journeys plus focused stylesheet and asset checks run in both source
  and isolated-package modes. The package mode costs an additional install and
  production build in normal CI.
- Hosts need only the public stylesheet, but they still must provide a sized
  canvas container.
- Package validation detects missing files, invalid embedded assets, escaping
  or absent relative assets, font failures, and browser asset-load errors.
- Chromium, Node 24, Yarn 4, and portless remain the acceptance environment.
- Public runtime APIs, types, exports, runtime dependencies, and the upstream
  path mapping do not change.
