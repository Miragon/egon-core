import { every, reduce } from "min-dash";
import { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import EventBus from "diagram-js/lib/core/EventBus";
import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import { isConnection, isGroup } from "../../../story/domain/elementPredicates";
import {
    canConnect,
    canConnectToAnnotation,
    canCreate,
    canResize,
    canStartConnection,
    clampGroupBounds,
} from "../../../story/domain/modelingRules";
import { getBusinessObject } from "../../../shared/infrastructure/util";

const HIGH_PRIORITY = 1500;

/**
 * diagram-js adapter for the Domain Storytelling notation grammar.
 *
 * WHY: the grammar itself lives in `story/domain/modelingRules` (pure and
 * tested); this class only wires it into diagram-js's rule protocol and
 * preserves the two framework-specific contracts the pure functions cannot
 * express — the legacy `undefined` tri-state that `elements.move` depends on
 * (returning `false` would forbid moving a non-group over empty canvas), and the
 * in-place mutation of `context.newBounds` that diagram-js's resize expects.
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
        this.addRule("elements.create", (context) => {
            const elements = context.elements,
                target = context.target;

            return every(elements, (element: Element) => {
                if (isConnectionShape(element)) {
                    if (!element.source || !element.target) {
                        return false;
                    }
                    return canConnect(element.source, element.target);
                }

                return this.canCreate(element, target);
            });
        });

        this.addRule("elements.move", HIGH_PRIORITY, (context: any) => {
            const target = context.target,
                shapes = context.shapes;

            // The idea of this code is to make sure that if any of the selected shapes cannot be moved,
            // then the whole selection cannot be moved. However, it actually only checks
            // if the shape under the mouse cursor is over another shape.
            // This is probably enough as a full detection over overlapping shapes might make it hard
            // to move large selections
            return reduce(
                shapes,
                (result: any, s: Element) => {
                    if (result === false) {
                        return false;
                    }
                    return this.canCreate(s, target);
                },
                undefined,
            );
        });

        this.addRule("shape.create", HIGH_PRIORITY, (context: any) => {
            const target = context.target,
                shape = context.shape;

            return this.canCreate(shape, target);
        });

        this.addRule("connection.create", HIGH_PRIORITY, (context) => {
            const source = context.source,
                target = context.target;

            return canConnect(source, target);
        });

        this.addRule("connection.reconnect", HIGH_PRIORITY, (context: any) => {
            const connection: Connection = context.connection,
                source: Element = context.hover || context.source,
                target: Element = context.target;

            const result = canConnectToAnnotation(source, target, connection);

            if (!result) {
                return undefined;
            }

            return canConnect(source, target);
        });

        this.addRule("shape.resize", function (context: any) {
            const shape: Shape = context.shape,
                newBounds: Shape = context.newBounds;

            // `getBusinessObject` preserves the historical reading of
            // `businessObject.type` (falling back to the element itself).
            if (!canResize(getBusinessObject(shape))) {
                return false;
            }

            // diagram-js resizes by mutating `newBounds` in place, so apply the
            // clamped bounds onto it rather than returning a new object.
            if (newBounds) {
                Object.assign(newBounds, clampGroupBounds(shape, newBounds));
            }

            return true;
        });

        this.addRule("connection.start", function (context: any) {
            const source = context.source;

            return canStartConnection(source);
        });

        this.addRule("connection.updateWaypoints", function (context: any) {
            return {
                type: context.connection.type,
            };
        });

        // CopyPaste.js requires this empty-looking rule to exist
        this.addRule("element.copy", function () {
            return true;
        });
    }

    /**
     * Bridges the pure `canCreate` to diagram-js's tri-state: with no hover
     * target the move/create rules must return `undefined` ("keep evaluating"),
     * not `false`, unless the shape is a group (always allowed). A naive
     * strict-boolean rewrite here would forbid moving a plain shape over empty
     * canvas.
     */
    private canCreate(shape: Element, target: Element) {
        if (!target) {
            return isGroup(shape) ? true : undefined;
        }
        return canCreate(shape, target);
    }
}
