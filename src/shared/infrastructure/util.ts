import { Element } from "diagram-js/lib/model/Types";

// TODO: this will not work for actors and work objects as the name of the icon is part of the type
export function is(element: Element | undefined, type: string): boolean {
    if (!element) {
        return false;
    }

    const bo = getBusinessObject(element);

    return bo && bo.type === type;
}

export function getBusinessObject(element: Element) {
    return (element && element.businessObject) || element;
}

export function isCustomIcon(icon: string) {
    // Custom icons are data URLs; default icons are raw SVG.
    return icon.startsWith("data");
}

export function isCustomSvgIcon(icon: string) {
    return icon.startsWith("data:image/svg");
}

/**
 * The text-annotation bracket: top serif, a spine of `height`, bottom serif.
 * Equals upstream's getScaledPath output for the only arguments it ever got.
 */
export function getAnnotationBracketSvg(height: number) {
    return `m 0, 0 m 10,0 l -10,0 l 0,${height} l 10,0`;
}
