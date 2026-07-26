import { Element, Shape } from "diagram-js/lib/model/Types";
import {
    add as collectionAdd,
    remove as collectionRemove,
} from "diagram-js/lib/util/Collections";

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

/**
 * Re-parents every shape that visually sits inside `shape` (a group) onto it.
 *
 * diagram-js `element.children` is a plain Array, so the `.add()`/`.remove()`
 * methods upstream calls here do not exist — they threw `TypeError` and made the
 * whole group-reparenting path dead (see issue #8). Upstream got away with it
 * because moddle collections do carry those methods. The diagram-js `Collections`
 * helpers are the array-safe equivalents and are what the updater already uses.
 */
export function reworkGroupElements(parent: any, shape: Shape) {
    parent.children.slice().forEach((innerShape: any) => {
        if (innerShape.id !== shape.id) {
            if (
                innerShape.x >= shape.x &&
                innerShape.x <= shape.x + shape.width
            ) {
                if (
                    innerShape.y >= shape.y &&
                    innerShape.y <= shape.y + shape.height
                ) {
                    if (innerShape.children?.includes(shape)) {
                        collectionRemove(innerShape.children, shape);
                    }
                    innerShape.parent = shape;
                    if (!shape.children.includes(innerShape)) {
                        shape.children.push(innerShape);
                    }
                }
            }
        }
    });
}

/** Lifts `shape` out of the group `parent` and back onto the group's own parent. */
export function undoGroupRework(parent: any, shape: Shape) {
    const superParent = parent.parent;

    // See reworkGroupElements: `children` is an Array, not a moddle collection.
    collectionRemove(parent.children, shape);
    collectionAdd(superParent.children, shape);

    shape.parent = superParent;

    const svgShape = document.querySelector(
        "[data-element-id=" + shape.id + "]",
    )?.parentElement;

    if (!svgShape) {
        throw new Error("No element with id " + shape.id + " found.");
    }

    const svgGroup = svgShape.parentElement;
    const svgGroupParent = svgGroup?.parentElement?.parentElement;
    svgGroup?.removeChild(svgShape);
    svgGroupParent?.appendChild(svgShape);
}

export function isCustomIcon(icon: string) {
    // default icons are provided as SVG
    // custom icons are provided as "Data URL" with a base64-encoded image as payload
    return icon.startsWith("data");
}

export function isCustomSvgIcon(icon: string) {
    // default icons are provided as SVG
    // custom icons are provided as "Data URL" with a base64-encoded image as payload
    return icon.startsWith("data:image/svg");
}

/**
 * Draws the left-bracket outline of a text annotation, scaled to `height`.
 * This is the only shape the former bpmn-js-derived getScaledPath ever
 * produced (always mx=my=0, scale 1), so it collapses to this one-liner: a
 * pen move to the origin, out and back to form the top serif, down the spine,
 * and out again for the bottom serif.
 */
export function getAnnotationBracketSvg(height: number) {
    return `m 0, 0 m 10,0 l -10,0 l 0,${height} l 10,0`;
}
