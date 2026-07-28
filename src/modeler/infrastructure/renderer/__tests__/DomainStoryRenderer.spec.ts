import { describe, expect, it, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";
import Canvas from "diagram-js/lib/core/Canvas";

import { DomainStoryRenderer } from "../DomainStoryRenderer";

/**
 * Issue #12: the renderer id (which seeds SVG marker ids) is now per-instance,
 * not a module-level `new Ids()`. Two renderers on one page must therefore get
 * distinct ids so their marker `<defs>` never collide.
 *
 * The second group covers the bendpoint-drag marker lifecycle, which is the
 * other thing the constructor wires up.
 */
function makeRenderer(eventBus: any = { on: vi.fn() }, canvas: any = {}) {
    const renderer = new DomainStoryRenderer(
        eventBus,
        {} as any,
        canvas as Canvas,
        {} as any,
        {} as any,
    );
    return renderer;
}

describe("DomainStoryRenderer", () => {
    it("gives each instance a distinct renderer id", () => {
        const rendererA = makeRenderer() as any;
        const rendererB = makeRenderer() as any;

        expect(rendererA.rendererId).toBeTruthy();
        expect(rendererA.rendererId).not.toBe(rendererB.rendererId);
    });
});

/**
 * The dragged connection is hidden while a bendpoint moves, so the stale path is
 * not painted underneath the preview. Whatever hides it has to unhide it on
 * *every* way the drag can finish.
 */
describe("DomainStoryRenderer bendpoint drag", () => {
    function setup() {
        const eventBus = new EventBus();
        const canvas = { addMarker: vi.fn(), removeMarker: vi.fn() };
        makeRenderer(eventBus, canvas);

        const connection = { id: "Activity_1" };
        const context = {
            connection,
            draggerGfx: document.createElementNS(
                "http://www.w3.org/2000/svg",
                "g",
            ),
        };

        return { eventBus, canvas, connection, context };
    }

    it("unhides the connection when the drag completes", () => {
        const { eventBus, canvas, connection, context } = setup();

        eventBus.fire("bendpoint.move.start", { context });
        eventBus.fire("bendpoint.move.end", { context });

        expect(canvas.removeMarker).toHaveBeenCalledWith(
            connection,
            "djs-element-hidden",
        );
    });

    it("unhides the connection when the drag is cancelled with ESC", () => {
        const { eventBus, canvas, connection, context } = setup();

        eventBus.fire("bendpoint.move.start", { context });
        // ESC aborts the drag: diagram-js fires `.cancel`, never `.end`.
        eventBus.fire("bendpoint.move.cancel", { context });

        expect(canvas.removeMarker).toHaveBeenCalledWith(
            connection,
            "djs-element-hidden",
        );
    });
});
