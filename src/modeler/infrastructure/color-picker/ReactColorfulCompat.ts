// react-colorful 5.8.1 needs this small React-compatible subset. Importing it
// through diagram-js's UI barrel guarantees both widgets use that barrel's
// exact Preact runtime even when a package manager virtualizes Preact peers.
import {
    createElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "diagram-js/lib/ui";

export {
    createElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
};

// Memoization is only an optimization inside the pinned react-colorful build;
// an identity adapter preserves component behavior without importing a second
// Preact compatibility runtime.
export function memo<T>(component: T): T {
    return component;
}

export default { createElement, memo };
