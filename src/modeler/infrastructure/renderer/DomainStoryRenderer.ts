import EventBus from "diagram-js/lib/core/EventBus";
import Styles from "diagram-js/lib/draw/Styles";
import Canvas from "diagram-js/lib/core/Canvas";
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import { componentsToPath, createLine } from "diagram-js/lib/util/RenderUtil";
import { Ids } from "ids";
import {
    append as svgAppend,
    attr as svgAttr,
    classes as svgClasses,
    create as svgCreate,
} from "tiny-svg";
import { query as domQuery } from "min-dom";
import { assign, isObject } from "min-dash";
import {
    Box,
    numberBoxDefinitions,
} from "../../../shared/infrastructure/numbering";
import { getIconId } from "../../../story/domain/elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isConnection,
    isDomainStoryElement,
    isGroup,
    isWorkObject,
} from "../../../story/domain/elementPredicates";
import { Point } from "diagram-js/lib/util/Types";
import { countLines, labelPosition } from "../../domain/labeling/position";
import { approximateArialSize11TextWidthInPixel } from "../labeling/utils";
import { angleBetween } from "../../../shared/domain/mathExtensions";
import {
    getAnnotationBracketSvg,
    isCustomIcon,
    isCustomSvgIcon,
} from "../../../shared/infrastructure/util";
import { DomainStoryTextRenderer } from "../text-renderer/DomainStoryTextRenderer";
import { IconDictionaryService } from "../../../iconSet/service";
import { DEFAULT_COLOR, isDefaultColor } from "../../../story/domain/color";
import type { IconSanitizerPort } from "../../../iconSet/domain/ports/IconSanitizerPort";
import { ColorPickerPreviewState } from "../color-picker/ColorPickerPreviewState";

/**
 * Draws Domain Storytelling elements and never writes to the model (ADR ARC-4).
 * A repaint is invisible to undo, and for an imported story the canvas shares
 * the persisted business objects, so any write here silently corrupts the file.
 */
export class DomainStoryRenderer extends BaseRenderer {
    static $inject: string[] = [
        "eventBus",
        "styles",
        "canvas",
        "domainStoryTextRenderer",
        "domainStoryIconDictionaryService",
        "domainStoryIconSanitizer",
        "domainStoryColorPickerPreviewState",
    ];

    // Per-instance so SVG marker ids never collide between two renderers on one page.
    private rendererId = new Ids().next();

    private markers: Record<string, SVGMarkerElement> = {};

    constructor(
        eventBus: EventBus,
        private readonly styles: Styles,
        private readonly canvas: Canvas,
        private readonly domainStoryTextRenderer: DomainStoryTextRenderer,
        private readonly iconDictionaryService: IconDictionaryService,
        private readonly iconSanitizer: IconSanitizerPort,
        private readonly colorPreviewState: ColorPickerPreviewState,
    ) {
        super(eventBus, 2000);

        eventBus.on("bendpoint.move.start", 200, function (event: any) {
            // the bendpoint which we are dragging will otherwise be displayed with 0.3 opacity
            // through bendpoint-dragging we match the CSS class more specifically, hence our style applies
            svgClasses(event.context.draggerGfx).add("bendpoint-dragging");
            // the old path of the activity will otherwise be displayed in gray
            canvas.addMarker(event.context.connection, "djs-element-hidden");
        });

        // An ESC-aborted drag fires only `.cancel`, never `.end`; without it the
        // connection stays hidden until the next successful drag.
        eventBus.on(
            ["bendpoint.move.end", "bendpoint.move.cancel"],
            2000,
            function (event: any) {
                // the acitvity will not be displayed if we don't remove the marker we added during bendpoint.move.start
                // high priority is neccessary, so we come before something that might stop the execution
                canvas.removeMarker(
                    event.context.connection,
                    "djs-element-hidden",
                );
            },
        );
    }

    override canRender(element: Element): boolean {
        return isDomainStoryElement(element);
    }

    override drawShape(visuals: SVGElement, shape: Shape): SVGElement {
        // polyfill for tests
        if (!String.prototype.startsWith) {
            Object.defineProperty(String.prototype, "startsWith", {
                value: function (search: any[], pos: number) {
                    pos = !pos || pos < 0 ? 0 : +pos;
                    return this.substring(pos, pos + search.length) === search;
                },
            });
        }

        if (isActor(shape)) {
            return this.drawActor(visuals, shape);
        } else if (isWorkObject(shape)) {
            return this.drawWorkObject(visuals, shape);
        } else if (isAnnotation(shape)) {
            return this.drawAnnotation(visuals, shape);
        } else if (isGroup(shape)) {
            return this.drawGroup(visuals, shape);
        }

        throw new Error(
            "[DomainStoryRenderer] The type of the shape is invalid.",
        );
    }

