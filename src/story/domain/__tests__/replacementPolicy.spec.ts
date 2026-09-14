import { describe, expect, it } from "vitest";

import { ElementTypes } from "../elementTypes";
import { isReplacementEligible } from "../replacementPolicy";

describe("isReplacementEligible", () => {
    it.each([
        [ElementTypes.ACTOR, "Person"],
        [ElementTypes.WORKOBJECT, "Document"],
    ] as const)("excludes the exact current %s type", (family, iconName) => {
        expect(
            isReplacementEligible(`${family}${iconName}`, family, iconName),
        ).toBe(false);
    });

    it("keeps overlapping icon names eligible", () => {
        expect(
            isReplacementEligible(
                ElementTypes.ACTOR + "SalesPerson",
                ElementTypes.ACTOR,
                "Person",
            ),
        ).toBe(true);
    });

    it("preserves case sensitivity", () => {
        expect(
            isReplacementEligible(
                ElementTypes.ACTOR + "person",
                ElementTypes.ACTOR,
                "Person",
            ),
        ).toBe(true);
    });

    it("does not collide across actor and work-object prefixes", () => {
        expect(
            isReplacementEligible(
                ElementTypes.WORKOBJECT + "Person",
                ElementTypes.ACTOR,
                "Person",
            ),
        ).toBe(true);
    });

    it.each([undefined, ElementTypes.ACTOR + "Customer"])(
        "keeps candidates for an unregistered or missing current type",
        (currentType) => {
            expect(
                isReplacementEligible(
                    currentType,
                    ElementTypes.ACTOR,
                    "Person",
                ),
            ).toBe(true);
        },
    );
});
