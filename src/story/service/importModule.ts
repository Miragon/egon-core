import DomainServiceModule from "../../modeler/service";
import IconSetModule from "../../iconSet/service";
import { DomainStoryImportService } from "./DomainStoryImportService";
import { VersionBoxBanner } from "../infrastructure/VersionBoxBanner";

export default {
    // Registers `domainStoryPropertiesService` (written on import, read on
    // export) and the icon-set services that restore a story's custom icons.
    __depends__: [DomainServiceModule, IconSetModule],
    __init__: ["domainStoryImportService"],
    domainStoryImportService: ["type", DomainStoryImportService],
    // The VersionBannerPort adapter keeps the import service DOM-free.
    domainStoryVersionBanner: ["type", VersionBoxBanner],
};
