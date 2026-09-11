import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Shape } from "diagram-js/lib/model/Types";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { IconDictionaryService } from "../../../iconSet/service";
import type { IconSanitizerPort } from "../../../iconSet/domain/ports/IconSanitizerPort";
import type { DirtyFlagService } from "../DirtyFlagService";
import type { DomainStoryModeling } from "../../infrastructure/modeling/DomainStoryModeling";

const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const SETTLE_MS = 250;

interface SessionRecord {
    canvas: Canvas;
    canvasContainer: HTMLElement;
    commandStack: CommandStack;
    elementRegistry: ElementRegistry;
    eventBus: EventBus;
    modeling: DomainStoryModeling;
    dirtyFlag: DirtyFlagService;
    icons: IconDictionaryService;
    destroyed: boolean;
}

function lifecycleProbe(): {
    module: ModuleDeclaration;
    records: SessionRecord[];
    failOnShapeId?: string;
    failOnConnectionId?: string;
} {
    const controller: {
        module: ModuleDeclaration;
        records: SessionRecord[];
        failOnShapeId?: string;
        failOnConnectionId?: string;
    } = { module: {}, records: [] };

    class Probe {
        static $inject = [
            "canvas",
            "commandStack",
            "elementRegistry",
            "eventBus",
            "modeling",
            "domainStoryDirtyFlagService",
            "domainStoryIconDictionaryService",
        ];

        constructor(
            canvas: Canvas,
            commandStack: CommandStack,
            elementRegistry: ElementRegistry,
            eventBus: EventBus,
            modeling: DomainStoryModeling,
            dirtyFlag: DirtyFlagService,
            icons: IconDictionaryService,
        ) {
            const record: SessionRecord = {
                canvas,
                canvasContainer: canvas.getContainer(),
                commandStack,
                elementRegistry,
                eventBus,
                modeling,
                dirtyFlag,
                icons,
                destroyed: false,
            };
            controller.records.push(record);
            eventBus.on("shape.added", (event: { element: Shape }) => {
                if (event.element.id === controller.failOnShapeId) {
                    throw new Error(`injected failure at ${event.element.id}`);
                }
            });
            eventBus.on("connection.added", (event: { element: Shape }) => {
                if (event.element.id === controller.failOnConnectionId) {
                    throw new Error(`injected failure at ${event.element.id}`);
                }
            });
            eventBus.on("diagram.destroy", () => {
                record.destroyed = true;
            });
        }
    }

    controller.module = {
        __init__: ["atomicImportLifecycleProbe"],
        atomicImportLifecycleProbe: ["type", Probe],
    };
    return controller;
}

