import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";

import { ElementTypes } from "../../story/domain/elementTypes";
import { TEST_ICON_NAMES } from "./testIconSet";
import type { TestModeler } from "./createTestModeler";

/**
 * Keeps two easy mistakes out of canvas specs:
 * - actor and work-object types carry the icon name as a suffix
 *   (`domainStory:actorPerson`); a bare `ElementTypes.ACTOR` resolves no icon.
 * - `modeling.createShape` takes the centre: `x - Math.round(width / 2)`, so a
 *   75-wide shape at `x: 200` lands at 162.
 */

/** Default position, far enough from the origin that nothing lands negative. */
const DEFAULT_POINT: Point = { x: 200, y: 200 };

export interface ShapeOptions {
    /** Centre of the new shape, not its top-left corner. */
    point?: Point;
    name?: string;
    parent?: Shape;
    width?: number;
    height?: number;
    pickedColor?: string;
}

function createShape(
    modeler: TestModeler,
    type: string,
    options: ShapeOptions = {},
): Shape {
    const attrs: Partial<Shape> = { type } as Partial<Shape>;
    if (options.name !== undefined) {
        (attrs as Record<string, unknown>)["name"] = options.name;
    }
    if (options.width !== undefined) attrs.width = options.width;
    if (options.height !== undefined) attrs.height = options.height;

    const shape = modeler.elementFactory.create("shape", attrs);

    // Before creation, so the first render already paints the colour.
    if (options.pickedColor !== undefined) {
        shape.businessObject.pickedColor = options.pickedColor;
    }

    return modeler.modeling.createShape(
        shape,
        options.point ?? DEFAULT_POINT,
        options.parent ?? (modeler.root as unknown as Shape),
    );
}

export function addActor(
    modeler: TestModeler,
    options: ShapeOptions & { icon?: string } = {},
): Shape {
    return createShape(
        modeler,
        ElementTypes.ACTOR + (options.icon ?? TEST_ICON_NAMES.person),
        options,
    );
}

export function addWorkObject(
    modeler: TestModeler,
    options: ShapeOptions & { icon?: string } = {},
): Shape {
    return createShape(
        modeler,
        ElementTypes.WORKOBJECT + (options.icon ?? TEST_ICON_NAMES.document),
        options,
    );
}

export function addAnnotation(
    modeler: TestModeler,
    options: ShapeOptions = {},
): Shape {
    return createShape(modeler, ElementTypes.TEXTANNOTATION, options);
}

export function addGroup(
    modeler: TestModeler,
    options: ShapeOptions = {},
): Shape {
    return createShape(modeler, ElementTypes.GROUP, options);
}

/**
 * Does not enforce the grammar: `CommandStack.execute` never consults
 * `canExecute`, so a forbidden pair really is created. Specs that care must
 * assert `rules.allowed(...)` themselves.
 */
export function connect(
    modeler: TestModeler,
    source: Shape,
    target: Shape,
    type: ElementTypes = ElementTypes.ACTIVITY,
): Connection | undefined {
    return modeler.modeling.connect(source, target, {
        type,
    } as Partial<Connection>) as Connection | undefined;
}
