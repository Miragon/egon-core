export function rgbaToHex(rgba: string) {
    if (isValidHex(rgba)) {
        return rgba;
    }

    const colorFunction = rgba.match(
        /^\s*(rgb|rgba)\(\s*(\d+(?:\.\d+)?|\.\d+)\s*,\s*(\d+(?:\.\d+)?|\.\d+)\s*,\s*(\d+(?:\.\d+)?|\.\d+)(?:\s*,\s*(\d+(?:\.\d+)?|\.\d+))?\s*\)\s*$/i,
    );
    if (!colorFunction) {
        return rgba;
    }

    const [, functionName, redValue, greenValue, blueValue, alphaValue] =
        colorFunction;
    if (
        (functionName.toLowerCase() === "rgb" && alphaValue !== undefined) ||
        (functionName.toLowerCase() === "rgba" && alphaValue === undefined)
    ) {
        return rgba;
    }

    const channels = [redValue, greenValue, blueValue].map(Number);
    const alphaFloat = alphaValue === undefined ? 1 : Number(alphaValue);
    if (
        channels.some((channel) => channel < 0 || channel > 255) ||
        alphaFloat < 0 ||
        alphaFloat > 1
    ) {
        return rgba;
    }

    const [red, green, blue] = channels.map((channel) =>
        Math.round(channel).toString(16).padStart(2, "0"),
    );
    const alpha = Math.round(alphaFloat * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${red}${green}${blue}${alpha}`;
}

const isValidHex = (hex: string) =>
    /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(
        hex,
    );
const getChunksFromString = (st: string, chunkSize: number) =>
    st.match(new RegExp(`.{${chunkSize}}`, "g")) ?? [];
const convertHexUnitTo256 = (hexStr: string) =>
    parseInt(hexStr.repeat(2 / hexStr.length), 16);
const getAlphafloat = (a: number | undefined) => {
    if (typeof a !== "undefined") {
        return Math.round((a / 255 + Number.EPSILON) * 100) / 100; // Runden auf 2 oder weniger Nachkommastellen
    }
    return 1;
};

export const isHexWithAlpha = (hex: string | null | undefined) =>
    hex?.startsWith("#") && (hex?.length === 5 || hex?.length === 9);

export const hexToRGBA = (hex: string) => {
    if (!isValidHex(hex)) {
        throw new Error("Invalid HEX");
    }
    const chunkSize = Math.floor((hex.length - 1) / 3); // 1 falls hex 3-4 Stellen, 2 falls hex 6 oder 8 Stellen
    const hexArr = getChunksFromString(hex.slice(1), chunkSize);
    const [r, g, b, a] = hexArr.map(convertHexUnitTo256);
    return `rgba(${r},${g},${b},${getAlphafloat(a)})`;
};
