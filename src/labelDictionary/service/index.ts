import IconDictionaryService from "../../iconSet/service";
import ElementRegistryService from "../../modeler/service";
import { LabelDictionaryService } from "./LabelDictionaryService";
import CommandStack from "diagram-js/lib/command";

export { LabelDictionaryService } from "./LabelDictionaryService";

export default {
    __depends__: [IconDictionaryService, ElementRegistryService, CommandStack],
    __init__: ["domainStoryLabelDictionaryService"],
    domainStoryLabelDictionaryService: ["type", LabelDictionaryService],
};
