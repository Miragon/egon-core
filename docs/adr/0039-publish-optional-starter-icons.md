# 0039 — Publish starter icons through an optional data-only entry

- Status: accepted
- Date: 2026-09-15

## Context

egon-core deliberately starts with an empty creation palette unless a host
loads icon data. The public demo carried its own `Person` and `Document` SVG
files and loaded them after `EgonClient.create()`, so consumers had no packaged
minimal set to opt into and the demo duplicated a responsibility now useful to
other hosts.

Bundling that artwork into the main entry would make every consumer pay for it,
including hosts with their own catalog, and would weaken ADR 0010's narrow
client boundary. Initialization must also use the sanitizer and instance-local
registries established by ADRs 0023 and 0012, while later icon and document
loads must retain ADR 0009's replacement behavior.

## Decision

Publish one frozen, data-only `defaultIcons` value from `egon-core/icons`. It
contains the demo-derived `Person` actor and `Document` work-object artwork
under the set name `egon-default`. The main `egon-core` entry has no runtime
dependency on this pack. Hosts explicitly import the secondary entry and pass
its data through `EgonClientConfig.defaultIcons`; the same option accepts a
custom `IconSetData`. Omitting it or passing `false` keeps the empty palette.

Creation loads supplied data once through the existing `loadIcons` port before
its promise resolves. A load failure destroys the new client and rejects
creation. The option is initialization only: later `loadIcons()` calls and
document imports replace the selection and never restore removed starters.

This is a narrow expansion of ADR 0010's public package boundary. Executable
architecture checks freeze both entries and prevent the main entry from
reaching the pack. Installed-package validation type-checks the subpath and
builds separate client-only and opted-in consumers, proving the artwork is
absent or present in their emitted chunks respectively.

## Alternatives considered

- **Load starters automatically from the main entry** — rejected because hosts
  with their own icon catalog would still ship unused artwork and an empty
  palette would no longer be the default.
- **Keep the icons in the demo only** — rejected because every host wanting the
  same minimal palette would duplicate files and bypass the package contract.
- **Accept `defaultIcons: true` and load internally** — rejected because it
  creates a hidden runtime edge from the client entry to the artwork. Explicit
  data keeps tree-shaking observable and lets custom packs use the same path.

## Consequences

- Consumers opt in with a second import; consumers that do not import it can
  exclude both SVG strings from their application bundles.
- The package archive still contains the icon entry and artwork, adding a small
  amount to the published archive even when an application excludes it.
- The demo no longer owns or copies SVG files and exercises the same public
  constructor path as consuming hosts.
- The extra `./icons` export is deliberate public surface and must remain
  framework-, DOM-, stylesheet-, and registration-side-effect-free.
