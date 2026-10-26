# Internal feature flags (ADR 0042)

Read this before adding, testing, flipping, or removing a flag.

## When a flag is justified

Only for a **user-visible behaviour change that cannot land in one small PR**.

These cases need no flag:

- **A new domain object.** It stays inert until wired in.
- **A behaviour-preserving extraction.** Use branch by abstraction, guarded by
  characterization tests.
- **A bug fix.** It ships with its regression test.

When a flag is justified, state the reason in the PR description.

## Where flags live

- **One typed registry** of flag names, each defaulting to `false`, introduced
  by #207. Look for `FeatureFlags` under `src/modeler/service/`.
    - If it does not exist yet, this change is the first one that needs a flag:
      implement the registry per #207 as part of it.
    - It never goes into a `domain/` folder. Domain purity would then no longer
      keep it out of the domain.
- **Instance-scoped.** The registry is a value in the client's injector, like
  `config.textRenderer`, and it must reach every editor session (ADR 0024).
  It is never module state (ADR 0012).
- **Not in the public API.** Flags are not on `EgonClientConfig` and not
  exported from `src/index.ts`. The architecture tests' public-surface freeze
  rejects that anyway. Exposing a flag to hosts needs its own ADR.

## The domain never branches on a flag

The caller in service or infrastructure code chooses. The domain gets two
implementations, each with one behaviour, and each mutation-tested on its own.

```ts
// infrastructure (illustrative): the adapter picks, the domain does not branch
const decision = this.featureFlags.activitySequence
    ? ActivitySequence.from(snapshot).renumberAfter(change)
    : renumberLegacy(snapshot, change);
applyDecision(commandStack, decision);
```

A flag check inside a domain file doubles the mutants (both branches must be
killed) for code that is half-deleted soon after.

## Testing both states

While the flag exists, run every affected behaviour with the flag off and on,
usually in browser specs:

```ts
describe.each([false, true])("activitySequence flag = %s", (enabled) => {
    // create the client with the flag set through the internal injection point
});
```

Expectations that differ between the states are the behaviour change itself;
assert them explicitly per state.

## Lifecycle

Open the flag together with an issue that removes it, so it cannot become
permanent.

| Step   | Commit type       | Content                                                                                  |
| ------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Add    | `refactor:`       | Registry entry (`false`), the new path, tests for both states, the removal issue         |
| Flip   | `feat:` or `fix:` | Default becomes `true`; this is the one changelog entry users see                        |
| Remove | `refactor:`       | Delete the entry, the old path, the old domain implementation, and the both-states tests |

Remove the flag once the flipped default has shipped in one release without a
regression. A flipped flag is already unreachable for hosts, so keeping it only
preserves a fast way to roll back.
