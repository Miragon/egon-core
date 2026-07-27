import { ElementTypes } from "./elementTypes";

/**
 * The answer the Domain Storytelling grammar gives when asked to judge a
 * modeling action.
 *
 * WHY: the grammar and its diagram-js adapter used to speak three different
 * ad-hoc dialects (`boolean`, `false | { type }`, `null | false`), and the
 * adapter was free to return whatever it liked into diagram-js' four-valued rule
 * protocol with no compiler check that the two agreed. That gap is how issue #66
 * happened: the grammar said "forbidden", the adapter returned `undefined`, and
 * `Rules.allowed` reads `undefined` as "nobody objected" — so a forbidden
 * activity↔annotation edge was accepted. Naming the *outcome* here, and
 * translating it to wire values at exactly one place
 * (`rules/ruleVerdictAdapter`), turns an unhandled case into a compile error.
 *
 * The union has four members because diagram-js distinguishes four answers, and
 * `null` is not `undefined`: `null` means "ignore this interaction entirely"
 * (consumers such as `GlobalConnect` skip their OK/NOT_OK marker), while
 * `undefined` means "no opinion, ask lower-priority providers" and ultimately
 * default-allows. This module never names those wire values — see ADR 0015.
 */

/**
 * The only situations in which deferring to lower-priority providers is
 * legitimate. Enumerating them is the point: an adapter can no longer defer
 * "just because", it must name a situation the grammar already recognises.
 */
export type NoOpinionReason = "noHoverTarget" | "noShapesSelected";

/** The only situations in which an interaction is not ours to judge at all. */
export type IgnoredReason = "missingElement" | "labelOwnedByAnotherElement";

export type RuleVerdict =
    | { readonly kind: "allowed"; readonly connectionType?: ElementTypes }
    | { readonly kind: "denied" }
    | { readonly kind: "noOpinion"; readonly reason: NoOpinionReason }
    | { readonly kind: "ignored"; readonly reason: IgnoredReason };

/** Allowed without further qualification. */
export const ALLOWED: RuleVerdict = { kind: "allowed" };

/** Denied — the grammar forbids this action outright. */
export const DENIED: RuleVerdict = { kind: "denied" };

/**
 * Allowed, and the resulting connection is of `connectionType`. diagram-js
 * carries the attributes object straight into the created connection, which is
 * why the type travels with the verdict rather than being looked up again.
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
