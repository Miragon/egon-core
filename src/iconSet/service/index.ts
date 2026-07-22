import { IconDictionaryService } from "./IconDictionaryService";
import { IconSetImportExportService } from "./IconSetImportExportService";
import { IconCssInjector } from "../infrastructure/IconCssInjector";

/**
 * Public surface of the iconSet feature. Sibling features import the icon
 * services from this barrel (never their concrete files) so the feature keeps a
 * single, stable entry point. The DOM-owning `IconCssInjector` stays behind the
 * default didi module — it is wired here as the composition root and never
 * re-exported, so no sibling can reach the infrastructure layer.
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
    // Not in __init__: didi resolves it lazily via IconDictionaryService's
    // $inject. Implements IconStyleSheetPort so the service stays DOM-free.
    domainStoryIconStyleSheet: ["type", IconCssInjector],
};
