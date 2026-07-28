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

    /**
     * `config` is optional because didi resolves an absent dotted key to
     * `undefined` (as long as a `config` provider exists at all) — the host is
     * not required to supply typography.
     */
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

        // min-dash `assign` is Object.assign: passing `defaultStyle` as the
        // target mutated it and returned it, so both styles were one object at
        // 11px and every label rendered and measured a point too small.
        //
        // The external style derives from the *merged* default, so a host that
        // only overrides `defaultStyle` still gets the one-point-smaller
        // external label; an explicit `externalStyle` overrides that in turn.
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

    /**
     * Get the new bounds of an externally rendered and arranged label.
     */
    getExternalLabelBounds(bounds: Rect, text: string): Rect {
        const layoutDimensions = this.textUtil.getDimensions(text, {
            box: {
                width: 90,
                height: 30,
            },
            style: this.config.externalStyle,
        });

        // resize label shape to fit label text
        return {
            x: Math.round(
                bounds.x + bounds.width / 2 - layoutDimensions.width / 2,
            ),
            y: Math.round(bounds.y),
            width: Math.ceil(layoutDimensions.width),
            height: Math.ceil(layoutDimensions.height),
        };
    }

    /**
     * Get the new bounds of text annotation.
     */
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

    /**
     * Create an arranged text element.
     *
     * @param {string} text
     * @param {TextLayoutConfig} [options]
     *
     * @return {SVGElement} rendered text
     */
    createText(text: string, options: TextLayoutConfig): SVGElement {
        return this.textUtil.createText(text, options || {});
    }

    /**
     * Get the default text style.
     */
    getDefaultStyle() {
        return this.config.defaultStyle;
    }

    /**
     * Get the external text style.
     */
    getExternalStyle() {
        return this.config.externalStyle;
    }
}
