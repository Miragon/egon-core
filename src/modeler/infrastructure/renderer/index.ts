import DomainStoryTextRenderer from "../text-renderer";
import ElementRegistryService from "../../service";
import DirtyFlagService from "../../service";
import IconDictionaryService from "../../../iconSet/service";

import { DomainStoryRenderer } from "./DomainStoryRenderer";
import CommandStack from "diagram-js/lib/command";

export default {
    __depends__: [
        DomainStoryTextRenderer,
        ElementRegistryService,
        DirtyFlagService,
        IconDictionaryService,
        CommandStack,
    ],
    __init__: ["domainStoryRenderer"],
    domainStoryRenderer: ["type", DomainStoryRenderer],
};
