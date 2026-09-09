import { describe, expect, it, vi } from "vitest";
import { DomainStoryExportService } from "../DomainStoryExportService";
import { DomainStoryPropertiesService } from "../../../modeler/service/DomainStoryPropertiesService";
import type { ElementRegistryService } from "../../../modeler/service/ElementRegistryService";
import type { IconSetImportExportService } from "../../../iconSet/service/IconSetImportExportService";

/** A registry stub that yields the given business objects as canvas objects. */
function makeRegistry(
    businessObjects: any[],
    usedIcons: { actors: string[]; workObjects: string[] } = {
        actors: [],
        workObjects: [],
    },
): ElementRegistryService {
    return {
        createObjectListForDSTDownload: () =>
            businessObjects.map((businessObject) => ({ businessObject })),
        getUsedIcons: () => usedIcons,
    } as unknown as ElementRegistryService;
}

/** An icon-service stub returning a fixed export configuration. */
function makeIconService(config: any): IconSetImportExportService {
    return {
        getConfigurationForStoryExport: () => config,
    } as unknown as IconSetImportExportService;
}

describe("DomainStoryExportService", () => {
    it("emits the v4.0.0 envelope with metadata, icon-set name, sorted objects, and no trailer", () => {
        const properties = new DomainStoryPropertiesService();
        const scope = {
            granularity: "coarse-grained",
            pointInTime: "to-be",
            domainPurity: "digitalized",
        };
        // deliberately import version 1.5.0 to prove export forces 4.0.0
        properties.setProperties(
            "My Title",
            "My Description",
            scope as any,
            "1.5.0",
        );

        const registry = makeRegistry([
            { id: "shape_2", type: "domainStory:actorPerson" },
            { id: "connection_9", type: "domainStory:activity" },
            { id: "shape_1", type: "domainStory:workObjectDocument" },
        ]);
        const iconService = makeIconService({
            name: "myset",
            actors: { Person: "<svg/>" },
            workObjects: {},
        });

        const result = JSON.parse(
            new DomainStoryExportService(
                registry,
                iconService,
                properties,
            ).export(),
        );

        expect(Object.keys(result)).toEqual(["iconSet", "domainStory"]);
        expect(result.iconSet).toEqual({
            name: "myset",
            actors: { Person: "<svg/>" },
            workObjects: {},
        });
        expect(result.domainStory.version).toBe("4.0.0");
        expect(result.domainStory.title).toBe("My Title");
        expect(result.domainStory.description).toBe("My Description");
        expect(result.domainStory.scope).toEqual(scope);

        // sorted by id, and no {info}/{version} trailer objects
        expect(
            result.domainStory.businessObjects.map((bo: any) => bo.id),
        ).toEqual(["connection_9", "shape_1", "shape_2"]);
        expect(
            result.domainStory.businessObjects.every((bo: any) => "type" in bo),
        ).toBe(true);
    });

    it("omits scope when none was set and defaults to an empty icon set", () => {
        const result = JSON.parse(
            new DomainStoryExportService(
                makeRegistry([]),
                makeIconService(undefined),
                new DomainStoryPropertiesService(),
            ).export(),
        );

        expect(result.iconSet).toEqual({
            name: "",
            actors: {},
            workObjects: {},
        });
        expect(result.domainStory.businessObjects).toEqual([]);
        expect("scope" in result.domainStory).toBe(false);
    });

    it("passes live actor and work-object references to the icon export builder", () => {
        const registry = makeRegistry([], {
            actors: ["Person"],
            workObjects: ["Document"],
        });
        const getConfigurationForStoryExport = vi.fn((usedIcons: any) => ({
            name: "retained",
            actors: { [usedIcons.actors[0]]: "<actor/>" },
            workObjects: { [usedIcons.workObjects[0]]: "<object/>" },
        }));
        const iconService = {
            getConfigurationForStoryExport,
        } as unknown as IconSetImportExportService;

        const result = JSON.parse(
            new DomainStoryExportService(
                registry,
                iconService,
                new DomainStoryPropertiesService(),
            ).export(),
        );

        expect(result.iconSet).toEqual({
            name: "retained",
            actors: { Person: "<actor/>" },
            workObjects: { Document: "<object/>" },
        });
        expect(getConfigurationForStoryExport).toHaveBeenCalledWith({
            actors: ["Person"],
            workObjects: ["Document"],
        });
    });
});