    override getShapePath(shape: Shape): string {
        if (isActor(shape)) {
            return this.getPath(shape);
        } else if (isWorkObject(shape)) {
            return this.getPath(shape);
        } else if (isGroup(shape)) {
            return this.getPath(shape);
        } else if (isAnnotation(shape)) {
            return this.getPath(shape);
        } else {
            return super.getShapePath(shape);
        }
    }

    override drawConnection(
        visuals: SVGElement,
        connection: Connection,
    ): SVGElement {
        if (isActivity(connection)) {
            return this.drawActivity(visuals, connection);
        } else if (isConnection(connection)) {
            return this.drawDSConnection(visuals, connection);
        } else {
            return super.drawConnection(visuals, connection);
        }
    }

    drawActor(parent: SVGElement, element: Shape) {
        const svgDynamicSizeAttributes = {
            width: element.width,
            height: element.height,
        };
        const actor = this.drawIcon(parent, element, svgDynamicSizeAttributes);

        this.renderActorAndWorkObjectLabel(parent, element, "center", -5);
        return actor;
    }

    drawWorkObject(parent: SVGElement, element: Shape) {
        const svgDynamicSizeAttributes = {
            width: element.width * 0.65,
            height: element.height * 0.65,
            x: element.width / 2 - 25,
            y: element.height / 2 - 25,
        };
        const workObject = this.drawIcon(
            parent,
            element,
            svgDynamicSizeAttributes,
        );
        this.renderActorAndWorkObjectLabel(parent, element, "center", -5);

        return workObject;
    }

    drawGroup(parentGfx: SVGElement, element: Shape) {
        const rect = this.drawRect(
            parentGfx,
            element.width,
            element.height,
            0,
            0,
            assign(
                {
                    fill: "none",
                    stroke: this.colorOf(element),
                },
                element["attrs"],
            ),
        );

        this.renderActorAndWorkObjectLabel(parentGfx, element, "left-top", 8);

        return rect;
    }

    drawActivity(visuals: SVGElement, element: Connection): SVGElement {
        const waypoints = this.waypointsClearOfSourceLabel(element);

        const attrs = this.useColorForActivity(element);

        const x = svgAppend(
            visuals,
            createLine(waypoints, attrs),
        ) as SVGElement;
        this.renderActivityLabel(visuals, element, waypoints);
        this.renderExternalNumber(visuals, element, waypoints);

        // The drawn line may diverge from `element.waypoints` by the overlap
        // offset; hit path and bendpoints follow the model, which is fine because
        // the offset stays inside the ~15px hit stroke.

        // changes the color of the moved activity back to original instead of blue
        if (visuals.getAttribute("djs-dragger")) {
            svgClasses(visuals).remove("djs-dragger");
            svgClasses(visuals).add("djs-connection-preview");
        }

        return x;
    }

    drawDSConnection(visuals: SVGElement, element: Connection): SVGElement {
        let attrs = "";
        attrs = this.styles.computeStyle(attrs, {
            stroke: this.colorOf(element),
            strokeWidth: 1.5,
            strokeLinejoin: "round",
            strokeDasharray: "5, 5",
        });

        return svgAppend(
            visuals,
            createLine(element.waypoints, attrs),
        ) as SVGElement;
    }

    drawAnnotation(parentGfx: SVGElement, element: Shape) {
        const style = {
            fill: "none",
            stroke: "none",
        };

        // `element.height` is only read; `DomainStoryUpdateLabelHandler` resizes
        // it through an undoable command.
        const text = element.businessObject.text || "";

        const textElement = this.drawRect(
            parentGfx,
            element.width,
            element.height,
            0,
            0,
            style,
        );
        const textPathData = getAnnotationBracketSvg(element.height);

        this.drawPath(parentGfx, textPathData, {
            stroke: this.colorOf(element),
        });

        this.renderLabel(parentGfx, text, {
            box: element,
            align: "left-top",
            padding: 5,
            style: {
                fill: this.colorOf(element),
            },
        });

        return textElement;
    }

    private getPath(shape: Shape) {
        const rectangle = this.getRectPath(shape);
        return componentsToPath(rectangle);
    }

