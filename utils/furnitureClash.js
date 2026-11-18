import { catalogEntry, footprintPx, furnitureLayer, toContent } from "./furnitureCatalog";

// Clash detection for placed furniture in the 2D plan. A design with any clash
// is blocked from opening in 3D (like an unclosed room), so these rules aim to
// flag real problems only:
//
//  - furniture vs furniture: footprints overlap (rotation-aware) AND their
//    height ranges overlap — so a wall cabinet above a counter, or a TV
//    standing above its stand, is fine.
//  - furniture vs wall: the footprint cuts into a wall's drawn line.
//  - furniture vs door: the piece sits in a door's swing, or blocks a plain
//    opening/doorway.
//
// Never a clash: rugs (they sit under things), and seating tucked under a
// table, desk or counter (chairs at a dining table, stools at an island).

const PX_PER_IN = 26 / 12; // matches PIXELS_PER_FOOT in the plan screens
const TOLERANCE_IN = 0.5; // pieces may touch / overlap by this much without clashing
const WALL_BAND_PX = 9 / 2; // half of the drawn wall line (PlanPreviewScreen WALL_WIDTH)
const DOOR_CLEAR_IN = 84; // pieces raised above this don't block a door
const ARC_STEPS = 8; // polygon resolution of a door's swing quarter-circle

const SEAT_SHAPES = new Set(["chair", "stool", "officeChair", "bench"]);
const SURFACE_SHAPES = new Set(["table", "roundTable", "desk", "counter", "sink"]);

// --- geometry --------------------------------------------------------------

// Rotated footprint, shrunk on every side by `shrinkPx` (negative grows it).
const footprintPoly = (f, shrinkPx) => {
    const { w, d } = footprintPx(f);
    const hw = Math.max(0.1, w / 2 - shrinkPx);
    const hd = Math.max(0.1, d / 2 - shrinkPx);
    return [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: hd },
        { x: -hw, y: hd },
    ].map((p) => toContent(f, p));
};

// Separating-axis test for two convex polygons (strict overlap; touching
// edges don't count).
const polysOverlap = (a, b) => {
    const polys = [a, b];
    for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i];
            const q = poly[(i + 1) % poly.length];
            const nx = q.y - p.y;
            const ny = p.x - q.x;
            if (nx === 0 && ny === 0) continue;
            let minA = Infinity;
            let maxA = -Infinity;
            for (const v of a) {
                const s = v.x * nx + v.y * ny;
                if (s < minA) minA = s;
                if (s > maxA) maxA = s;
            }
            let minB = Infinity;
            let maxB = -Infinity;
            for (const v of b) {
                const s = v.x * nx + v.y * ny;
                if (s < minB) minB = s;
                if (s > maxB) maxB = s;
            }
            if (maxA <= minB || maxB <= minA) return false;
        }
    }
    return true;
};

// A wall segment's drawn band as a rectangle (round caps ignored).
const wallBand = (w) => {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return null;
    const nx = (-dy / len) * WALL_BAND_PX;
    const ny = (dx / len) * WALL_BAND_PX;
    return [
        { x: w.x1 + nx, y: w.y1 + ny },
        { x: w.x2 + nx, y: w.y2 + ny },
        { x: w.x2 - nx, y: w.y2 - ny },
        { x: w.x1 - nx, y: w.y1 - ny },
    ];
};

// Same opening/door-swing geometry as PlanPreviewScreen draws (re-derived
// here so that screen's own helpers stay untouched).
const openingSpan = (w, op) => {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const cx = w.x1 + dx * op.t;
    const cy = w.y1 + dy * op.t;
    const hx = ux * (op.width / 2);
    const hy = uy * (op.width / 2);
    return {
        ux,
        uy,
        a: { x: cx - hx, y: cy - hy },
        b: { x: cx + hx, y: cy + hy },
    };
};

// The quarter-circle a door leaf sweeps through, as a convex polygon.
const doorSwingPoly = (w, door) => {
    const { a, b } = openingSpan(w, door);
    const hinge = door.hinge === "a" ? a : b;
    const closedTip = door.hinge === "a" ? b : a;
    const cvx = closedTip.x - hinge.x;
    const cvy = closedTip.y - hinge.y;
    const ovx = door.flip ? cvy : -cvy;
    const ovy = door.flip ? -cvx : cvx;
    const r = Math.hypot(cvx, cvy);
    const a0 = Math.atan2(cvy, cvx);
    let a1 = Math.atan2(ovy, ovx);
    // Walk the short (90°) way round from closed to open.
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const pts = [hinge];
    for (let i = 0; i <= ARC_STEPS; i++) {
        const t = a0 + (delta * i) / ARC_STEPS;
        pts.push({ x: hinge.x + Math.cos(t) * r, y: hinge.y + Math.sin(t) * r });
    }
    return pts;
};

