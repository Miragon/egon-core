import { beforeEach, describe, expect, it } from "vitest";
import { IconDictionaryService } from "../IconDictionaryService";
import {
    FileConfiguration,
    IconSetImportExportService,
} from "../IconSetImportExportService";
import { IconStyleSheetPort } from "../../domain/ports/IconStyleSheetPort";

// This suite exercises import/export, not CSS injection; a no-op port exactly
// preserves today's jsdom behavior (without an #iconsCss sheet, insertion was
// already a silent no-op).
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
        dictionaryService = new IconDictionaryService(noopStyleSheet);
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
