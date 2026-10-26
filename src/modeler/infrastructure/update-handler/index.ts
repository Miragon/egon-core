import CommandStack from "diagram-js/lib/command";
import DomainStoryModeling from "../modeling";
import DomainStoryPopup from "../popup";
import ElementRegistryService from "../../service";
import { DomainStoryUpdateHandler } from "./DomainStoryUpdateHandler";

export default {
    // `DomainStoryPopup` provides `domainStoryNumberingRegistry` for
    // `ActivityChangedHandler`; command handlers are created lazily, so a missing
    // provider would only throw at the first `activity.changed`.
    __depends__: [
        DomainStoryModeling,
        DomainStoryPopup,
        ElementRegistryService,
        CommandStack,
    ],
    __init__: ["domainStoryUpdateHandler"],
    domainStoryUpdateHandler: ["type", DomainStoryUpdateHandler],
};
