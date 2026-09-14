import { ViewportData } from "../domain/model/Viewport";
import { DomainStoryTextRendererConfig } from "../domain/model/TextRendererConfig";
import type { ColorPickerProvider } from "./ColorPickerProvider";

/**
 * Configuration options for creating an EgonClient instance.
 */
export interface EgonClientConfig {
    /** The HTML element to render the diagram into */
    readonly container: HTMLElement;
    /** Width of the diagram canvas (default: "100%") */
    readonly width?: string;
    /** Height of the diagram canvas (default: "100%") */
    readonly height?: string;
    /** Initial viewport configuration */
    readonly viewport?: ViewportData;
    /** Label typography overrides; anything omitted keeps the built-in default */
    readonly textRenderer?: DomainStoryTextRendererConfig;
    /**
     * Color-picker presentation. Omit for the built-in popover, provide a
     * client-scoped replacement, or use `false` to remove color actions.
     */
    readonly colorPicker?: ColorPickerProvider | false;
}
