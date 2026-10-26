import EventBus from "diagram-js/lib/core/EventBus";
import CommandHandler from "diagram-js/lib/command/CommandHandler";
import { CommandContext } from "diagram-js/lib/command/CommandStack";
import {
    Connection,
    Element,
    ElementLike,
    Parent,
    Shape,
} from "diagram-js/lib/model/Types";
import { isConnection } from "diagram-js/lib/util/ModelUtil";
import { Point } from "diagram-js/lib/util/Types";
import { isAnnotation } from "../../../../story/domain/elementPredicates";
import { DomainStoryModeling } from "../../modeling/DomainStoryModeling";

export class ElementColorChangeHandler implements CommandHandler {
    static $inject: string[] = ["eventBus"];

    constructor(private readonly eventBus: EventBus) {}

    preExecute(context: CommandContext) {
        context.oldColor = context.businessObject.pickedColor;

        if (isAnnotation(context.businessObject)) {
            const connection = context.element.incoming[0];
            context.annotationConnection = connection;
            context.oldAnnotationConnectionColor =
                connection?.businessObject.pickedColor;
        }
    }

    execute(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element: Element = context.element;

        if (context.annotationConnection) {
            context.annotationConnection.businessObject.pickedColor =
                context.newColor;
            this.eventBus.fire("element.changed", {
                element: context.annotationConnection,
            });
        }

        semantic.pickedColor = context.newColor;

        this.eventBus.fire("element.changed", { element });

        return [
            {
                id: element.id,
                businessObject: semantic,
            },
        ];
    }

    revert(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element: Element = context.element;

        if (context.annotationConnection) {
            context.annotationConnection.businessObject.pickedColor =
                context.oldAnnotationConnectionColor;
            this.eventBus.fire("element.changed", {
                element: context.annotationConnection,
            });
        }

        semantic.pickedColor = context.oldColor;

        this.eventBus.fire("element.changed", { element });

        return [
            {
                id: element.id,
                businessObject: semantic,
            },
        ];
    }
}

/** Lifting a child out of the group is bookkeeping, not a drag: nothing moves. */
const NO_MOVE: Point = { x: 0, y: 0 };

/**
 * "Remove Group without Child-Elements": drops the group but keeps its children.
 *
 * preExecute-only: nested commands share the outer action id, so the teardown is
 * one undo entry and diagram-js' handlers own the inverse.
 * - Children move out first: `DeleteShapeHandler.preExecute` `saveClear`s them.
 * - `layout: false`: `BaseLayouter` would flatten every bendpoint to two points.
 * - Connections move separately: `MoveHelper.moveClosure` never re-parents them.
 *   `isConnection` is diagram-js' (`waypoints` check); the domain predicate
 *   would misread activities as shapes.
 * - `groupTeardown` tells `DomainStoryUpdater` to skip group re-adoption.
 */
export class RemoveGroupWithoutChildrenHandler implements CommandHandler {
    static $inject: string[] = ["modeling"];

    constructor(private readonly modeling: DomainStoryModeling) {}

    preExecute(context: CommandContext) {
        const group: Shape = context.element;
        const newParent: Parent | undefined = group.parent;

        // Snapshot: every move splices the child out of `group.children`.
        group.children.slice().forEach((child: Element) => {
            if (isConnection(child)) {
                this.modeling.moveConnection(
                    child as Connection,
                    NO_MOVE,
                    newParent,
                );
            } else {
                this.modeling.moveShape(
                    child as Shape,
                    NO_MOVE,
                    newParent,
                    undefined,
                    { recurse: false, layout: false, groupTeardown: true },
                );
            }
        });

        this.modeling.removeElements([group]);
    }
}
