import DomainStoryModeling from "../modeling";
import ElementRegistryService from "../../service";
import { DomainStoryActivityNumbering } from "./DomainStoryActivityNumbering";
import { DomainStoryNumberingRegistry } from "./DomainStoryNumberingRegistry";
import { DomainStoryPopupService } from "./DomainStoryPopupService";

export default {
    __depends__: [DomainStoryModeling, ElementRegistryService],
    __init__: [
        "domainStoryNumberingRegistry",
        "domainStoryActivityNumbering",
        "domainStoryNumberingUi",
    ],
    domainStoryNumberingRegistry: ["type", DomainStoryNumberingRegistry],
    // `__init__` is required, not optional: a CommandInterceptor only registers
    // its listeners in the constructor, and nothing injects it.
    domainStoryActivityNumbering: ["type", DomainStoryActivityNumbering],
    domainStoryNumberingUi: ["type", DomainStoryPopupService],
};
