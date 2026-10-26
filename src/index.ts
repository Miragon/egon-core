export {
    EgonClient,
    type EgonEventMap,
    type EgonEventName,
    type EgonClientPorts,
} from "./modeler/service/EgonClient";
export type { EgonClientConfig } from "./modeler/service/EgonClientConfig";
export type {
    ColorPickerAnchor,
    ColorPickerHandle,
    ColorPickerProvider,
    ColorPickerRequest,
} from "./modeler/service/ColorPickerProvider";

// Ports, for injecting test doubles into EgonClient.create.
export type {
    ModelerPort,
    // Payload of the `import.repaired` event (ADR DOC-2).
    ImportRepairData,
} from "./modeler/domain/ports/ModelerPort";
export type { IconPort } from "./modeler/domain/ports/IconPort";

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
    PngExportOptions,
    PngExportResult,
    SvgExportOptions,
    SvgExportResult,
    VisualExportOptions,
} from "./modeler/domain/export/VisualExport";
export type {
    DomainStoryTextRendererConfig,
    DomainStoryTextRendererStyle,
} from "./modeler/domain/model/TextRendererConfig";
export type {
    IconSet,
    IconSetData,
    IconCategory,
    IconConfiguration,
    IconNamesByCategory,
    IconMap,
} from "./iconSet/domain/IconTypes";
export type {
    LabelCategory,
    LabelDictionary,
    LabelEntry,
    LabelRename,
    LabelRenameBatch,
    WorkObjectLabelEntry,
} from "./labelDictionary/domain/LabelDictionary";
export type { ReplayStartOptions, ReplayState } from "./story/domain/replay";

// The public API is frozen to EgonClient plus these types (rule G, ADR API-1).
// Deep imports keep each feature's didi default module out of the package entry.
