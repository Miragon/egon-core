import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "@vitest/browser/context";
import type { Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import { TEST_ICON_NAMES } from "../../../../__tests__/helpers/testIconSet";
import { ElementTypes } from "../../../../story/domain/elementTypes";

const CASES = [
    {
        role: "actor",
        action: "domainStory-actorPerson",
        type: `${ElementTypes.ACTOR}${TEST_ICON_NAMES.person}`,
        iconTag: "circle",
    },
    {
        role: "work object",
        action: "domainStory-workObjectDocument",
        type: `${ElementTypes.WORKOBJECT}${TEST_ICON_NAMES.document}`,
        iconTag: "rect",
    },
] as const;

describe("palette drag-create", () => {
    let modeler: TestModeler | undefined;

    afterEach(async () => {
        await userEvent.cleanup();
        modeler?.cleanup();
        modeler = undefined;
    });

    it.each(CASES)(
        "creates exactly one $role with finite rendered bounds and undo removes it",
        async ({ action, type, iconTag }) => {
            await page.viewport(1000, 800);
            modeler = createTestModeler();
            const entry = modeler.container.querySelector<HTMLElement>(
                `[data-action="${action}"]`,
            )!;
            const canvas = modeler.container.querySelector<SVGElement>(
                ".djs-container > svg",
            )!;
            // Give Playwright a concrete destination at this empty-canvas
            // coordinate. It resolves to the same implicit root element as the
            // SVG's normal background hit area.
            const dropTarget = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "ellipse",
            );
            dropTarget.setAttribute("class", "djs-element");
            dropTarget.setAttribute("data-element-id", modeler.root.id);
            dropTarget.setAttribute("cx", "200");
            dropTarget.setAttribute("cy", "140");
            dropTarget.setAttribute("rx", "40");
            dropTarget.setAttribute("ry", "40");
            dropTarget.setAttribute("fill", "rgba(0, 0, 0, 0.001)");
            canvas.appendChild(dropTarget);
            // Multiple mousemove steps ensure diagram-js has installed its drag
            // listeners before the pointer crosses into the SVG root.
            await userEvent.dragAndDrop(entry, dropTarget, { steps: 10 });
            dropTarget.remove();

            await expect
                .poll(
                    () =>
                        modeler!.elementRegistry
                            .getAll()
                            .filter((element) => element["type"] === type)
                            .length,
                )
                .toBe(1);
            const domainShapes = modeler.elementRegistry
                .getAll()
                .filter((element) =>
                    element["type"]?.startsWith("domainStory:"),
                ) as Shape[];
            expect(domainShapes).toHaveLength(1);

            const shape = domainShapes[0];
            expect(shape["type"]).toBe(type);
            expect(Number.isFinite(shape.x)).toBe(true);
            expect(Number.isFinite(shape.y)).toBe(true);
            expect(Number.isFinite(shape.width)).toBe(true);
            expect(Number.isFinite(shape.height)).toBe(true);
            // The browser provider drops at the visible canvas centre.
            expect(shape.x + shape.width / 2).toBeCloseTo(200, -1);
            expect(shape.y + shape.height / 2).toBeCloseTo(140, -1);

            const renderedIcon = modeler.container.querySelector(
                `[data-element-id="${shape.id}"] .djs-visual ${iconTag}`,
            );
            expect(renderedIcon).not.toBeNull();

            modeler.commandStack.undo();
            expect(modeler.elementRegistry.get(shape.id)).toBeUndefined();
            expect(
                modeler.container.querySelector(
                    `[data-element-id="${shape.id}"]`,
                ),
            ).toBeNull();
        },
    );
});
