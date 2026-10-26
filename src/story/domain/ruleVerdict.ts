import { ElementTypes } from "./elementTypes";

/**
 * The grammar's answer to a modeling action. diagram-js has four rule answers,
 * and `null` ("ignore entirely") is not `undefined` ("no opinion", which
 * default-allows). Naming the outcome and mapping it to wire values in one
 * adapter (`ruleVerdictAdapter`) turns a missed case into a compile error
 * (ADR ARC-3). No rule answers `ignored` yet; it stays so `null` cannot
 * collapse onto `undefined`.
 */

/**
 * Enumerated so an adapter can only defer for a situation the grammar names.
 */
export type NoOpinionReason = "noHoverTarget" | "noShapesSelected";

/** The only situations in which an interaction is not ours to judge at all. */
export type IgnoredReason = "missingElement" | "labelOwnedByAnotherElement";

export type RuleVerdict =
    | { readonly kind: "allowed"; readonly connectionType?: ElementTypes }
    | { readonly kind: "denied" }
    | { readonly kind: "noOpinion"; readonly reason: NoOpinionReason }
    | { readonly kind: "ignored"; readonly reason: IgnoredReason };

export const ALLOWED: RuleVerdict = { kind: "allowed" };

export const DENIED: RuleVerdict = { kind: "denied" };

/**
 * diagram-js carries the attributes straight into the created connection, so
 * the type travels with the verdict.
 */
export function allowedAs(connectionType: ElementTypes): RuleVerdict {
    return { kind: "allowed", connectionType };
}

/** No opinion: leave the decision to lower-priority rule providers. */
export function noOpinion(reason: NoOpinionReason): RuleVerdict {
    return { kind: "noOpinion", reason };
}

/** Not our interaction to judge; consumers should skip it entirely. */
export function ignored(reason: IgnoredReason): RuleVerdict {
    return { kind: "ignored", reason };
}
