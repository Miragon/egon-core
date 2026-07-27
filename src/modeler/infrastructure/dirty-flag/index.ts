import CommandStack from "diagram-js/lib/command";
import DirtyFlagService from "../../service";

import { DomainStoryDirtyFlagUpdater } from "./DomainStoryDirtyFlagUpdater";

/**
 * didi module for the dirty-flag adapter. `__init__` is required, not optional:
 * the updater only subscribes in its constructor and nothing injects it.
 */
export default {
    __depends__: [DirtyFlagService, CommandStack],
    __init__: ["domainStoryDirtyFlagUpdater"],
    domainStoryDirtyFlagUpdater: ["type", DomainStoryDirtyFlagUpdater],
};
