import { ElementTypes } from "../../../story/domain/elementTypes";
import { RuleVerdict } from "../../../story/domain/ruleVerdict";

/** The four values diagram-js' `Rules.allowed` distinguishes. */
export type DiagramJsRuleResult =
    boolean | { type: ElementTypes } | null | undefined;

/**
 * The only translation to diagram-js' wire value (ADR ARC-3). No `default` arm on
 * purpose: with `noImplicitReturns` an unhandled kind fails the build instead of
 * returning `undefined`, which `Rules.allowed` reads as allowed.
 */
export function toRuleResult(verdict: RuleVerdict): DiagramJsRuleResult {
    switch (verdict.kind) {
        case "allowed":
            // The attributes object sets the created connection's type.
            return verdict.connectionType
                ? { type: verdict.connectionType }
                : true;
        case "denied":
            return false;
        case "noOpinion":
            return undefined;
        case "ignored":
            return null;
    }
}
