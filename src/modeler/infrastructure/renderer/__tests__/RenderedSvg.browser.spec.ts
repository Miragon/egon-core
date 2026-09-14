import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import type {
    Connection,
    Element as DiagramElement,
} from "diagram-js/lib/model/Types";

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
import { TEST_ICON_NAMES } from "../../../../__tests__/helpers/testIconSet";
import { ElementTypes } from "../../../../story/domain/elementTypes";

const SNAPSHOT_ATTRIBUTES = [
    "class",
    "d",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "marker-end",
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "rx",
    "ry",
    "refX",
    "refY",
    "markerWidth",
    "markerHeight",
    "orient",
] as const;

interface NormalizedSvgNode {
    tag: string;
    attributes?: Record<string, string>;
    text?: string;
    children?: NormalizedSvgNode[];
}

/** Stable, layout-noise-free representation of renderer-owned SVG. */
function normalizeSvgNode(node: globalThis.Element): NormalizedSvgNode {
    const attributes: Record<string, string> = {};
    for (const name of SNAPSHOT_ATTRIBUTES) {
        let value = node.getAttribute(name);
        if (!value) continue;
        value = value
            .replace(/url\(#activity-[^)]+\)/g, "url(#activity-marker)")
            .replace(/\s+/g, " ")
            .trim();
        attributes[name] = value;
    }
    const svgNode = node as SVGElement;
    for (const [name, value] of [
        ["fill", svgNode.style.fill],
        ["stroke", svgNode.style.stroke],
        ["stroke-width", svgNode.style.strokeWidth],
        ["stroke-dasharray", svgNode.style.strokeDasharray],
        ["marker-end", svgNode.style.markerEnd],
    ]) {
        if (value && !attributes[name]) {
            attributes[name] = value
                .replace(
                    /url\(["']?#activity-[^)"']+["']?\)/g,
                    "url(#activity-marker)",
                )
                .trim();
        }
    }

    const normalized: NormalizedSvgNode = {
        tag: node.tagName.toLowerCase(),
    };
    if (Object.keys(attributes).length) normalized.attributes = attributes;

    // Text renderer tspans carry browser/font-dependent positioning. Keep the
    // visible label and ordering at the text boundary, and omit measurements.
    if (normalized.tag === "text") {
        normalized.text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return normalized;
    }

    const children = Array.from(node.children)
        .filter((child) => !child.classList.contains("djs-hit"))
        .map(normalizeSvgNode);
    if (children.length) normalized.children = children;
    return normalized;
}

function visual(modeler: TestModeler, element: DiagramElement): SVGElement {
    return modeler.container.querySelector(
        `[data-element-id="${element.id}"] > .djs-visual`,
    )!;
}

function visibleTexts(modeler: TestModeler, element: DiagramElement): string[] {
    return Array.from(visual(modeler, element).querySelectorAll("text")).map(
        (text) => text.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
}

describe("rendered domain-story SVG", () => {
    let modeler: TestModeler | undefined;

    afterEach(async () => {
        await userEvent.cleanup();
        modeler?.cleanup();
        modeler = undefined;
    });

    it("keeps the reference story's semantic SVG structure stable", async () => {
        modeler = createTestModeler();
        const group = addGroup(modeler, {
            point: { x: 480, y: 430 },
            name: "Fulfilment",
            pickedColor: "#7755aa",
        });
        const actor = addActor(modeler, {
            point: { x: 120, y: 130 },
            name: "Customer",
            pickedColor: "#1166cc",
        });
        const order = addWorkObject(modeler, {
            point: { x: 360, y: 130 },
            name: "Order",
        });
        const receipt = addWorkObject(modeler, {
            point: { x: 600, y: 130 },
            name: "Receipt",
            icon: TEST_ICON_NAMES.folder,
            pickedColor: "#cc5500",
        });
        const annotation = addAnnotation(modeler, {
            point: { x: 370, y: 310 },
            pickedColor: "#228844",
            width: 100,
            height: 55,
        });
        // Annotations store their label as `text`, while the generic builder's
        // name initializes only shape business objects.
        modeler.modeling.updateLabel(annotation, "first line\nsecond line");

        const numbered = connect(modeler, actor, order)!;
        modeler.commandStack.execute("activity.changed", {
            businessObject: numbered.businessObject,
            element: numbered,
            newLabel: "places",
            newNumber: numbered.businessObject.number,
            newMultipleNumberAllowed: false,
        });
        const response = connect(modeler, order, receipt)!;
        modeler.commandStack.execute("activity.changed", {
            businessObject: response.businessObject,
            element: response,
            newLabel: "creates",
            newNumber: undefined,
            newMultipleNumberAllowed: false,
        });
        const noteConnection = connect(
            modeler,
            order,
            annotation,
            ElementTypes.CONNECTION,
        )!;

        const renderedElements = [
            ["group", group],
            ["actor", actor],
            ["order", order],
            ["receipt", receipt],
            ["annotation", annotation],
            ["numberedActivity", numbered],
            ["response", response],
            ["annotationConnection", noteConnection],
        ].map(([role, element]) => ({
            role,
            svg: normalizeSvgNode(visual(modeler!, element as DiagramElement)),
        }));

        const markerDefinitions = Array.from(
            modeler.container.querySelectorAll("defs marker"),
        ).map((marker) => ({
            id: "activity-marker",
            svg: normalizeSvgNode(marker),
        }));

        expect({ markerDefinitions, renderedElements }).toMatchSnapshot();
        expect(visibleTexts(modeler, numbered)).toEqual(["places", "1"]);
        expect(visibleTexts(modeler, response)).toEqual(["creates"]);

        // Computed paint is asserted outside the structural snapshot because
        // CSS normalizes colors independently of serialized SVG attributes.
        const actorPaint = visual(modeler, actor).querySelector("circle")!;
        const defaultPaint = visual(modeler, order).querySelector("rect")!;
        const groupFrame = visual(modeler, group).querySelector("rect")!;
        expect(getComputedStyle(actorPaint).fill).toBe("rgb(17, 102, 204)");
        expect(getComputedStyle(defaultPaint).fill).toBe("rgb(0, 0, 0)");
        expect(getComputedStyle(groupFrame).stroke).toBe("rgb(119, 85, 170)");

        // These icon classes belong to controls, not the SVG icon itself.
        expect(
            modeler.container.querySelector(
                '[data-action="domainStory-actorPerson"]',
            ),
        ).toHaveClass("icon-domain-story-person");
        await userEvent.click(
            modeler.container.querySelector(
                `[data-element-id="${actor.id}"] .djs-hit`,
            )!,
        );
        expect(
            modeler.container.querySelector(
                '.djs-context-pad.open [data-action="append.workObjectDocument"]',
            ),
        ).toHaveClass("icon-domain-story-document");
    });

    it("keeps real badge geometry around horizontal, vertical, diagonal and bent activities", () => {
        modeler = createTestModeler();
        const actors = [
            { x: 120, y: 100 },
            { x: 120, y: 260 },
            { x: 390, y: 100 },
            { x: 390, y: 300 },
        ].map((point) => addActor(modeler!, { point }));
        const targets = [
            { x: 330, y: 100 },
            { x: 120, y: 460 },
            { x: 590, y: 260 },
            { x: 650, y: 430 },
        ].map((point) => addWorkObject(modeler!, { point }));
        const activities = actors.map((actor, index) =>
            connect(modeler!, actor, targets[index]),
        ) as Connection[];

        const bent = activities[3];
        const [start, end] = bent.waypoints;
        modeler.modeling.updateWaypoints(bent, [
            start,
            { x: 500, y: start.y },
            { x: 500, y: end.y },
            end,
        ]);
        modeler.commandStack.execute("activity.changed", {
            businessObject: bent.businessObject,
            element: bent,
            newLabel: "double digit",
            newNumber: 12,
            newMultipleNumberAllowed: true,
        });

        for (const activity of activities) {
            const activityVisual = visual(modeler, activity);
            const badge = Array.from(
                activityVisual.querySelectorAll("path"),
            ).find((path) => path.getAttribute("d")?.includes("a 11,11")) as
                SVGGraphicsElement | undefined;
            const number = activityVisual.querySelector(
                "text.djs-labelNumber",
            ) as SVGGraphicsElement;
            expect(
                badge,
                `${activity.id} number=${String(activity.businessObject.number)} ${activityVisual.innerHTML}`,
            ).toBeDefined();
            expect(number, activity.id).not.toBeNull();

            const badgeBox = badge!.getBBox();
            const textBox = number.getBBox();
            const tolerance = 3;
            expect(textBox.x).toBeGreaterThanOrEqual(badgeBox.x - tolerance);
            expect(textBox.y).toBeGreaterThanOrEqual(badgeBox.y - tolerance);
            expect(textBox.x + textBox.width).toBeLessThanOrEqual(
                badgeBox.x + badgeBox.width + tolerance,
            );
            expect(textBox.y + textBox.height).toBeLessThanOrEqual(
                badgeBox.y + badgeBox.height + tolerance,
            );
        }

        expect(
            visual(modeler, bent).querySelector("text.djs-labelNumber")
                ?.textContent,
        ).toBe("12");
        expect(bent.waypoints).toHaveLength(4);
    });
});
