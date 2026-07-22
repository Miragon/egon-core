import { ElementRegistryService } from "./ElementRegistryService";
import { DirtyFlagService } from "./DirtyFlagService";
import { DomainStoryPropertiesService } from "./DomainStoryPropertiesService";

// Public surface of the modeler feature. EgonClient, its config and the domain
// ports are the outward API; the three diagram-js services below are re-exported
// so sibling features (story, labelDictionary) inject them through this barrel
// instead of reaching into concrete service files.
export * from "./EgonClient";
export * from "./EgonClientConfig";
export * from "../domain/ports";
export { ElementRegistryService } from "./ElementRegistryService";
export { DirtyFlagService } from "./DirtyFlagService";
export { DomainStoryPropertiesService } from "./DomainStoryPropertiesService";

export default {
    __init__: [
        "domainStoryElementRegistryService",
        "domainStoryDirtyFlagService",
        "domainStoryPropertiesService",
    ],
    domainStoryElementRegistryService: ["type", ElementRegistryService],
    domainStoryDirtyFlagService: ["type", DirtyFlagService],
    domainStoryPropertiesService: ["type", DomainStoryPropertiesService],
};
