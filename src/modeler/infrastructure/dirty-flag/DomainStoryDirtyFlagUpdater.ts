import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";

import { DirtyFlagService } from "../../service/DirtyFlagService";

/**
 * Derives the host's "unsaved changes" flag from the command stack: dirtiness is
 * a property of the model's history, not of the paint. Lives outside
 * `DirtyFlagService` so that service stays free of diagram-js.
 *
 * Known limitation: "clean" means "the undo stack is empty", not "matches the
 * last save"; the public API has no way for a host to set a save marker.
 */
export class DomainStoryDirtyFlagUpdater {
    static $inject: string[] = [
        "eventBus",
        "commandStack",
        "domainStoryDirtyFlagService",
    ];

    constructor(
        eventBus: EventBus,
        commandStack: CommandStack,
        dirtyFlagService: DirtyFlagService,
    ) {
        eventBus.on("commandStack.changed", () => {
            // Undoing back to the start of history is a return to clean.
            if (commandStack.canUndo()) {
                dirtyFlagService.makeDirty();
            } else {
                dirtyFlagService.makeClean();
            }
        });

        // CommandStack clears itself silently on `diagram.clear`, so no
        // `commandStack.changed` follows.
        eventBus.on("diagram.clear", () => dirtyFlagService.makeClean());
    }
}
