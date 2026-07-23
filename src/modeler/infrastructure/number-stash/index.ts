import { DomainStoryNumberStash } from "./DomainStoryNumberStash";

/**
 * didi module for the number stash. No `__init__`: it is a passive holder with
 * no side effects, resolved lazily via the `$inject` of the labeling provider
 * (writer) and renderer (reader). didi dedupes this module across dependents, so
 * both share the one stash instance per injector — the hand-off they rely on.
 */
export default {
    domainStoryNumberStash: ["type", DomainStoryNumberStash],
};
