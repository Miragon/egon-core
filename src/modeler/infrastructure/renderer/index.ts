import DomainStoryTextRenderer from "../text-renderer";
import IconDictionaryService from "../../../iconSet/service";

import { DomainStoryRenderer } from "./DomainStoryRenderer";

// Two dependencies, because the renderer only draws (ADR 0016). The element
// registry, the dirty-flag service, the command stack and the number stash were
// all here to serve writes that moved onto commands and import repairs in #74.
export default {
    __depends__: [DomainStoryTextRenderer, IconDictionaryService],
    __init__: ["domainStoryRenderer"],
    domainStoryRenderer: ["type", DomainStoryRenderer],
};
