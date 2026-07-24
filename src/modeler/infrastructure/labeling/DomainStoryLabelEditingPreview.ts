import EventBus from "diagram-js/lib/core/EventBus";
import Canvas from "diagram-js/lib/core/Canvas";
import {
    append as svgAppend,
    attr as svgAttr,
    create as svgCreate,
    remove as svgRemove,
} from "tiny-svg";
import { translate } from "diagram-js/lib/util/SvgTransformUtil";
import { Shape } from "diagram-js/lib/model/Types";
import {
    getAnnotationBracketSvg,
    is,
} from "../../../shared/infrastructure/util";
import { ElementTypes } from "../../../story/domain/elementTypes";
import {
    isActivity,
    isActor,
    isGroup,
    isWorkObject,
} from "../../../story/domain/elementPredicates";
import { Rect } from "diagram-js/lib/util/Types";

const MARKER_HIDDEN = "djs-element-hidden",
    MARKER_LABEL_HIDDEN = "djs-label-hidden";

export class DomainStoryLabelEditingPreview {
    static $inject: string[] = ["eventBus", "canvas"];

    private defaultLayer: SVGElement;

    private path: SVGElement | undefined;

    private element: Shape | undefined;

    private absoluteElementBBox: Rect | undefined;

    private gfx: SVGElement | undefined;

    constructor(eventBus: EventBus, canvas: Canvas) {
        this.defaultLayer = canvas.getDefaultLayer();

        eventBus.on("directEditing.activate", (context: any) => {
            const activeProvider = context.active;

            this.element = (activeProvider.element.label ||
                activeProvider.element) as Shape;

            if (is(this.element, ElementTypes.TEXTANNOTATION)) {
                this.absoluteElementBBox = canvas.getAbsoluteBBox(this.element);
                this.gfx = svgCreate("g");

                const textPathData = getAnnotationBracketSvg(
                    this.element.height,
                );

                const path = (this.path = svgCreate("path"));

                svgAttr(path, {
                    d: textPathData,
                    strokeWidth: 2,
                    stroke: "black",
                });

                svgAppend(this.gfx, path);

                svgAppend(this.defaultLayer, this.gfx);

                translate(this.gfx, this.element.x, this.element.y);

                if (
                    is(this.element, ElementTypes.TEXTANNOTATION) ||
                    this.element["labelTarget"]
                ) {
                    canvas.addMarker(this.element, MARKER_HIDDEN);
                } else if (
                    isActor(this.element) ||
                    isWorkObject(this.element) ||
                    isActivity(this.element) ||
                    isGroup(this.element)
                ) {
                    canvas.addMarker(this.element, MARKER_LABEL_HIDDEN);
                }
            }
        });

        eventBus.on("directEditing.resize", (context: any) => {
            if (is(this.element, ElementTypes.TEXTANNOTATION)) {
                const height = context.height,
                    dy = context.dy;

                const newElementHeight = Math.max(
                    (this.element!.height /
                        (this.absoluteElementBBox?.height ?? 1)) *
                        (height + dy),
                    0,
                );

                svgAttr(this.path!, {
                    d: getAnnotationBracketSvg(newElementHeight),
                });
            }
        });

        eventBus.on(
            ["directEditing.complete", "directEditing.cancel"],
            (context: any) => {
                const activeProvider = context.active;

                if (activeProvider) {
                    canvas.removeMarker(
                        activeProvider.element.label || activeProvider.element,
                        MARKER_HIDDEN,
                    );
                    canvas.removeMarker(
                        this.element as Shape,
                        MARKER_LABEL_HIDDEN,
                    );
                }

                this.element = undefined;
                this.absoluteElementBBox = undefined;

                if (this.gfx) {
                    svgRemove(this.gfx);
                    this.gfx = undefined;
                }
            },
        );
    }
}
