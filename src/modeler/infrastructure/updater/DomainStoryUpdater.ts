import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";
import EventBus from "diagram-js/lib/core/EventBus";
import CroppingConnectionDocking from "diagram-js/lib/layout/CroppingConnectionDocking";
import { Point } from "diagram-js/lib/util/Types";
import { assign, pick } from "min-dash";
import { Connection, Shape } from "diagram-js/lib/model/Types";
import { reworkGroupElements } from "../../../shared/infrastructure/util";
import { isBackground, isGroup } from "../../../story/domain/elementPredicates";

export class DomainStoryUpdater extends CommandInterceptor {
    static override $inject: string[] = ["eventBus", "connectionDocking"];

    constructor(
        eventBus: EventBus,
        private readonly connectionDocking: CroppingConnectionDocking,
    ) {
        super(eventBus);

        // cropping must be done before updateElement
        // do not change the order of these .executed calls
        this.executed(
            ["connection.layout", "connection.create"],
            this.cropConnection(),
        );

        this.reverted(["connection.layout"], function (e) {
            delete e.context.cropped;
        });

        const SHAPE_COMMANDS = [
            "shape.create",
            "shape.move",
            "shape.delete",
            "shape.resize",
        ];

        this.executed(SHAPE_COMMANDS, this.updateElement());

        this.reverted(SHAPE_COMMANDS, this.updateElement());

        this.executed(
            [
                "connection.create",
                "connection.reconnect",
                "connection.updateWaypoints",
                "connection.delete",
                "connection.layout",
                "connection.move",
            ],
            this.updateConnection(),
        );

        this.reverted(
            [
                "connection.create",
                "connection.reconnect",
                "connection.updateWaypoints",
                "connection.delete",
                "connection.layout",
                "connection.move",
            ],
            this.updateConnection(),
        );
    }

    private updateElement(): (event: any) => void {
        return (event: any) => {
            const context = event.context,
                shape: Shape = context.shape;

            if (!shape) {
                return;
            }
            const businessObject = shape.businessObject;
            const parent = shape.parent;

            // save element position
            assign(businessObject, pick(shape, ["x", "y"]));

            if (isGroup(shape)) {
                // save element size if resizable
                assign(businessObject, pick(shape, ["height", "width"]));

                // to rework the child-parent relations if a group was moved, such that all Objects that are visually in the group are also associated with it
                // since we do not have access to the standard-canvas object here, we cannot use the function correctGroupChildren() from DSLabelUtil
                //
                // A group-teardown move is bookkeeping, not a user gesture: the
                // delta is 0, so nothing changed geometrically, and re-adopting
                // here would mutate parent/children outside the command stack
                // and survive the undo the teardown exists to make possible.
                if (parent && !context.hints?.groupTeardown) {
                    if (isBackground(parent) || isGroup(parent)) {
                        reworkGroupElements(parent, shape);
                    } else {
                        // the group is created on top of a shape or connection which makes it their child; we need to invert the child-parent relationship
                        shape.parent = parent.parent;
                        reworkGroupElements(parent.parent, shape);
                    }
                }
            }
            // Group membership is persisted, so a shape lifted out of a group
            // must have it cleared — otherwise the export keeps naming a group
            // the shape left, or one that no longer exists. Read `shape.parent`,
            // not the `parent` const: the branch above may just have reassigned it.
            if (shape.parent && isGroup(shape.parent)) {
                assign(businessObject, {
                    parent: shape.parent.id,
                });
            } else {
                delete businessObject.parent;
            }
        };
    }

    private updateConnection(): (event: any) => void {
        return (event: any) => {
            const context = event.context,
                connection: Connection = context.connection,
                businessObject = connection.businessObject;

            // Read the ends off the connection itself. A reconnect has already
            // written them there by the time `executed`/`reverted` runs, and the
            // `context.newSource`/`newTarget` the handler uses are on the
            // context, never on the event.
            const source = connection.source,
                target = connection.target;

            // update waypoints
            assign(businessObject, {
                waypoints: this.copyWaypoints(connection),
            });

            if (source) {
                if (!businessObject.source) {
                    assign(businessObject, { source: source.id });
                } else {
                    businessObject.source = source.id;
                }
            }
            if (target) {
                if (!businessObject.target) {
                    assign(businessObject, { target: target.id });
                } else {
                    businessObject.target = target.id;
                }
            }
        };
    }

    // crop connection ends during create/update
    private cropConnection(): (event: any) => void {
        return (event: any) => {
            const context = event.context,
                hints = context.hints || {};

            if (!context.cropped && hints.createElementsBehavior !== false) {
                const connection: Connection = context.connection;
                connection.waypoints =
                    this.connectionDocking.getCroppedWaypoints(
                        connection,
                        connection.source,
                        connection.target,
                    );
                context.cropped = true;
            }
        };
    }

    private copyWaypoints(connection: Connection): Point[] {
        return connection.waypoints.map(function (p) {
            // @ts-expect-error Property original does exist on type Point
            const original: Point | undefined = p.original;

            if (original) {
                return {
                    original: {
                        x: original.x,
                        y: original.y,
                    },
                    x: p.x,
                    y: p.y,
                };
            } else {
                return {
                    x: p.x,
                    y: p.y,
                };
            }
        });
    }
}
