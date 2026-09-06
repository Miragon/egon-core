import { describe, expect, it } from "vitest";

import { numberBoxDefinitions } from "../numbering";

const START = { x: 100, y: 100 };

/**
 * Literal vectors and results deliberately avoid deriving expectations through
 * angleBetween/numberBoxDefinitions. The sixteen rows exercise every angular
 * branch at an interior point and every inclusive boundary.
 */
const CASES = [
    ["0° boundary", { x: 200, y: 100 }, { x: 125, y: 120 }],
    ["0°–45°", { x: 192.387953, y: 61.731657 }, { x: 125, y: 110 }],
    ["45° boundary", { x: 200, y: 0 }, { x: 125, y: 100 }],
    ["45°–90°", { x: 138.268343, y: 7.612047 }, { x: 112.5, y: 100 }],
    ["90° boundary", { x: 100, y: 0 }, { x: 105, y: 100 }],
    ["90°–135°", { x: 61.731657, y: 7.612047 }, { x: 95, y: 100 }],
    ["135° boundary", { x: 0, y: 0 }, { x: 85, y: 100 }],
    ["135°–180°", { x: 7.612047, y: 61.731657 }, { x: 85, y: 110 }],
    ["180° boundary", { x: 0, y: 100 }, { x: 85, y: 120 }],
    ["180°–225°", { x: 7.612047, y: 138.268343 }, { x: 85, y: 127.5 }],
    ["225° boundary", { x: 0, y: 200 }, { x: 85, y: 140 }],
    ["225°–270°", { x: 61.731657, y: 192.387953 }, { x: 95, y: 140 }],
    ["270° boundary", { x: 100, y: 200 }, { x: 105, y: 140 }],
    ["270°–315°", { x: 138.268343, y: 192.387953 }, { x: 117.5, y: 140 }],
    ["315° boundary", { x: 200, y: 200 }, { x: 130, y: 140 }],
    ["315°–360°", { x: 192.387953, y: 138.268343 }, { x: 125, y: 127.5 }],
] as const;

describe("numberBoxDefinitions", () => {
    it.each(CASES)(
        "positions the badge in the %s range",
        (_name, end, expected) => {
            const box = numberBoxDefinitions([START, end]);

            expect(box.x).toBeCloseTo(expected.x, 5);
            expect(box.y).toBeCloseTo(expected.y, 5);
            expect(box).toMatchObject({
                width: 30,
                height: 30,
                textAlign: "center",
            });
        },
    );
});
