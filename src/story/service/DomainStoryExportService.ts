import {
    ElementRegistryService,
    DomainStoryPropertiesService,
} from "../../modeler/service";
import { BusinessObject } from "../domain/businessObject";
import { IconSetExportConfiguration } from "../domain/iconSet";
import { IconSetImportExportService } from "../../iconSet/service";
import { EgnExportFile } from "../domain/egnExportFile";
import type { CanvasObject } from "../domain/canvasObject";
import { isAnnotation } from "../domain/elementPredicates";

const EGN_EXPORT_VERSION = "4.0.0";

const EMPTY_ICON_SET: IconSetExportConfiguration = {
    name: "",
    actors: {},
    workObjects: {},
};

/**
 * Story metadata and the icon-set name are not in the element registry, so they
 * are read back from the services import populated.
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

    /** Sorted by id so diffs between saves stay meaningful. */
    private getStory(): BusinessObject[] {
        return this.elementRegistryService
            .createObjectListForDSTDownload()
            .map(projectBusinessObject)
            .sort((objA: BusinessObject, objB: BusinessObject) => {
                if (objA.id !== undefined && objB.id !== undefined) {
                    return objA.id.localeCompare(objB.id);
                }
                return 0;
            });
    }

    private createExportFile(businessObjects: BusinessObject[]): EgnExportFile {
        const iconSet =
            this.iconSetImportExportService.getConfigurationForStoryExport(
                this.elementRegistryService.getUsedIcons(),
            ) ?? EMPTY_ICON_SET;

        return new EgnExportFile(iconSet, {
            businessObjects,
            title: this.propertiesService.getTitle(),
            description: this.propertiesService.getDescription(),
            version: EGN_EXPORT_VERSION,
            scope: this.propertiesService.getScope(),
        });
    }
}

/**
 * Annotation size belongs to the live shape, so it goes into a detached copy
 * and serializing never writes it into the business object (ADR ARC-4).
 */
function projectBusinessObject(canvasObject: CanvasObject): BusinessObject {
    const businessObject = { ...canvasObject.businessObject };
    if (isAnnotation(canvasObject)) {
        businessObject.width = canvasObject.width;
        businessObject.height = canvasObject.height;
    }
    return businessObject;
}
