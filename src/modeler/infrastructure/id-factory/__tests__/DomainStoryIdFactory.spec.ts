import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainStoryIdFactory } from "../DomainStoryIdFactory";

/**
 * Covers the two guarantees the factory makes now that its id list is
 * instance-owned (issue #12): within one instance it never hands out a
 * duplicate, and ids consumed in one instance leave a second instance's
 * generation untouched. The isolation test fails against the pre-#12 code,
 * where a shared module-level list made instance A poison instance B.
 *
 * Math.random is mocked so the four-digit seed is deterministic and the
 * collision-avoidance loop is exercised on demand.
 */
describe("DomainStoryIdFactory", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("avoids collisions within one instance by walking to the next id", () => {
        // Every seed resolves to 0001, so the second getId must detect the
        // clash and increment to 0002 instead of repeating the first id.
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        const factory = new DomainStoryIdFactory();

        const first = factory.getId("actor");
        const second = factory.getId("actor");

        expect(first).toBe("actor_0001");
        expect(second).toBe("actor_0002");
    });

    it("keeps generated ids isolated between instances", () => {
        // Both factories draw the same seed. If they shared an id list, B's
        // first id would skip 0001 (seen by A). Instance ownership means B is
        // free to reuse it.
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        const factoryA = new DomainStoryIdFactory();
        const factoryB = new DomainStoryIdFactory();

        const fromA = factoryA.getId("actor");
        const fromB = factoryB.getId("actor");

        expect(fromA).toBe("actor_0001");
        expect(fromB).toBe("actor_0001");
    });

    it("keeps registered ids isolated between instances", () => {
        // A registered id only constrains its own instance's generation.
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        const factoryA = new DomainStoryIdFactory();
        const factoryB = new DomainStoryIdFactory();

        factoryA.registerId("actor_0001");

        // A must route around the id it already knows; B has never seen it.
        expect(factoryA.getId("actor")).toBe("actor_0002");
        expect(factoryB.getId("actor")).toBe("actor_0001");
    });
});
