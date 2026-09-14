import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";
import Canvas from "diagram-js/lib/core/Canvas";
import EventBus from "diagram-js/lib/core/EventBus";
import CroppingConnectionDocking from "diagram-js/lib/layout/CroppingConnectionDocking";
import { Point } from "diagram-js/lib/util/Types";
import { assign, pick } from "min-dash";
import { Connection, Element, Parent, Shape } from "diagram-js/lib/model/Types";
import { isConnection } from "diagram-js/lib/util/ModelUtil";
import { isBackground, isGroup } from "../../../story/domain/elementPredicates";
import { isTopLeftInsideGroup } from "../../../story/domain/groupMembership";
import { DomainStoryModeling } from "../modeling/DomainStoryModeling";

const NO_MOVE: Point = { x: 0, y: 0 };

interface AdoptionHints {
    groupAdoption?: boolean;
    groupTeardown?: boolean;
}

export class DomainStoryUpdater extends CommandInterceptor {
    static override $inject: string[] = [
        "eventBus",
        "connectionDocking",
        "modeling",
        "canvas",
    ];

    private movementDepth = 0;
    private creationDepth = 0;
    private readonly pendingGroups: Shape[] = [];
    private readonly pendingGroupIds = new Set<string>();

    constructor(
        eventBus: EventBus,
        private readonly connectionDocking: CroppingConnectionDocking,
        private readonly modeling: DomainStoryModeling,
        private readonly canvas: Canvas,
    ) {
        super(eventBus);

        // A group dropped on a shape or connection must live beside that
        // element, not underneath it. Do this before diagram-js snapshots the
        // old/new parents so its own handlers can provide the inverse.
        this.preExecute("shape.create", this.normalizeCreateParent());
        this.preExecute("shape.move", this.normalizeMoveParent());
        this.preExecute("elements.move", this.normalizeElementsMoveParent());

        // A bulk create (notably paste) contains nested shape.create commands.
        // Wait for all of them so adoption sees one stable sibling snapshot.
        this.preExecute("elements.create", () => {
            this.creationDepth++;
        });
        this.preExecute("shape.create", this.beginShapeCreation());
        this.postExecuted("shape.create", this.finishShapeCreation());
        this.postExecuted("elements.create", () => {
            this.creationDepth--;
            this.adoptPendingGroupsWhenReady();
        });

        // elements.move fans out into shape.move commands in its postExecute.
        // Queue every moved group in first-seen order and adopt only after the
        // outermost movement has finished, so selected descendants move once.
        this.preExecute("elements.move", this.beginElementsMove());
        this.preExecute("shape.move", this.beginShapeMove());
        this.postExecuted("shape.move", this.finishShapeMove());
        this.postExecuted("elements.move", this.finishElementsMove());

        this.postExecuted("shape.resize", (event: any) => {
            if (isGroup(event.context.shape)) {
                this.queueGroup(event.context.shape);
                this.adoptPendingGroupsWhenReady();
            }
        });

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
            // save element position
            assign(businessObject, pick(shape, ["x", "y"]));

            if (isGroup(shape)) {
                // save element size if resizable
                assign(businessObject, pick(shape, ["height", "width"]));
            }
            // Group membership is persisted, so a shape lifted out of a group
            // must have it cleared — otherwise the export keeps naming a group
            // the shape left, or one that no longer exists.
            if (shape.parent && isGroup(shape.parent)) {
                assign(businessObject, {
                    parent: shape.parent.id,
                });
            } else {
                delete businessObject.parent;
            }
        };
    }

    private normalizeCreateParent(): (event: any) => void {
        return (event: any) => {
            const context = event.context;
            if (!isGroup(context.shape)) {
                return;
            }

            context.parent = this.normalizedGroupParent(
                context.parent,
                context.shape,
                context.shape.parent,
            );
        };
    }

    private normalizeMoveParent(): (event: any) => void {
        return (event: any) => {
            const context = event.context;
            if (
                this.isInternalMove(context.hints) ||
                !isGroup(context.shape) ||
                !context.newParent
            ) {
                return;
            }

            context.newParent = this.normalizedGroupParent(
                context.newParent,
                context.shape,
                context.shape.parent,
            );
        };
    }

    private normalizeElementsMoveParent(): (event: any) => void {
        return (event: any) => {
            const context = event.context;
            if (this.isInternalMove(context.hints)) {
                return;
            }

            const groups = (context.shapes ?? []).filter((shape: Shape) =>
                isGroup(shape),
            );
            if (!groups.length || !context.newParent) {
                return;
            }

            // A bulk move has one shared new parent. If its target lies below
            // any selected group, retaining that group's current parent is the
            // only cycle-free interpretation of the drop.
            const cyclicGroup = groups.find((group: Shape) =>
                this.isSelfOrDescendant(context.newParent, group),
            );
            if (cyclicGroup) {
                context.newParent = cyclicGroup.parent;
                return;
            }

            context.newParent = this.normalizedGroupParent(
                context.newParent,
                groups[0],
                groups[0].parent,
            );
        };
    }

    private beginShapeCreation(): (event: any) => void {
        return (event: any) => {
            this.creationDepth++;
            if (isGroup(event.context.shape)) {
                this.queueGroup(event.context.shape);
            }
        };
    }

    private finishShapeCreation(): () => void {
        return () => {
            this.creationDepth--;
            this.adoptPendingGroupsWhenReady();
        };
    }

    private beginElementsMove(): (event: any) => void {
        return (event: any) => {
            if (this.isInternalMove(event.context.hints)) {
                return;
            }

            this.movementDepth++;
            (event.context.shapes ?? []).forEach((shape: Shape) => {
                if (isGroup(shape)) {
                    this.queueGroup(shape);
                }
            });
        };
    }

    private finishElementsMove(): (event: any) => void {
        return (event: any) => {
            if (this.isInternalMove(event.context.hints)) {
                return;
            }

            this.movementDepth--;
            this.adoptPendingGroupsWhenReady();
        };
    }

    private beginShapeMove(): (event: any) => void {
        return (event: any) => {
            if (this.isInternalMove(event.context.hints)) {
                return;
            }

            this.movementDepth++;
            if (isGroup(event.context.shape)) {
                this.queueGroup(event.context.shape);
            }
        };
    }

    private finishShapeMove(): (event: any) => void {
        return (event: any) => {
            if (this.isInternalMove(event.context.hints)) {
                return;
            }

            this.movementDepth--;
            this.adoptPendingGroupsWhenReady();
        };
    }

    private queueGroup(group: Shape): void {
        if (this.pendingGroupIds.has(group.id)) {
            return;
        }

        this.pendingGroupIds.add(group.id);
        this.pendingGroups.push(group);
    }

    private adoptPendingGroupsWhenReady(): void {
        if (this.movementDepth || this.creationDepth) {
            return;
        }

        while (this.pendingGroups.length) {
            const group = this.pendingGroups.shift()!;
            this.pendingGroupIds.delete(group.id);
            this.adoptEligibleSiblings(group);
        }
    }

    private adoptEligibleSiblings(group: Shape): void {
        const parent = group.parent;
        if (!parent || (!isBackground(parent) && !isGroup(parent))) {
            return;
        }

        const ancestors = new Set<Element>();
        let ancestor: Parent | undefined = group.parent;
        while (ancestor && !ancestors.has(ancestor)) {
            ancestors.add(ancestor);
            ancestor = ancestor.parent;
        }

        // Snapshot before moving: every move mutates parent.children, and the
        // original order is required both for adoption and exact undo restore.
        parent["children"].slice().forEach((candidate: Element) => {
            if (
                candidate === group ||
                candidate.parent !== parent ||
                isConnection(candidate) ||
                ancestors.has(candidate) ||
                !isTopLeftInsideGroup(candidate as Shape, group)
            ) {
                return;
            }

            this.modeling.moveShape(
                candidate as Shape,
                NO_MOVE,
                group,
                undefined,
                {
                    recurse: false,
                    layout: false,
                    groupAdoption: true,
                },
            );
        });
    }

    private normalizedGroupParent(
        target: Parent | undefined,
        group: Shape,
        fallback: Parent | undefined,
    ): Parent | undefined {
        const safeFallback = this.safeGroupParent(fallback, group);

        if (!target || this.isSelfOrDescendant(target, group)) {
            return safeFallback;
        }

        let candidate: Parent | undefined = target;
        while (candidate && !isBackground(candidate) && !isGroup(candidate)) {
            candidate = candidate.parent;
        }

        return candidate && !this.isSelfOrDescendant(candidate, group)
            ? candidate
            : safeFallback;
    }

    private safeGroupParent(
        candidate: Parent | undefined,
        group: Shape,
    ): Parent {
        let current = candidate;

        while (
            current &&
            !this.isSelfOrDescendant(current, group) &&
            !isBackground(current) &&
            !isGroup(current)
        ) {
            current = current.parent;
        }

        if (current && !this.isSelfOrDescendant(current, group)) {
            return current;
        }

        return this.canvas.getRootElement() as Parent;
    }

    private isSelfOrDescendant(
        possibleDescendant: Parent | undefined,
        group: Shape,
    ): boolean {
        let current: Parent | undefined = possibleDescendant;
        const seen = new Set<Parent>();

        while (current && !seen.has(current)) {
            if (current === group) {
                return true;
            }
            seen.add(current);
            current = current.parent;
        }

        return false;
    }

    private isInternalMove(hints: AdoptionHints | undefined): boolean {
        return !!(hints?.groupAdoption || hints?.groupTeardown);
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
