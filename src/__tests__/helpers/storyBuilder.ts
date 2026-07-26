import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";

import { ElementTypes } from "../../story/domain/elementTypes";
import { TEST_ICON_NAMES } from "./testIconSet";
import type { TestModeler } from "./createTestModeler";

/**
 * Shape/connection constructors for canvas-driving specs.
 *
 * They exist to keep the two easy-to-get-wrong parts of element creation in one
 * place instead of once per spec:
 *
 * - actor and work-object *types carry the icon name as a suffix*
 *   (`domainStory:actorPerson`), so a bare `ElementTypes.ACTOR` renders nothing
 *   and resolves no icon;
 * - diagram-js treats the `modeling.createShape` point as the shape's **centre**,
 *   not its top-left. `CreateShapeHandler` computes
 *   `x = point.x - Math.round(width / 2)`, so a 75-wide shape asked for at
 *   `x: 200` lands at 162 (not 162.5). Specs that assert coordinates need that
 *   stated once, not rediscovered each time.
 *
 * Every helper goes through `modeling.*`, so each one is a real commandStack
 * entry and is undoable — which is the point of the suite.
 */

/** Default position, far enough from the origin that nothing lands negative. */
const DEFAULT_POINT: Point = { x: 200, y: 200 };

export interface ShapeOptions {
    /** Centre of the new shape, not its top-left corner. */
    point?: Point;
    name?: string;
    /** Parent to create into; defaults to the canvas root. */
    parent?: Shape;
    /** Overrides the element factory's default size. */
    width?: number;
    height?: number;
    pickedColor?: string;
}

/** Creates a shape of `type` through `modeling.createShape`. */
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

    // Set before creation so the very first render already paints the colour —
    // the renderer reads `pickedColor` off the business object while drawing.
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
 * Connects two shapes with the given edge type — an activity between actors and
 * work objects, a plain connection to an annotation.
 *
 * **This does not enforce the grammar.** `modeling.connect` executes
 * `connection.create` on the commandStack, and `CommandStack.execute` never
 * consults `canExecute`, so the rules guard only the *interaction* layer
 * (drag-to-connect, bendpoint drag). A forbidden pair asked for here really is
 * created. Specs that care about a rule must assert `rules.allowed(...)`
 * themselves; see `ActivityConnections.browser.spec.ts`.
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
