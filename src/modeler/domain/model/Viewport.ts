/** Immutable value object for the visible area of the canvas. */
export class Viewport {
    constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
    ) {
        Object.freeze(this);
    }

    equals(other: Viewport): boolean {
        return (
            this.x === other.x &&
            this.y === other.y &&
            this.width === other.width &&
            this.height === other.height
        );
    }

    toPlainObject(): ViewportData {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    static fromPlainObject(data: ViewportData): Viewport {
        return new Viewport(data.x, data.y, data.width, data.height);
    }
}

/**
 * Adapter outputs are fresh objects with exactly these four fields, even when
 * the canvas viewbox has more.
 */
export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
}
