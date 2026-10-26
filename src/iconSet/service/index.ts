import { IconDictionaryService } from "./IconDictionaryService";
import { IconSetImportExportService } from "./IconSetImportExportService";
import { IconCssInjector } from "../infrastructure/IconCssInjector";
import { DomPurifyIconSanitizer } from "../infrastructure/DomPurifyIconSanitizer";

/**
 * Siblings import the icon services only from this barrel. The DOM-owning
 * adapters are wired here but never re-exported, so no sibling reaches
 * infrastructure.
 */
export { IconDictionaryService } from "./IconDictionaryService";
export {
    IconSetImportExportService,
    type FileConfiguration,
} from "./IconSetImportExportService";

export default {
    __init__: [
        "domainStoryIconDictionaryService",
        "domainStoryIconSetImportExportService",
    ],
    domainStoryIconDictionaryService: ["type", IconDictionaryService],
    domainStoryIconSetImportExportService: ["type", IconSetImportExportService],
    // IconStyleSheetPort adapter, so the service stays DOM-free.
    domainStoryIconStyleSheet: ["type", IconCssInjector],
    // One adapter per injector, shared by storage and the render boundary.
    domainStoryIconSanitizer: ["type", DomPurifyIconSanitizer],
};
