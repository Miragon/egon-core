import { ElementRegistryService } from "./ElementRegistryService";
import { DirtyFlagService } from "./DirtyFlagService";
import { DomainStoryPropertiesService } from "./DomainStoryPropertiesService";

// Sibling features inject these services through this barrel, not the
// concrete service files.
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
