import ElementRegistryService from "../../domain/service";
import IconSetImportExportService from "../../iconSet/service";
import { DomainStoryExportService } from "./DomainStoryExportService";

export default {
    __depends__: [ElementRegistryService, IconSetImportExportService],
    __init__: ["domainStoryExportService"],
    domainStoryExportService: ["type", DomainStoryExportService],
};
