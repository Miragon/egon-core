import { describe, expect, it } from "vitest";
import { LabelDictionaryService } from "../LabelDictionaryService";
import { IconDictionaryService } from "../../../iconSet/service";
import { IconStyleSheetPort } from "../../../iconSet/domain/ports/IconStyleSheetPort";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { CanvasObject } from "../../../story/domain/canvasObject";
import type { ElementRegistryService } from "../../../modeler/service";

/**
 * First cover for the label dictionary, which the mass-rename UI (still
 * commented out in the service) will read verbatim. The dictionary is a
 * projection over the canvas, so every rule that decides *what lands in it*
 * — dedup, the empty-name filter, case-insensitive ordering, and the silent
 * skip of a work object whose icon is not in the current set — is behaviour a
 * host depends on and none of it was pinned before.
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
    );
    const elementRegistryService = {
        getAllCanvasObjects: () => canvasObjects,
        getAllWorkObjects: () =>
            canvasObjects.filter((element) =>
                element.type.startsWith(ElementTypes.WORKOBJECT),
            ),
    } as unknown as ElementRegistryService;

    const service = new LabelDictionaryService(
        elementRegistryService,
        iconDictionaryService,
    );

    return { service, iconDictionaryService };
}

describe("LabelDictionaryService", () => {
    describe("activity labels", () => {
        it("collects each distinct activity name once", () => {
            const { service } = makeSut([
                activity("send"),
                activity("send"),
                activity("receive"),
            ]);

            service.createLabelDictionaries();

            expect(service.getActivityLabels()).toEqual([
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

            service.createLabelDictionaries();

            expect(service.getActivityLabels()).toEqual([
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

            service.createLabelDictionaries();

            expect(
                service.getActivityLabels().map((entry) => entry.name),
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

            service.createLabelDictionaries();

            expect(service.getWorkObjectLabels()).toEqual([
                {
                    name: "invoice",
                    originalName: "invoice",
                    icon: "data:image/svg+xml,<svg/>",
                },
            ]);
        });

        it("skips a work object whose icon is not in the current set", () => {
            // `getIconSource` answers "" on a miss, and the service bails out of
            // that element rather than emitting an entry with a broken image.
            const { service } = makeSut([workObject("Missing", "invoice")]);

            service.createLabelDictionaries();

            expect(service.getWorkObjectLabels()).toEqual([]);
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

            service.createLabelDictionaries();

            const icons = Object.fromEntries(
                service
                    .getWorkObjectLabels()
                    .map((entry) => [entry.name, entry.icon]),
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

            service.createLabelDictionaries();

            expect(
                service.getWorkObjectLabels().map((entry) => entry.name),
            ).toEqual(["apple", "Banana"]);
        });
    });

    it("resets rather than appends when built twice", () => {
        const { service, iconDictionaryService } = makeSut([
            activity("send"),
            workObject("Doc", "invoice"),
        ]);
        iconDictionaryService.addIMGToIconDictionary("<svg/>", "Doc");

        service.createLabelDictionaries();
        service.createLabelDictionaries();

        expect(service.getActivityLabels()).toHaveLength(1);
        expect(service.getWorkObjectLabels()).toHaveLength(1);
    });

    it("hands out copies so a caller cannot mutate the dictionary", () => {
        const { service, iconDictionaryService } = makeSut([
            activity("send"),
            workObject("Doc", "invoice"),
        ]);
        iconDictionaryService.addIMGToIconDictionary("<svg/>", "Doc");
        service.createLabelDictionaries();

        service.getActivityLabels().push({ name: "x", originalName: "x" });
        service
            .getWorkObjectLabels()
            .push({ name: "x", originalName: "x", icon: "" });

        expect(service.getActivityLabels()).toHaveLength(1);
        expect(service.getWorkObjectLabels()).toHaveLength(1);
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

        it("reads the canvas directly, without createLabelDictionaries", () => {
            // Unlike the two label getters this one is not backed by the
            // dictionaries, so it answers before they have ever been built —
            // and it is unaffected by the missing-icon skip above.
            const { service } = makeSut([workObject("Missing", "invoice")]);

            expect(service.getUniqueWorkObjectNames()).toEqual(["invoice"]);
            expect(service.getWorkObjectLabels()).toEqual([]);
        });
    });
});
