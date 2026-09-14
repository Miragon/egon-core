// react-colorful 5.8.1 needs this small React-compatible subset. Importing it
// through diagram-js's UI barrel guarantees both widgets use that barrel's
// exact Preact runtime even when a package manager virtualizes Preact peers.
import {
    createElement as preactCreateElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "diagram-js/lib/ui";

type ReactCompatibleEvent = Event & { nativeEvent?: Event };
type EventHandler = (event: ReactCompatibleEvent) => unknown;

function withNativeEvent(handler: EventHandler): EventHandler {
    return (event) => {
        if (event.nativeEvent === undefined) {
            Object.defineProperty(event, "nativeEvent", {
                configurable: true,
                value: event,
            });
        }
        return handler(event);
    };
}

// Preact passes the original DOM event to handlers, while react-colorful's
// interactive controls expect React's SyntheticEvent.nativeEvent. Adapt only
// picker-created DOM elements; component VNodes and diagram-js UI stay on the
// unmodified diagram-js Preact runtime.
export const createElement = ((
    type: any,
    props: any,
    ...children: any[]
): any => {
    if (typeof type === "string" && props) {
        props = { ...props };
        for (const name of ["onMouseDown", "onTouchStart"] as const) {
            if (typeof props[name] === "function") {
                props[name] = withNativeEvent(props[name]);
            }
        }
    }
    return preactCreateElement(type, props, ...children);
}) as typeof preactCreateElement;

export { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState };

// Memoization is only an optimization inside the pinned react-colorful build;
// an identity adapter preserves component behavior without importing a second
// Preact compatibility runtime.
export function memo<T>(component: T): T {
    return component;
}

export default { createElement, memo };
