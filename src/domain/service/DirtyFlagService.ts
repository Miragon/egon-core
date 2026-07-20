/**
 * Tracks whether the domain story has unsaved changes.
 *
 * Exists so features (renderer, context-pad, …) can flag edits and consumers
 * can react to the dirty state. Uses a dependency-free listener API instead of
 * an rxjs observable: `onDirtyChange` invokes the listener immediately with the
 * current value to mirror a BehaviorSubject's replay semantics, keeping the
 * package free of a runtime rxjs dependency.
 */
export class DirtyFlagService {
    static $inject: string[] = [];

    private isDirty = false;
    private readonly listeners = new Set<(dirty: boolean) => void>();

    get dirty(): boolean {
        return this.isDirty;
    }

    /**
     * Registers a listener for dirty-state changes and returns an unsubscribe
     * function. Fires immediately with the current value so subscribers do not
     * miss the initial state.
     */
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
