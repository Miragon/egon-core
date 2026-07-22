import { ElementRegistryService } from "./ElementRegistryService";
import { DirtyFlagService } from "./DirtyFlagService";
import { DomainStoryPropertiesService } from "./DomainStoryPropertiesService";

export * from "./EgonClient";
export * from "./EgonClientConfig";
export * from "../domain/ports";

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
