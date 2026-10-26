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

            // An external label shares its target's business object.
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

            // `copyElement` without `propertyNames` copies nothing, so paste must
            // set `type` itself; the renderer must not patch it in (ADR ARC-4).
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
