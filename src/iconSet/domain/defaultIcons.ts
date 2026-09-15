import type { IconSetData } from "./IconTypes";

const actors = Object.freeze({
    Person: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26">
    <path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10c3 0 8 1.5 8 4.5V22H4v-3.5C4 15.5 9 14 12 14Z" />
</svg>`,
});

const workObjects = Object.freeze({
    Document: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 26">
    <path d="M6 2h8l6 6v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 2v5h5ZM8 14h8v-2H8Zm0 4h8v-2H8Z" />
</svg>`,
});

/** Optional starter artwork for hosts that want a minimal creation palette. */
export const defaultIcons: IconSetData = Object.freeze({
    name: "egon-default",
    actors,
    workObjects,
});
