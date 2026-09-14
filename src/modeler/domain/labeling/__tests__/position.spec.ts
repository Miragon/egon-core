import { describe, expect, it } from "vitest";

import {
    countLines,
    labelPosition,
    labelPositionX,
    labelPositionY,
    selectPartOfActivity,
} from "../position";

type Coordinate = { x: number; y: number };

function anglesGuardedAgainstOutOfRangeReads(values: number[]): number[] {
    return new Proxy(values, {
        get(target, property, receiver) {
            if (
                typeof property === "string" &&
                /^\d+$/.test(property) &&
                Number(property) >= target.length
            ) {
                throw new RangeError(`angle ${property} is out of range`);
            }
            return Reflect.get(target, property, receiver);
        },
    });
}

describe("countLines", () => {
    it.each([
        ["single line", 1],
        ["first\nsecond", 2],
        ["first\rsecond", 2],
        ["first\r\nsecond", 2],
        ["one\ntwo\rthree\r\nfour", 4],
    ])("counts line endings in %j", (text, expected) => {
        expect(countLines(text)).toBe(expected);
    });
});

describe("label coordinates", () => {
    it.each<[string, Coordinate, Coordinate, number, number]>([
        ["east", { x: 0, y: 0 }, { x: 100, y: 0 }, 50, 15],
        ["north", { x: 0, y: 100 }, { x: 0, y: 0 }, 0, 50],
        ["west", { x: 100, y: 0 }, { x: 0, y: 0 }, 50, 15],
        ["south", { x: 0, y: 0 }, { x: 0, y: 100 }, 0, 50],
        ["upper right", { x: 0, y: 10 }, { x: 10, y: 0 }, 2.5, 12.5],
        ["upper left", { x: 10, y: 10 }, { x: 0, y: 0 }, 7.5, 0],
        ["lower left", { x: 10, y: 0 }, { x: 0, y: 10 }, 7.5, 5],
        ["lower right", { x: 0, y: 0 }, { x: 10, y: 10 }, 2.5, 0],
    ])(
        "positions a %s segment",
        (_direction, start, end, expectedX, expectedY) => {
            expect(labelPositionX(start, end)).toBeCloseTo(expectedX);
            expect(labelPositionY(start, end)).toBeCloseTo(expectedY);
        },
    );

    it("scales the upper-left and lower-right vertical offsets by line count", () => {
        expect(labelPositionY({ x: 10, y: 10 }, { x: 0, y: 0 }, 3)).toBe(-10);
        expect(labelPositionY({ x: 0, y: 0 }, { x: 10, y: 10 }, 3)).toBe(-10);
    });

    it("positions a two-point path on segment zero", () => {
        expect(
            labelPosition(
                [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                ],
                2,
            ),
        ).toEqual({ x: 50, y: 15, selected: 0 });
    });

    it("positions a multi-segment path on the last qualifying segment", () => {
        expect(
            labelPosition([
                { x: 0, y: 0 },
                { x: 20, y: 20 },
                { x: 80, y: 20 },
                { x: 80, y: 40 },
                { x: 140, y: 40 },
            ]),
        ).toEqual({ x: 110, y: 55, selected: 3 });
    });

    it("does not mutate its waypoint input", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 60, y: 20 },
        ];
        const before = structuredClone(waypoints);

        labelPosition(waypoints, 2);

        expect(waypoints).toEqual(before);
    });
});

describe("selectPartOfActivity", () => {
    it("can select the last valid segment without reading a non-existent angle", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 20, y: 20 },
            { x: 80, y: 20 },
        ];
        const angles = anglesGuardedAgainstOutOfRangeReads([45, 0]);

        expect(selectPartOfActivity(waypoints, angles)).toBe(1);
    });

    it("selects the last of multiple qualifying horizontal segments", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 60, y: 20 },
            { x: 120, y: 20 },
        ];

        expect(selectPartOfActivity(waypoints, [0, 90, 0])).toBe(2);
    });

    it("does not qualify a segment that is exactly 49 pixels long", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 59, y: 10 },
        ];

        expect(selectPartOfActivity(waypoints, [45, 0])).toBe(0);
    });

    it("qualifies a horizontal segment running in the reverse direction", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 100, y: 20 },
            { x: 40, y: 20 },
        ];

        expect(selectPartOfActivity(waypoints, [45, 180])).toBe(1);
    });

    it("falls back to segment zero when no segment qualifies", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 30 },
        ];

        expect(selectPartOfActivity(waypoints, [0, 90])).toBe(0);
    });
});
