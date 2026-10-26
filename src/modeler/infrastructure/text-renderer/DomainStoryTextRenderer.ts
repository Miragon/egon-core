import { assign } from "min-dash";
import TextUtil, { TextLayoutConfig } from "diagram-js/lib/util/Text";
import { Rect } from "diagram-js/lib/util/Types";

import {
    DomainStoryTextRendererConfig,
    DomainStoryTextRendererStyle,
} from "../../domain";

const DEFAULT_FONT_SIZE = 12;
const LINE_HEIGHT_RATIO = 1.2;
const MIN_TEXT_ANNOTATION_HEIGHT = 30;

export class DomainStoryTextRenderer {
    static $inject: string[] = ["config.textRenderer"];

    private config: {
        defaultStyle: DomainStoryTextRendererStyle;
        externalStyle: DomainStoryTextRendererStyle;
    };

    private textUtil: TextUtil;

    /** Optional: didi resolves an absent dotted config key to `undefined`. */
    constructor(config?: DomainStoryTextRendererConfig) {
        const defaultStyle: DomainStoryTextRendererStyle = assign(
            {
                fontFamily: "Arial, sans-serif",
                fontSize: DEFAULT_FONT_SIZE,
                fontWeight: "normal",
                lineHeight: LINE_HEIGHT_RATIO,
            },
            config?.defaultStyle ?? {},
        );

        // Fresh target: `assign` mutates its first argument. Derived from the
        // merged default so external labels stay one point smaller.
        const externalStyle: DomainStoryTextRendererStyle = assign(
            {},
            defaultStyle,
            {
                fontSize: defaultStyle.fontSize - 1,
            },
            config?.externalStyle ?? {},
        );

        this.config = {
            defaultStyle,
            externalStyle,
        };

        this.textUtil = new TextUtil({
            style: this.config.defaultStyle,
        });
    }

    getExternalLabelBounds(bounds: Rect, text: string): Rect {
        const layoutDimensions = this.textUtil.getDimensions(text, {
            box: {
                width: 90,
                height: 30,
            },
            style: this.config.externalStyle,
        });

        return {
            x: Math.round(
                bounds.x + bounds.width / 2 - layoutDimensions.width / 2,
            ),
            y: Math.round(bounds.y),
            width: Math.ceil(layoutDimensions.width),
            height: Math.ceil(layoutDimensions.height),
        };
    }

    getTextAnnotationBounds(bounds: Rect, text: string): Rect {
        const layoutDimensions = this.textUtil.getDimensions(text, {
            box: bounds,
            style: this.config.defaultStyle,
            align: "center-top",
            padding: 5,
        });

        return {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: Math.max(
                MIN_TEXT_ANNOTATION_HEIGHT,
                Math.round(layoutDimensions.height),
            ),
        };
    }

    createText(text: string, options: TextLayoutConfig): SVGElement {
        return this.textUtil.createText(text, options || {});
    }

    getDefaultStyle() {
        return this.config.defaultStyle;
    }

    getExternalStyle() {
        return this.config.externalStyle;
    }
}
