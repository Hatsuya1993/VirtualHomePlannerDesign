// Furniture catalog shared by the 2D plan editor and the 3D walkthrough.
//
// Every catalog entry describes one placeable piece: its default real-world
// size in inches (w = width along its local x axis, d = depth along local y,
// h = height), a `shape` that selects both the top-view SVG glyph
// (components/FurnitureGlyph.js) and the 3D model builder
// (utils/furniture3D.js), and a default color.
//
// A placed piece in a design is stored as:
//   { id, type, x, y, rot, w, d, h, elev, color }
// where x/y are content-space pixels (same space as the walls), rot is degrees
// clockwise on screen, and the dimensions are inches. Local "front" is +y in
// 2D (+z in 3D) — e.g. the side of a sofa you sit on, the foot of a bed.

// Must match the drawing scale assumed by PlanPreviewScreen / Room3DScreen.
export const PIXELS_PER_FOOT = 26;
export const PX_PER_IN = PIXELS_PER_FOOT / 12;

export const FURNITURE_CATEGORIES = [
    { key: "living", label: "Living Room", icon: "sofa-outline" },
    { key: "bedroom", label: "Bedroom", icon: "bed-outline" },
    { key: "dining", label: "Dining", icon: "table-chair" },
    { key: "kitchen", label: "Kitchen", icon: "stove" },
    { key: "bathroom", label: "Bathroom", icon: "shower-head" },
    { key: "office", label: "Office", icon: "desk" },
    { key: "outdoor", label: "Outdoor", icon: "pine-tree" },
    { key: "decor", label: "Decor & Lighting", icon: "floor-lamp-outline" },
];

// Drawing order: rugs underneath everything, wall-mounted/raised pieces on top.
const LAYER_RUG = 0;
const LAYER_FLOOR = 1;
const LAYER_RAISED = 2;

const item = (type, name, category, shape, w, d, h, color, extra = {}) => ({
    type,
    name,
    category,
    shape,
    w,
    d,
    h,
    color,
    elev: 0,
    layer: LAYER_FLOOR,
    ...extra,
});

