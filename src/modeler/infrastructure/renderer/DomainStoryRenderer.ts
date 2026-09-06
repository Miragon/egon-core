import EventBus from "diagram-js/lib/core/EventBus";
import Styles from "diagram-js/lib/draw/Styles";
import Canvas from "diagram-js/lib/core/Canvas";
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import { componentsToPath, createLine } from "diagram-js/lib/util/RenderUtil";
import Ids from "ids";
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

/**
 * Draws Domain Storytelling elements — and **only** draws them.
 *
 * Rendering is a read (ADR 0016). Every write this class used to make on the way
 * past — the overlap nudge and the default colour (#65), then the element type,
 * the activity number, the annotation height and the host's dirty flag (#74) —
 * belonged to a command handler, an import repair or the export pass, somewhere
 * undo could see it. A repaint is not a user action, happens an unbounded number
 * of times, and for an imported story writes straight into the persisted model,
 * so anything mutated here corrupts the file format silently.
 * `RendererModelPurity.browser.spec.ts` and a raw-source rule in
 * `architecture.spec.ts` hold the line.
 */
export class DomainStoryRenderer extends BaseRenderer {
    static $inject: string[] = [
        "eventBus",
        "styles",
        "canvas",
        "domainStoryTextRenderer",
        "domainStoryIconDictionaryService",
    ];

    // Per-instance so SVG marker ids never collide between two renderers on one
    // page. The `ids` package draws random ids, so per-instance stays unique
    // across diagrams too (issue #12; was a module-level `new Ids()`).
    private rendererId = new Ids().next();

    private markers: Record<string, SVGMarkerElement> = {};

