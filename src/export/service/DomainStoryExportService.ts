import { ElementRegistryService } from "../../domain/service/ElementRegistryService";
import { DomainStoryPropertiesService } from "../../domain/service/DomainStoryPropertiesService";
import { BusinessObject } from "../../domain/entities/businessObject";
import { IconSetExportConfiguration } from "../../domain/entities/iconSet";
import { IconSetImportExportService } from "../../iconSet/service/IconSetImportExportService";
import { EgnExportFile } from "../domain/egnExportFile";

/** The format version this library converges every export on. */
const EGN_EXPORT_VERSION = "4.0.0";

/** An empty icon set, emitted when the canvas has no icons yet. */
const EMPTY_ICON_SET: IconSetExportConfiguration = {
    name: "",
    actors: {},
    workObjects: {},
};

/**
 * Serializes the current diagram to the EGN v4.0.0 file format.
 *
 * The diagram elements come from the element registry; the story-level metadata
 * (title/description/scope) and the icon-set name do not live there, so they
 * are read back from the properties service and the icon service — both
 * populated on import — to keep them intact across an open→save round-trip.
 */
export class DomainStoryExportService {
    static $inject: string[] = [
        "domainStoryElementRegistryService",
        "domainStoryIconSetImportExportService",
        "domainStoryPropertiesService",
    ];

    constructor(
        private readonly elementRegistryService: ElementRegistryService,
        private readonly iconSetImportExportService: IconSetImportExportService,
        private readonly propertiesService: DomainStoryPropertiesService,
    ) {}

    export(): string {
        const businessObjects = this.getStory();
        const exportFile = this.createExportFile(businessObjects);
        return JSON.stringify(exportFile, null, 2);
    }

    /**
     * Collects the diagram's business objects sorted by id. Sorting keeps the
     * output stable so diffs between saves stay meaningful. Unlike the legacy
     * exporter, no `{info}`/`{version}` trailer is appended — that metadata now
     * lives on the `domainStory` object.
     */
    private getStory(): BusinessObject[] {
        return this.elementRegistryService
            .createObjectListForDSTDownload()
            .map((canvasObject) => canvasObject.businessObject)
            .sort((objA: BusinessObject, objB: BusinessObject) => {
                if (objA.id !== undefined && objB.id !== undefined) {
                    return objA.id.localeCompare(objB.id);
                }
                return 0;
            });
    }

    private createExportFile(businessObjects: BusinessObject[]): EgnExportFile {
        const iconSet =
            this.iconSetImportExportService.getCurrentConfigurationForExport() ??
            EMPTY_ICON_SET;

        return new EgnExportFile(iconSet, {
            businessObjects,
            title: this.propertiesService.getTitle(),
            description: this.propertiesService.getDescription(),
            version: EGN_EXPORT_VERSION,
            scope: this.propertiesService.getScope(),
        });
    }
}