    private drawRect(
        parentGfx: SVGElement,
        width: number,
        height: number,
        r: number,
        offset: number,
        attrs?: any,
    ) {
        if (isObject(offset)) {
            attrs = offset;
            offset = 0;
        }

        offset = offset || 0;
        attrs = this.styles.computeStyle(attrs, {
            stroke: "black",
            strokeWidth: 2,
            fill: "white",
        });

        const rect = svgCreate("rect");
        svgAttr(rect, {
            x: offset,
            y: offset,
            width: width - offset * 2,
            height: height - offset * 2,
            rx: r,
            ry: r,
        });

        svgAttr(rect, attrs);
        svgAppend(parentGfx, rect);

        return rect;
    }

    private drawPath(parentGfx: SVGElement, d: string, attrs: any) {
        attrs = this.styles.computeStyle(attrs, ["no-fill"], {
            strokeWidth: 2,
            stroke: "black",
        });

        const path = svgCreate("path");
        svgAttr(path, { d: d });
        svgAttr(path, attrs);

        svgAppend(parentGfx, path);

        return path;
    }

    private getRectPath(shape: Shape) {
        const offset = 5;
        const x = shape.x,
            y = shape.y,
            width = shape.width / 2 + offset,
            height = shape.height / 2 + offset;

        return [
            ["M", x, y],
            ["l", width, 0],
            ["l", width, height],
            ["l", -width, height],
            ["l", -width, 0],
            ["z"],
        ];
    }

    private drawIcon(
        parent: SVGElement,
        element: Shape,
        dimensions: Record<string, number>,
    ): SVGElement {
        const icon = this.iconDictionaryService.getIconSource(
            getIconId(element["type"]),
        );
        const pickedColor = this.colorOf(element);
        if (
            isCustomIcon(icon) &&
            !isCustomSvgIcon(icon) &&
            !isDefaultColor(pickedColor)
        ) {
            document.dispatchEvent(new CustomEvent("errorColoringOnlySvg"));
        }

        const safeMarkup = this.iconSanitizer.prepareForRendering(
            icon,
            pickedColor,
        );
        const rendered = svgCreate(safeMarkup);
        svgAttr(rendered, dimensions);
        svgAppend(parent, rendered);
        return rendered;
    }

    /**
     * A copy of the waypoints with either end nudged clear of the source's label
     * (upstream: `adjustForTextOverlap`). For an imported story `element.waypoints`
     * is the persisted array, so nudging in place would leak into the saved file.
     *
     * Both ends are measured against `source`, as upstream does.
     */
    private waypointsClearOfSourceLabel(element: Connection): Point[] {
        const source = element.source;
        const target = element.target;

        const waypoints = element.waypoints.slice();
        const lastIndex = waypoints.length - 1;

        if (waypoints[0] && waypoints[lastIndex] && source && target) {
            // Read back through the array: with a single waypoint both ends are
            // the same slot and the offset must apply twice, as upstream does.
            waypoints[0] = this.pointClearOfSourceLabel(waypoints[0], source);
            waypoints[lastIndex] = this.pointClearOfSourceLabel(
                waypoints[lastIndex],
                source,
            );
        }

        return waypoints;
    }

    private colorOf(element: Element): string {
        return (
            this.colorPreviewState.get(element) ??
            element.businessObject.pickedColor ??
            DEFAULT_COLOR
        );
    }

    private useColorForActivity(element: Connection) {
        const color = this.colorOf(element);
        const attrs = "";
        return this.styles.computeStyle(attrs, {
            stroke: color,
            fill: "none",
            strokeWidth: 1.5,
            strokeLinejoin: "round",
            markerEnd: this.marker("activity", "black", color),
        });
    }

    private renderActivityLabel(
        parentGfx: SVGElement,
        element: Connection,
        waypoints: Point[],
    ): SVGElement | undefined {
        const semantic = element.businessObject;
        const lines = countLines(semantic.name);

        const position = labelPosition(waypoints, lines);
        const startPoint = waypoints[position.selected];
        const endPoint = waypoints[position.selected + 1];
        const angle = angleBetween(startPoint, endPoint);
        let alignment = "left";
        let boxWidth = 500;
        let xStart = position.x;

        // if the activity is horizontal, we want to center the label
        if (angle === 0 || angle === 180) {
            boxWidth = Math.abs(startPoint.x - endPoint.x);
            alignment = "center";
            const textWidthInPixel = approximateArialSize11TextWidthInPixel(
                semantic.name,
            );
            xStart =
                (startPoint.x + endPoint.x) / 2 - (textWidthInPixel / 2 + 20);
        }

        const box = {
            textAlign: alignment,
            width: boxWidth,
            height: 30,
            x: xStart,
            y: position.y,
        };

        if (semantic.name && semantic.name.length) {
            return this.renderLabel(
                parentGfx,
                semantic.name,
                {
                    box: box,
                    fitBox: true,
                    style: assign(
                        {},
                        this.domainStoryTextRenderer.getExternalStyle(),
                        {
                            fill: "black",
                            wordWrap: "break-word",
                            overflowWrap: "break-word",
                            hyphens: "auto",
                        },
                    ),
                },
                element["type"],
            );
        }

        return undefined;
    }

