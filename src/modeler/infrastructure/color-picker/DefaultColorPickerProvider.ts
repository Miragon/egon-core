import { HexAlphaColorPicker } from "react-colorful";
import { html, render, useState } from "diagram-js/lib/ui";

import type {
    ColorPickerProvider,
    ColorPickerRequest,
} from "../../service/ColorPickerProvider";
import { isValidHex, rgbaToHex } from "../../../shared/domain/colorConverter";

interface PopoverProps {
    readonly initialColor: string;
    readonly onApply: (color: string) => void;
    readonly onCancel: () => void;
}

function initialHex(color: string): string {
    if (isValidHex(color)) return color;
    const converted = rgbaToHex(color);
    return isValidHex(converted) ? converted : "#000000";
}

function ColorPickerPopover({ initialColor, onApply, onCancel }: PopoverProps) {
    const startingColor = initialHex(initialColor);
    const [pickerColor, setPickerColor] = useState(startingColor);
    const [draft, setDraft] = useState(startingColor);
    const valid = isValidHex(draft);

    const updatePicker = (color: string) => {
        setPickerColor(color);
        setDraft(color);
    };

    const updateInput = (event: Event) => {
        const color = (event.currentTarget as HTMLInputElement).value;
        setDraft(color);
        if (isValidHex(color)) setPickerColor(color);
    };

    return html`<section
        class="egon-color-picker"
        role="dialog"
        aria-modal="false"
        aria-label="Change color"
    >
        <${HexAlphaColorPicker} color=${pickerColor} onChange=${updatePicker} />
        <label class="egon-color-picker__field">
            <span>Hex color</span>
            <span class="egon-color-picker__input-row">
                <span
                    class="egon-color-picker__swatch"
                    style=${{
                        "--egon-picker-color": valid ? draft : "transparent",
                    }}
                    aria-hidden="true"
                ></span>
                <input
                    name="color"
                    value=${draft}
                    onInput=${updateInput}
                    aria-invalid=${valid ? "false" : "true"}
                    autocomplete="off"
                    spellcheck="false"
                />
            </span>
        </label>
        <p class="egon-color-picker__hint">
            Custom non-SVG artwork retains its original colors.
        </p>
        <div class="egon-color-picker__actions">
            <button type="button" onClick=${onCancel}>Cancel</button>
            <button
                type="button"
                class="egon-color-picker__apply"
                disabled=${!valid}
                onClick=${() => valid && onApply(draft)}
            >
                Apply
            </button>
        </div>
    </section>`;
}

function findOrigin(
    container: HTMLElement,
    request: ColorPickerRequest,
): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && container.contains(active)) {
        return active;
    }

    const entries = container.querySelectorAll<HTMLElement>(
        '[data-action="colorChange"]',
    );
    return (
        Array.from(entries).find((entry) => {
            const rect = entry.getBoundingClientRect();
            return (
                request.anchor.x >= rect.left &&
                request.anchor.x <= rect.right + 1 &&
                request.anchor.y >= rect.top &&
                request.anchor.y <= rect.bottom
            );
        }) ?? null
    );
}

/** Create the built-in, client-owned anchored Preact picker. */
export function createDefaultColorPickerProvider(
    container: HTMLElement,
): ColorPickerProvider {
    return (request) => {
        const mount = document.createElement("div");
        mount.className = "egon-color-picker-mount";
        mount.setAttribute("data-egon-color-picker", request.requestId);
        document.body.appendChild(mount);

        const origin = findOrigin(container, request);
        let settled = false;
        let disposed = false;
        let resolveResult!: (result: string | null) => void;
        const result = new Promise<string | null>((resolve) => {
            resolveResult = resolve;
        });

        const finish = (value: string | null, restoreFocus: boolean) => {
            if (settled) return;
            settled = true;
            if (restoreFocus && origin?.isConnected) {
                origin.focus({ preventScroll: true });
            }
            resolveResult(value);
        };

        const cancelWithoutFocus = () => finish(null, false);
        const position = () => {
            if (!container.isConnected || (origin && !origin.isConnected)) {
                cancelWithoutFocus();
                return;
            }

            const panel = mount.firstElementChild as HTMLElement | null;
            if (!panel) return;
            const margin = 8;
            const rect = panel.getBoundingClientRect();
            let left = request.anchor.x + margin;
            if (left + rect.width > window.innerWidth - margin) {
                left = request.anchor.x - rect.width - margin;
            }
            left = Math.max(
                margin,
                Math.min(left, window.innerWidth - rect.width - margin),
            );
            const top = Math.max(
                margin,
                Math.min(
                    request.anchor.y - rect.height / 2,
                    window.innerHeight - rect.height - margin,
                ),
            );
            mount.style.left = `${left}px`;
            mount.style.top = `${top}px`;
        };

        const onPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !mount.contains(event.target)) {
                cancelWithoutFocus();
            }
        };
        const onFocusIn = (event: FocusEvent) => {
            if (event.target instanceof Node && !mount.contains(event.target)) {
                cancelWithoutFocus();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                finish(null, true);
            }
        };
        const onResize = () => position();
        const observer = new MutationObserver(position);

        render(
            html`<${ColorPickerPopover}
                initialColor=${request.color}
                onApply=${(color: string) => finish(color, true)}
                onCancel=${() => finish(null, true)}
            />`,
            mount,
        );
        mount
            .querySelector<HTMLInputElement>('input[name="color"]')
            ?.focus({ preventScroll: true });
        position();

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", cancelWithoutFocus, true);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        request.signal.addEventListener("abort", cancelWithoutFocus, {
            once: true,
        });

        return {
            result,
            dispose() {
                if (disposed) return;
                disposed = true;
                request.signal.removeEventListener("abort", cancelWithoutFocus);
                document.removeEventListener(
                    "pointerdown",
                    onPointerDown,
                    true,
                );
                document.removeEventListener("focusin", onFocusIn, true);
                document.removeEventListener("keydown", onKeyDown, true);
                window.removeEventListener("resize", onResize);
                window.removeEventListener("scroll", cancelWithoutFocus, true);
                observer.disconnect();
                render(null, mount);
                mount.remove();
            },
        };
    };
}
