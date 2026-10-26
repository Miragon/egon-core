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
 * "Change type" end to end: popup menu, `DomainStoryReplace` and `shape.replace`
 * on a real graph, because the seams between them fail silently.
 *
 * Browser tier (ADR TST-2): `shape.replace` reaches
 * `SVGSVGElement.createSVGTransform`, absent in jsdom, and the popup renders DOM.
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

    /** Clicks the rendered entry, covering registration, entry list and action. */
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

            // `false` proves the provider is registered and answers for actors.
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
            // `DomainStoryReplace` adds `ceil(75/2)` and `CreateShapeHandler`
            // subtracts `round(75/2)`; both are 38 only by coincidence.
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

            modeler.commandStack.undo();

            const restored = modeler.elementRegistry.get(oldId) as Shape;
            expect(restored).toBeDefined();
            expect(restored["type"]).toBe(ACTOR_PERSON);
            expect(modeler.elementRegistry.get(replacedId)).toBeUndefined();
            expect(outgoing.source).toBe(restored);
            expect(incoming.target).toBe(restored);

            // `DomainStoryReplace` writes these ids outside a command; they are
            // only safe because the updater also handles `reverted` reconnects.
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
