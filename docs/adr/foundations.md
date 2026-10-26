# Foundations

What egon-core is, which license it uses, and how it relates to upstream
egon.io.

## <a id="fnd-1"></a>FND-1 — Extract a standalone, host-independent modeling core

- Status: accepted
- History: 2026-07-20 decided (ADR 0002); 2026-07-22 public surface narrowed
  to `EgonClient` (ADR 0010, see [API-1](public-api.md#api-1))

**Context.** [egon.io](https://github.com/WPS/egon.io) is a complete Domain
Storytelling editor: an Angular application with its diagram-js modeling code
woven in. We want to embed Domain Storytelling modeling in our own products
(a VS Code webview today, the WPS web app as the end goal). That is not
practical while the modeling core exists only inside someone else's editor.

**Decision.** Extract the modeling core into this standalone library. The core
owns the canvas, the story model, and the notation's domain logic. Everything
that belongs to an editor application stays out: Angular UI, persistence,
dialogs, notifications, file downloads, and playback scheduling. Hosts embed
the core through `EgonClient` (API-1) and supply those concerns themselves.

**Consequences.**

- Domain Storytelling modeling is embeddable in any ESM-capable browser app.
- The core must stay framework- and host-agnostic. It has no Angular and makes
  no assumptions about where documents are stored or how users are prompted.
  The layout rules ([ARC-1](architecture.md#arc-1),
  [ARC-2](architecture.md#arc-2))
  exist to keep it that way.
- Where a feature needs UI, the core exposes a host-neutral primitive (replay,
  label renames, visual export) or a replaceable default (the color picker,
  [EDT-2](editor-features.md#edt-2)).

## <a id="fnd-2"></a>FND-2 — License under GPL-3.0-or-later

- Status: accepted
- History: 2026-07-20 decided (ADR 0003)

**Context.** egon-core is a derivative work of egon.io, which is licensed under
GPL-3.0. A derivative needs a GPL-compatible license, and we cannot relicense
code we did not write.

**Decision.** The package is licensed `GPL-3.0-or-later` (`LICENSE`,
`package.json`).

**Consequences.**

- This is legally sound with respect to the upstream project.
- Copyleft applies to consumers: applications that embed egon-core and are
  distributed must be GPL-compatible. This limits adoption in proprietary
  products. It is a known and accepted trade-off, not an oversight.
- Code merged or ported into egon-core, and dependencies it ships, must be
  GPL-3.0-compatible. Bundled third-party code ships its license notice
  ([REL-1](release-and-distribution.md#rel-1)).

## <a id="fnd-3"></a>FND-3 — Own the extracted code; port upstream fixes deliberately

- Status: accepted
- History: 2026-07-20 decided as part of the extraction (ADR 0002); naming and
  porting conventions added with ADRs 0008, 0011, 0012 and 0015

**Context.** The extraction is a fork, not a dependency. egon.io keeps
evolving and fixes bugs that the two code bases share. After the restructuring
(ARC-1), a mechanical sync is impossible.

**Decision.**

- We own the extracted code. Upstream fixes are ported by hand in sync rounds.
  `SYNC.md` records the synced-through baseline, the upstream→local path
  mapping, and the round process. A PR that moves or renames modules updates
  the mapping in the same PR.
- Where a name is arbitrary, match upstream (classes, methods, CSS classes) so
  sync diffs stay reviewable.
- Prefer upstream's proven approach and dependency versions to a hand-rolled
  divergence (for example align-to-origin,
  [EDT-1](editor-features.md#edt-1)).
- Port upstream module-level state as an injected per-instance service, never
  as module globals ([ARC-5](architecture.md#arc-5)).
- Local-only structure, such as the pure grammar in `story/domain`, may use
  local names. `SYNC.md` notes that it has no upstream counterpart.

**Consequences.**

- Upstream improvements arrive only when someone ports them. The `SYNC.md`
  baseline shows how far behind we are.
- Each deliberate divergence must be recorded, either in `SYNC.md` or in the
  decision that caused it, so that a later sync does not undo it. One example
  is the `mask-image` icon CSS
  ([ICO-1](icons.md#ico-1)).