export const FURNITURE_ITEMS = [
    // Living room
    item("sofa", "Sofa", "living", "sofa", 84, 36, 34, "#8E9AAF"),
    item("loveseat", "Loveseat", "living", "sofa", 60, 34, 34, "#A3B18A"),
    item("sectional", "Sectional Sofa", "living", "sectional", 112, 84, 34, "#9C8F80"),
    item("armchair", "Armchair", "living", "armchair", 34, 34, 36, "#C08B5C"),
    item("recliner", "Recliner", "living", "armchair", 38, 38, 40, "#6D5A4B"),
    item("ottoman", "Ottoman", "living", "ottoman", 30, 22, 17, "#B5838D"),
    item("coffeeTable", "Coffee Table", "living", "table", 48, 24, 18, "#8B6B4A"),
    item("roundCoffeeTable", "Round Coffee Table", "living", "roundTable", 36, 36, 18, "#A47551"),
    item("sideTable", "Side Table", "living", "table", 20, 20, 24, "#8B6B4A"),
    item("tvStand", "TV Stand", "living", "cabinet", 64, 18, 22, "#5B4636", { variant: "media" }),
    item("tv", "TV", "living", "tv", 56, 10, 33, "#1F2328", {
        elev: 22,
        layer: LAYER_RAISED,
    }),
    item("bookshelf", "Bookshelf", "living", "bookshelf", 36, 14, 72, "#7A5C43"),
    item("fireplace", "Fireplace", "living", "fireplace", 60, 16, 44, "#E8E2D8"),
    item("piano", "Upright Piano", "living", "piano", 58, 25, 48, "#1B1B1F"),

    // Bedroom
    item("kingBed", "King Bed", "bedroom", "bed", 80, 84, 40, "#9FB4C7"),
    item("queenBed", "Queen Bed", "bedroom", "bed", 64, 84, 40, "#C9ADA7"),
    item("doubleBed", "Double Bed", "bedroom", "bed", 58, 79, 38, "#B7C4A5"),
    item("singleBed", "Single Bed", "bedroom", "bed", 42, 79, 36, "#E0B97E"),
    item("bunkBed", "Bunk Bed", "bedroom", "bunkBed", 42, 80, 64, "#8B6B4A"),
    item("crib", "Baby Crib", "bedroom", "crib", 30, 54, 40, "#F1EDE6"),
    item("nightstand", "Nightstand", "bedroom", "cabinet", 20, 16, 24, "#8B6B4A", { variant: "drawers" }),
    item("dresser", "Dresser", "bedroom", "cabinet", 60, 20, 34, "#7A5C43", { variant: "drawers" }),
    item("wardrobe", "Wardrobe", "bedroom", "wardrobe", 48, 24, 80, "#EDE7DD"),
    item("dressingTable", "Dressing Table", "bedroom", "desk", 42, 18, 30, "#F1EDE6", { variant: "vanity" }),
    item("bedBench", "Bed Bench", "bedroom", "bench", 50, 16, 18, "#B5838D", { variant: "upholstered" }),

    // Dining
    item("diningTable", "Dining Table", "dining", "table", 72, 38, 30, "#8B6B4A"),
    item("roundDiningTable", "Round Dining Table", "dining", "roundTable", 48, 48, 30, "#A47551"),
    item("diningChair", "Dining Chair", "dining", "chair", 18, 20, 36, "#6D5A4B"),
    item("barStool", "Bar Stool", "dining", "stool", 16, 16, 30, "#2F3237"),
    item("diningBench", "Dining Bench", "dining", "bench", 60, 15, 18, "#8B6B4A"),
    item("sideboard", "Sideboard", "dining", "cabinet", 60, 18, 34, "#5B4636", { variant: "doors" }),

    // Kitchen
    item("baseCabinet", "Base Cabinet", "kitchen", "counter", 30, 24, 36, "#F4F1EA"),
    item("wallCabinet", "Wall Cabinet", "kitchen", "cabinet", 30, 13, 30, "#F4F1EA", {
        variant: "doors",
        elev: 54,
        layer: LAYER_RAISED,
    }),
    item("kitchenSink", "Kitchen Sink", "kitchen", "sink", 36, 24, 36, "#F4F1EA"),
    item("stove", "Stove / Oven", "kitchen", "stove", 30, 26, 36, "#C9CDD2"),
    item("fridge", "Refrigerator", "kitchen", "fridge", 36, 30, 70, "#D5D9DE"),
    item("dishwasher", "Dishwasher", "kitchen", "dishwasher", 24, 24, 34, "#C9CDD2"),
    item("kitchenIsland", "Kitchen Island", "kitchen", "counter", 72, 36, 36, "#4F6D7A", { variant: "island" }),
    item("pantry", "Tall Pantry", "kitchen", "wardrobe", 30, 24, 84, "#F4F1EA"),

    // Bathroom
    item("toilet", "Toilet", "bathroom", "toilet", 20, 28, 30, "#FAFAFA"),
    item("bathtub", "Bathtub", "bathroom", "bathtub", 60, 30, 22, "#FAFAFA"),
    item("shower", "Shower", "bathroom", "shower", 36, 36, 80, "#E6EEF2"),
    item("bathVanity", "Bathroom Vanity", "bathroom", "vanity", 36, 21, 34, "#5B6C7A"),
    item("washer", "Washing Machine", "bathroom", "washer", 27, 30, 38, "#F5F6F7"),
    item("dryer", "Dryer", "bathroom", "washer", 27, 30, 38, "#F5F6F7"),

    // Office
    item("desk", "Desk", "office", "desk", 60, 30, 30, "#A47551"),
    item("officeChair", "Office Chair", "office", "officeChair", 26, 26, 42, "#2F3237"),
    item("filingCabinet", "Filing Cabinet", "office", "cabinet", 15, 24, 28, "#9AA1A9", { variant: "drawers" }),
    item("officeShelf", "Shelving Unit", "office", "bookshelf", 48, 14, 72, "#EDE7DD"),
    item("treadmill", "Treadmill", "office", "treadmill", 32, 72, 56, "#2F3237"),

    // Outdoor
    item("patioTable", "Patio Table", "outdoor", "roundTable", 42, 42, 29, "#E7E2D6"),
    item("patioChair", "Patio Chair", "outdoor", "chair", 22, 24, 34, "#E7E2D6"),
    item("sunLounger", "Sun Lounger", "outdoor", "lounger", 28, 76, 14, "#D9CBB4"),
    item("grill", "BBQ Grill", "outdoor", "grill", 50, 22, 45, "#2F3237"),
    item("outdoorSofa", "Outdoor Sofa", "outdoor", "sofa", 76, 32, 30, "#C5B9A5"),

    // Decor & lighting
    item("floorLamp", "Floor Lamp", "decor", "floorLamp", 16, 16, 64, "#F5EEDD"),
    item("plant", "Potted Plant", "decor", "plant", 20, 20, 42, "#5E8C61"),
    item("tallPlant", "Tall Plant", "decor", "plant", 26, 26, 66, "#4C7A50"),
    item("rug", "Rug", "decor", "rug", 96, 60, 0.5, "#C7B49A", { layer: LAYER_RUG }),
    item("runnerRug", "Runner Rug", "decor", "rug", 96, 30, 0.5, "#9E6B5A", { layer: LAYER_RUG }),
    item("roundRug", "Round Rug", "decor", "roundRug", 72, 72, 0.5, "#A7B8A8", { layer: LAYER_RUG }),
    item("floorMirror", "Floor Mirror", "decor", "mirror", 28, 3, 64, "#C9A86A"),
];

