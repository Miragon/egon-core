import { beforeEach, describe, expect, it } from "vitest";
import { IconDictionaryService } from "../IconDictionaryService";
import {
    FileConfiguration,
    IconSetImportExportService,
} from "../IconSetImportExportService";
import { IconStyleSheetPort } from "../../domain/ports/IconStyleSheetPort";
import { passThroughIconSanitizer } from "../../../__tests__/helpers/passThroughIconSanitizer";
import { ElementTypes } from "../../../story/domain/elementTypes";

// This suite exercises import/export, not CSS injection; a no-op port exactly
// preserves what the real injector does with no style element configured — a
// silent no-op.
const noopStyleSheet: IconStyleSheetPort = { addIconStyle() {} };

/**
 * Regression cover for issue #4 on the import/export side: dot-containing icon
 * names must survive createIconSetConfiguration → loadConfiguration → export
 * verbatim (they were previously truncated to "my.icon" and silently dropped
 * on import). Also pins the new replace-on-import semantics. The per-test
 * `beforeEach` builds a fresh IconDictionaryService, so its now instance-owned
 * `customIcons` pool starts empty for every case (issue #12).
 */
function iconSet(
    actors: Record<string, string>,
    workObjects: Record<string, string>,
    name = "",
): FileConfiguration {
    return { name, actors, workObjects };
}

describe("IconSetImportExportService dot-named icons", () => {
    let dictionaryService: IconDictionaryService;
    let service: IconSetImportExportService;

    beforeEach(() => {
        dictionaryService = new IconDictionaryService(
            noopStyleSheet,
            passThroughIconSanitizer,
        );
        service = new IconSetImportExportService(dictionaryService);
    });

    it("keeps a dot-containing key untruncated in createIconSetConfiguration", () => {
        const config = service.createIconSetConfiguration(
            iconSet({ "alpha.icon.v1": "<svg/>" }, {}),
        );

        expect(config.actors.has("alpha.icon.v1")).toBe(true);
    });

    it("loads a dot-named actor without silently dropping it", () => {
        service.loadConfiguration(
            service.createIconSetConfiguration(
                iconSet(
                    { "beta.icon.v2": "<svg/>" },
                    { "gamma.object.v1": "<svg/>" },
                ),
            ),
        );

        expect(
            dictionaryService.getActorsDictionary().has("beta.icon.v2"),
        ).toBe(true);
    });

    it("round-trips a dot-named icon through export verbatim", () => {
        service.loadConfiguration(
            service.createIconSetConfiguration(
                iconSet(
                    { "delta.icon.v3": "<svg/>" },
                    { "epsilon.object.v2": "<svg/>" },
                    "round-trip-set",
                ),
            ),
        );

        const exported = service.getCurrentConfigurationForExport();

        expect(exported).toBeDefined();
        expect(Object.keys(exported!.actors)).toContain("delta.icon.v3");
    });

    it("replaces (does not merge) the selected icon set on import", () => {
        service.loadConfiguration(
            service.createIconSetConfiguration(
                iconSet({ PersonA1: "<svg/>" }, { DocA1: "<svg/>" }),
            ),
        );
        service.loadConfiguration(
            service.createIconSetConfiguration(
                iconSet({ RobotB1: "<svg/>" }, { DocB1: "<svg/>" }),
            ),
        );

        expect(dictionaryService.getActorsDictionary().keysArray()).toEqual([
            "RobotB1",
        ]);
    });
});

/**
 * A half-empty icon set is legal here — unlike upstream, which always has the
 * default set loaded. Requiring *both* halves made the export report nothing at
 * all, so the populated half was overwritten with EMPTY_ICON_SET on the next
 * save and `hasIcon()`/`getIcons()` denied icons that had just been added.
 */