    /**
     * Upstream: `checkIfPointOverlapsText`. Copies via spread so a docking point
     * keeps its undeclared `original` anchor. Stays out of `story/domain` because
     * `getLineOffset` measures the rendered label in the DOM.
     */
    private pointClearOfSourceLabel(point: Point, source: Element): Point {
        if (point.y > source["y"] + 60) {
            if (point.x > source["x"] + 3 && point.x < source["x"] + 72) {
                const lineOffset = this.getLineOffset(source);
                if (source["y"] + 75 + lineOffset > point.y) {
                    return { ...point, y: point.y + lineOffset };
                }
            }
        }
        return point;
    }

    private getLineOffset(element: Element) {
        const id = element.id;
        let offset = 0;

        const objects = this.canvas
            .getContainer()
            .getElementsByClassName("djs-element djs-shape");
        for (let i = 0; i < objects.length; i++) {
            const data_id = objects.item(i)?.getAttribute("data-element-id");
            if (data_id === id) {
                const object = objects.item(i);
                const text = object?.getElementsByTagName("text")[0];
                const tspans = text?.getElementsByTagName("tspan");
                if (tspans) {
                    const tspan = tspans[tspans.length - 1];
                    offset = parseInt(tspan.getAttribute("y") ?? "0");
                }
            }
        }
        return offset - 70;
    }

    /**
     * Folds non-identifier characters to `_`: diagram-js' `PreviewSupport` runs
     * `querySelector("marker#" + id)`, and the `#` of a colour would throw and
     * kill every activity drag.
     */
    private markerId(type: string, fill: string, stroke: string) {
        return [type, fill, stroke, this.rendererId]
            .join("-")
            .replace(/[^\w-]/g, "_");
    }

    private marker(type: string, fill: string, stroke: string) {
        const id = this.markerId(type, fill, stroke);

        if (!this.markers[id]) {
            this.createMarker(type, fill, stroke);
        }
        return "url(#" + id + ")";
    }

    private createMarker(type: string, fill: string, stroke: string) {
        const id = this.markerId(type, fill, stroke);

        if (type === "activity") {
            const activityArrow = svgCreate("path");
            svgAttr(activityArrow, { d: "M 1 5 L 11 10 L 1 15 Z" });

            this.addMarker(id, {
                element: activityArrow,
                ref: { x: 11, y: 10 },
                scale: 0.5,
                attrs: {
                    fill: stroke,
                    stroke: stroke,
                },
            });
        }
    }

    private addMarker(id: string, options: any) {
        const attrs = assign(
            {
                fill: "black",
                strokeWidth: 1,
                strokeLinecap: "round",
                strokeDasharray: "none",
            },
            options.attrs,
        );

        const ref = options.ref || { x: 0, y: 0 };
        const scale = options.scale || 1;

        if (attrs.strokeDasharray === "none") {
            attrs.strokeDasharray = [10000, 1];
        }

        const marker = svgCreate("marker");

        svgAttr(options.element, attrs);
        svgAppend(marker, options.element);
        svgAttr(marker, {
            id: id,
            viewBox: "0 0 20 20",
            refX: ref.x,
            refY: ref.y,
            markerWidth: 20 * scale,
            markerHeight: 20 * scale,
            orient: "auto",
        });

        // @ts-expect-error _svg does exist on canvas
        let defs = domQuery("defs", this.canvas._svg);
        if (!defs) {
            defs = svgCreate("defs");
            // @ts-expect-error _svg does exist on canvas
            svgAppend(this.canvas._svg, defs);
        }
        svgAppend(defs, marker);
        this.markers[id] = marker;
    }

    private drawActivityNumber(
        parentGfx: SVGElement,
        element: Element,
        box: Box,
    ) {
        const semantic = element.businessObject;

        box.x -= 26;
        box.y -= 16;

        if (semantic.number < 10) {
            box.x += 3;
        }

        this.renderNumber(
            parentGfx,
            semantic.number,
            this.numberStyle(box),
            element["type"],
        );
    }