// A plain opening/doorway: the gap in the wall band, extended a little into
// the room on both sides so a piece parked in the doorway is caught.
const doorwayPoly = (w, op) => {
    const { ux, uy, a, b } = openingSpan(w, op);
    const reach = WALL_BAND_PX + 12 * PX_PER_IN;
    const nx = -uy * reach;
    const ny = ux * reach;
    return [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
    ];
};

// --- rules -----------------------------------------------------------------

const heightRange = (f) => {
    const lo = f.elev ?? 0;
    return [lo, lo + (f.h ?? 0)];
};

const heightsOverlap = (f, g) => {
    const [a0, a1] = heightRange(f);
    const [b0, b1] = heightRange(g);
    return Math.min(a1, b1) - Math.max(a0, b0) > TOLERANCE_IN;
};

const tucksUnder = (f, g) => {
    const sf = catalogEntry(f.type).shape;
    const sg = catalogEntry(g.type).shape;
    return (SEAT_SHAPES.has(sf) && SURFACE_SHAPES.has(sg)) ||
        (SEAT_SHAPES.has(sg) && SURFACE_SHAPES.has(sf));
};

// `voids` are stairwell openings on this floor (content-space polygons, from
// stairs on the floor below) — nothing may stand in one.
// Returns { ids: Set of clashing piece ids, issues: [{ id, kind, other }] }
// where kind is "furniture" | "wall" | "door" | "void".
export const computeClashes = (walls = [], furniture = [], voids = []) => {
    const ids = new Set();
    const issues = [];
    const tol = TOLERANCE_IN * PX_PER_IN;
    const pieces = furniture.filter((f) => furnitureLayer(f) > 0); // rugs never clash
    const polys = new Map(pieces.map((f) => [f.id, footprintPoly(f, tol)]));

    // furniture vs furniture
    for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
            const f = pieces[i];
            const g = pieces[j];
            if (!heightsOverlap(f, g) || tucksUnder(f, g)) continue;
            if (polysOverlap(polys.get(f.id), polys.get(g.id))) {
                ids.add(f.id);
                ids.add(g.id);
                issues.push({ id: f.id, kind: "furniture", other: g.id });
            }
        }
    }

    // furniture vs walls and doors
    const bands = walls.map(wallBand);
    const doorZones = [];
    walls.forEach((w) =>
        (w.openings ?? []).forEach((op) => {
            if (op.kind === "door") doorZones.push(doorSwingPoly(w, op));
            else if (op.kind === "opening") doorZones.push(doorwayPoly(w, op));
        })
    );

    pieces.forEach((f) => {
        const poly = polys.get(f.id);
        const wallIndex = bands.findIndex((band) => band && polysOverlap(poly, band));
        if (wallIndex !== -1) {
            ids.add(f.id);
            issues.push({ id: f.id, kind: "wall", other: wallIndex });
        }
        if ((f.elev ?? 0) < DOOR_CLEAR_IN && doorZones.some((z) => polysOverlap(poly, z))) {
            ids.add(f.id);
            issues.push({ id: f.id, kind: "door" });
        }
        // Stairwell openings: tested as convex hulls (stair voids are
        // rectangles or circles, so that's exact).
        if (voids.some((v) => v.length >= 3 && polysOverlap(poly, v))) {
            ids.add(f.id);
            issues.push({ id: f.id, kind: "void" });
        }
    });

    return { ids, issues };
};

// One-line summary for the warning banner.
export const clashMessage = ({ ids, issues }) => {
    const n = ids.size;
    const kinds = new Set(issues.map((i) => i.kind));
    const what = [
        kinds.has("furniture") && "each other",
        kinds.has("wall") && "a wall",
        kinds.has("door") && "a door",
        kinds.has("void") && "a stair opening",
    ].filter(Boolean);
    const list =
        what.length > 1 ? `${what.slice(0, -1).join(", ")} or ${what[what.length - 1]}` : what[0];
    return n === 1
        ? `1 item clashes with ${list}. It's outlined in red — move it to switch to 3D.`
        : `${n} items clash with ${list}. They're outlined in red — move them apart to switch to 3D.`;
};
