/** Report post-commit observer/cleanup failures without turning them into import failures. */
export function reportPostCommitError(error: unknown): void {
    const reporter = (
        globalThis as typeof globalThis & {
            reportError?: (value: unknown) => void;
        }
    ).reportError;

    if (typeof reporter === "function") {
        try {
            reporter(error);
            return;
        } catch {
            // Reporting is best-effort and must never turn a committed import
            // back into a reported import failure.
        }
    }

    try {
        console.error(error);
    } catch {
        // A host may replace console methods. There is no further safe sink.
    }
}
