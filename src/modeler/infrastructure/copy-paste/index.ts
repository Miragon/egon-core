import CopyPasteModule from "diagram-js/lib/features/copy-paste";

import { DomainStoryCopyPaste } from "./DomainStoryCopyPaste";
import { DomainStoryPasteRestore } from "./DomainStoryPasteRestore";
import { DomainStoryPropertyCopy } from "./DomainStoryPropertyCopy";

export default {
    __depends__: [CopyPasteModule],
    __init__: [
        "domainStoryCopyPaste",
        "domainStoryPropertyCopy",
        "domainStoryPasteRestore",
    ],
    domainStoryCopyPaste: ["type", DomainStoryCopyPaste],
    domainStoryPropertyCopy: ["type", DomainStoryPropertyCopy],
    domainStoryPasteRestore: ["type", DomainStoryPasteRestore],
};
