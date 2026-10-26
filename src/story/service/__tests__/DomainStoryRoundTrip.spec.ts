import { describe, expect, it } from "vitest";
import { parseExportFile } from "../ExportFileParser";
import { importFixture } from "../../../__tests__/helpers/importFixture";
import { DomainStoryExportService } from "../DomainStoryExportService";
import { DomainStoryPropertiesService } from "../../../modeler/service/DomainStoryPropertiesService";
import { IconDictionaryService } from "../../../iconSet/service/IconDictionaryService";
import { IconSetImportExportService } from "../../../iconSet/service/IconSetImportExportService";
import { IconStyleSheetPort } from "../../../iconSet/domain/ports/IconStyleSheetPort";
import type { ElementRegistryService } from "../../../modeler/service/ElementRegistryService";
import { passThroughIconSanitizer } from "../../../__tests__/helpers/passThroughIconSanitizer";

// This proves metadata survival, not CSS injection.
const noopStyleSheet: IconStyleSheetPort = { addIconStyle() {} };

/**
 * Drives the real icon and properties services on both sides and stubs only the
 * element registry (it needs a live canvas), so metadata must actually survive.
 */
describe("v4.0.0 open→save round-trip", () => {
    it("preserves title/description/scope and the icon-set name, converges on 4.0.0, and emits no trailer", () => {
        const fixture = importFixture<any>("egn_export_version_4_0_0.json");
        const { iconSetConfiguration, domainStory } = parseExportFile(fixture);

        // --- import side: load the icon set and remember the metadata ---
        const iconDictionaryService = new IconDictionaryService(
            noopStyleSheet,
            passThroughIconSanitizer,
        );
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

        // --- export side ---
        const registry = {
            createObjectListForDSTDownload: () =>
                domainStory.businessObjects.map((businessObject) => ({
                    businessObject,
                })),
            getUsedIcons: () => ({ actors: [], workObjects: [] }),
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

    // SVG-unsafe characters are escaped only at export-to-SVG time; the JSON
    // model must keep them verbatim.
    it("round-trips a label with '--', '<', '>' through JSON export/import verbatim", () => {
        const rawLabel = "a--b <c>";
        const fixture = importFixture<any>("egn_export_version_4_0_0.json");
        const targetId = fixture.domainStory.businessObjects[0].id;
        fixture.domainStory.businessObjects[0].name = rawLabel;

        const { iconSetConfiguration, domainStory } = parseExportFile(fixture);

        const iconDictionaryService = new IconDictionaryService(
            noopStyleSheet,
            passThroughIconSanitizer,
        );
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

        const registry = {
            createObjectListForDSTDownload: () =>
                domainStory.businessObjects.map((businessObject) => ({
                    businessObject,
                })),
            getUsedIcons: () => ({ actors: [], workObjects: [] }),
        } as unknown as ElementRegistryService;

        const result = JSON.parse(
            new DomainStoryExportService(
                registry,
                iconService,
                properties,
            ).export(),
        );

        const exported = result.domainStory.businessObjects.find(
            (bo: any) => bo.id === targetId,
        );
        expect(exported.name).toBe(rawLabel);
    });
});