    constructor(
        eventBus: EventBus,
        private readonly styles: Styles,
        private readonly canvas: Canvas,
        private readonly domainStoryTextRenderer: DomainStoryTextRenderer,
        private readonly iconDictionaryService: IconDictionaryService,
    ) {
        super(eventBus, 2000);

        eventBus.on("bendpoint.move.start", 200, function (event: any) {
            // the bendpoint which we are dragging will otherwise be displayed with 0.3 opacity
            // through bendpoint-dragging we match the CSS class more specifically, hence our style applies
            svgClasses(event.context.draggerGfx).add("bendpoint-dragging");
            // the old path of the activity will otherwise be displayed in gray
            canvas.addMarker(event.context.connection, "djs-element-hidden");
        });

        // `.cancel` matters as much as `.end`: an ESC-aborted drag fires only
        // the former (Dragging.js:283 vs :374), so listening for `.end` alone
        // left the connection invisible until the next successful drag.
        // diagram-js' own BendpointMovePreview cleans up on both.
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
        let iconSRC = this.iconDictionaryService.getIconSource(
            getIconId(element["type"]),
        );
        iconSRC = this.getIconSvg(iconSRC, element);
        const actor = svgCreate(iconSRC);

        svgAttr(actor, svgDynamicSizeAttributes);
        svgAppend(parent, actor);

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
        let iconSRC = this.iconDictionaryService.getIconSource(
            getIconId(element["type"]),
        );
        iconSRC = this.getIconSvg(iconSRC, element);
        const workObject = svgCreate(iconSRC);

        svgAttr(workObject, svgDynamicSizeAttributes);
        svgAppend(parent, workObject);
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
                    stroke: element.businessObject.pickedColor ?? DEFAULT_COLOR,
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

        // The drawn line deliberately diverges from `element.waypoints` by the
        // overlap offset; diagram-js' hit path, bendpoint handles and selection
        // outline follow the model (#65 — inside the ~15px djs-hit-stroke, and
        // the divergent stretch lies inside the source shape's own hit area).

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
            stroke: element.businessObject.pickedColor ?? DEFAULT_COLOR,
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

        // `element.height` is read, never written (#74). It is already correct
        // by the time anything paints: the element factory honours a supplied
        // height, `DomainStoryUpdateLabelHandler.postExecute` resizes through the
        // undoable `modeling.resizeShape`, the export pass persists it as
        // `businessObject.height`, and a pre-#74 file's `number` was translated
        // into it by `useLegacyAnnotationNumberAsHeight` on import.
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
            stroke: element.businessObject.pickedColor ?? DEFAULT_COLOR,
        });

        this.renderLabel(parentGfx, text, {
            box: element,
            align: "left-top",
            padding: 5,
            style: {
                fill: element.businessObject.pickedColor ?? DEFAULT_COLOR,
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

    /**
     * creates an SVG path that describes a rectangle which encloses the given shape.
     */
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

    private getIconSvg(icon: string, element: Shape) {
        const pickedColor = element.businessObject.pickedColor;
        if (isCustomIcon(icon)) {
            let dataURL;
            if (isCustomSvgIcon(icon)) {
                dataURL = this.applyColorToCustomSvgIcon(pickedColor, icon);
            } else {
                dataURL = icon;
                // `isDefaultColor`, not `!== DEFAULT_COLOR` (#74): files written
                // before #65 persist the literal `"black"`, which *is* the
                // default in intent but not by string equality — so a raster
                // custom icon in such a file used to fire this error for a colour
                // the user never picked.
                if (!isDefaultColor(pickedColor)) {
                    document.dispatchEvent(
                        new CustomEvent("errorColoringOnlySvg"),
                    );
                }
            }
            return (
                '<svg viewBox="0 0 24 24" width="48" height="48" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
                '<image width="24" height="24" xlink:href="' +
                dataURL +
                '"/></svg>'
            );
        } else {
            return this.applyColorToIcon(pickedColor, icon);
        }
    }

    private applyColorToCustomSvgIcon(pickedColor: string, iconSvg: string) {
        if (!pickedColor) {
            return iconSvg;
        }
        const [rest, base64Svg] = iconSvg.split("base64,");
        const svg = atob(base64Svg);
        const coloredSvg = this.applyColorToIcon(pickedColor, svg);
        const encodedColoredSvg = btoa(coloredSvg);
        return rest + "base64," + encodedColoredSvg;
    }

    private applyColorToIcon(pickedColor = DEFAULT_COLOR, iconSvg: string) {
        const match = iconSvg.match(
            /fill=\s*"(?!none).*?"|fill:\s*[#r]\w*[;\s]{1}/,
        );
        if (match && match.some((it) => it)) {
            return iconSvg
                .replaceAll(/fill=\s*"(?!none).*?"/g, `fill="${pickedColor}"`)
                .replaceAll(/fill:\s*[#r]\w*[;\s]{1}/g, `fill:${pickedColor};`);
        } else {
            const index = iconSvg.indexOf("<svg ") + 5;
            return (
                iconSvg.substring(0, index) +
                ' fill=" ' +
                pickedColor +
                '" ' +
                iconSvg.substring(index)
            );
        }
    }

    /**
     * The waypoints this activity is *drawn* with: the element's own, with
     * either end nudged clear of the source's label.
     *
     * Returns a copy and never writes to the element (#65). Upstream
     * (`adjustForTextOverlap`) nudged the point in place, and for an imported
     * story `element.waypoints` *is* `businessObject.waypoints`, so drawing
     * persisted 5px into the saved file and the next open re-applied it.
     *
     * `slice()` suffices: the only write was to `point.y`, and the point-level
     * helper now returns a fresh point. Untouched interior points are shared
     * with the element on purpose — the render path only reads x/y.
     *
     * Both ends are measured against **`source`**, the end point included.
     * That is upstream's behaviour and probably a bug of its own; the offset is
     * only ever non-zero for a point under `source`'s label, so correcting it
     * here would be an unrelated behaviour change.
     */
    private waypointsClearOfSourceLabel(element: Connection): Point[] {
        const source = element.source;
        const target = element.target;

        const waypoints = element.waypoints.slice();
        const lastIndex = waypoints.length - 1;

        if (waypoints[0] && waypoints[lastIndex] && source && target) {
            // Assigned back through the array, not via two captured locals:
            // with a single waypoint both ends are the same entry and the
            // offset applied twice. Reading the slot back reproduces that.
            waypoints[0] = this.pointClearOfSourceLabel(waypoints[0], source);
            waypoints[lastIndex] = this.pointClearOfSourceLabel(
                waypoints[lastIndex],
                source,
            );
        }

        return waypoints;
    }

    private useColorForActivity(element: Connection) {
        const color = element.businessObject.pickedColor ?? DEFAULT_COLOR;
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
     * `point`, moved down far enough to clear `source`'s label — or `point`
     * itself when it does not overlap.
     *
     * Never mutates its argument (#65; upstream: `checkIfPointOverlapsText`).
     * The copy is a spread, so a docking point keeps its `original` anchor even
     * though diagram-js' `Point` does not declare it — the returned array must
     * stay substitutable for `element.waypoints`.
     *
     * Not pure in the wider sense: `getLineOffset` measures the source's
     * rendered label out of the DOM, which is why this stays in the renderer
     * instead of moving to `story/domain`.
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

        const objects = document.getElementsByClassName(
            "djs-element djs-shape",
        );
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
     * marker functions ("markers" are arrowheads of activities)
     */
    /**
     * The marker's DOM id, with everything a CSS identifier cannot carry folded
     * to `_`.
     *
     * Load-bearing, not cosmetic: colours arrive as `#rrggbbaa`, and diagram-js'
     * `PreviewSupport` clones a drag preview's arrowhead via
     * `querySelector("marker#" + id)` — an unescaped `#` makes that throw
     * `SyntaxError` and the drag dies. Upstream only ever hit this on a
     * *coloured* activity; since #65 the default colour is `#000000` too, so it
     * would otherwise break every activity drag.
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

        // resetting stroke dash array
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

    /**
     * Draws the number badge of an activity originating from an actor.
     *
     * Renders the number the model already carries; it does not decide it. Since
     * #74 the number is minted and cleared by `DomainStoryActivityNumbering`
     * (`connection.create`/`connection.reconnect`), `ActivityChangedHandler` and
     * `ActivityDirectionChangedHandler` — all commands, all undoable.
     */
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

        // !IMPORTANT!
        // When converting svg-files via Inkscape or Photoshop, the svg-circle is converted to a black dot that obscures the number.
        // To circumvent this, we draw an arc.
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
     * Renders the number badge of an activity that has one.
     *
     * Purely a read since #74. It used to *mint* a number when an actor-sourced
     * activity had none and *clear* the number of every other activity — two
     * writes performed by a repaint, invisible to undo, and (for an imported
     * story, whose business objects the canvas shares) written straight into the
     * persisted model. Both moved onto the commands that change an activity's
     * source; an imported file's gaps are filled once by
     * `numberActivitiesFromActors`.
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

    /**
     * render a label on the canvas
     */
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

    /**
     * determine the X-coordinate of the label / number to be rendered
     */
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

    /**
     * determine the Y-coordinate of the label / number to be rendered
     */
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
