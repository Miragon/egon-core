// =============================================================================
// Client API (primary exports)
// =============================================================================

// Application Layer - Main entry point
export {
    EgonClient,
    type EgonEventMap,
    type EgonEventName,
    type EgonClientPorts,
} from "./modeler/service/EgonClient";
export type { EgonClientConfig } from "./modeler/service/EgonClientConfig";

// Port interfaces (for testing via constructor injection)
export type { ModelerPort } from "./modeler/domain/ports/ModelerPort";
export type { IconPort } from "./modeler/domain/ports/IconPort";

// Domain Layer - Value Objects & Types (for consumers who need type information)
export type {
    DomainStoryDocument,
    DomainStoryContent,
    DomainStoryElement,
} from "./story/domain/DomainStoryDocument";
// v4.0.0 wire-format types, re-exported so consumers can build/read documents.
export type { IconSetExportConfiguration } from "./story/domain/iconSet";
export type { Scope } from "./story/domain/scope";
export {
    PointInTime,
    DomainPurity,
    Granularity_Grain,
    Granularity_Goal,
} from "./story/domain/scope";
export type { ViewportData } from "./modeler/domain/model/Viewport";
export type {
    IconSet,
    IconSetData,
    IconCategory,
    IconMap,
} from "./iconSet/domain/IconTypes";

// =============================================================================
// Plugin module (for advanced usage / custom integrations)
// =============================================================================
export { default as EgonPlugin } from "./modeler/infrastructure/plugin";

// =============================================================================
// Internal services (deprecated - use EgonClient instead)
// These exports are kept for backward compatibility but should be removed
// in future versions.
// =============================================================================

/** @deprecated Use EgonClient.import() instead */
export { DomainStoryImportService } from "./story/service/DomainStoryImportService";
/** @deprecated Use EgonClient.export() instead */
export { DomainStoryExportService } from "./story/service/DomainStoryExportService";

// Existing original internal services (kept for backward compatibility)
export { ElementRegistryService } from "./modeler/service/ElementRegistryService";
export { DirtyFlagService } from "./modeler/service/DirtyFlagService";
export { IconDictionaryService } from "./iconSet/service/IconDictionaryService";
export { LabelDictionaryService } from "./labelDictionary/service/LabelDictionaryService";
