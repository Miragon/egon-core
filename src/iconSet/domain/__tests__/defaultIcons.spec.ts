import { describe, expect, it } from "vitest";

import { defaultIcons } from "../defaultIcons";

describe("defaultIcons", () => {
    it("exposes the frozen demo-derived starter pack", () => {
        expect(defaultIcons.name).toBe("egon-default");
        expect(Object.keys(defaultIcons.actors ?? {})).toEqual(["Person"]);
        expect(Object.keys(defaultIcons.workObjects ?? {})).toEqual([
            "Document",
        ]);
        expect(defaultIcons.actors?.["Person"]).toContain(
            "M12 4a4 4 0 1 1 0 8",
        );
        expect(defaultIcons.workObjects?.["Document"]).toContain(
            "M6 2h8l6 6v16",
        );
        expect(Object.isFrozen(defaultIcons)).toBe(true);
        expect(Object.isFrozen(defaultIcons.actors)).toBe(true);
        expect(Object.isFrozen(defaultIcons.workObjects)).toBe(true);
    });
});
