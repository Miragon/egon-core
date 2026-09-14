/** The coordinates used to decide whether a shape belongs to a group. */
export interface TopLeftPosition {
    x: number;
    y: number;
}

/** The rectangular bounds of a group. */
export interface GroupBounds extends TopLeftPosition {
    width: number;
    height: number;
}

/**
 * Whether a shape's top-left corner lies inside a group's inclusive bounds.
 *
 * Containment deliberately does not consider the candidate's width or height:
 * this preserves the notation's established partial-overlap behaviour.
 */
export function isTopLeftInsideGroup(
    candidate: TopLeftPosition,
    group: GroupBounds,
): boolean {
    return (
        candidate.x >= group.x &&
        candidate.x <= group.x + group.width &&
        candidate.y >= group.y &&
        candidate.y <= group.y + group.height
    );
}