describe("IconSetImportExportService half-empty icon sets", () => {
    let dictionaryService: IconDictionaryService;
    let service: IconSetImportExportService;

    beforeEach(() => {
        dictionaryService = new IconDictionaryService(
            noopStyleSheet,
            passThroughIconSanitizer,
        );
        service = new IconSetImportExportService(dictionaryService);
    });

    function load(config: FileConfiguration) {
        service.loadConfiguration(service.createIconSetConfiguration(config));
    }

    it("exports a set that has only actors", () => {
        load(iconSet({ Person: "<svg/>" }, {}, "actors-only"));

        const exported = service.getCurrentConfigurationForExport();

        expect(exported).toEqual({
            name: "actors-only",
            actors: { Person: "<svg/>" },
            workObjects: {},
        });
    });

    it("exports a set that has only work objects", () => {
        load(iconSet({}, { Document: "<svg/>" }, "objects-only"));

        const exported = service.getCurrentConfigurationForExport();

        expect(exported).toEqual({
            name: "objects-only",
            actors: {},
            workObjects: { Document: "<svg/>" },
        });
    });

    it("still reports nothing for a genuinely empty set", () => {
        load(iconSet({}, {}, "empty"));

        // `undefined` is what makes the export fall back to EMPTY_ICON_SET.
        expect(service.getCurrentConfigurationForExport()).toBeUndefined();
    });
});

describe("IconSetImportExportService story export", () => {
    let dictionaryService: IconDictionaryService;
    let service: IconSetImportExportService;

    beforeEach(() => {
        dictionaryService = new IconDictionaryService(
            noopStyleSheet,
            passThroughIconSanitizer,
        );
        service = new IconSetImportExportService(dictionaryService);
    });

    function load(config: FileConfiguration) {
        service.loadConfiguration(service.createIconSetConfiguration(config));
    }

    it("retains live actor and work-object assets removed from the selection", () => {
        load(
            iconSet(
                { Person: "<person/>" },
                { Document: "<document/>" },
                "retained-assets",
            ),
        );
        dictionaryService.unregisterIconForType(ElementTypes.ACTOR, "Person");
        dictionaryService.unregisterIconForType(
            ElementTypes.WORKOBJECT,
            "Document",
        );

        expect(
            service.getConfigurationForStoryExport({
                actors: ["Person"],
                workObjects: ["Document"],
            }),
        ).toEqual({
            name: "retained-assets",
            actors: { Person: "<person/>" },
            workObjects: { Document: "<document/>" },
        });
    });

    it("keeps selected icons, supplements only missing live references, and excludes historical extras", () => {
        load(
            iconSet(
                { Person: "<person/>", Unused: "<unused/>" },
                { Document: "<document/>" },
                "first",
            ),
        );
        load(iconSet({ Robot: "<robot/>" }, {}, "replacement"));

        expect(
            service.getConfigurationForStoryExport({
                actors: ["Person", "Person", "Robot"],
                workObjects: ["Document"],
            }),
        ).toEqual({
            name: "replacement",
            actors: { Robot: "<robot/>", Person: "<person/>" },
            workObjects: { Document: "<document/>" },
        });
    });

    it("retains dotted live names after an empty replacement", () => {
        load(iconSet({ "person.v2": "<person/>" }, {}, "dotted"));
        load(iconSet({}, {}, "empty-selection"));

        expect(
            service.getConfigurationForStoryExport({
                actors: ["person.v2", "person.v2"],
                workObjects: [],
            }),
        ).toEqual({
            name: "empty-selection",
            actors: { "person.v2": "<person/>" },
            workObjects: {},
        });
    });

    it("does not alter the selection while preparing a story export", () => {
        load(iconSet({ Person: "<person/>" }, {}, "original"));
        load(iconSet({ Robot: "<robot/>" }, {}, "replacement"));
        const selectedActors = dictionaryService.getActorsDictionary();
        const selectedWorkObjects =
            dictionaryService.getWorkObjectsDictionary();

        service.getConfigurationForStoryExport({
            actors: ["Person"],
            workObjects: [],
        });

        expect(dictionaryService.getActorsDictionary()).toBe(selectedActors);
        expect(dictionaryService.getWorkObjectsDictionary()).toBe(
            selectedWorkObjects,
        );
        expect(dictionaryService.getActorsDictionary().toRecord()).toEqual({
            Robot: "<robot/>",
        });
        expect(dictionaryService.getWorkObjectsDictionary().toRecord()).toEqual(
            {},
        );
        expect(service.getCurrentConfigurationForExport()).toEqual({
            name: "replacement",
            actors: { Robot: "<robot/>" },
            workObjects: {},
        });
    });

    it("still returns undefined when neither selected nor live icons exist", () => {
        load(iconSet({}, {}, "empty"));

        expect(
            service.getConfigurationForStoryExport({
                actors: [],
                workObjects: [],
            }),
        ).toBeUndefined();
    });
});
