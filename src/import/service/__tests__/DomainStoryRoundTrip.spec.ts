import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseExportFile } from "../ExportFileParser";
import { DomainStoryExportService } from "../../../export/service/DomainStoryExportService";
import { DomainStoryPropertiesService } from "../../../domain/service/DomainStoryPropertiesService";
import { IconDictionaryService } from "../../../icon-set-config/service/IconDictionaryService";
import { IconSetImportExportService } from "../../../icon-set-config/service/IconSetImportExportService";
import type { ElementRegistryService } from "../../../domain/service/ElementRegistryService";

/**
 * Open→save round-trip for the v4.0.0 format. Drives the *real* icon and
 * properties services on both the import and export sides — only the element
 * registry (which needs a live canvas) is stubbed — so it proves the metadata
 * and icon-set name actually survive the trip rather than merely being echoed.
 */
function loadFixture(name: string): any {
    return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));
}

describe("v4.0.0 open→save round-trip", () => {
    it("preserves title/description/scope and the icon-set name, converges on 4.0.0, and emits no trailer", () => {
        const fixture = loadFixture("egn_export_version_4_0_0.json");
        const { iconSetConfiguration, domainStory } = parseExportFile(fixture);

        // --- import side: load the icon set and remember the metadata ---
        const iconDictionaryService = new IconDictionaryService();
        const iconService = new IconSetImportExportService(
            iconDictionaryService,
        );
        iconService.loadConfiguration(
            iconService.createIconSetConfiguration(iconSetConfiguration),
        );

        const properties = new DomainStoryPropertiesService();
        properties.setProperties(
            domainStory.title,
            domainStory.description,
            domainStory.scope,
            domainStory.version,
        );

        // --- export side (registry stubbed; a live canvas is out of scope) ---
        const registry = {
            createObjectListForDSTDownload: () =>
                domainStory.businessObjects.map((businessObject) => ({
                    businessObject,
                })),
        } as unknown as ElementRegistryService;

        const result = JSON.parse(
            new DomainStoryExportService(
                registry,
                iconService,
                properties,
            ).export(),
        );

        expect(Object.keys(result)).toEqual(["iconSet", "domainStory"]);
        expect(result.iconSet.name).toBe("default");
        expect(Object.keys(result.iconSet.actors)).toHaveLength(3);
        expect(Object.keys(result.iconSet.workObjects)).toHaveLength(6);

        expect(result.domainStory.version).toBe("4.0.0");
        expect(result.domainStory.title).toBe(fixture.domainStory.title);
        expect(result.domainStory.description).toBe(
            fixture.domainStory.description,
        );
        expect(result.domainStory.scope).toEqual(fixture.domainStory.scope);

        expect(result.domainStory.businessObjects).toHaveLength(13);
        const ids = result.domainStory.businessObjects.map((bo: any) => bo.id);
        expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
        expect(
            result.domainStory.businessObjects.every((bo: any) => "type" in bo),
        ).toBe(true);
    });
});
