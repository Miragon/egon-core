import type { ModuleDeclaration } from "didi";

import type { EgonClientConfig } from "./EgonClientConfig";
import { IconPort, ImportRepairData, ModelerPort } from "../domain/ports";
import type { ColorPickerProvider } from "./ColorPickerProvider";

import type {
    DomainStoryDocument,
    IconCategory,
    IconConfiguration,
    IconSet,
    IconSetData,
    ViewportData,
} from "../domain";
import type {
    PngExportOptions,
    PngExportResult,
    SvgExportOptions,
    SvgExportResult,
} from "../domain/export/VisualExport";
import type {
    LabelDictionary,
    LabelRenameBatch,
} from "../../labelDictionary/domain/LabelDictionary";
import type {
    ReplayStartOptions,
    ReplayState,
} from "../../story/domain/replay";

export type EgonEventMap = {
    "story.changed": () => void;
    "viewport.changed": (viewport: ViewportData) => void;
    "icons.changed": (icons: IconSet) => void;
    "labels.changed": (labels: LabelDictionary) => void;
    "replay.changed": (state: ReplayState) => void;
    /**
     * The imported story was repaired by dropping dangling activity edges.
     * Fires before `import()` returns, so a host can warn that saving would
     * make the loss permanent.
     */
    "import.repaired": (repair: ImportRepairData) => void;
};

export type EgonEventName = keyof EgonEventMap;

/** Test-only port injection that replaces the diagram-js adapters. */
export interface EgonClientPorts {
    modelerPort: ModelerPort;
    iconPort: IconPort;
}

interface ColorPickerControllerPort {
    destroy(): void;
}

/** Public entry point of the plugin: a facade over the modeler and icon ports. */
export class EgonClient {
    private destroyed = false;

    private constructor(
        private readonly modelerPort: ModelerPort,
        private readonly iconPort: IconPort,
        viewport?: ViewportData,
        private readonly colorPickerController?: ColorPickerControllerPort,
    ) {
        if (viewport) {
            this.setViewport(viewport);
        }
    }

    /**
     * Creates a client rendering into `config.container`. On failure, anything
     * already created is destroyed and the original error is rethrown.
     *
     * @param additionalModules - extra diagram-js modules to register
     * @param ports - test-only; bypasses the diagram-js adapters
     */
    static async create(
        config: EgonClientConfig,
        additionalModules: ModuleDeclaration[] = [],
        ports?: EgonClientPorts,
    ): Promise<EgonClient> {
        let modelerPort: ModelerPort | undefined;
        let iconPort: IconPort | undefined;
        let colorPickerController: ColorPickerControllerPort | undefined;

        try {
            if (ports) {
                modelerPort = ports.modelerPort;
                iconPort = ports.iconPort;
            } else {
                // Lazy: hosts injecting their own ports never load diagram-js.
                const { DiagramJsModelerAdapter } =
                    await import("../infrastructure/DiagramJsModelerAdapter");
                const { DiagramJsIconAdapter } =
                    await import("../infrastructure/DiagramJsIconAdapter");

                const modelerAdapter = new DiagramJsModelerAdapter(
                    config.container,
                    config.width ?? "100%",
                    config.height ?? "100%",
                    additionalModules,
                    config.textRenderer,
                    config.colorPicker !== false,
                );

                modelerPort = modelerAdapter;
                iconPort = new DiagramJsIconAdapter(
                    modelerAdapter.getSessionOwner(),
                );
            }

            if (config.colorPicker !== false) {
                let provider: ColorPickerProvider;
                if (config.colorPicker) {
                    provider = config.colorPicker;
                } else {
                    const { createDefaultColorPickerProvider } =
                        await import("../infrastructure/color-picker/DefaultColorPickerProvider");
                    provider = createDefaultColorPickerProvider(
                        config.container,
                    );
                }
                const { ColorPickerController } =
                    await import("../infrastructure/color-picker/ColorPickerController");
                colorPickerController = new ColorPickerController(
                    modelerPort,
                    provider,
                );
            }

            const client = new EgonClient(
                modelerPort,
                iconPort,
                config.viewport,
                colorPickerController,
            );

            if (config.defaultIcons) {
                client.loadIcons(config.defaultIcons);
            }
            return client;
        } catch (error) {
            safelyDestroy(colorPickerController);
            safelyDestroy(iconPort);
            safelyDestroy(modelerPort);
            throw error;
        }
    }

    // --- Document Operations ---

    /**
     * Import a domain story document, loading the icons of its domain section.
     * Repairable damage is fixed and reported via `import.repaired`;
     * structurally invalid input is rejected atomically.
     */
    import(document: DomainStoryDocument): void {
        this.modelerPort.import(document);
    }

    export(): DomainStoryDocument {
        return this.modelerPort.export();
    }

    exportSVG(options?: SvgExportOptions): Promise<SvgExportResult> {
        return this.modelerPort.exportSVG(options);
    }

    exportPNG(options: PngExportOptions = {}): Promise<PngExportResult> {
        const { signal, ...request } = options;
        return this.modelerPort.exportPNG({
            ...request,
            ...(signal ? { cancellation: adaptAbortSignal(signal) } : {}),
        });
    }

    // --- Event Subscription ---

