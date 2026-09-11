# 0029 — Release with Release Please and GitHub package archives

- Status: accepted
- Date: 2026-09-11

## Context

egon-core builds a host-consumable ESM package with declarations, CSS, and
assets, and ADR 0028 verifies that package in an isolated consumer. It has no
semantic-version release process or supported distribution location. Installing
from source tags would make consumers run the package build themselves, while
registry publication would introduce credentials and a distribution channel the
project does not currently need.

A release archive must not silently change after consumers begin using its
versioned URL. Release events, manual recovery, mutable branch names, moved
tags, partial uploads, and reruns all create opportunities to publish the wrong
commit or overwrite an existing version.

## Decision

Release Please maintains one root Node-package release PR, `CHANGELOG.md`, the
root package version, `v<version>` tags, and GitHub Releases from conventional
commits on `main`. The manifest starts empty with an initial version of `0.1.0`
so the first release includes existing conventional-commit history. While below
`1.0.0`, fixes bump patch and features and breaking changes bump minor.

GitHub Releases are the only package distribution channel. Each published
release triggers a separate workflow that resolves the exact version tag,
downloads that commit's source archive, checks tag/package/manifest identity,
packs `egon-core-<version>.tgz`, runs ADR 0028's isolated package validation,
and uploads only the validated archive. Consumers install the versioned release
asset URL; GitHub-generated source archives are not package assets.

The workflow rechecks tag and release identity immediately before upload and
checksum-verifies the downloaded result. A rerun preserves any existing asset:
matching extracted contents succeed without replacement, and conflicting
contents fail. Manual recovery may validate any ref but uploads only to an
existing matching published version release; it never creates or retags one.

## Alternatives considered

- **Publish to npm or GitHub Packages** — rejected because it adds a registry,
  registry credentials, and another publication boundary without a current
  consumer need.
- **Install directly from Git tags** — rejected because consumers would receive
  repository source and need egon-core's development build toolchain.
- **Build from `main` or release `target_commitish`** — rejected because either
  may be branch-valued or move independently of the version tag.
- **Replace assets on rerun** — rejected because a versioned dependency URL must
  remain immutable; a conflict requires a new release version.

## Consequences

- Maintainers review and squash-merge a normal, CI-gated release PR; no registry
  publishing job, credential, monorepo target, or approval environment exists.
- A GitHub App with repository-scoped Contents and Pull requests write access is
  required so Release Please can update PRs and its release event can trigger
  archive publication.
- A new GitHub Release is briefly not installable while its package archive is
  built and validated. Failures leave it without the asset and are recoverable
  without changing release identity.
- Release archive logic and Release Please version calculations have regression
  tests in the normal unit suite. GitHub App permissions and event delivery
  still require the post-merge rollout checks in `docs/Releasing.md`.
- WPS host integration remains separate, but its intended egon-core dependency
  source is the built GitHub Release archive.
