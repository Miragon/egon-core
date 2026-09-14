import { describe, expect, it } from "vitest";
import { isTopLeftInsideGroup } from "../groupMembership";

describe("groupMembership", () => {
    const group = { x: 100, y: 200, width: 300, height: 250 };

    it.each([
        ["top-left", { x: 100, y: 200 }],
        ["top-right", { x: 400, y: 200 }],
        ["bottom-left", { x: 100, y: 450 }],
        ["bottom-right", { x: 400, y: 450 }],
        ["interior", { x: 250, y: 325 }],
    ])("includes the %s boundary or interior point", (_name, candidate) => {
        expect(isTopLeftInsideGroup(candidate, group)).toBe(true);
    });

    it.each([
        ["left", { x: 99, y: 325 }],
        ["right", { x: 401, y: 325 }],
        ["above", { x: 250, y: 199 }],
        ["below", { x: 250, y: 451 }],
    ])("excludes a point immediately %s of the group", (_name, candidate) => {
        expect(isTopLeftInsideGroup(candidate, group)).toBe(false);
    });

    it("uses only the candidate's top-left corner", () => {
        expect(
            isTopLeftInsideGroup(
                { x: group.x + group.width, y: group.y + group.height },
                group,
            ),
        ).toBe(true);
    });
});
