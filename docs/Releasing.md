# Releasing egon-core

egon-core uses Release Please to maintain one release PR for the root Node
package. Merging that PR creates a `v<version>` tag and a GitHub Release. A
separate release-event workflow builds, validates, and attaches
`egon-core-<version>.tgz`; nothing is published to npm or GitHub Packages.

## Repository setup

Create or reuse a GitHub App and install it only for the `Miragon/egon-core`
repository. Grant these repository permissions:

- **Contents: Read and write** — update release branches, create tags, and
  create GitHub Releases.
- **Pull requests: Read and write** — open and update the release PR.

Add the App client ID as the repository variable
`RELEASE_PLEASE_APP_CLIENT_ID` and its PEM private key as the repository secret
`RELEASE_PLEASE_APP_PRIVATE_KEY`. The Release Please workflow omits `owner` and
`repositories` when creating the installation token, which scopes the token to
the current repository. Using an App token also allows the created release to
trigger the archive workflow; events created with the repository's automatic
`GITHUB_TOKEN` would not start another workflow.

The archive workflow uses its short-lived `GITHUB_TOKEN` with **Contents: write**
only to read source/tag/release data and upload the validated asset. It needs no
registry credential or approval environment.

## Review and publish

Qualifying conventional commits on `main` update the open release PR. Because
the repository squash-merges pull requests, the PR title is the commit Release
Please reads. The existing PR-title check accepts `feat`, `fix`, `refactor`,
`docs`, and `chore`; do not merge a PR while that check or CI is failing.

The initial release is `0.1.0`. Before `1.0.0`, versioning is:

| Change                       | Example from `0.1.0` | Result  |
| ---------------------------- | -------------------- | ------- |
| Fix                          | `fix: ...`           | `0.1.1` |
| Feature                      | `feat: ...`          | `0.2.0` |
| Breaking change (`!`/footer) | `feat!: ...`         | `0.2.0` |

The first release PR initializes `.release-please-manifest.json`, changes the
root `package.json` version to `0.1.0`, and creates the root `CHANGELOG.md` from
the existing conventional-commit history. Later release PRs update those same
files. Review them like any other change, then squash-merge when the accumulated
changes should ship.

Release Please creates the matching tag and GitHub Release. The release becomes
installable only after the **Release archive** workflow has finished validating
and uploading `egon-core-<version>.tgz`. GitHub's automatically generated
**Source code (zip)** and **Source code (tar.gz)** downloads contain repository
source, not the built consumer package.

## Archive identity and recovery

For a published release, the archive workflow resolves the exact version tag to
a commit and downloads that commit's GitHub source archive. It does not build
the workflow checkout, moving `main`, or `target_commitish`. The tag version,
root package version, and Release Please manifest version must agree.

The workflow installs with the repository-pinned Yarn and `--immutable`, runs
the package's `prepack` build exactly once through `yarn pack`, and validates the
candidate archive with the isolated consumer suite before any upload. It checks
package identity, GPL license, public exports, all emitted `dist` files,
TypeScript consumption, a production build, browser journeys, styles, and
assets. Immediately before upload it rechecks that the release and tag still
identify the same commit. It then downloads the uploaded asset and compares its
SHA-256 checksum with the validated candidate.

Runs are serialized per tag. A rerun never replaces an asset: if the versioned
name already exists, the workflow compares extracted file contents while
ignoring archive timestamps. Matching contents succeed and preserve the asset;
different contents fail.

- A build or validation failure leaves the GitHub Release without a package
  asset. Retry transient failures. If the released contents are invalid, fix
  them in a new version; never move the existing tag.
- A transient upload failure can be retried from the failed workflow run. It is
  also safe to dispatch **Release archive** manually with the same version tag
  and **upload** enabled.
- Manual runs default to validation only. Manual upload requires an existing,
  published `v<version>` release with matching package and manifest versions;
  recovery never creates a release or tag.
- Failure candidates, Playwright reports, traces, and screenshots are retained
  for seven days in the run's `release-archive-failure-<run-id>` workflow
  artifact when those files exist.

The WPS web host is outside this repository. Its intended dependency source is
the validated versioned archive URL, not a source deep import.

## Rollout verification

Local and pull-request checks cannot prove GitHub App permissions or event
delivery. After this configuration reaches `main`, maintainers must record the
following in issue #125 or its release follow-up:

- the first release PR updated `package.json`, the manifest, and `CHANGELOG.md`
  to `0.1.0` and passed CI/title checks;
- merging it created tag/release `v0.1.0` at the same commit;
- the release-event workflow attached `egon-core-0.1.0.tgz` and the documented
  `yarn add` command worked in a clean consumer; and
- rerunning the archive workflow detected and preserved the matching asset.
