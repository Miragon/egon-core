import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";

import { DirtyFlagService } from "../../service/DirtyFlagService";

/**
 * Keeps the host's "unsaved changes" flag in step with the command stack.
 *
 * WHY it exists: until #74 the flag was set from `DomainStoryRenderer.drawShape`
 * and `drawConnection`, i.e. by a *repaint*. Merely opening a story, selecting an
 * element, or scrolling something back into view therefore reported unsaved
 * changes, while an edit that happened to change nothing visible reported none.
 * Dirtiness is a property of the model's history, not of the paint, so it is read
 * off the only thing that records that history.
 *
 * WHY an adapter and not a method on `DirtyFlagService`: the service is
 * deliberately dependency-free (a plain listener API, no diagram-js, no rxjs), so
 * the diagram-js wiring lives out here.
 *
 * Known limitation: "clean" means "the undo stack is empty", not "matches the
 * last save". A host that calls `makeClean()` after saving mid-history is
 * overruled by the next command, and undoing back to the start reports clean even
 * if the save happened later. Tracking a save marker needs the host to tell the
 * core where that marker is, which the frozen public API does not yet expose.
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
            // `canUndo()` is load-bearing, not defensive. `DomainStoryImportService`
            // fires `diagram.clear`, which diagram-js' `CommandStack` answers by
            // clearing itself and firing `changed` — an unconditional
            // `makeDirty()` would mark every freshly opened story dirty.
            if (commandStack.canUndo()) {
                dirtyFlagService.makeDirty();
            } else {
                dirtyFlagService.makeClean();
            }
        });
    }
}
