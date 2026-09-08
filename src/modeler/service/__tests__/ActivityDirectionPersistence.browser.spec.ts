import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { ModuleDeclaration } from "didi";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import {
    TEST_ICON_NAMES,
    TEST_ICON_SET,
} from "../../../__tests__/helpers/testIconSet";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";

type Waypoint = {
    x: number;
    y: number;
    original?: { x: number; y: number };
};

type ContextPadProviderLike = {
    getContextPadEntries(element: unknown): Record<string, any>;
};

type DirectionProbe = {
    module: ModuleDeclaration;
    provider(): ContextPadProviderLike;
    commandStack(): CommandStack;
    elementRegistry(): ElementRegistry;
};

function injectorProbe(): DirectionProbe {
    let capturedProvider: ContextPadProviderLike | undefined;
    let capturedCommandStack: CommandStack | undefined;
    let capturedElementRegistry: ElementRegistry | undefined;

    function capture(
        domainStoryContextPadProvider: ContextPadProviderLike,
        commandStack: CommandStack,
        elementRegistry: ElementRegistry,
    ): void {
        capturedProvider = domainStoryContextPadProvider;
        capturedCommandStack = commandStack;
        capturedElementRegistry = elementRegistry;
    }
    capture.$inject = [
        "domainStoryContextPadProvider",
        "commandStack",
        "elementRegistry",
    ];

    function required<T>(value: T | undefined, name: string): T {
        if (!value) {
            throw new Error(`${name} was never injected`);
        }
        return value;
    }

    return {
        module: { __init__: [capture] },
        provider: () => required(capturedProvider, "context-pad provider"),
        commandStack: () => required(capturedCommandStack, "command stack"),
        elementRegistry: () =>
            required(capturedElementRegistry, "element registry"),
    };
}

function directionStory(waypoints: Waypoint[]): DomainStoryDocument {
    return {
        iconSet: {
            name: "test-icons",
            actors: TEST_ICON_SET.actors ?? {},
            workObjects: TEST_ICON_SET.workObjects ?? {},
        },
        domainStory: {
            title: "direction persistence",
            description: "",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "actor_direction",
                    type: ElementTypes.ACTOR + TEST_ICON_NAMES.person,
                    name: "",
                    x: 100,
                    y: 150,
                    width: 75,
                    height: 75,
                },
                {
                    id: "work_object_direction",
                    type: ElementTypes.WORKOBJECT + TEST_ICON_NAMES.document,
                    name: "",
                    x: 500,
                    y: 350,
                    width: 75,
                    height: 75,
                },
                {
                    id: "activity_direction",
                    type: ElementTypes.ACTIVITY,
                    name: "",
                    source: "actor_direction",
                    target: "work_object_direction",
                    number: 1,
                    waypoints,
                },
            ],
        },
    };
}

function activityExport(document: DomainStoryDocument): any {
    const activity = document.domainStory.businessObjects.find(
        (businessObject: any) => businessObject.id === "activity_direction",
    );
    if (!activity) {
        throw new Error("activity_direction was not exported");
    }
    return activity;
}

function changeDirection(probe: DirectionProbe): void {
    const activity = probe.elementRegistry().get("activity_direction");
    if (!activity) {
        throw new Error("activity_direction was not imported");
    }
    const entry = probe.provider().getContextPadEntries(activity)[
        "changeDirection"
    ];
    if (!entry) {
        throw new Error("Change direction is not in the context pad");
    }
    entry.action.click({}, activity);
}

function renderedLine(container: HTMLElement): SVGGeometryElement {
    const line = container.querySelector(
        '[data-element-id="activity_direction"] .djs-visual > path',
    );
    if (!line) {
        throw new Error("activity_direction was not rendered");
    }
    return line as SVGGeometryElement;
}

function expectRenderedPointOrder(
    line: SVGGeometryElement,
    waypoints: Waypoint[],
): void {
    let distance = 0;
    for (let index = 0; index < waypoints.length; index++) {
        const actual = line.getPointAtLength(distance);
        expect(actual.x).toBeCloseTo(waypoints[index].x, 3);
        expect(actual.y).toBeCloseTo(waypoints[index].y, 3);

        const next = waypoints[index + 1];
        if (next) {
            distance += Math.hypot(
                next.x - waypoints[index].x,
                next.y - waypoints[index].y,
            );
        }
    }
}

describe("activity direction persistence (browser)", () => {
    const diagrams: TestDiagram[] = [];

    async function expectFreshRoundTrip(
        document: DomainStoryDocument,
        expected: {
            source: string;
            target: string;
            waypoints: Waypoint[];
        },
    ): Promise<void> {
        const fresh = await createTestDiagram();
        diagrams.push(fresh);
        fresh.client.import(document);

        expect(activityExport(fresh.client.export())).toMatchObject(expected);
        expect(fresh.client.export()).toMatchObject({
            domainStory: {
                businessObjects: expect.arrayContaining([
                    expect.objectContaining({
                        id: "activity_direction",
                        ...expected,
                    }),
                ]),
            },
        });

        const line = renderedLine(fresh.container);
        expectRenderedPointOrder(line, expected.waypoints);
        expect(getComputedStyle(line).markerEnd).not.toBe("none");
    }

    afterEach(() => {
        for (const diagram of diagrams.splice(0)) {
            diagram.cleanup();
        }
    });

    it.each([
        {
            name: "straight",
            waypoints: [
                { x: 175, y: 187, original: { x: 100, y: 187 } },
                { x: 500, y: 387, original: { x: 575, y: 387 } },
            ],
        },
        {
            name: "multi-bendpoint",
            waypoints: [
                { x: 175, y: 187, original: { x: 100, y: 187 } },
                { x: 275, y: 300 },
                { x: 400, y: 300 },
                { x: 500, y: 387, original: { x: 575, y: 387 } },
            ],
        },
    ])(
        "exports and re-imports $name geometry after context-pad reversal history",
        async ({ waypoints }) => {
            const probe = injectorProbe();
            // The first client must be booted with the probe so the test reaches
            // the production context-pad action and command stack.
            const booted = await createTestDiagram({}, [probe.module]);
            diagrams.push(booted);
            booted.client.import(directionStory(waypoints));

            const reversed = [...waypoints].reverse();
            changeDirection(probe);
            const reversedDocument = booted.client.export();
            const reversedActivity = {
                source: "work_object_direction",
                target: "actor_direction",
                waypoints: reversed,
            };
            expect(activityExport(reversedDocument)).toMatchObject(
                reversedActivity,
            );
            await expectFreshRoundTrip(reversedDocument, reversedActivity);

            probe.commandStack().undo();
            expect(activityExport(booted.client.export())).toMatchObject({
                source: "actor_direction",
                target: "work_object_direction",
                waypoints,
            });

            probe.commandStack().redo();
            expect(activityExport(booted.client.export())).toMatchObject({
                source: "work_object_direction",
                target: "actor_direction",
                waypoints: reversed,
            });

            // A second real context-pad action returns to the original target.
            changeDirection(probe);
            const finalDocument = booted.client.export();
            const finalActivity = {
                source: "actor_direction",
                target: "work_object_direction",
                waypoints,
            };
            expect(activityExport(finalDocument)).toMatchObject(finalActivity);
            await expectFreshRoundTrip(finalDocument, finalActivity);
        },
    );
});
