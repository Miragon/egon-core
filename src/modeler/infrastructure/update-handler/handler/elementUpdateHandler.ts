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
    }

    execute(context: CommandContext): ElementLike[] {
        const semantic = context.businessObject;
        const element: Element = context.element;

        if (isAnnotation(semantic) && element.incoming[0]) {
            element.incoming[0].businessObject.pickedColor = context.newColor;
            this.eventBus.fire("element.changed", {
                element: element.incoming[0],
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

        if (isAnnotation(semantic) && element.incoming[0]) {
            element.incoming[0].businessObject.pickedColor = context.oldColor;
            this.eventBus.fire("element.changed", {
                element: element.incoming[0],
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
 * "Remove Group without Child-Elements": drops the group's frame but keeps what
 * it contained.
 *
 * WHY preExecute-only, with no `execute`/`revert` of its own: nested
 * `commandStack.execute` calls inherit the outer action id, so the whole
 * teardown collapses into **one** undo entry — and diagram-js' own handlers then
 * own both the graphics re-parenting and the inverse. The previous
 * implementation hand-rolled both (`document.querySelector` SVG surgery) and got
 * undo wrong in every way it could.
 *
 * Three details the order and the hints encode:
 * - children move out **before** the group is removed, because
 *   `DeleteShapeHandler.preExecute` `saveClear`s `shape.children`;
 * - `layout: false` keeps `MoveShapeHandler.postExecute` from re-laying-out the
 *   attached activities — `BaseLayouter` returns two points and would flatten
 *   every bendpoint into the saved file;
 * - connections are moved separately because `MoveHelper.moveClosure` never
 *   re-parents them, so an activity parented to the group would be deleted with
 *   it. `isConnection` here is diagram-js' (tests for `waypoints`), not the
 *   domain predicate, which only matches `ElementTypes.CONNECTION` and would
 *   misread every activity as a shape.
 *
 * `groupTeardown` is read by `DomainStoryUpdater`, which skips its geometric
 * group re-adoption for these moves — see there for why.
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
