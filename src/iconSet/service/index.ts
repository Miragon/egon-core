import { IconDictionaryService } from "./IconDictionaryService";
import { IconSetImportExportService } from "./IconSetImportExportService";
import { IconCssInjector } from "../infrastructure/IconCssInjector";

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
