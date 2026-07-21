# 0002 — Extract a standalone modeling core from egon.io

- Status: accepted
- Date: 2026-07-20

## Context

[egon.io](https://github.com/WPS/egon.io) is a complete Domain Storytelling
editor: an Angular application with the diagram-js-based modeling code woven
into it. We want to embed Domain Storytelling modeling into our own products,
which is not practical when the modeling core is only available inside someone
else's full editor application.

## Decision

Extract the modeling core into this standalone library, `egon-core`, with two
public entry points:

- **`EgonClient`** — the primary API: an embeddable client that mounts the
  modeler into a DOM container and exposes import/export, icon-set handling,
  and domain events. Consumers should not need to know diagram-js exists.
- **`EgonPlugin`** — the underlying diagram-js module, exported for advanced
  integrations that compose their own diagram-js instance.

The Angular UI, and everything else specific to the egon.io editor
application, stays out of scope. A few legacy service exports remain on the
package surface for backward compatibility and are marked `@deprecated`.

## Consequences

- Domain Storytelling modeling becomes embeddable in any ESM-capable app.
- We own the extracted code: upstream egon.io improvements must be ported
  manually; there is no mechanical sync.
- The library must remain framework-agnostic (no Angular, no host-app
  assumptions) — the layout rules in [0005](0005-module-layout-and-architecture-tests.md)
  exist to keep it that way.
