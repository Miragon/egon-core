# Release and distribution

What the package ships and how a version is released.

## <a id="rel-1"></a>REL-1 — Ship ESM, two entries and one stylesheet

- Status: accepted
- History: 2026-07-20 ESM-only build (ADR 0004); 2026-09-11 single public
  stylesheet (ADR 0028); 2026-09-13 bundled color picker (ADR 0038);
  2026-09-15 `./icons` entry (ADR 0039)
- Enforced by: architecture rule G; `yarn test:package` ([TST-3](testing.md#tst-3))

**Context.** Hosts use the package through a bundler. Whether the published
archive is usable depends on what a host has to import and configure.

**Decision.**

- **Format:** ESM only. The package has two entries, `dist/index.js` (main)
  and `dist/icons.js` (data only, [ICO-5](icons.md#ico-5)), each with type
  declarations. `exports` and `files` are locked
  ([API-1](public-api.md#api-1)).
- **Styles:** there is one host-facing stylesheet, `egon-core/style.css`. It
  contains diagram-js's base stylesheet, egon-core's font, minimap, and mask
  rules, and their assets. Hosts import only this stylesheet, and they still
  provide a canvas container with a size.
- **Dependencies:** JavaScript dependencies are left out of the bundle and
  declared as runtime dependencies. The one exception is `react-colorful`,
  which is bundled and mapped onto diagram-js's Preact
  ([EDT-2](editor-features.md#edt-2)). Its license notice ships in the
  package. Consumers never need React.
- **Side effects:** `sideEffects` lists only styles. Runtime modules must have
  no side effects at import time, or bundlers will tree-shake incorrectly.

**Rejected alternatives.**

- **A CJS build:** the targets are browser apps that use bundlers.
- **Have hosts import diagram-js and bpmn-font styles themselves:** the source
  demo hid missing package CSS exactly this way.

**Consequences.**

- Consumers on legacy CJS setups need a bundler.
- Package-level guarantees are checked by tests ([TST-3](testing.md#tst-3)),
  not assumed.

## <a id="rel-2"></a>REL-2 — Release with Release Please to immutable GitHub Release archives

- Status: accepted
- History: 2026-09-11 decided (ADR 0029); 2026-09-14 release configuration
  tested against the action's bundled version (ADR 0037)

**Context.** There was no semantic-version release process and no
distribution channel. Installing from Git tags would make consumers run our
build, and a package registry would add credentials and a channel we do not
need. A versioned archive URL must never change once consumers use it, but
several things can publish the wrong commit or overwrite a version:

- release events and manual recovery
- branch names and tags that move
- partial uploads and reruns

**Decision.**

- **Versioning:** Release Please maintains one release PR, `CHANGELOG.md`,
  the package version, `v<version>` tags, and GitHub Releases. It works from
  conventional commits on `main`, and CI checks PR titles. Below 1.0.0, fixes
  bump the patch version, and features and breaking changes bump the minor
  version.
- **Distribution:** GitHub Releases are the only channel, and consumers
  install the release asset URL. When a release is published, a workflow:
    1. resolves the exact tag
    2. downloads that commit's source archive
    3. checks that tag, package, and manifest agree
    4. installs dependencies immutably and packs `egon-core-<version>.tgz`
    5. validates the archive with the isolated consumer
       ([TST-3](testing.md#tst-3))
    6. uploads only that archive
- **Immutability:**
    - The workflow checks identity again right before uploading, and verifies
      the uploaded asset by checksum.
    - A rerun never replaces an asset. If the contents match, it succeeds; if
      they conflict, it fails.
    - Manual recovery may validate any ref, but it uploads only to an existing,
      matching release. It never creates or retags one.
- **Configuration tests:** the release configuration tests run against both
  the installed `release-please` and the version bundled in the pinned workflow
  action, through the `release-please-action-implementation` alias. Update the
  alias together with the action SHA, and remove it when the versions match
  (`docs/Releasing.md`).

**Rejected alternatives.**

- **Publish to npm or GitHub Packages:** this adds a registry and its
  credentials without a consumer who needs them.
- **Install from Git tags:** consumers would get repository source and need
  our build toolchain.
- **Build from `main` or the release's `target_commitish`:** either can move
  independently of the version tag.
- **Replace the asset on rerun:** a versioned dependency URL must stay
  immutable. A conflict requires a new version.
- **Downgrade release-please to the action's version, or update the expected
  version without testing the action's copy:** the first discards a requested
  upgrade, and the second loses the guarantee that the tests cover what
  actually runs.

**Consequences.**

- A release is a normal release PR: it is gated by CI and squash-merged. There
  is no registry job or registry credential.
- Release Please needs a GitHub App with write access to Contents and Pull
  requests, so that its PRs and release events trigger workflows.
- A new release cannot be installed until its archive is validated and
  uploaded. If validation fails, the release has no asset, and it can be
  recovered without changing its identity.
- App permissions and event delivery are checked after merging, as described
  in `docs/Releasing.md`.
- The WPS host integration is meant to depend on the built release archive.
