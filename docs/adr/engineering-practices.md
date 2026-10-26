# Engineering practices

The toolchain, code formatting, and local runtime.

## <a id="eng-1"></a>ENG-1 — Use a standalone toolchain with exact pins

- Status: accepted
- History: 2026-07-20 decided (ADR 0004); 2026-09-14 TypeScript 7 for
  typechecking with a TypeScript 6 API alias (ADR 0035)

**Context.** The extracted code used to build inside the egon.io Angular
workspace. As a library, it must build, test, and verify itself with no host
application present, and its output must work with any bundler.

**Decision.**

- **Build:** Vite in library mode produces ESM, `.d.ts` files through
  `vite-plugin-dts`, and a compiled `style.css`. There is no CJS build
  ([REL-1](release-and-distribution.md#rel-1)).
- **Test:** Vitest ([TST-1](testing.md#tst-1)).
- **Static checks:** ESLint (flat config with typescript-eslint), and
  `yarn typecheck` across the library, spec, and demo tsconfigs.
- **Package manager:** Yarn 4 through corepack, pinned in `packageManager`.
  npm and npx are not used.
- **Dependencies:** every dependency is pinned to an exact version, so each
  upgrade is a reviewable change.
- **TypeScript 7 for typechecking:** `@typescript/native` is
  `npm:typescript@7.x` and provides `tsc`. `typescript` is an alias for
  `npm:@typescript/typescript6@6.x`, which provides the JavaScript compiler
  API that typescript-eslint, vite-plugin-dts, and the source-analysis tests
  import. All configs use ESNext modules and Bundler resolution, with no
  `baseUrl`.

**Rejected alternatives.**

- **Go back to TypeScript 6:** the migration was explicitly requested to keep
  TypeScript 7's native compiler.
- **Install the compatibility package next to TypeScript 7 without the
  alias:** typescript-eslint imports `typescript` directly.

**Consequences.**

- `yarn build`, `yarn test`, `yarn lint`, and `yarn typecheck` together are
  the full local verification. CI needs nothing from egon.io.
- Two compiler implementations are installed. Every upgrade must check both
  the CLI path and the API path.

## <a id="eng-2"></a>ENG-2 — Format with Prettier, configured to the existing style

- Status: accepted
- History: 2026-07-21 decided (ADR 0006)

**Context.** `eslint-config-prettier` was installed, but no formatter was set
up, and CI needed a format check. The code already had a de facto style:
4-space indentation, double quotes, semicolons, and about 80 columns.

**Decision.** `.prettierrc.json` writes down that style. `tabWidth: 4` is the
only deviation from Prettier's defaults. `printWidth: 80`, `semi`,
`singleQuote: false`, and `trailingComma: "all"` are set explicitly even
though they are defaults. `yarn format` rewrites files, and
`yarn format:check` runs in CI on every PR. There is no pre-commit hook; CI is
the backstop.

**Rejected alternatives.**

- **Prettier's default 2-space indentation:** this would have reindented
  almost every file (116 files instead of 15) and destroyed `git blame`.
- **ESLint stylistic rules:** ESLint has deprecated them.
- **No formatter:** style would be left to review comments.

**Consequences.**

- The config is settled. Changing it means reformatting the whole repo.
- Prefer typed fixes to suppressions that depend on line position, such as
  `@ts-expect-error`. Those can stop working when Prettier rewraps a line.

## <a id="eng-3"></a>ENG-3 — Use Node 24 and portless for demo routing

- Status: accepted
- History: 2026-09-06 decided (ADR 0022)

**Context.** Linked worktrees often run demos at the same time. A fixed Vite
port collides, and a random port is awkward for people and for browser
automation. Portless gives stable, named `.localhost` routes and adds a prefix
per worktree, but it needs Node 24, and local development and CI must use the
same runtime. Portless's default HTTPS listener also needs local certificates
and a privileged port.

**Decision.**

- **Node:** `.nvmrc` pins Node 24, and CI reads it.
- **Proxy:** portless is pinned and serves the demo over loopback HTTP:
    - proxy port 1355, which `PORTLESS_PORT` overrides
    - `.localhost` routing, with LAN mode off and no hosts-file sync
    - proxy state in a shared temporary directory, which `PORTLESS_STATE_DIR`
      overrides, so it can run alongside an unrelated default portless proxy
- **Routes:** the demo and the e2e tests use the routes `egon-core-demo` and
  `egon-core-e2e`.
- **Launcher:** a shared launcher checks the Node major version, forwards
  shutdown signals, and leaves the proxy running.
- **URL handoff:** Vite prints `EGON_DEMO_READY <url>` once it is listening,
  and Playwright reads that URL as its `baseURL`.

**Rejected alternatives.**

- **Fixed ports:** parallel worktrees collide.
- **Random ports without named routes:** the e2e runner would need its own way
  to discover the port.
- **Portless's default HTTPS:** the certificate and privileged-port setup adds
  friction without improving loopback testing.
- **Change the contributor's nvm default:** `.nvmrc` selects the Node version
  for this repository only.

**Consequences.**

- Run `nvm install` and `nvm use` before `yarn install`. Older Node versions
  get an actionable error.
- Manual and e2e demos can run side by side, including across worktrees.
- The proxy may keep running after the demo stops. This is by design.
