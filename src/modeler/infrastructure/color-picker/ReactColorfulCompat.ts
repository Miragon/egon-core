// The React subset react-colorful 5.8.1 needs, taken from diagram-js' UI barrel
// so both widgets share one Preact runtime even with virtualized peers.
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

// react-colorful reads React's `event.nativeEvent`, which Preact lacks. Only
// picker-created DOM elements are adapted.
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

// Identity is enough: memo is only an optimization in react-colorful, and this
// avoids a second Preact compat runtime.
export function memo<T>(component: T): T {
    return component;
}

export default { createElement, memo };
