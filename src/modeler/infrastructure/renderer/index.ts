import DomainStoryTextRenderer from "../text-renderer";
import IconDictionaryService from "../../../iconSet/service";
import DomainStoryColorPicker from "../color-picker";

import { DomainStoryRenderer } from "./DomainStoryRenderer";

// Every dependency is read-only from the renderer (ADRs ARC-4 and EDT-2).
export default {
    __depends__: [
        DomainStoryTextRenderer,
        IconDictionaryService,
        DomainStoryColorPicker,
    ],
    __init__: ["domainStoryRenderer"],
    domainStoryRenderer: ["type", DomainStoryRenderer],
};
