// Floor and wall finishes, shared by the 2D plan, the Design sheet and the
// 3D view.
//
// - A floor level stores `floorFinish` (a key below; default "oak").
// - A wall stores `finish: { texture, color }` (default plain paint in the
//   original wall color). Textures are tinted by `color`.
// Paint colors and the basic floors are free; textures are PRO.

export const DEFAULT_FLOOR_FINISH = "oak";
export const DEFAULT_WALL_COLOR = "#DFDAD1";
export const DEFAULT_WALL_FINISH = { texture: "paint", color: DEFAULT_WALL_COLOR };

// `plank`/`tile` describe the 2D pattern; `tone` the 3D texture generator.
export const FLOOR_FINISHES = [
    { key: "oak", label: "Oak", kind: "wood", base: "#C4A981", palette: ["#D9C09F", "#D3B893", "#DEC7A8", "#CFB28C", "#E2CCAF"] },
    { key: "lightWood", label: "Light wood", kind: "wood", base: "#E3D3B8", palette: ["#EFE3CD", "#EADCC2", "#F2E8D5", "#E6D6BA", "#F4EBDB"] },
    { key: "walnut", label: "Dark walnut", kind: "wood", base: "#6B4A33", palette: ["#7A563B", "#6E4C34", "#83603F", "#5F412D", "#8A6645"] },
    { key: "herringbone", label: "Herringbone", kind: "herringbone", base: "#B98E62", palette: ["#C9A074", "#BE936A", "#D1AB80", "#B48961"], pro: true },
    { key: "marble", label: "Marble", kind: "tile", base: "#F1EFEC", line: "#D6D2CC", tileIn: 24, pro: true },
    { key: "greyTile", label: "Grey tile", kind: "tile", base: "#B9BCC0", line: "#9A9EA3", tileIn: 18 },
    { key: "terracotta", label: "Terracotta", kind: "tile", base: "#C26E4B", line: "#9E5636", tileIn: 12, pro: true },
    { key: "concrete", label: "Concrete", kind: "plain", base: "#A9A7A3" },
    { key: "carpetBeige", label: "Beige carpet", kind: "plain", base: "#D8CBB5" },
    { key: "carpetGrey", label: "Grey carpet", kind: "plain", base: "#9C9EA3" },
];

export const WALL_TEXTURES = [
    { key: "paint", label: "Paint", icon: "color-fill-outline" },
    { key: "brick", label: "Brick", icon: "grid-outline", pro: true, color: "#B5603F" },
    { key: "panel", label: "Wood panel", icon: "reorder-four-outline", pro: true, color: "#A47551" },
    { key: "stripes", label: "Wallpaper", icon: "barcode-outline", pro: true, color: "#C9D6CF" },
    { key: "tile", label: "Tile", icon: "apps-outline", pro: true, color: "#E8ECEF" },
    { key: "concrete", label: "Concrete", icon: "square-outline", pro: true, color: "#B4B2AE" },
];

export const WALL_COLORS = [
    "#DFDAD1",
    "#F5F2EC",
    "#FFFFFF",
    "#E8DCC8",
    "#D9C3A5",
    "#C8C6C1",
    "#8F9296",
    "#4A4F57",
    "#B7C4A5",
    "#7E9C86",
    "#A9C1D6",
    "#3E5A78",
    "#C9826B",
    "#E6C27A",
];

export const floorFinish = (key) =>
    FLOOR_FINISHES.find((f) => f.key === key) ?? FLOOR_FINISHES[0];

export const wallTexture = (key) =>
    WALL_TEXTURES.find((t) => t.key === key) ?? WALL_TEXTURES[0];

export const wallFinishOf = (w) => ({ ...DEFAULT_WALL_FINISH, ...(w?.finish ?? {}) });

export const isProFinish = (finish) => !!finish?.pro;

// Deterministic RNG so 2D patterns are stable across renders.
const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 2D floor pattern covering `bbox` (content px), to be clipped to the room:
// { base, rects: [{x,y,w,h,color,rot?}], lines: [{x1,y1,x2,y2}], lineColor }.
// `pxPerIn` converts real sizes (tile size, plank width) to plan pixels.
export const floorPattern2D = (key, bbox, pxPerIn) => {
    const f = floorFinish(key);
    const out = { base: f.base, rects: [], lines: [], lineColor: f.line };
    if (f.kind === "wood") {
        const rng = mulberry32(1993);
        const rowH = 14;
        for (let y = bbox.minY; y < bbox.maxY; y += rowH) {
            let x = bbox.minX - rng() * 60;
            while (x < bbox.maxX) {
                const w = 55 + rng() * 70;
                out.rects.push({
                    x,
                    y,
                    w: w - 1.2,
                    h: rowH - 1.2,
                    color: f.palette[Math.floor(rng() * f.palette.length)],
                });
                x += w;
            }
        }
    } else if (f.kind === "herringbone") {
        // Short planks laid in alternating 45° zig-zag columns.
        const rng = mulberry32(77);
        const L = 30 * pxPerIn * 0.9; // plank length
        const W = 5 * pxPerIn * 0.9; // plank width
        const stepX = L * Math.SQRT1_2;
        for (let col = 0, x = bbox.minX - L; x < bbox.maxX + L; col++, x += stepX) {
            for (let y = bbox.minY - L; y < bbox.maxY + L; y += W * Math.SQRT2) {
                out.rects.push({
                    x: x,
                    y: y,
                    w: L - 1,
                    h: W - 1,
                    rot: col % 2 ? 45 : -45,
                    color: f.palette[Math.floor(rng() * f.palette.length)],
                });
            }
        }
    } else if (f.kind === "tile") {
        const s = (f.tileIn || 18) * pxPerIn;
        const x0 = Math.floor(bbox.minX / s) * s;
        const y0 = Math.floor(bbox.minY / s) * s;
        for (let x = x0; x <= bbox.maxX; x += s) out.lines.push({ x1: x, y1: bbox.minY, x2: x, y2: bbox.maxY });
        for (let y = y0; y <= bbox.maxY; y += s) out.lines.push({ x1: bbox.minX, y1: y, x2: bbox.maxX, y2: y });
    }
    return out;
};
