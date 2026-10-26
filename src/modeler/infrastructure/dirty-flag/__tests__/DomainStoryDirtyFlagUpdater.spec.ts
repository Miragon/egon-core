import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryDirtyFlagUpdater } from "../DomainStoryDirtyFlagUpdater";
import { DirtyFlagService } from "../../../service/DirtyFlagService";

/**
 * A real `EventBus` with a stubbed `CommandStack`: the behaviour is what happens
 * with `canUndo()` on `commandStack.changed`, and diagram-js' real stack cannot
 * reach that state without a canvas (ADR TST-2).
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
        // Undoing back to the start of history is a return to clean.
        canUndo = true;
        eventBus.fire("commandStack.changed", {});
        expect(dirtyFlagService.dirty).toBe(true);

        canUndo = false;
        eventBus.fire("commandStack.changed", {});

        expect(dirtyFlagService.dirty).toBe(false);
    });

    it("resets to clean when an import clears the diagram", () => {
        canUndo = true;
        eventBus.fire("commandStack.changed", {});
        expect(dirtyFlagService.dirty).toBe(true);

        // CommandStack clears itself silently on `diagram.clear`, so this
        // listener is the only reset.
        eventBus.fire("diagram.clear", {});

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

        // The replayed initial `false`, then one transition each way, not one per command.
        expect(seen).toEqual([false, true, false]);
    });
});
