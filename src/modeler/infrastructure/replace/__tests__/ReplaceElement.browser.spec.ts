import { afterEach, describe, expect, it } from "vitest";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addGroup,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { TEST_ICON_NAMES } from "../../../../__tests__/helpers/testIconSet";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * "Change type" end to end: the `ds-replace` popup menu, `DomainStoryReplace`
 * and the `shape.replace` command, driven on a real graph.
 *
 * WHY it exists: the replace feature is assembled across four collaborators and
 * the seams are all silent when broken. The provider is registered from inside
 * `DomainStoryContextPadProvider`'s constructor, so deleting one line leaves
 * every unit test green and the menu permanently empty. And `DomainStoryReplace`
 * hands `modeling.replaceShape` a *centre* point computed as
 * `ceil(x + width / 2)` while `CreateShapeHandler` subtracts
 * `round(width / 2)` — the two conventions only cancel out by arithmetic
 * coincidence, so the position needs pinning rather than trusting.
 *
 * WHY browser tier (ADR 0014): `shape.replace` runs `createShape`,
 * `moveElements`, `connection.reconnect` and `removeShape`, all of which reach
 * `canvas.addShape` → tiny-svg `translate()` → `SVGSVGElement.createSVGTransform`,
 * absent in jsdom. The popup menu also renders real DOM here.
 */
