import { ElementRegistryService } from "./ElementRegistryService";
import { DirtyFlagService } from "./DirtyFlagService";
import { DomainStoryPropertiesService } from "./DomainStoryPropertiesService";

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
