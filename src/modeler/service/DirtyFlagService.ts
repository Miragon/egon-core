/**
 * Tracks whether the domain story has unsaved changes. A plain listener API
 * instead of an rxjs BehaviorSubject avoids a runtime rxjs dependency.
 */
export class DirtyFlagService {
    static $inject: string[] = [];

    private isDirty = false;
    private readonly listeners = new Set<(dirty: boolean) => void>();

    get dirty(): boolean {
        return this.isDirty;
    }

    /** Fires immediately with the current value, like a BehaviorSubject. */
    onDirtyChange(listener: (dirty: boolean) => void): () => void {
        this.listeners.add(listener);
        listener(this.isDirty);
        return () => this.listeners.delete(listener);
    }

    makeDirty(): void {
        this.setDirty(true);
    }

    makeClean(): void {
        this.setDirty(false);
    }

    private setDirty(dirty: boolean): void {
        if (this.isDirty === dirty) return;
        this.isDirty = dirty;
        this.listeners.forEach((listener) => listener(dirty));
    }
}