describe("replace element (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    const ACTOR_GROUP = `${ElementTypes.ACTOR}${TEST_ICON_NAMES.group}`;
    const ACTOR_PERSON = `${ElementTypes.ACTOR}${TEST_ICON_NAMES.person}`;

    function popupMenu(): PopupMenu {
        return modeler!.get<PopupMenu>("popupMenu");
    }

    /**
     * Opens the real popup for `target` and clicks the rendered entry, so the
     * assertions cover the registration, the entry list and the action together
     * rather than calling `DomainStoryReplace` directly.
     */
    function triggerReplaceEntry(target: Shape, actionName: string) {
        popupMenu().open(target, "ds-replace", { x: 0, y: 0 });

        const entry = modeler!.container.querySelector<HTMLElement>(
            `.djs-popup .entry[data-id="${actionName}"]`,
        );
        if (!entry) {
            throw new Error(`no ds-replace entry <${actionName}> rendered`);
        }
        entry.click();
    }

    /** The single element of `type` on the canvas; fails loudly if ambiguous. */
    function onlyElementOfType(type: string): Shape {
        const matches = modeler!.elementRegistry.filter(
            (element) => element["type"] === type,
        );
        expect(matches).toHaveLength(1);
        return matches[0] as Shape;
    }

    describe("ds-replace popup wiring", () => {
        it("is reachable through the injector's popupMenu", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler);

            // `isEmpty` returns true both when no provider is registered and
            // when the registered one yields nothing, so `false` proves the
            // registration in DomainStoryContextPadProvider's constructor ran
            // *and* that the provider answered for an actor.
            expect(popupMenu().isEmpty(actor, "ds-replace")).toBe(false);
        });

        it("offers every other icon of the same family and nothing else", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { icon: TEST_ICON_NAMES.person });
            const workObject = addWorkObject(modeler, {
                point: { x: 500, y: 200 },
                icon: TEST_ICON_NAMES.document,
            });

            popupMenu().open(actor, "ds-replace", { x: 0, y: 0 });
            expect(renderedEntryIds()).toEqual(["replace-with-actor-group"]);

            popupMenu().open(workObject, "ds-replace", { x: 0, y: 0 });
            expect(renderedEntryIds()).toEqual([
                "replace-with-workobject-folder",
            ]);
        });

        it("has nothing to offer for a group", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });

            // Only actors and work objects have interchangeable icons; a group
            // must not open an empty menu over a "Change type" it never shows.
            expect(popupMenu().isEmpty(group, "ds-replace")).toBe(true);
        });

        function renderedEntryIds(): string[] {
            return Array.from(
                modeler!.container.querySelectorAll(".djs-popup .entry"),
            ).map((entry) => entry.getAttribute("data-id") ?? "");
        }
    });

    describe("replacing an actor", () => {
        it("keeps the name and the top-left corner, and drops the old shape", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, {
                point: { x: 200, y: 200 },
                name: "Alice",
                icon: TEST_ICON_NAMES.person,
            });
            const oldId = actor.id;
            const { x, y } = actor;

            triggerReplaceEntry(actor, "replace-with-actor-group");

            const replaced = onlyElementOfType(ACTOR_GROUP);
            expect(replaced.businessObject.name).toBe("Alice");
            // The pin for the two clashing centre conventions: `DomainStoryReplace`
            // passes `ceil(x + 75/2)` = x + 38 and `CreateShapeHandler` subtracts
            // `round(75/2)` = 38, so the corner survives only because both round
            // the same way. Changing either side moves every replaced element.
            expect({ x: replaced.x, y: replaced.y }).toEqual({ x, y });
            expect(replaced.businessObject.x).toBe(x);
            expect(replaced.businessObject.y).toBe(y);

            expect(modeler.elementRegistry.get(oldId)).toBeUndefined();
            expect(
                modeler.container.querySelector(`[data-element-id="${oldId}"]`),
            ).toBeNull();
        });

        it("rewrites the endpoints of both incoming and outgoing activities", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 200, y: 300 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 300 },
            });
            const outgoing = connect(modeler, actor, workObject)!;
            const incoming = connect(modeler, workObject, actor)!;

            triggerReplaceEntry(actor, "replace-with-actor-group");

            const replaced = onlyElementOfType(ACTOR_GROUP);
            expect(outgoing.source).toBe(replaced);
            expect(incoming.target).toBe(replaced);
            // The exported ids, which is what a host persists.
            expect(outgoing.businessObject.source).toBe(replaced.id);
            expect(incoming.businessObject.target).toBe(replaced.id);
        });

        it("undo restores the old type and the old activity endpoints", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, {
                point: { x: 200, y: 300 },
                name: "Alice",
            });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 300 },
            });
            const outgoing = connect(modeler, actor, workObject)!;
            const incoming = connect(modeler, workObject, actor)!;
            const oldId = actor.id;

            triggerReplaceEntry(actor, "replace-with-actor-group");
            const replacedId = onlyElementOfType(ACTOR_GROUP).id;
            expect(replacedId).not.toBe(oldId);

            // `shape.replace` nests createShape/reconnect/removeShape inside one
            // commandStack action, so a single undo has to unwind all of it.
            modeler.commandStack.undo();

            const restored = modeler.elementRegistry.get(oldId) as Shape;
            expect(restored).toBeDefined();
            expect(restored["type"]).toBe(ACTOR_PERSON);
            expect(modeler.elementRegistry.get(replacedId)).toBeUndefined();
            expect(outgoing.source).toBe(restored);
            expect(incoming.target).toBe(restored);

            // The assertions that matter for the next export: a business object
            // still pointing at the destroyed element's id writes a dangling
            // reference, which the importer then prunes.
            //
            // These hold *despite* `DomainStoryReplace.replaceElement` writing
            // `source`/`target` outside any command handler, because the ids are
            // owned by `DomainStoryUpdater.updateConnection`, which is wired to
            // both `executed` and `reverted` of `connection.reconnect`. Those
            // out-of-command writes are therefore redundant, not dangerous — and
            // this test is what keeps them that way if the updater's `reverted`
            // registration is ever trimmed.
            expect(outgoing.businessObject.source).toBe(oldId);
            expect(incoming.businessObject.target).toBe(oldId);
            expect(outgoing.businessObject.source).not.toBe(replacedId);
            expect(incoming.businessObject.target).not.toBe(replacedId);
        });
    });

    describe("replacing a work object", () => {
        it("keeps the name and re-points its activity", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 200, y: 300 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 300 },
                name: "Invoice",
                icon: TEST_ICON_NAMES.document,
            });
            const activity = connect(modeler, actor, workObject)!;

            triggerReplaceEntry(workObject, "replace-with-workobject-folder");

            const replaced = onlyElementOfType(
                `${ElementTypes.WORKOBJECT}${TEST_ICON_NAMES.folder}`,
            );
            expect(replaced.businessObject.name).toBe("Invoice");
            expect({ x: replaced.x, y: replaced.y }).toEqual({
                x: workObject.x,
                y: workObject.y,
            });
            expect(activity.businessObject.target).toBe(replaced.id);
        });
    });
});
