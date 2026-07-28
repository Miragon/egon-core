import DomainServiceModule from "../../modeler/service";
import IconSetModule from "../../iconSet/service";
import { DomainStoryImportService } from "./DomainStoryImportService";
import { VersionBoxBanner } from "../infrastructure/VersionBoxBanner";

export default {
    // depend on the shared domain services so `domainStoryPropertiesService`
    // (written on import, read on export) is registered in the injector, and on
    // the icon set services the import service injects to restore a story's
    // custom icons (`domainStoryIconDictionaryService`,
    // `domainStoryIconSetImportExportService`).
    __depends__: [DomainServiceModule, IconSetModule],
    __init__: ["domainStoryImportService"],
    domainStoryImportService: ["type", DomainStoryImportService],
    // Composition root: wire the VersionBannerPort adapter here so the import
    // service stays DOM-free. Not in __init__ — didi resolves it lazily via the
    // service's $inject.
    domainStoryVersionBanner: ["type", VersionBoxBanner],
};
