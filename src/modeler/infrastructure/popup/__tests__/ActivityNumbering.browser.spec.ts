import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connection, Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import type { DomainStoryNumberingRegistry } from "../DomainStoryNumberingRegistry";

/**
 * Automatic activity numbering, end to end. A number is the product of several
 * services agreeing across the command stack, so mocking any of them tests the
 * mock; the arithmetic has its own domain spec.
 *
 * Browser tier (ADR TST-2): `modeling.*` reaches tiny-svg `translate()` →
 * `SVGSVGElement.createSVGTransform`, absent in jsdom.
 */
describe("activity numbering (browser)", () => {
    let modelers: TestModeler[] = [];

    afterEach(() => {
        modelers.forEach((modeler) => modeler.cleanup());
        modelers = [];
        vi.restoreAllMocks();
    });

    /** Registers the modeler for teardown; leaked canvases are what cost time. */
    function boot(): TestModeler {
        const modeler = createTestModeler();
        modelers.push(modeler);
        return modeler;
    }

    /** One actor plus `count` work objects, vertically spread so nothing overlaps. */
    function addStoryCast(
        modeler: TestModeler,
        count: number,
    ): { actor: Shape; workObjects: Shape[] } {
        const actor = addActor(modeler, { point: { x: 120, y: 120 } });
        const workObjects = Array.from({ length: count }, (_unused, index) =>
            addWorkObject(modeler, { point: { x: 450, y: 120 + index * 120 } }),
        );
        return { actor, workObjects };
    }

    function numberOf(activity: Connection): number | null | undefined {
        return activity.businessObject.number;
    }

    /**
     * The context `DomainStoryPopupService.handleUpdate` builds, reproduced
     * because its shape is the command-handler contract.
     */
    function editActivityThroughPopupFlow(
        modeler: TestModeler,
        activity: Connection,
        options: { label: string; number?: number; isMultiple?: boolean },
    ): void {
        const { label, number, isMultiple = false } = options;

        modeler.commandStack.execute("activity.changed", {
            businessObject: activity.businessObject,
            element: activity,
            newLabel: label,
            newNumber: number,
            newMultipleNumberAllowed: isMultiple,
        });
    }

    describe("automatic numbers", () => {
        it("numbers the first activity 1 during connection.create", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 1);

            const activity = connect(modeler, actor, workObjects[0])!;

            expect(numberOf(activity)).toBe(1);
            const gfx = modeler.container.querySelector(
                `[data-element-id="${activity.id}"]`,
            )!;
            expect(
                Array.from(gfx.querySelectorAll("text")).map(
                    (text) => text.textContent,
                ),
            ).toContain("1");
        });

        it("assigns the number without needing anything to be drawn", () => {
            // The write happens inside the command, so it is visible before any repaint.
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 1);
            let numberAtExecuted: number | null | undefined = "unset" as never;

            modeler.eventBus.on(
                "commandStack.connection.create.executed",
                (event: any) => {
                    numberAtExecuted = event.context.connection.businessObject
                        .number as number;
                },
            );

            connect(modeler, actor, workObjects[0]);

            expect(numberAtExecuted).toBe(1);
        });

        it("undo of connection.create takes the number back, redo re-mints it", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const first = connect(modeler, actor, workObjects[0])!;
            const second = connect(modeler, actor, workObjects[1])!;
            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);

            modeler.commandStack.undo();

            // `null`, not `undefined`: `JSON.stringify` drops `undefined`, and
            // every fixture persists `"number": null` for an unnumbered activity.
            expect(numberOf(second)).toBeNull();
            expect(numberOf(first)).toBe(1);

            modeler.commandStack.redo();

            // Redo re-fires `executed` but never `preExecute`.
            expect(numberOf(second)).toBe(2);
        });

        it("counts up for each following activity from an actor", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);

            const numbers = workObjects.map((workObject) =>
                numberOf(connect(modeler, actor, workObject)!),
            );

            expect(numbers).toEqual([1, 2, 3]);
        });

        it("refills the gap a deleted activity leaves before growing", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const activities = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            modeler.modeling.removeConnection(activities[1]);
            const replacement = connect(modeler, actor, workObjects[1])!;

            // The smallest unused number is reused rather than a fourth added.
            expect(numberOf(replacement)).toBe(2);
            expect([
                numberOf(activities[0]),
                numberOf(replacement),
                numberOf(activities[2]),
            ]).toEqual([1, 2, 3]);
        });

        it("leaves a work object→work object activity unnumbered", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const numbered = connect(modeler, actor, workObjects[0])!;

            const response = connect(modeler, workObjects[0], workObjects[1])!;

            // Only an activity whose source is an actor is a story step.
            expect(numberOf(response)).toBeNull();
            expect(numberOf(numbered)).toBe(1);
            const nextStep = connect(modeler, actor, workObjects[1])!;
            expect(numberOf(nextStep)).toBe(2);
        });
    });

    /**
     * Every route that can change which shape an activity starts at must be named
     * in the interceptor explicitly, so each gets a case.
     */
    describe("connection.reconnect", () => {
        it("clears the number when the source stops being an actor", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const activity = connect(modeler, actor, workObjects[0])!;
            expect(numberOf(activity)).toBe(1);

            modeler.modeling.reconnectStart(activity, workObjects[1], {
                x: workObjects[1].x + 37,
                y: workObjects[1].y + 37,
            });

            expect(activity.source).toBe(workObjects[1]);
            expect(numberOf(activity)).toBeNull();

            modeler.commandStack.undo();

            expect(activity.source).toBe(actor);
            expect(numberOf(activity)).toBe(1);
        });

        it("mints a number when the source becomes an actor", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            // Occupy 1 so a mint is visibly different from "the first number".
            connect(modeler, actor, workObjects[0]);
            const response = connect(modeler, workObjects[0], workObjects[1])!;
            expect(numberOf(response)).toBeNull();

            modeler.modeling.reconnectStart(response, actor, {
                x: actor.x + 37,
                y: actor.y + 37,
            });

            expect(numberOf(response)).toBe(2);

            modeler.commandStack.undo();

            expect(numberOf(response)).toBeNull();
        });

        it("leaves the number alone when only the target moves", () => {
            // The `== null` guard: re-pointing the far end is not a renumbering event.
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            connect(modeler, actor, workObjects[0]);
            const second = connect(modeler, actor, workObjects[1])!;
            expect(numberOf(second)).toBe(2);

            modeler.modeling.reconnectEnd(second, workObjects[2], {
                x: workObjects[2].x + 37,
                y: workObjects[2].y + 37,
            });

            expect(second.target).toBe(workObjects[2]);
            expect(numberOf(second)).toBe(2);
        });

        it("clears the number when the source actor is replaced by a work object", () => {
            // Replace re-points attached connections through nested
            // `connection.reconnect`s; this case breaks if diagram-js stops doing so.
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 1);
            const activity = connect(modeler, actor, workObjects[0])!;
            expect(numberOf(activity)).toBe(1);

            // Not the `ds-replace` menu: it only offers icons of the same family.
            modeler.modeling.replaceShape(
                actor,
                {
                    type: workObjects[0]["type"],
                    x: actor.x,
                    y: actor.y,
                    width: actor.width,
                    height: actor.height,
                } as never,
                {},
            );

            expect(numberOf(activity)).toBeNull();
        });
    });

    describe("activity.changed", () => {
        it("cascades the occupants upward when an occupied number is claimed", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
            });

            // Every occupied number ≥ 1 moves up one slot, so the edited activity
            // owns 1 without duplicating it.
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 2, 3]);
            expect(third.businessObject.name).toBe("third");
            expect(third.businessObject.multipleNumberAllowed).toBe(false);
        });

        it("undo and redo move the whole edit, cascade included", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
            });
            modeler.commandStack.undo();

            // The command names one element; without its snapshot the cascaded
            // activities would keep their new numbers.
            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            expect(numberOf(third)).toBe(3);
            expect(third.businessObject.name).toBe("");

            modeler.commandStack.redo();

            // Redo re-runs `execute` only, so the cascade must live inside it.
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 2, 3]);
            expect(third.businessObject.name).toBe("third");

            // The command's snapshots must survive being replayed.
            modeler.commandStack.undo();

            expect([
                numberOf(first),
                numberOf(second),
                numberOf(third),
            ]).toEqual([1, 2, 3]);
        });

        it("suppresses the cascade when the number may occur multiple times", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            const numberingRegistry = modeler.get<DomainStoryNumberingRegistry>(
                "domainStoryNumberingRegistry",
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
                isMultiple: true,
            });

            // Two activities sharing number 1 is the *point* of the multiple-number
            // allowance (one actor doing the same step to several work objects).
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 1, 2]);
            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);

            modeler.commandStack.undo();

            expect(numberingRegistry.isNumberMultiple(1)).toBe(false);
            // `undefined`, not `false`: undo restores what `preExecute` saw and
            // must not add a key to the exported bytes.
            expect(third.businessObject.multipleNumberAllowed).toBeUndefined();

            modeler.commandStack.redo();

            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);
            expect(third.businessObject.multipleNumberAllowed).toBe(true);
        });

        it("leaves the actor sequence alone when a response arrow is edited", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const [first, second] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            const response = connect(modeler, workObjects[0], workObjects[1])!;

            // Covers the non-actor / `oldNumber == null` path end to end; the
            // domain spec "excludes the edited activity from its own cascade" locks the rest.
            editActivityThroughPopupFlow(modeler, response, {
                label: "response",
            });

            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            expect(numberOf(response)).toBeNull();
            expect(response.businessObject.name).toBe("response");

            modeler.commandStack.undo();

            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            expect(response.businessObject.name).toBe("");
        });

        it("re-mints a number when the field is cleared, and undo restores the old one", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const activities = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            // Leaves numbers {1, 3}, so a re-mint is visibly different from the
            // number that was cleared.
            modeler.modeling.removeConnection(activities[1]);

            editActivityThroughPopupFlow(modeler, activities[2], {
                label: "third",
            });

            // An empty field re-mints the lowest free number.
            expect(numberOf(activities[2])).toBe(2);

            modeler.commandStack.undo();

            expect(numberOf(activities[2])).toBe(3);
        });
    });

    /**
     * Driven through the context-pad entry: the provider prepares the command,
     * and executing `activity.directionChange` directly would skip that step.
     */
    describe("activity.directionChange", () => {
        function changeDirectionThroughContextPad(
            modeler: TestModeler,
            activity: Connection,
        ) {
            const provider = modeler.get<{
                getContextPadEntries(element: unknown): Record<string, any>;
            }>("domainStoryContextPadProvider");

            provider
                .getContextPadEntries(activity)
                ["changeDirection"].action.click({}, activity);
        }

        it("undo restores the unnumbered state of a work-object-sourced activity", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            // Occupy 1, so the number the swap mints is visibly a fresh one.
            connect(modeler, actor, workObjects[0]);
            const response = connect(modeler, workObjects[0], workObjects[1])!;
            expect(numberOf(response)).toBeNull();

            changeDirectionThroughContextPad(modeler, response);

            expect(numberOf(response)).toBe(2);

            modeler.commandStack.undo();

            // A write before the command would make preExecute snapshot 2 as the
            // "old" number, and undo would keep it.
            expect(numberOf(response)).toBeNull();
        });
    });

    describe("multi-instance isolation", () => {
        it("numbers and mints ids per instance, with no pool shared", () => {
            // Pinned randomness makes both instances want the same ids; a shared
            // pool would make the second skip past them, so identical ids prove
            // independence.
            vi.spyOn(Math, "random").mockReturnValue(0.0001);

            const first = boot();
            const second = boot();

            const firstCast = addStoryCast(first, 2);
            const secondCast = addStoryCast(second, 1);

            const firstActivity = connect(
                first,
                firstCast.actor,
                firstCast.workObjects[0],
            )!;
            const secondActivity = connect(
                second,
                secondCast.actor,
                secondCast.workObjects[0],
            )!;
            const firstFollowUp = connect(
                first,
                firstCast.actor,
                firstCast.workObjects[1],
            )!;

            // Numbering: each instance counts its own story from 1.
            expect(numberOf(firstActivity)).toBe(1);
            expect(numberOf(secondActivity)).toBe(1);
            expect(numberOf(firstFollowUp)).toBe(2);

            // Ids: pristine pools hand out the same strings…
            expect(secondActivity.id).toBe(firstActivity.id);
            expect(secondCast.actor.id).toBe(firstCast.actor.id);
            // …and each registry still resolves that id to its own element, so
            // nothing crosses over.
            expect(first.elementRegistry.get(firstActivity.id)).toBe(
                firstActivity,
            );
            expect(second.elementRegistry.get(firstActivity.id)).toBe(
                secondActivity,
            );

            // A cascade in one instance must not touch the other.
            editActivityThroughPopupFlow(first, firstFollowUp, {
                label: "second step",
                number: 1,
            });

            expect(numberOf(firstFollowUp)).toBe(1);
            expect(numberOf(firstActivity)).toBe(2);
            expect(numberOf(secondActivity)).toBe(1);
        });
    });
});
