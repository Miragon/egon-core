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

/** The domain `isConnection` returns a boolean; this adds the type guard. */
function isConnectionShape(element: Element): element is Connection {
    return isConnection(element);
}

/**
 * Wires the grammar in `story/domain/modelingRules` into diagram-js' rule
 * protocol (ADR ARC-3). Only the `newBounds` mutation and the multi-element
 * folds live here.
 */
export class DomainStoryRules extends RuleProvider {
    static override $inject: string[] = ["eventBus"];

    constructor(eventBus: EventBus) {
        super(eventBus);
    }

    override init() {
        this.addVerdictRule("elements.create", (context: any) => {
            const elements = context.elements,
                target = context.target;

            // A deferral counts as denied here but stays a deferral in
            // `elements.move`; that long-standing asymmetry is kept on purpose.
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

            // Only checks the target under the cursor; full overlap detection
            // would make large selections hard to move.
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

            const verdict = judgeResize(getBusinessObject(shape));
            if (verdict.kind !== "allowed") {
                return verdict;
            }

            // diagram-js reads `newBounds` back, so mutate it in place.
            if (newBounds) {
                Object.assign(newBounds, clampGroupBounds(shape, newBounds));
            }

            return verdict;
        });

        this.addVerdictRule("connection.updateWaypoints", (context: any) => {
            return allowedAs(context.connection.type);
        });

        // CopyPaste requires this rule to exist.
        this.addVerdictRule("element.copy", () => ALLOWED);
    }

    /**
     * Typed `=> RuleVerdict` so no rule can return a raw `undefined`, which
     * `Rules.allowed` would read as allowed.
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
