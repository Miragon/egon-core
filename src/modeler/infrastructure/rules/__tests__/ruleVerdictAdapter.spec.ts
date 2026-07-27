import { describe, expect, it } from "vitest";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import {
    ALLOWED,
    DENIED,
    allowedAs,
    ignored,
    noOpinion,
} from "../../../../story/domain/ruleVerdict";
import { toRuleResult } from "../ruleVerdictAdapter";

/**
 * Pins the verdict→diagram-js mapping, one case per kind. The two that matter
 * most are the last two: `noOpinion` must be `undefined` (defer to lower-priority
 * providers, which `Rules.allowed` then default-allows) and `ignored` must be
 * `null` (consumers such as `GlobalConnect` skip marking entirely). Folding them
 * together would let a global-connect drag start from a label, which is why the
 * verdict union has four members rather than three.
 */

describe("toRuleResult", () => {
    it("maps a bare allowance to true", () => {
        expect(toRuleResult(ALLOWED)).toBe(true);
    });

    it("maps a typed allowance to diagram-js connection attributes", () => {
        expect(toRuleResult(allowedAs(ElementTypes.ACTIVITY))).toEqual({
            type: ElementTypes.ACTIVITY,
        });
        expect(toRuleResult(allowedAs(ElementTypes.CONNECTION))).toEqual({
            type: ElementTypes.CONNECTION,
        });
    });

    it("maps a denial to false", () => {
        expect(toRuleResult(DENIED)).toBe(false);
    });

    it("maps a deferral to undefined, never to false", () => {
        expect(toRuleResult(noOpinion("noHoverTarget"))).toBeUndefined();
        expect(toRuleResult(noOpinion("noShapesSelected"))).toBeUndefined();
    });

    it("maps an ignored interaction to null, which is not undefined", () => {
        expect(toRuleResult(ignored("missingElement"))).toBeNull();
        expect(toRuleResult(ignored("labelOwnedByAnotherElement"))).toBeNull();
    });

    it("keeps null and undefined distinct across the two deferring kinds", () => {
        expect(toRuleResult(ignored("missingElement"))).not.toBe(
            toRuleResult(noOpinion("noHoverTarget")),
        );
    });
});