    /**
     * Subscribe to an event. Idempotent per event and callback; one matching
     * {@link off} removes it. Throws a `TypeError` for an unknown event.
     */
    on<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void {
        switch (event) {
            case "story.changed":
                this.modelerPort.onStoryChanged(
                    callback as EgonEventMap["story.changed"],
                );
                break;
            case "viewport.changed":
                this.modelerPort.onViewportChanged(
                    callback as EgonEventMap["viewport.changed"],
                );
                break;
            case "import.repaired":
                this.modelerPort.onImportRepaired(
                    callback as EgonEventMap["import.repaired"],
                );
                break;
            case "icons.changed":
                this.iconPort.onIconsChanged(
                    callback as EgonEventMap["icons.changed"],
                );
                break;
            case "labels.changed":
                this.modelerPort.onLabelsChanged(
                    callback as EgonEventMap["labels.changed"],
                );
                break;
            case "replay.changed":
                this.modelerPort.onReplayChanged(
                    callback as EgonEventMap["replay.changed"],
                );
                break;
            default:
                throw new TypeError(`Unknown Egon event: ${String(event)}`);
        }
    }

    /**
     * Unsubscribe, including a pending debounced delivery. Unknown callbacks
     * are ignored; throws a `TypeError` for an unknown event.
     */
    off<E extends EgonEventName>(event: E, callback: EgonEventMap[E]): void {
        switch (event) {
            case "story.changed":
                this.modelerPort.offStoryChanged(
                    callback as EgonEventMap["story.changed"],
                );
                break;
            case "viewport.changed":
                this.modelerPort.offViewportChanged(
                    callback as EgonEventMap["viewport.changed"],
                );
                break;
            case "import.repaired":
                this.modelerPort.offImportRepaired(
                    callback as EgonEventMap["import.repaired"],
                );
                break;
            case "icons.changed":
                this.iconPort.offIconsChanged(
                    callback as EgonEventMap["icons.changed"],
                );
                break;
            case "labels.changed":
                this.modelerPort.offLabelsChanged(
                    callback as EgonEventMap["labels.changed"],
                );
                break;
            case "replay.changed":
                this.modelerPort.offReplayChanged(
                    callback as EgonEventMap["replay.changed"],
                );
                break;
            default:
                throw new TypeError(`Unknown Egon event: ${String(event)}`);
        }
    }

    // --- Viewport Operations ---

    /** Returns a fresh object containing exactly `{ x, y, width, height }`. */
    getViewport(): ViewportData {
        return this.modelerPort.getViewport();
    }

    setViewport(viewport: ViewportData): void {
        this.modelerPort.setViewport(viewport);
    }

    /**
     * Shift all contents to positive coordinates, which external tools need.
     * Undoable and may fire `story.changed`, so dirty-flag hosts should call it
     * before a save or export, not on every edit.
     */
    alignToOrigin(): void {
        this.modelerPort.alignToOrigin();
    }

    /**
     * Align to origin, then fit the whole story into the visible canvas.
     * May fire `story.changed` because it aligns.
     */
    fitToScreen(): void {
        this.modelerPort.fitToScreen();
    }

    // --- Icon Management ---

    /**
     * **Replaces** the selected icon set, like opening a story does: an omitted
     * category becomes empty. To merge, spread `getIcons()` into the new set.
     */
    loadIcons(icons: Partial<IconSetData>): void {
        this.iconPort.loadIcons(icons);
    }

    /**
     * Add one icon. An existing name is replaced and matching shapes repaint.
     * Artwork is shared by name, so a selected same-name entry in the other
     * category refreshes too, without gaining membership there.
     */
    addIcon(category: IconCategory, name: string, svg: string): void {
        this.iconPort.addIcon(category, name, svg);
    }

    removeIcon(category: IconCategory, name: string): void {
        this.iconPort.removeIcon(category, name);
    }

    getIcons(): IconSet {
        return this.iconPort.getIcons();
    }

    hasIcon(category: IconCategory, name: string): boolean {
        return this.iconPort.hasIcon(category, name);
    }

    getIconConfiguration(): IconConfiguration {
        return this.iconPort.getIconConfiguration();
    }

    setIconOrder(category: IconCategory, names: readonly string[]): void {
        this.iconPort.setIconOrder(category, names);
    }

    // --- Label Dictionary ---

    getLabelDictionary(): LabelDictionary {
        return this.modelerPort.getLabelDictionary();
    }

    renameLabels(changes: LabelRenameBatch): readonly string[] {
        return this.modelerPort.renameLabels(changes);
    }

    // --- Headless Replay ---

    getReplayState(): ReplayState {
        return this.modelerPort.getReplayState();
    }

    startReplay(options?: ReplayStartOptions): ReplayState {
        return this.modelerPort.startReplay(options);
    }

    stopReplay(): ReplayState {
        return this.modelerPort.stopReplay();
    }

    nextReplayStep(): ReplayState {
        return this.modelerPort.nextReplayStep();
    }

    previousReplayStep(): ReplayState {
        return this.modelerPort.previousReplayStep();
    }

    seekReplayStep(index: number): ReplayState {
        return this.modelerPort.seekReplayStep(index);
    }

    setReplayShowGroups(value: boolean): ReplayState {
        return this.modelerPort.setReplayShowGroups(value);
    }

    // --- Lifecycle ---

    /** Destroy the client and release its resources. Idempotent. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        safelyDestroy(this.colorPickerController);
        // Icon port first: the modeler port tears down the injector both read.
        safelyDestroy(this.iconPort);
        safelyDestroy(this.modelerPort);
    }
}

function safelyDestroy(resource: { destroy(): void } | undefined): void {
    try {
        resource?.destroy();
    } catch {
        // Creation preserves its original failure; destruction continues so a
        // faulty disposer cannot strand resources owned by later ports.
    }
}

function adaptAbortSignal(signal: AbortSignal) {
    return {
        get aborted() {
            return signal.aborted;
        },
        onCancel(callback: () => void): () => void {
            signal.addEventListener("abort", callback, { once: true });
            return () => signal.removeEventListener("abort", callback);
        },
    };
}
