import Diagram from "diagram-js";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { ModuleDeclaration } from "didi";
import { Ids } from "ids";

import EgonPlugin from "./plugin";
import type { DomainStoryTextRendererConfig } from "../domain";
import { reportPostCommitError } from "../../shared/infrastructure/reportError";

export interface EditorSession {
    readonly diagram: Diagram;
    readonly canvas: Canvas;
    readonly eventBus: EventBus;
    readonly iconStyleElement: HTMLStyleElement;
    readonly stagingHost?: HTMLDivElement;
}

type PromotionListener = (
    previous: EditorSession,
    current: EditorSession,
) => void;

/**
 * Fires diagram teardown without allowing one faulty listener to strand the
 * listeners and DOM owned by the remaining services.
 */
function destroyEventBus(
    eventBus: EventBus,
    destroy: () => void = () => eventBus.fire("diagram.destroy"),
    reportErrors = true,
): void {
    const cleanupErrors: unknown[] = [];
    const handleCleanupError = (event: unknown): false => {
        cleanupErrors.push((event as { error: unknown }).error);
        return false;
    };
    eventBus.on("error", handleCleanupError);
    try {
        destroy();
    } catch (error) {
        cleanupErrors.push(error);
    } finally {
        eventBus.off("error", handleCleanupError);
    }
    if (reportErrors) cleanupErrors.forEach(reportPostCommitError);
}

/** Owns the one active diagram-js injector and any isolated import candidate. */
export class EditorSessionOwner {
    private active: EditorSession;
    private readonly sessionIds = new Ids();
    private readonly promotionListeners = new Set<PromotionListener>();

    constructor(
        private readonly container: HTMLElement,
        private readonly width: string,
        private readonly height: string,
        private readonly additionalModules: ModuleDeclaration[] = [],
        private readonly textRenderer?: DomainStoryTextRendererConfig,
        private readonly colorPickerEnabled = true,
    ) {
        this.active = this.createSession();
    }

    getActiveSession(): EditorSession {
        return this.active;
    }

    getActiveDiagram(): Diagram {
        return this.active.diagram;
    }

    onPromotion(listener: PromotionListener): () => void {
        this.promotionListeners.add(listener);
        return () => this.promotionListeners.delete(listener);
    }

    createCandidate(): EditorSession {
        const stagingHost = document.createElement("div");
        stagingHost.setAttribute("data-egon-import-candidate", "");
        const bounds = this.container.getBoundingClientRect();
        Object.assign(stagingHost.style, {
            position: "absolute",
            left: "0",
            top: "0",
            width: bounds.width > 0 ? `${bounds.width}px` : this.width,
            height: bounds.height > 0 ? `${bounds.height}px` : this.height,
            visibility: "hidden",
            pointerEvents: "none",
            overflow: "hidden",
        });
        this.container.appendChild(stagingHost);

        try {
            return this.createSession(stagingHost);
        } catch (error) {
            stagingHost.remove();
            throw error;
        }
    }

    /** Atomically make a fully materialized candidate the active session. */
    promote(candidate: EditorSession): EditorSession {
        if (!candidate.stagingHost) {
            throw new Error("Only a candidate editor session can be promoted");
        }

        const previous = this.active;
        const previousCanvas = previous.canvas.getContainer();
        const candidateCanvas = candidate.canvas.getContainer();
        const previousMedia = previous.iconStyleElement.media;

        try {
            // The two icon sets may reuse class names. Keep exactly one
            // stylesheet active throughout the swap so preparation cannot
            // restyle the document the user is still looking at.
            previous.iconStyleElement.media = "not all";
            this.container.insertBefore(
                candidate.iconStyleElement,
                previous.iconStyleElement,
            );
            this.container.insertBefore(candidateCanvas, previousCanvas);
            candidate.iconStyleElement.media = "";
            this.active = candidate;

            this.promotionListeners.forEach((listener) => {
                try {
                    listener(previous, candidate);
                } catch (error) {
                    reportPostCommitError(error);
                }
            });
            candidate.stagingHost.remove();
            return previous;
        } catch (error) {
            this.active = previous;
            previous.iconStyleElement.media = previousMedia;
            candidate.iconStyleElement.media = "not all";
            candidate.stagingHost.append(
                candidate.iconStyleElement,
                candidateCanvas,
            );
            throw error;
        }
    }

    dispose(session: EditorSession): void {
        const canvasContainer =
            typeof session.canvas.getContainer === "function"
                ? session.canvas.getContainer()
                : undefined;
        try {
            destroyEventBus(session.eventBus, () => session.diagram.destroy());
        } finally {
            canvasContainer?.remove();
            session.iconStyleElement.remove();
            session.stagingHost?.remove();
        }
    }

    destroy(): void {
        this.promotionListeners.clear();
        this.dispose(this.active);
    }

    private createSession(stagingHost?: HTMLDivElement): EditorSession {
        const canvasHost = stagingHost ?? this.container;
        const scopeId = this.sessionIds.next();
        const iconStyleElement = document.createElement("style");
        iconStyleElement.setAttribute("data-egon-icons-css", "");
        if (stagingHost) iconStyleElement.media = "not all";
        canvasHost.appendChild(iconStyleElement);

        let diagram: Diagram | undefined;
        let creationEventBus: EventBus | undefined;
        const captureEventBus = (eventBus: EventBus): object => {
            creationEventBus = eventBus;
            return {};
        };
        (captureEventBus as any).$inject = ["eventBus"];
        try {
            diagram = new Diagram({
                canvas: {
                    container: canvasHost,
                    width: this.width,
                    height: this.height,
                },
                domainStoryIconStyleSheet: {
                    styleElement: iconStyleElement,
                    scopeId,
                },
                ...(this.textRenderer
                    ? { textRenderer: this.textRenderer }
                    : {}),
                domainStoryColorPicker: {
                    enabled: this.colorPickerEnabled,
                },
                modules: [
                    {
                        __init__: ["domainStoryCreationCleanup"],
                        domainStoryCreationCleanup: [
                            "factory",
                            captureEventBus,
                        ],
                    },
                    EgonPlugin,
                    ...this.additionalModules,
                ],
            });
            const canvas = diagram.get<Canvas>("canvas");
            const eventBus = diagram.get<EventBus>("eventBus");
            canvas.getContainer().setAttribute("data-egon-icon-scope", scopeId);
            canvas.getRootElement();
            return {
                diagram,
                canvas,
                eventBus,
                iconStyleElement,
                stagingHost,
            };
        } catch (error) {
            try {
                if (creationEventBus) {
                    destroyEventBus(
                        creationEventBus,
                        () => creationEventBus?.fire("diagram.destroy"),
                        false,
                    );
                } else {
                    diagram?.destroy();
                }
            } catch (cleanupError) {
                reportPostCommitError(cleanupError);
            } finally {
                iconStyleElement.remove();
            }
            throw error;
        }
    }
}
