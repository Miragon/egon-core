# 0036 — Configure Vitest 4 with its Playwright provider and explicit coverage inputs

- Status: accepted
- Date: 2026-09-14

## Context

Vitest 4 replaces the string browser provider used in ADR 0013 with a provider
factory from a dedicated package. It also stops including untested files in
coverage reports by default. Simply updating package versions would break the
browser tier and silently change the coverage gate's input set.

## Decision

Add exactly pinned `@vitest/browser-playwright`, at the same version as Vitest,
and configure the browser project with `playwright()`. Keep its headless
Chromium instances and the separate unit/browser projects. Retain the direct
`@vitest/browser` dependency used by existing browser context imports.

Explicitly include source TypeScript files in coverage, retaining the existing
exclusions and domain thresholds. Untested production files must continue to
count toward coverage. Update constructor mocks to use constructible functions
and CSS assertions to account for jsdom's standard CSS serialization.

## Consequences

- Browser tests continue to exercise genuine client creation, SVG rendering,
  and editor interactions; unit tests remain the default fast loop.
- Provider and Vitest package versions must stay aligned.
- More accurate Vitest 4 coverage must be addressed with meaningful tests,
  never by lowering the existing thresholds or removing production files.
