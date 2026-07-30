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
export type {
    ModelerPort,
    // Payload of the `import.repaired` event (ADR 0017).
    ImportRepairData,
} from "./modeler/domain/ports/ModelerPort";
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
    DomainStoryTextRendererConfig,
    DomainStoryTextRendererStyle,
} from "./modeler/domain/model/TextRendererConfig";
export type {
    IconSet,
    IconSetData,
    IconCategory,
    IconMap,
} from "./iconSet/domain/IconTypes";

// The public API is deliberately frozen to EgonClient plus the types above
// (locked by architecture.spec.ts, rule G / ADR 0010). EgonPlugin and the
// former internal service exports are gone: EgonClient.create(config,
// additionalModules) is the advanced-integration escape hatch, and re-adding a
// named export later is non-breaking. Deep imports here are intentional so this
// barrel never pulls a feature's didi default module into the package entry.
