import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainStoryIdFactory } from "../DomainStoryIdFactory";

const factorySource = readFileSync(
    resolve(__dirname, "../DomainStoryIdFactory.ts"),
    "utf8",
);
const compiledFactorySource = ts.transpileModule(factorySource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;

// A VM timeout can interrupt a synchronous allocation loop; a Vitest timeout cannot.
function runFactoryScenario<T>(scenario: string, timeout = 1000): T {
    const context: { exports: object; result: T | undefined } = {
        exports: {},
        result: undefined,
    };
    const script = new Script(`
        ${compiledFactorySource}
        result = (() => {
            const { DomainStoryIdFactory } = exports;
            ${scenario}
        })();
    `);

    script.runInNewContext(context, { timeout });

    return context.result as T;
}

/**
 * Covers the two guarantees the factory makes now that its id collection is
 * instance-owned (issue #12): within one instance it never hands out a
 * duplicate, and ids consumed in one instance leave a second instance's
 * generation untouched. The isolation test fails against the pre-#12 code,
 * where a shared module-level collection made instance A poison instance B.
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
        // Both factories draw the same seed. If they shared ids, B's
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

    it("keeps four digits as the minimum suffix width", () => {
        const ids = runFactoryScenario<string[]>(`
            return [0, 9, 10, 99, 100, 999, 1000].map((seed) => {
                Math.random = () => seed / 10000;
                return new DomainStoryIdFactory().getId("shape");
            });
        `);

        expect(ids).toEqual([
            "shape_0000",
            "shape_0009",
            "shape_0010",
            "shape_0099",
            "shape_0100",
            "shape_0999",
            "shape_1000",
        ]);
    });

    it("continues past 9999 without rewriting legacy registered ids", () => {
        const id = runFactoryScenario<string>(`
            Math.random = () => 0.9999;
            const factory = new DomainStoryIdFactory();
            factory.registerId("shape_9999");
            factory.registerId("shape_0");
            return factory.getId("shape");
        `);

        expect(id).toBe("shape_10000");
    });

    it("skips duplicate registrations beyond the four-digit boundary", () => {
        const id = runFactoryScenario<string>(`
            Math.random = () => 0.9999;
            const factory = new DomainStoryIdFactory();
            for (const id of [
                "shape_9999",
                "shape_10000",
                "shape_10000",
                "shape_10001",
                "shape_10001",
            ]) {
                factory.registerId(id);
            }
            return factory.getId("shape");
        `);

        expect(id).toBe("shape_10002");
    });

    it("walks consecutive collisions for seeds at the boundary", () => {
        const ids = runFactoryScenario<string[]>(`
            const allocate = (seed, count) => {
                Math.random = () => seed;
                const factory = new DomainStoryIdFactory();
                return Array.from({ length: count }, () => factory.getId("shape"));
            };

            return [...allocate(0.9998, 4), ...allocate(0.9999, 3)];
        `);

        expect(ids).toEqual([
            "shape_9998",
            "shape_9999",
            "shape_10000",
            "shape_10001",
            "shape_9999",
            "shape_10000",
            "shape_10001",
        ]);
    });

    it("generates 10,001 unique ids and progresses beyond 9999", () => {
        const result = runFactoryScenario<{
            first: string;
            last: string;
            size: number;
        }>(
            `
                    // Fill the four-digit range deterministically, then collide
                    // at its upper boundary without a quadratic full-range walk.
                    let seed = 0;
                    Math.random = () => (Math.min(seed++, 9999) + 0.5) / 10000;
                    const factory = new DomainStoryIdFactory();
                    const ids = Array.from(
                        { length: 10001 },
                        () => factory.getId("shape"),
                    );
                    return {
                        first: ids[0],
                        last: ids.at(-1),
                        size: new Set(ids).size,
                    };
                `,
            5000,
        );

        expect(result).toEqual({
            first: "shape_0000",
            last: "shape_10000",
            size: 10001,
        });
    }, 10000);

    it("resolves many collisions with a fixed seed", () => {
        const result = runFactoryScenario<{
            last: string;
            size: number;
        }>(`
            Math.random = () => 0.9999;
            const factory = new DomainStoryIdFactory();
            const ids = Array.from({ length: 256 }, () => factory.getId("shape"));
            return { last: ids.at(-1), size: new Set(ids).size };
        `);

        expect(result).toEqual({ last: "shape_10254", size: 256 });
    });

    it("isolates overflow ids across instances and type prefixes", () => {
        const ids = runFactoryScenario<string[]>(`
            Math.random = () => 0.9999;
            const factoryA = new DomainStoryIdFactory();
            const factoryB = new DomainStoryIdFactory();
            factoryA.registerId("shape_9999");
            factoryA.registerId("shape_10000");

            return [
                factoryA.getId("shape"),
                factoryA.getId("actor"),
                factoryB.getId("shape"),
                factoryB.getId("actor"),
            ];
        `);

        expect(ids).toEqual([
            "shape_10001",
            "actor_9999",
            "shape_9999",
            "actor_9999",
        ]);
    });
});
