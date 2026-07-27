import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryDirtyFlagUpdater } from "../DomainStoryDirtyFlagUpdater";
import { DirtyFlagService } from "../../../service/DirtyFlagService";

/**
 * Issue #74: the unsaved-changes flag follows the command stack, not the paint.
 *
 * It used to be set from `DomainStoryRenderer.drawShape`/`drawConnection`, so
 * opening a story, selecting an element or scrolling one back into view all
 * reported unsaved changes.
 *
 * A real `EventBus` with a stubbed `CommandStack`: the whole behaviour is "what
 * does it do with `canUndo()` when `commandStack.changed` fires", and diagram-js'
 * real stack cannot reach that state without a canvas (ADR 0014).
 */
describe("DomainStoryDirtyFlagUpdater", () => {
    let eventBus: EventBus;
    let dirtyFlagService: DirtyFlagService;
    let canUndo: boolean;

    beforeEach(() => {
        eventBus = new EventBus();
        dirtyFlagService = new DirtyFlagService();
        canUndo = false;
        new DomainStoryDirtyFlagUpdater(
            eventBus,
            { canUndo: () => canUndo } as never,
            dirtyFlagService,
        );
    });

    it("starts clean, and stays clean while nothing has been executed", () => {
        expect(dirtyFlagService.dirty).toBe(false);

        eventBus.fire("commandStack.changed", {});

        expect(dirtyFlagService.dirty).toBe(false);
    });

    it("marks the story dirty once a command is on the stack", () => {
        canUndo = true;

        eventBus.fire("commandStack.changed", {});

        expect(dirtyFlagService.dirty).toBe(true);
    });

    it("comes back clean when the stack is emptied again", () => {
        // Both the undo-everything case and the `diagram.clear` an import fires:
        // diagram-js' CommandStack answers `diagram.clear` by clearing itself and
        // firing `changed`. Without the `canUndo()` guard this would report every
        // freshly opened story as having unsaved changes.
        canUndo = true;
        eventBus.fire("commandStack.changed", {});
        expect(dirtyFlagService.dirty).toBe(true);

        canUndo = false;
        eventBus.fire("commandStack.changed", {});

        expect(dirtyFlagService.dirty).toBe(false);
    });

    it("notifies a subscriber only when the value actually changes", () => {
        const seen: boolean[] = [];
        dirtyFlagService.onDirtyChange((dirty) => seen.push(dirty));

        canUndo = true;
        eventBus.fire("commandStack.changed", {});
        eventBus.fire("commandStack.changed", {});
        canUndo = false;
        eventBus.fire("commandStack.changed", {});

        // The replayed initial `false`, then one transition each way — not one
        // event per command, which a repaint-driven flag effectively produced.
        expect(seen).toEqual([false, true, false]);
    });
});
