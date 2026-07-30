import { every, reduce } from "min-dash";
import { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import EventBus from "diagram-js/lib/core/EventBus";
import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import { isConnection } from "../../../story/domain/elementPredicates";
import {
    clampGroupBounds,
    judgeConnection,
    judgeCreation,
    judgeReconnect,
    judgeResize,
} from "../../../story/domain/modelingRules";
import {
    ALLOWED,
    DENIED,
    RuleVerdict,
    allowedAs,
    noOpinion,
} from "../../../story/domain/ruleVerdict";
import { toRuleResult } from "./ruleVerdictAdapter";
import { getBusinessObject } from "../../../shared/infrastructure/util";

const HIGH_PRIORITY = 1500;

/**
 * diagram-js adapter for the Domain Storytelling notation grammar.
 *
 * WHY: the grammar itself lives in `story/domain/modelingRules` (pure and
 * tested); this class only wires it into diagram-js's rule protocol. Every rule
 * is registered through {@link DomainStoryRules.addVerdictRule}, which types the
 * callback as returning a `RuleVerdict` and funnels it through `toRuleResult` —
 * so a bare `return false`/`return undefined` inside a rule does not compile and
 * the wire mapping cannot drift per rule (issue #66; ADR 0015).
 *
 * What is left that the grammar cannot express: the in-place mutation of
 * `context.newBounds` that diagram-js's resize expects, and the per-action
 * *folds* over several elements — which differ, deliberately, in how they treat
 * a "no opinion" (see `elements.create` vs `elements.move`).
 */

/**
 * Narrows to a diagram-js `Connection` for callbacks that then read
 * `source`/`target`. The domain `isConnection` returns a plain boolean and so
 * cannot narrow the type; this thin wrapper restores the type guard.
 */
function isConnectionShape(element: Element): element is Connection {
    return isConnection(element);
}

export class DomainStoryRules extends RuleProvider {
    static override $inject: string[] = ["eventBus"];

    constructor(eventBus: EventBus) {
        super(eventBus);
    }

    override init() {
        this.addVerdictRule("elements.create", (context: any) => {
            const elements = context.elements,
                target = context.target;

            // Only an outright "allowed" passes here. A deferral collapses to
            // *denied* for a bulk create, unlike `elements.move` below where it
            // stays a deferral — that asymmetry is the historical behaviour
            // (min-dash `every` coerced the old `undefined` to falsy) and is
            // kept deliberately rather than silently "fixed".
            const everyElementAllowed = every(elements, (element: Element) => {
                if (isConnectionShape(element)) {
                    if (!element.source || !element.target) {
                        return false;
                    }
                    return (
                        judgeConnection(element.source, element.target).kind ===
                        "allowed"
                    );
                }

                return judgeCreation(element, target).kind === "allowed";
            });

            return everyElementAllowed ? ALLOWED : DENIED;
        });

        this.addVerdictRule("elements.move", HIGH_PRIORITY, (context: any) => {
            const target = context.target,
                shapes = context.shapes;

            // The idea of this code is to make sure that if any of the selected shapes cannot be moved,
            // then the whole selection cannot be moved. However, it actually only checks
            // if the shape under the mouse cursor is over another shape.
            // This is probably enough as a full detection over overlapping shapes might make it hard
            // to move large selections
            return reduce(
                shapes,
                (verdict: RuleVerdict, shape: Element) => {
                    if (verdict.kind === "denied") {
                        return verdict;
                    }
                    return judgeCreation(shape, target);
                },
                noOpinion("noShapesSelected"),
            );
        });

        this.addVerdictRule("shape.create", HIGH_PRIORITY, (context: any) => {
            const target = context.target,
                shape = context.shape;

            return judgeCreation(shape, target);
        });

        this.addVerdictRule(
            "connection.create",
            HIGH_PRIORITY,
            (context: any) => {
                const source = context.source,
                    target = context.target;

                return judgeConnection(source, target);
            },
        );

        this.addVerdictRule(
            "connection.reconnect",
            HIGH_PRIORITY,
            (context: any) => {
                const connection: Connection = context.connection,
                    source: Element = context.hover || context.source,
                    target: Element = context.target;

                return judgeReconnect(source, target, connection);
            },
        );

        this.addVerdictRule("shape.resize", (context: any) => {
            const shape: Shape = context.shape,
                newBounds: Shape = context.newBounds;

            // `getBusinessObject` preserves the historical reading of
            // `businessObject.type` (falling back to the element itself).
            const verdict = judgeResize(getBusinessObject(shape));
            if (verdict.kind !== "allowed") {
                return verdict;
            }

            // diagram-js resizes by mutating `newBounds` in place, so apply the
            // clamped bounds onto it rather than returning a new object.
            if (newBounds) {
                Object.assign(newBounds, clampGroupBounds(shape, newBounds));
            }

            return verdict;
        });

        this.addVerdictRule("connection.updateWaypoints", (context: any) => {
            return allowedAs(context.connection.type);
        });

        // CopyPaste.js requires this empty-looking rule to exist
        this.addVerdictRule("element.copy", () => ALLOWED);
    }

    /**
     * Registers a rule whose callback must answer with a {@link RuleVerdict},
     * translating it once through {@link toRuleResult}.
     *
     * WHY: this is the seam issue #66 slipped through. With the callback typed as
     * `=> RuleVerdict`, no rule can hand diagram-js a raw wire value — the
     * compiler rejects `return false` / `return undefined` — so every answer
     * passes the exhaustive mapping and an unnamed "no opinion" (which
     * `Rules.allowed` would read as *allowed*) becomes impossible to write.
     */
    private addVerdictRule(
        action: string,
        judge: (context: any) => RuleVerdict,
    ): void;
    private addVerdictRule(
        action: string,
        priority: number,
        judge: (context: any) => RuleVerdict,
    ): void;
    private addVerdictRule(
        action: string,
        priorityOrJudge: number | ((context: any) => RuleVerdict),
        maybeJudge?: (context: any) => RuleVerdict,
    ): void {
        const judge =
            typeof priorityOrJudge === "number"
                ? (maybeJudge as (context: any) => RuleVerdict)
                : priorityOrJudge;
        const rule = (context: any) => toRuleResult(judge(context));

        if (typeof priorityOrJudge === "number") {
            this.addRule(action, priorityOrJudge, rule);
        } else {
            this.addRule(action, rule);
        }
    }
}
