import { ElementTypes } from "../../../story/domain/elementTypes";
import { RuleVerdict } from "../../../story/domain/ruleVerdict";

/**
 * The single translation point between the grammar's {@link RuleVerdict} and
 * diagram-js' rule protocol.
 *
 * WHY one point: `Rules.allowed` collapses four rule return values onto three
 * meanings, and one of them (`undefined` → allowed) silently permits whatever a
 * rule forgot to deny — issue #66. Funnelling every rule through this switch
 * means the mapping is written once, reviewed once, and — because the switch is
 * exhaustive over a discriminated union with no `default` — a new verdict kind
 * or a deleted arm breaks the build instead of leaking a default-allow. See
 * ADR 0015.
 */

/** The four values diagram-js' `Rules.allowed` distinguishes. */
export type DiagramJsRuleResult =
    boolean | { type: ElementTypes } | null | undefined;

/**
 * Maps a verdict onto diagram-js' wire value. The missing `default` arm is
 * deliberate and load-bearing: `noImplicitReturns` (tsconfig.json) reports
 * "Not all code paths return a value" as soon as one kind is unhandled. Adding
 * a `default` — or dropping the flag — silently disables the lock, because
 * `undefined` is assignable to the declared return type.
 */
export function toRuleResult(verdict: RuleVerdict): DiagramJsRuleResult {
    switch (verdict.kind) {
        case "allowed":
            // The attributes object doubles as the created connection's type;
            // a bare `true` is "allowed, nothing to configure".
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