    private renderNumber(
        parentGfx: any,
        number: number,
        options: any,
        type: string,
    ) {
        const text = this.domainStoryTextRenderer.createText(
            String(number),
            options,
        );

        svgClasses(text).add("djs-labelNumber");

        this.setCoordinates(type, text, options, parentGfx);

        // An arc, not an svg circle: Inkscape and Photoshop convert circles into
        // a black dot that hides the number.
        const circle = svgCreate("path");
        const radius = 11;
        const x = options.box.x + 18 + (number > 9 ? 3 : 0);
        const y = options.box.y - radius + 7;
        svgAttr(circle, {
            d: `
      M ${x} ${y}
      m ${radius},0
      a ${radius},${radius} 0 1,0 ${-radius * 2},0
      a ${radius},${radius} 0 1,0 ${radius * 2},0
      `,
            fill: "white",
            stroke: "black",
        });

        svgAppend(parentGfx, circle);
        svgAppend(parentGfx, text);

        return text;
    }

    /**
     * Only draws an existing number; numbers are minted and cleared by undoable
     * commands (`DomainStoryActivityNumbering`).
     */
    private renderExternalNumber(
        parentGfx: SVGElement,
        element: Connection,
        waypoints: Point[],
    ) {
        const semantic = element?.businessObject;

        if (semantic?.number && isActor(element.source)) {
            this.drawActivityNumber(
                parentGfx,
                element,
                numberBoxDefinitions(waypoints),
            );
        }
    }

    private numberStyle(box: any) {
        return {
            box: box,
            fitBox: true,
            style: assign({}, this.domainStoryTextRenderer.getExternalStyle(), {
                fill: "black",
                position: "absolute",
            }),
        };
    }

    private setCoordinates(
        type: string,
        text: SVGElement,
        options: any,
        parentGfx: SVGElement,
    ) {
        if (/:activity$/.test(type)) {
            text.innerHTML = this.manipulateInnerHTMLXLabel(
                text.children,
                options.box.x,
                0,
            );
            text.innerHTML = this.manipulateInnerHTMLYLabel(
                text.children,
                options.box.y,
                0,
            );
        } else if (/:actor/.test(type)) {
            const h: string =
                (parentGfx.firstChild as SVGElement)?.getAttribute("height") ??
                "";
            text.innerHTML = this.manipulateInnerHTMLYLabel(
                text.children,
                h,
                0,
            );
        } else if (/:workObject/.test(type)) {
            const h: string =
                (parentGfx.firstChild as SVGElement)?.getAttribute("height") ??
                "";
            text.innerHTML = this.manipulateInnerHTMLYLabel(
                text.children,
                h,
                26,
            );
        }
    }

    private renderLabel(
        parentGfx: SVGElement,
        label: string,
        options: any,
        type?: string,
    ) {
        const text = this.domainStoryTextRenderer.createText(
            label || "",
            options,
        );

        svgClasses(text).add("djs-label");
        this.setCoordinates(type ?? "", text, options, parentGfx);

        svgAppend(parentGfx, text);
        return text;
    }

    private renderActorAndWorkObjectLabel(
        parentGfx: SVGElement,
        element: Element,
        align: string,
        padding: number,
    ) {
        const businessObject = element.businessObject;
        return this.renderLabel(
            parentGfx,
            businessObject.name,
            {
                box: element,
                align: align,
                padding: padding ? padding : 0,
                style: {
                    fill: "#000000",
                },
            },
            element["type"],
        );
    }

    private manipulateInnerHTMLXLabel(
        children: HTMLCollection,
        x: string,
        offset: number,
    ) {
        if (!children) {
            throw new Error(
                "[DomainStoryRenderer] Parameter children is undefined!",
            );
        }

        let result = "";
        for (let i = 0; i < children.length; i++) {
            result += children[i].outerHTML.replace(
                /x="-?\d*.\d*"/,
                'x="' + (Number(x) + offset + 14) + '"',
            );
        }
        return result;
    }

    private manipulateInnerHTMLYLabel(
        children: HTMLCollection,
        y: string,
        offset: number,
    ) {
        let result = "";
        for (let i = 0; i < children.length; i++) {
            result += children[i].outerHTML.replace(
                /y="-?\d*.\d*"/,
                'y="' + (Number(y) + offset + 14 * i) + '"',
            );
        }
        return result;
    }
}
