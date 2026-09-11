import { describe, expect, it, vi } from "vitest";
import { LabelDictionaryService } from "../LabelDictionaryService";
import { IconDictionaryService } from "../../../iconSet/service";
import { IconStyleSheetPort } from "../../../iconSet/domain/ports/IconStyleSheetPort";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { CanvasObject } from "../../../story/domain/canvasObject";
import type { ElementRegistryService } from "../../../modeler/service";
import { passThroughIconSanitizer } from "../../../__tests__/helpers/passThroughIconSanitizer";

/**
 * The dictionary is a current projection over the canvas, so every rule that
 * decides what lands in it — dedup, the empty-name filter, case-insensitive
 * ordering, optional representative artwork, and detached snapshots — is
 * behavior a host depends on.
 *
 * No canvas is booted: the service only ever reads `ElementRegistryService`,
 * so a duck-typed stub is enough (same style as
 * `popup/__tests__/DomainStoryNumberingRegistry.spec.ts`). The
 * `IconDictionaryService` is real, because the `data:image/svg+xml,` prefixing
 * depends on its "" -on-miss contract.
 */

/** The style-sheet port is irrelevant here; icons are only ever read back. */
class NoopStyleSheetPort implements IconStyleSheetPort {
    addIconStyle(): void {}
}

/**
 * The subset of a canvas element the dictionary reads. Cast rather than built
 * in full: `CanvasObject` demands a dozen geometry fields the service never
 * touches, and spelling them out would hide which two actually matter.
 */
function canvasObject(type: string, name?: string): CanvasObject {
    return { type, businessObject: { name } } as unknown as CanvasObject;
}

const actor = (icon: string, name?: string) =>
    canvasObject(ElementTypes.ACTOR + icon, name);
const workObject = (icon: string, name?: string) =>
    canvasObject(ElementTypes.WORKOBJECT + icon, name);
const activity = (name?: string) => canvasObject(ElementTypes.ACTIVITY, name);

/**
 * Builds the service over a fixed canvas. `getAllWorkObjects` mirrors the real
 * registry's own filter so `getUniqueWorkObjectNames` is exercised against the
 * same list the production service would derive.
 */
function makeSut(canvasObjects: CanvasObject[]) {
    const iconDictionaryService = new IconDictionaryService(
        new NoopStyleSheetPort(),
        passThroughIconSanitizer,
    );
    const elementRegistryService = {
        getAllCanvasObjects: () => canvasObjects,
        getAllWorkObjects: () =>
            canvasObjects.filter((element) =>
                element.type.startsWith(ElementTypes.WORKOBJECT),
            ),
    } as unknown as ElementRegistryService;

    const commandStack = { execute: vi.fn() };
    const service = new LabelDictionaryService(
        elementRegistryService,
        iconDictionaryService,
        commandStack as any,
    );

    return { service, iconDictionaryService, commandStack };
}

