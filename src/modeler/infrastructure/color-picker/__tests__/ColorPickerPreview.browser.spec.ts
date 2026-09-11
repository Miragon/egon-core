import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addAnnotation,
    addGroup,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import type { DirtyFlagService } from "../../../service/DirtyFlagService";
import type { ColorPickerCoordinator } from "../ColorPickerCoordinator";

function visual(modeler: TestModeler, element: DiagramElement): SVGElement {
    return modeler.container.querySelector(
        `[data-element-id="${element.id}"] .djs-visual`,
    )!;
}

function paint(node: Element | null, property: "fill" | "stroke"): string {
    return getComputedStyle(node!).getPropertyValue(property);
}

describe("color preview rendering", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    it("temporarily recolors every supported visual path and restores all of them", () => {
        modeler = createTestModeler();
        const actor = addActor(modeler, { point: { x: 100, y: 100 } });
        const workObject = addWorkObject(modeler, {
            point: { x: 300, y: 100 },
        });
        const group = addGroup(modeler, { point: { x: 550, y: 350 } });
        const annotation = addAnnotation(modeler, {
            point: { x: 300, y: 300 },
            name: "note",
        });
        const activity = connect(modeler, actor, workObject)!;
        const annotationConnector = connect(
            modeler,
            workObject,
            annotation,
            ElementTypes.CONNECTION,
        )!;
        const targets = [actor, workObject, group, activity, annotation];
        modeler.commandStack.clear();
        const dirty = modeler.get<DirtyFlagService>(
            "domainStoryDirtyFlagService",
        );
        dirty.makeClean();
        const commandChanged = vi.fn();
        modeler.eventBus.on("commandStack.changed", commandChanged);
        modeler.get<any>("selection").select(targets);
        const coordinator = modeler.get<ColorPickerCoordinator>(
            "domainStoryColorPickerCoordinator",
        );
        let requestId = "";
        modeler.eventBus.on("dst.colorPicker.requested", (event: any) => {
            requestId = event.requestId;
        });

        expect(coordinator.request(targets)).toBe(true);
        expect(coordinator.preview(requestId, "#22aa44")).toBe(true);

        expect(
            paint(visual(modeler, actor).querySelector("circle"), "fill"),
        ).toBe("rgb(34, 170, 68)");
        expect(
            paint(visual(modeler, workObject).querySelector("rect"), "fill"),
        ).toBe("rgb(34, 170, 68)");
        expect(
            paint(visual(modeler, group).querySelector("rect"), "stroke"),
        ).toBe("rgb(34, 170, 68)");
        expect(
            paint(visual(modeler, activity).querySelector("path"), "stroke"),
        ).toBe("rgb(34, 170, 68)");
        expect(
            paint(visual(modeler, annotation).querySelector("path"), "stroke"),
        ).toBe("rgb(34, 170, 68)");
        expect(
            paint(
                visual(modeler, annotationConnector).querySelector("path"),
                "stroke",
            ),
        ).toBe("rgb(34, 170, 68)");
        expect(
            Array.from(
                modeler.container.querySelectorAll("defs marker path"),
            ).some((path) => paint(path, "fill") === "rgb(34, 170, 68)"),
        ).toBe(true);
        expect(
            targets.every((target) => !target.businessObject.pickedColor),
        ).toBe(true);
        expect(annotationConnector.businessObject.pickedColor).toBeUndefined();
        expect(dirty.dirty).toBe(false);
        expect(modeler.commandStack.canUndo()).toBe(false);
        expect(commandChanged).not.toHaveBeenCalled();

        expect(coordinator.cancel(requestId)).toBe(true);
        expect(
            paint(visual(modeler, actor).querySelector("circle"), "fill"),
        ).toBe("rgb(0, 0, 0)");
        expect(
            paint(visual(modeler, workObject).querySelector("rect"), "fill"),
        ).toBe("rgb(0, 0, 0)");
        expect(
            paint(visual(modeler, group).querySelector("rect"), "stroke"),
        ).toBe("rgb(0, 0, 0)");
        expect(
            paint(
                visual(modeler, annotationConnector).querySelector("path"),
                "stroke",
            ),
        ).toBe("rgb(0, 0, 0)");
        expect(dirty.dirty).toBe(false);
        expect(commandChanged).not.toHaveBeenCalled();
    });
});
