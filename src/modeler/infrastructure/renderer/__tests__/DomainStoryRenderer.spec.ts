import { describe, expect, it, vi } from "vitest";
import { DomainStoryRenderer } from "../DomainStoryRenderer";

/**
 * Issue #12: the renderer id (which seeds SVG marker ids) is now per-instance,
 * not a module-level `new Ids()`. Two renderers on one page must therefore get
 * distinct ids so their marker `<defs>` never collide. The constructor only
 * registers eventBus listeners and stores its deps, so a lone `on` stub plus
 * empty dep objects are enough to build it.
 */
function makeRenderer(): DomainStoryRenderer {
    const eventBus = { on: vi.fn() } as any;
    return new DomainStoryRenderer(
        eventBus,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
    );
}

describe("DomainStoryRenderer", () => {
    it("gives each instance a distinct renderer id", () => {
        const rendererA = makeRenderer() as any;
        const rendererB = makeRenderer() as any;

        expect(rendererA.rendererId).toBeTruthy();
        expect(rendererA.rendererId).not.toBe(rendererB.rendererId);
    });
});