describe("LabelDictionaryService", () => {
    describe("activity labels", () => {
        it("collects each distinct activity name once", () => {
            const { service } = makeSut([
                activity("send"),
                activity("send"),
                activity("receive"),
            ]);

            expect(service.getDictionary().activities).toEqual([
                { name: "receive", originalName: "receive" },
                { name: "send", originalName: "send" },
            ]);
        });

        it("excludes activities with an empty or absent name", () => {
            const { service } = makeSut([
                activity(""),
                activity(undefined),
                activity("send"),
            ]);

            expect(service.getDictionary().activities).toEqual([
                { name: "send", originalName: "send" },
            ]);
        });

        it("sorts case-insensitively", () => {
            // A naive `localeCompare` on the raw names would put "Banana"
            // first, because uppercase sorts before lowercase.
            const { service } = makeSut([
                activity("Banana"),
                activity("apple"),
            ]);

            expect(
                service.getDictionary().activities.map((entry) => entry.name),
            ).toEqual(["apple", "Banana"]);
        });
    });

    describe("work object labels", () => {
        it("collects each distinct work object name once, with its icon", () => {
            const { service, iconDictionaryService } = makeSut([
                workObject("Document", "invoice"),
                workObject("Document", "invoice"),
            ]);
            iconDictionaryService.addIMGToIconDictionary("<svg/>", "Document");

            expect(service.getDictionary().workObjects).toEqual([
                {
                    name: "invoice",
                    originalName: "invoice",
                    icon: "data:image/svg+xml,<svg/>",
                },
            ]);
        });

        it("keeps a work object editable when its icon is unavailable", () => {
            const { service } = makeSut([workObject("Missing", "invoice")]);

            expect(service.getDictionary().workObjects).toEqual([
                { name: "invoice", originalName: "invoice" },
            ]);
        });

        it("prefixes raw SVG source but leaves a data URL untouched", () => {
            const { service, iconDictionaryService } = makeSut([
                workObject("Raw", "raw"),
                workObject("Encoded", "encoded"),
            ]);
            iconDictionaryService.addIMGToIconDictionary("<svg/>", "Raw");
            iconDictionaryService.addIMGToIconDictionary(
                "data:image/png;base64,AAA",
                "Encoded",
            );

            const icons = Object.fromEntries(
                service
                    .getDictionary()
                    .workObjects.map((entry) => [entry.name, entry.icon]),
            );
            expect(icons["raw"]).toBe("data:image/svg+xml,<svg/>");
            expect(icons["encoded"]).toBe("data:image/png;base64,AAA");
        });

        it("sorts case-insensitively", () => {
            const { service, iconDictionaryService } = makeSut([
                workObject("Doc", "Banana"),
                workObject("Doc", "apple"),
            ]);
            iconDictionaryService.addIMGToIconDictionary("<svg/>", "Doc");

            expect(
                service.getDictionary().workObjects.map((entry) => entry.name),
            ).toEqual(["apple", "Banana"]);
        });
    });

    it("derives a fresh snapshot on every read", () => {
        const { service, iconDictionaryService } = makeSut([
            activity("send"),
            workObject("Doc", "invoice"),
        ]);
        iconDictionaryService.addIMGToIconDictionary("<svg/>", "Doc");

        expect(service.getDictionary()).not.toBe(service.getDictionary());
        expect(service.getDictionary().activities).toHaveLength(1);
        expect(service.getDictionary().workObjects).toHaveLength(1);
    });

    it("hands out copies so a caller cannot mutate the dictionary", () => {
        const { service, iconDictionaryService } = makeSut([
            activity("send"),
            workObject("Doc", "invoice"),
        ]);
        iconDictionaryService.addIMGToIconDictionary("<svg/>", "Doc");
        const snapshot = service.getDictionary();
        (
            snapshot.activities as Array<{ name: string; originalName: string }>
        ).push({ name: "x", originalName: "x" });
        (
            snapshot.workObjects as Array<{
                name: string;
                originalName: string;
                icon?: string;
            }>
        ).push({ name: "x", originalName: "x", icon: "" });

        expect(service.getDictionary().activities).toHaveLength(1);
        expect(service.getDictionary().workObjects).toHaveLength(1);
    });

    describe("getUniqueWorkObjectNames", () => {
        it("dedups names and drops the unnamed, ignoring non-work-objects", () => {
            const { service } = makeSut([
                workObject("Doc", "invoice"),
                workObject("Doc", "invoice"),
                workObject("Doc", "receipt"),
                workObject("Doc", ""),
                actor("Person", "Alice"),
                activity("send"),
            ]);

            expect(service.getUniqueWorkObjectNames()).toEqual([
                "invoice",
                "receipt",
            ]);
        });

        it("reads the canvas directly", () => {
            const { service } = makeSut([workObject("Missing", "invoice")]);

            expect(service.getUniqueWorkObjectNames()).toEqual(["invoice"]);
            expect(service.getDictionary().workObjects).toEqual([
                { name: "invoice", originalName: "invoice" },
            ]);
        });
    });

    describe("renameLabels", () => {
        it("resolves swaps and category-specific mappings before mutation", () => {
            const first = activity("send");
            first.id = "a";
            const second = activity("receive");
            second.id = "b";
            const object = workObject("Doc", "send");
            object.id = "w";
            const { service, commandStack } = makeSut([first, second, object]);

            expect(
                service.renameLabels([
                    {
                        category: "activity",
                        originalName: "send",
                        name: "receive",
                    },
                    {
                        category: "activity",
                        originalName: "receive",
                        name: "send",
                    },
                    {
                        category: "workObject",
                        originalName: "send",
                        name: "stored",
                    },
                ]),
            ).toEqual(["a", "b", "w"]);
            expect(commandStack.execute).toHaveBeenCalledWith(
                "labels.renameBatch",
                {
                    updates: [
                        { element: first, name: "receive" },
                        { element: second, name: "send" },
                        { element: object, name: "stored" },
                    ],
                },
            );
            expect(first.businessObject.name).toBe("send");
            expect(second.businessObject.name).toBe("receive");
        });

        it("rejects conflicting replacements before starting a command", () => {
            const { service, commandStack } = makeSut([activity("send")]);

            expect(() =>
                service.renameLabels([
                    {
                        category: "activity",
                        originalName: "send",
                        name: "one",
                    },
                    {
                        category: "activity",
                        originalName: "send",
                        name: "two",
                    },
                ]),
            ).toThrow(/Conflicting replacements/);
            expect(commandStack.execute).not.toHaveBeenCalled();
        });

        it("does not create history for unchanged or unmatched entries", () => {
            const { service, commandStack } = makeSut([activity("send")]);

            expect(
                service.renameLabels([
                    {
                        category: "activity",
                        originalName: "send",
                        name: "send",
                    },
                    {
                        category: "workObject",
                        originalName: "missing",
                        name: "new",
                    },
                ]),
            ).toEqual([]);
            expect(commandStack.execute).not.toHaveBeenCalled();
        });
    });
});
