import IconDictionaryService from "../../iconSet/service";
import ElementRegistryService from "../../modeler/service";
import { LabelDictionaryService } from "./LabelDictionaryService";

export default {
    __depends__: [IconDictionaryService, ElementRegistryService],
    __init__: ["domainStoryLabelDictionaryService"],
    domainStoryLabelDictionaryService: ["type", LabelDictionaryService],
};
