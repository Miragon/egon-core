import IconDictionaryService from "../../iconSet/service";
import ElementRegistryService from "../../modeler/service";
import { LabelDictionaryService } from "./LabelDictionaryService";
import CommandStack from "diagram-js/lib/command";

// Public surface of the labelDictionary feature: the default didi module plus
// the service class, so siblings inject it through this barrel.
export { LabelDictionaryService } from "./LabelDictionaryService";

export default {
    __depends__: [IconDictionaryService, ElementRegistryService, CommandStack],
    __init__: ["domainStoryLabelDictionaryService"],
    domainStoryLabelDictionaryService: ["type", LabelDictionaryService],
};
