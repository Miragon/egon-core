import DomainStoryTextRenderer from "../text-renderer";
import IconDictionaryService from "../../../iconSet/service";
import DomainStoryColorPicker from "../color-picker";

import { DomainStoryRenderer } from "./DomainStoryRenderer";

// Every dependency is read-only from the renderer (ADRs 0016 and 0026). The
// element registry, dirty flag, command stack and number stash remain absent;
// preview state is passive session-local presentation data.
export default {
    __depends__: [
        DomainStoryTextRenderer,
        IconDictionaryService,
        DomainStoryColorPicker,
    ],
    __init__: ["domainStoryRenderer"],
    domainStoryRenderer: ["type", DomainStoryRenderer],
};
