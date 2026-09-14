import { forEach, isArray, isUndefined } from "min-dash";
import EventBus from "diagram-js/lib/core/EventBus";
import { DomainStoryPropertyCopy } from "./DomainStoryPropertyCopy";
import { getBusinessObject } from "../../../shared/infrastructure/util";
import { isLabel } from "diagram-js/lib/util/ModelUtil";

const LOW_PRIORITY = 750;

export class DomainStoryCopyPaste {
    static $inject: string[] = ["domainStoryPropertyCopy", "eventBus"];

    constructor(
        private readonly domainStoryPropertyCopy: DomainStoryPropertyCopy,
        eventBus: EventBus,
    ) {
        eventBus.on(
            "copyPaste.copyElement",
            LOW_PRIORITY,
            function (context: any) {
                const descriptor = context.descriptor,
                    element = context.element;

                const businessObject = (descriptor.oldBusinessObject =
                    getBusinessObject(element));

                descriptor.type = element.type;

                copyProperties(businessObject, descriptor, "name");

                if (isLabel(descriptor)) {
                    return descriptor;
                }
            },
        );

        eventBus.on("copyPaste.pasteElement", (context: any) => {
            const cache = context.cache,
                descriptor = context.descriptor,
                oldBusinessObject = descriptor.oldBusinessObject,
                newBusinessObject: Record<string, any> = {};

            // do NOT copy a business object if an external label
            if (isLabel(descriptor)) {
                descriptor.businessObject = getBusinessObject(
                    cache[descriptor.labelTarget],
                );

                return;
            }

            descriptor.businessObject =
                this.domainStoryPropertyCopy.copyElement(
                    oldBusinessObject,
                    newBusinessObject,
                );

            // Paste is the one path that mints a business object without a
            // `type`: `copyElement` is called with no `propertyNames`, so it
            // copies nothing. Every other path is covered — the import carries
            // `type` in the file, and `DomainStoryElementFactory.create` stamps
            // it whenever it creates a fresh business object (palette, context-pad
            // append, `shape.replace`). Until #74 the *renderer* patched it in
            // while drawing; carrying the descriptor's own `type` (set by the
            // `copyPaste.copyElement` listener above) does it here instead, so a
            // pasted element is complete before anything paints it.
            newBusinessObject["type"] = descriptor.type;

            copyProperties(descriptor, newBusinessObject, ["name"]);

            removeProperties(descriptor, "oldBusinessObject");
        });
    }
}

function copyProperties(source: any, target: any, properties: any) {
    if (!isArray(properties)) {
        properties = [properties];
    }

    forEach(properties, function (property: any) {
        if (!isUndefined(source[property])) {
            target[property] = source[property];
        }
    });
}

function removeProperties(element: any, properties: any) {
    if (!isArray(properties)) {
        properties = [properties];
    }

    forEach(properties, function (property: any) {
        if (element[property]) {
            delete element[property];
        }
    });
}
