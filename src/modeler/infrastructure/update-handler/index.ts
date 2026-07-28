import CommandStack from "diagram-js/lib/command";
import DomainStoryModeling from "../modeling";
import DomainStoryPopup from "../popup";
import ElementRegistryService from "../../service";
import { DomainStoryUpdateHandler } from "./DomainStoryUpdateHandler";

export default {
    // `DomainStoryPopup` provides `domainStoryNumberingRegistry`, which
    // `ActivityChangedHandler` injects. didi instantiates registered command
    // handlers lazily, so a missing provider surfaced only at the first
    // `activity.changed` — long after boot, as a throw inside the command stack.
    __depends__: [
        DomainStoryModeling,
        DomainStoryPopup,
        ElementRegistryService,
        CommandStack,
    ],
    __init__: ["domainStoryUpdateHandler"],
    domainStoryUpdateHandler: ["type", DomainStoryUpdateHandler],
};
