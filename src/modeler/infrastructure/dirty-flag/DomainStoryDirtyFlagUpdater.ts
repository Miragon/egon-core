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
 * WHY it also listens to `diagram.clear`: an import wipes the canvas and the
 * command stack, but the stack clears silently, so no `commandStack.changed`
 * ever announces that history is gone. The freshly opened story would inherit
 * the previous one's dirty flag.
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
            // `canUndo()` is load-bearing, not defensive: undoing back to the
            // start of history is a return to clean, not a further change.
            if (commandStack.canUndo()) {
                dirtyFlagService.makeDirty();
            } else {
                dirtyFlagService.makeClean();
            }
        });

        // An import fires `diagram.clear`, which CommandStack answers with
        // `this.clear(false)` — and `clear(emit = false)` fires nothing
        // (CommandStack.js:159, :240). So opening a story leaves the flag
        // wherever the *previous* story left it unless we reset it here.
        eventBus.on("diagram.clear", () => dirtyFlagService.makeClean());
    }
}