const BY_TYPE = Object.fromEntries(FURNITURE_ITEMS.map((it) => [it.type, it]));

// Catalog entry for a placed piece (falls back to a plain box for unknown or
// future types loaded from a newer app version).
export const catalogEntry = (type) =>
    BY_TYPE[type] ?? {
        type,
        name: "Item",
        category: "decor",
        shape: "box",
        w: 24,
        d: 24,
        h: 24,
        color: "#B0A898",
        elev: 0,
        layer: LAYER_FLOOR,
    };

// Swatches offered in the edit sheet (the item's own default is shown first).
export const FURNITURE_COLORS = [
    "#F4F1EA",
    "#D9CBB4",
    "#C7B49A",
    "#A47551",
    "#7A5C43",
    "#2F3237",
    "#8E9AAF",
    "#4F6D7A",
    "#A3B18A",
    "#5E8C61",
    "#C08B5C",
    "#B5838D",
    "#9E6B5A",
    "#E0B97E",
];

const newId = () =>
    `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A fresh placed piece of `type` centered at content point (x, y).
export const createFurniture = (type, x, y) => {
    const c = catalogEntry(type);
    return {
        id: newId(),
        type,
        x,
        y,
        rot: 0,
        w: c.w,
        d: c.d,
        h: c.h,
        elev: c.elev ?? 0,
        color: c.color,
    };
};

// Duplicate of a placed piece, nudged so it doesn't sit exactly on top.
export const cloneFurniture = (f) => {
    const offset = Math.max(12, Math.min(f.w, f.d) * PX_PER_IN * 0.35);
    return { ...f, id: newId(), x: f.x + offset, y: f.y + offset };
};

export const furnitureLayer = (f) => catalogEntry(f.type).layer ?? LAYER_FLOOR;

// Pieces sorted bottom-to-top for drawing (stable within a layer).
export const sortForDrawing = (list) =>
    list
        .map((f, i) => ({ f, i, layer: furnitureLayer(f) }))
        .sort((a, b) => a.layer - b.layer || a.i - b.i)
        .map((e) => e.f);

// Footprint size in content pixels.
export const footprintPx = (f) => ({ w: f.w * PX_PER_IN, d: f.d * PX_PER_IN });

// Convert a content-space point into the piece's local (unrotated) frame.
export const toLocal = (f, p) => {
    const a = (-(f.rot || 0) * Math.PI) / 180;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    return {
        x: dx * Math.cos(a) - dy * Math.sin(a),
        y: dx * Math.sin(a) + dy * Math.cos(a),
    };
};

// Convert a local-frame point (relative to the piece's center) to content space.
export const toContent = (f, p) => {
    const a = ((f.rot || 0) * Math.PI) / 180;
    return {
        x: f.x + p.x * Math.cos(a) - p.y * Math.sin(a),
        y: f.y + p.x * Math.sin(a) + p.y * Math.cos(a),
    };
};

// Is the content point inside the piece's footprint (plus `pad` pixels)?
export const pointInFurniture = (f, p, pad = 0) => {
    const { w, d } = footprintPx(f);
    const l = toLocal(f, p);
    return Math.abs(l.x) <= w / 2 + pad && Math.abs(l.y) <= d / 2 + pad;
};

// The four footprint corners in content space (clockwise from back-left).
export const footprintCorners = (f) => {
    const { w, d } = footprintPx(f);
    return [
        { x: -w / 2, y: -d / 2 },
        { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 },
        { x: -w / 2, y: d / 2 },
    ].map((p) => toContent(f, p));
};

// Topmost piece under a content point, or null.
export const hitTestFurniture = (list, p, pad = 0) => {
    const ordered = sortForDrawing(list);
    for (let i = ordered.length - 1; i >= 0; i--) {
        if (pointInFurniture(ordered[i], p, pad)) return ordered[i];
    }
    return null;
};

// Normalize an angle in degrees to [0, 360).
export const normDeg = (deg) => ((deg % 360) + 360) % 360;

// Lighten (amt > 0) or darken (amt < 0) a #RRGGBB color by a fraction.
export const shade = (hex, amt) => {
    const h = (hex || "#999999").replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const mix = (c) =>
        Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    r = mix(r);
    g = mix(g);
    b = mix(b);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};