function story(options: {
    title: string;
    ids?: [string, string];
    secondType?: string;
}): DomainStoryDocument {
    const [firstId, secondId] = options.ids ?? ["shape_1", "shape_2"];
    return {
        iconSet: {
            name: options.title,
            actors: { Shared: ICON },
            workObjects: { Document: ICON },
        },
        domainStory: {
            title: options.title,
            description: `${options.title} description`,
            version: "4.0.0",
            businessObjects: [
                {
                    id: firstId,
                    type: ElementTypes.ACTOR + "Shared",
                    name: "actor",
                    x: 100,
                    y: 100,
                },
                {
                    id: secondId,
                    type:
                        options.secondType ??
                        ElementTypes.WORKOBJECT + "Document",
                    name: "object",
                    x: 350,
                    y: 100,
                },
                {
                    id: "connection_1",
                    type: ElementTypes.ACTIVITY,
                    name: "acts",
                    source: firstId,
                    target: secondId,
                    waypoints: [
                        { x: 175, y: 137 },
                        { x: 350, y: 137 },
                    ],
                    number: 1,
                },
            ],
        },
    };
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

describe("atomic document import", () => {
    const diagrams: TestDiagram[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
        vi.unstubAllGlobals();
    });

    it("keeps the complete active session after partial candidate rendering fails, then promotes a later import", async () => {
        const probe = lifecycleProbe();
        const diagram = await createTestDiagram({}, [probe.module]);
        diagrams.push(diagram);

        diagram.client.import(story({ title: "original" }));
        expect(probe.records).toHaveLength(2);
        expect(probe.records[0].destroyed).toBe(true);
        const active = probe.records[1];
        const root = active.canvas.getRootElement() as unknown as Shape;
        const liveShape = active.elementRegistry.get("shape_1") as Shape;

        active.modeling.moveShape(liveShape, { x: 15, y: 0 }, root);
        active.modeling.moveShape(liveShape, { x: 0, y: 20 }, root);
        active.commandStack.undo();
        expect(active.commandStack.canUndo()).toBe(true);
        expect(active.commandStack.canRedo()).toBe(true);

        diagram.client.setViewport({ x: 21, y: 34, width: 410, height: 310 });
        diagram.client.addIcon("actor", "PoolOnly", ICON);

        const before = JSON.stringify(diagram.client.export());
        const beforeIcons = diagram.client.getIcons();
        const beforePool = active.icons.getFullDictionary().keysArray();
        const beforeViewport = diagram.client.getViewport();
        const beforeStyle = diagram.container.querySelector<HTMLStyleElement>(
            "[data-egon-icons-css]",
        )!.textContent;
        const beforeBanner = active.canvas
            .getContainer()
            .querySelector('[data-version-banner-mount="true"]')!.textContent;
        const beforeDirty = active.dirtyFlag.dirty;

        const storyChanged = vi.fn();
        const iconsChanged = vi.fn();
        const repaired = vi.fn();
        diagram.client.on("story.changed", storyChanged);
        diagram.client.on("icons.changed", iconsChanged);
        diagram.client.on("import.repaired", repaired);
        active.eventBus.fire("commandStack.changed", {});

        probe.failOnShapeId = "shape_fail";
        const failing = story({
            title: "candidate",
            ids: ["shape_candidate", "shape_fail"],
            secondType: `${ElementTypes.WORKOBJECT}Repairable Icon`,
        });
        failing.iconSet.workObjects["Repairable-Icon"] = ICON;
        const errorLog = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        expect(() => diagram.client.import(failing)).toThrow(
            /injected failure at shape_fail/,
        );
        errorLog.mockRestore();
        await settle();

        expect(probe.records).toHaveLength(3);
        expect(probe.records[2].destroyed).toBe(true);
        expect(probe.records[2].canvasContainer.isConnected).toBe(false);
        expect(
            diagram.container.querySelector("[data-egon-import-candidate]"),
        ).toBeNull();
        expect(
            diagram.container.querySelectorAll("[data-egon-icons-css]"),
        ).toHaveLength(1);
        expect(JSON.stringify(diagram.client.export())).toBe(before);
        expect(diagram.client.getIcons()).toEqual(beforeIcons);
        expect(active.icons.getFullDictionary().keysArray()).toEqual(
            beforePool,
        );
        expect(diagram.client.getViewport()).toEqual(beforeViewport);
        expect(
            diagram.container.querySelector<HTMLStyleElement>(
                "[data-egon-icons-css]",
            )!.textContent,
        ).toBe(beforeStyle);
        expect(
            active.canvas
                .getContainer()
                .querySelector('[data-version-banner-mount="true"]')!
                .textContent,
        ).toBe(beforeBanner);
        expect(active.dirtyFlag.dirty).toBe(beforeDirty);
        expect(active.elementRegistry.get("shape_1")).toBe(liveShape);
        // Preparation repaired this candidate-local reference before the
        // injected materialization failure. The caller's document and every
        // live object in the active session nevertheless remain untouched.
        expect(failing.domainStory.businessObjects[1]).toMatchObject({
            type: `${ElementTypes.WORKOBJECT}Repairable Icon`,
        });
        expect(storyChanged).toHaveBeenCalledTimes(1);
        expect(iconsChanged).not.toHaveBeenCalled();
        expect(repaired).not.toHaveBeenCalled();

        active.commandStack.undo();
        active.commandStack.redo();
        expect(active.elementRegistry.get("shape_1")).toBe(liveShape);
        expect(JSON.stringify(diagram.client.export())).toBe(before);

        probe.failOnShapeId = undefined;
        probe.failOnConnectionId = "connection_1";
        const connectionErrorLog = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        expect(() =>
            diagram.client.import(story({ title: "connection candidate" })),
        ).toThrow(/injected failure at connection_1/);
        connectionErrorLog.mockRestore();
        expect(probe.records.at(-1)!.destroyed).toBe(true);
        expect(JSON.stringify(diagram.client.export())).toBe(before);

        probe.failOnConnectionId = undefined;
        active.eventBus.fire("commandStack.changed", {});
        diagram.client.import(story({ title: "replacement" }));
        await settle();

        const replacement = probe.records.at(-1)!;
        expect(active.destroyed).toBe(true);
        expect(replacement.destroyed).toBe(false);
        expect(diagram.client.export().domainStory.title).toBe("replacement");
        expect(diagram.client.getViewport()).toEqual(beforeViewport);
        expect(replacement.commandStack.canUndo()).toBe(false);
        expect(replacement.commandStack.canRedo()).toBe(false);
        expect(iconsChanged).toHaveBeenCalledTimes(1);
        // The pending delivery from the obsolete session was cancelled.
        expect(storyChanged).toHaveBeenCalledTimes(1);

        replacement.eventBus.fire("commandStack.changed", {});
        await settle();
        expect(storyChanged).toHaveBeenCalledTimes(2);
        diagram.client.addIcon("actor", "AfterPromotion", ICON);
        expect(diagram.client.hasIcon("actor", "AfterPromotion")).toBe(true);
    });

    it("reports reentrant post-commit observers without turning a committed import into failure", () => {
        const reported = vi.fn();
        vi.stubGlobal("reportError", reported);
        return createTestDiagram().then((diagram) => {
            diagrams.push(diagram);
            const nested = story({ title: "nested" });
            const observed = vi.fn();
            diagram.client.on("import.repaired", () =>
                diagram.client.import(nested),
            );
            diagram.client.on("import.repaired", observed);

            const damaged = story({ title: "damaged" }) as any;
            damaged.domainStory.businessObjects[2].target = "missing";
            damaged.domainStory.businessObjects[2].waypoints = "also malformed";

            expect(() => diagram.client.import(damaged)).not.toThrow();
            expect(diagram.client.export().domainStory.title).toBe("damaged");
            expect(observed).toHaveBeenCalledWith({
                removedConnectionIds: ["connection_1"],
            });
            expect(reported).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringMatching(/reentrant import/i),
                }),
            );
        });
    });

    it("destroys a candidate when icon preparation throws and keeps the active icon state", async () => {
        const probe = lifecycleProbe();
        const sanitizer: IconSanitizerPort = {
            sanitize(source) {
                if (source === "throw during icon preparation") {
                    throw new Error("injected icon preparation failure");
                }
                return source;
            },
            prepareForRendering(source) {
                return source;
            },
        };
        const sanitizerModule: ModuleDeclaration = {
            domainStoryIconSanitizer: ["value", sanitizer],
        };
        const diagram = await createTestDiagram({}, [
            probe.module,
            sanitizerModule,
        ]);
        diagrams.push(diagram);
        diagram.client.import(story({ title: "original icons" }));

        const before = JSON.stringify(diagram.client.export());
        const beforeIcons = diagram.client.getIcons();
        const failing = story({ title: "bad icons" });
        failing.iconSet.actors["Shared"] = "throw during icon preparation";

        expect(() => diagram.client.import(failing)).toThrow(
            /injected icon preparation failure/,
        );
        expect(probe.records.at(-1)!.destroyed).toBe(true);
        expect(JSON.stringify(diagram.client.export())).toBe(before);
        expect(diagram.client.getIcons()).toEqual(beforeIcons);
        expect(
            diagram.container.querySelector("[data-egon-import-candidate]"),
        ).toBeNull();
    });
});
