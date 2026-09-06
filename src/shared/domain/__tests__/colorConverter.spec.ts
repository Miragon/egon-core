import { describe, expect, it } from "vitest";

import { hexToRGBA, rgbaToHex } from "../colorConverter";

describe("rgbaToHex", () => {
    it.each([
        ["rgb(255, 0, 16)", "#ff0010ff"],
        ["rgba(255, 0, 16, 0)", "#ff001000"],
        ["rgba(12.4, 127.5, 254.6, .5)", "#0c80ff80"],
        ["  RGB( 1 , 2 , 3 )  ", "#010203ff"],
        ["RgBa( 1, 2, 3, 1 )", "#010203ff"],
    ])("converts %s to an eight-digit hex color", (input, expected) => {
        expect(rgbaToHex(input)).toBe(expected);
    });

    it.each(["#abc", "#abcd", "#aabbcc", "#AABBCCDD"])(
        "preserves valid hex input %s",
        (input) => {
            expect(rgbaToHex(input)).toBe(input);
        },
    );

    it.each([
        "black",
        "",
        "rgb(1, 2)",
        "rgba(1, 2, 3)",
        "rgb(1, 2, 3, .5)",
        "rgba(1, 2, 3, .5) trailing",
        "hsl(0, 100%, 50%)",
        "rgb(100% 0% 0%)",
        "rgb(256, 0, 0)",
        "rgb(0, 0, 255.1)",
        "rgba(0, 0, 0, 1.1)",
        "rgba(0, 0, 0, -0.1)",
        "#1234567",
    ])("preserves unsupported or invalid input %s", (input) => {
        expect(rgbaToHex(input)).toBe(input);
    });
});

describe("hexToRGBA", () => {
    it.each([
        ["#abc", "rgba(170,187,204,1)"],
        ["#abcd", "rgba(170,187,204,0.87)"],
        ["#aabbcc", "rgba(170,187,204,1)"],
        ["#aabbcc80", "rgba(170,187,204,0.5)"],
    ])("converts valid hex color %s", (input, expected) => {
        expect(hexToRGBA(input)).toBe(expected);
    });

    it("rejects seven-digit hex colors", () => {
        expect(() => hexToRGBA("#1234567")).toThrow("Invalid HEX");
    });
});
