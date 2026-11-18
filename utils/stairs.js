import { toContent } from "./furnitureCatalog";

// Stair geometry shared by the 2D symbol, the 3D model, the stairwell
// opening cut into the floor above, and walking up/down in 3D.
//
// A stair is a furniture piece with shape "stairs" and a `stair` config:
//   { type: "straight" | "L" | "U" | "spiral",
//     steps: number | null,      // risers; null = from the floor height
//     turn: "left" | "right",    // which way L/U/spiral stairs turn
//     flightW: inches,           // flight width for L/U stairs
//     handrail: "none" | "left" | "right" | "both",
//     risers: "closed" | "open",
//     railColor }
// Its height `h` is the floor-to-floor height of the floor it stands on, so
// the top step always meets the floor above.
//
// Everything here is in the piece's local frame, in inches: centered on
// (0, 0), width along x, depth along y, bottom step at the front (+y),
// climbing generally toward -y — the same frame as the furniture glyphs.

export const RISE_TARGET_IN = 7.5;
const RAIL_HEIGHT_IN = 36;

export const isStairs = (f) => f?.stair != null;

export const stairSteps = (f) =>
    Math.max(3, Math.min(40, f.stair?.steps || Math.round((f.h || 120) / RISE_TARGET_IN)));

const rect = (x0, y0, x1, y1) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
];

const centroid = (poly) => ({
    x: poly.reduce((a, p) => a + p.x, 0) / poly.length,
    y: poly.reduce((a, p) => a + p.y, 0) / poly.length,
});

const mirrorX = (p) => ({ ...p, x: -p.x });

// Handrail line: the walking path (with its real corners) densified at every
// tread so it rises with the steps, then offset sideways by `dist` (positive =
// left of the climbing direction, in this y-down frame), mitred at corners.
const railLine = (path, treads, h, dist) => {
    const segs = [];
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        // left normal of travel direction in a y-down frame
        segs.push({ a, b, dx, dy, len, nx: dy / len, ny: -dx / len });
    }
    // Project each tread center onto the path.
    const pts = [];
    treads.forEach((t) => {
        let best = null;
        segs.forEach((sg, si) => {
            const u = Math.max(0, Math.min(1, ((t.center.x - sg.a.x) * sg.dx + (t.center.y - sg.a.y) * sg.dy) / (sg.len * sg.len)));
            const px = sg.a.x + sg.dx * u;
            const py = sg.a.y + sg.dy * u;
            const dd = Math.hypot(t.center.x - px, t.center.y - py);
            if (!best || dd < best.dd) best = { dd, si, u, x: px, y: py };
        });
        pts.push({ si: best.si, u: best.u, x: best.x, y: best.y, top: t.top });
    });
    // Corners, with the height of the tread nearest them.
    for (let k = 1; k < path.length - 1; k++) {
        const near = pts.reduce((m, p) => {
            const dd = Math.hypot(p.x - path[k].x, p.y - path[k].y);
            return !m || dd < m.dd ? { dd, top: p.top } : m;
        }, null);
        pts.push({ si: k - 1, u: 1, x: path[k].x, y: path[k].y, top: near ? near.top : 0, corner: k });
    }
    pts.push({ si: 0, u: 0, x: path[0].x, y: path[0].y, top: 0 });
    pts.push({ si: segs.length - 1, u: 1.0001, x: path[path.length - 1].x, y: path[path.length - 1].y, top: h });
    pts.sort((p, q) => p.si - q.si || p.u - q.u);

    return pts.map((p) => {
        if (p.corner) {
            const s1 = segs[p.corner - 1];
            const s2 = segs[p.corner];
            const mx = s1.nx + s2.nx;
            const my = s1.ny + s2.ny;
            const dot = 1 + s1.nx * s2.nx + s1.ny * s2.ny || 1;
            return { x: p.x + (mx / dot) * dist, y: p.y + (my / dot) * dist, top: p.top };
        }
        const sg = segs[Math.min(segs.length - 1, p.si)];
        return { x: p.x + sg.nx * dist, y: p.y + sg.ny * dist, top: p.top };
    });
};

// Full layout: { treads: [{ poly, top, center }], path, rails, post, voidPoly, flightW }
// - treads: walkable surfaces in climbing order (landings included), each a
//   polygon with its top height.
// - path: the walking line from the bottom edge to the top edge (with top
//   heights), used for the UP arrow and handrails.
// - voidPoly: the opening needed in the floor above.
export const stairLayout = (f) => {
    const type = f.stair?.type || "straight";
    const w = Math.max(12, f.w);
    const d = Math.max(12, f.d);
    const h = f.h || 120;
    const n = stairSteps(f);
    const rise = h / n;
    const T = Math.max(1, n - 1); // treads; the last riser lands on the floor above
    const mirror = f.stair?.turn === "right";
    const treads = [];
    let path = [];
    let post = null;
    let voidPoly = rect(-w / 2, -d / 2, w / 2, d / 2);
    let flightW = w;

    const push = (poly, idx) => treads.push({ poly, top: (idx + 1) * rise, center: centroid(poly) });

    if (type === "spiral") {
        const R = Math.min(w, d) / 2;
        const r0 = Math.max(2.5, R * 0.08);
        const sign = mirror ? 1 : -1;
        const total = Math.min(360, Math.max(270, T * 27)) * (Math.PI / 180);
        const da = total / T;
        const a0 = Math.PI / 2; // start at the front
        const at = (r, a) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        for (let i = 0; i < T; i++) {
            const s = a0 + sign * i * da;
            const e = a0 + sign * (i + 1) * da;
            const poly = [at(r0, s)];
            for (let k = 0; k <= 4; k++) poly.push(at(R, s + ((e - s) * k) / 4));
            poly.push(at(r0, e));
            push(poly, i);
        }
        path = [];
        for (let i = 0; i <= T; i++) path.push({ ...at(R * 0.62, a0 + sign * i * da), top: i * rise });
        post = { x: 0, y: 0, r: r0 };
        voidPoly = Array.from({ length: 24 }, (_, i) => at(R, (i / 24) * Math.PI * 2));
        flightW = R - r0;
    } else if (type === "L") {
        const sw = Math.max(24, Math.min(f.stair?.flightW || 36, w - 12, d - 12));
        flightW = sw;
        const L1 = d - sw;
        const L2 = w - sw;
        const n1 = Math.max(1, Math.round(((T - 1) * L1) / (L1 + L2)));
        const n2 = Math.max(1, T - 1 - n1);
        const xc = w / 2 - sw / 2;
        // flight 1: right column, front → back
        for (let i = 0; i < n1; i++) {
            const y0 = d / 2 - (i * L1) / n1;
            push(rect(w / 2 - sw, y0 - L1 / n1, w / 2, y0), i);
        }
        // quarter landing, back-right
        push(rect(w / 2 - sw, -d / 2, w / 2, -d / 2 + sw), n1);
        // flight 2: back row, right → left
        for (let j = 0; j < n2; j++) {
            const x0 = w / 2 - sw - (j * L2) / n2;
            push(rect(x0 - L2 / n2, -d / 2, x0, -d / 2 + sw), n1 + 1 + j);
        }
        path = [
            { x: xc, y: d / 2, top: 0 },
            { x: xc, y: -d / 2 + sw / 2, top: (n1 + 1) * rise },
            { x: -w / 2, y: -d / 2 + sw / 2, top: h },
        ];
        if (mirror) {
            treads.forEach((t) => {
                t.poly = t.poly.map(mirrorX);
                t.center = mirrorX(t.center);
            });
            path = path.map(mirrorX);
        }
    } else if (type === "U") {
        const sw = Math.max(24, Math.min(f.stair?.flightW || 36, w / 2 - 2, d - 12));
        flightW = sw;
        const L = d - sw;
        const n1 = Math.max(1, Math.floor((T - 1) / 2));
        const n2 = Math.max(1, T - 1 - n1);
        // flight 1: right column, front → back
        for (let i = 0; i < n1; i++) {
            const y0 = d / 2 - (i * L) / n1;
            push(rect(w / 2 - sw, y0 - L / n1, w / 2, y0), i);
        }
        // half landing across the back
        push(rect(-w / 2, -d / 2, w / 2, -d / 2 + sw), n1);
        // flight 2: left column, back → front
        for (let j = 0; j < n2; j++) {
            const y0 = -d / 2 + sw + (j * L) / n2;
            push(rect(-w / 2, y0, -w / 2 + sw, y0 + L / n2), n1 + 1 + j);
        }
        path = [
            { x: w / 2 - sw / 2, y: d / 2, top: 0 },
            { x: w / 2 - sw / 2, y: -d / 2 + sw / 2, top: (n1 + 1) * rise },
            { x: -w / 2 + sw / 2, y: -d / 2 + sw / 2, top: (n1 + 1) * rise },
            { x: -w / 2 + sw / 2, y: d / 2, top: h },
        ];
        if (mirror) {
            treads.forEach((t) => {
                t.poly = t.poly.map(mirrorX);
                t.center = mirrorX(t.center);
            });
            path = path.map(mirrorX);
        }
    } else {
        // straight: front → back
        const t = d / T;
        for (let i = 0; i < T; i++) push(rect(-w / 2, d / 2 - (i + 1) * t, w / 2, d / 2 - i * t), i);
        path = [
            { x: 0, y: d / 2, top: 0 },
            { x: 0, y: -d / 2, top: h },
        ];
    }

    // Handrails follow the walking line, offset to the sides of the flight
    // (spiral stairs only get an outer rail).
    const hr = f.stair?.handrail ?? "both";
    const rails = [];
    if (hr !== "none") {
        const off = flightW / 2 - 1.5;
        const railAt = (side) =>
            railLine(path, treads, h, side * off).map((p) => ({ x: p.x, y: p.y, top: p.top + RAIL_HEIGHT_IN }));
        if (type === "spiral") {
            const R = Math.min(w, d) / 2 - 1.5;
            const line = [{ ...path[0], top: 0 }, ...treads.map((tr) => ({ ...tr.center, top: tr.top }))];
            rails.push(
                line.map((p) => {
                    const a = Math.atan2(p.y, p.x);
                    return { x: Math.cos(a) * R, y: Math.sin(a) * R, top: p.top + RAIL_HEIGHT_IN };
                })
            );
        } else {
            if (hr === "left" || hr === "both") rails.push(railAt(1));
            if (hr === "right" || hr === "both") rails.push(railAt(-1));
        }
    }

    return { treads, path, rails, post, voidPoly, rise, flightW };
};

const pointInPoly = (poly, p) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
};

// Height (inches above this floor) of the step under a local point, or null
// when the point isn't on the stair.
export const stairHeightAt = (layout, p) => {
    for (let i = layout.treads.length - 1; i >= 0; i--) {
        if (pointInPoly(layout.treads[i].poly, p)) return layout.treads[i].top;
    }
    return null;
};

// The opening a stair needs in the floor above, in content-space pixels.
export const stairVoidContent = (f, pxPerIn) =>
    stairLayout(f).voidPoly.map((p) => toContent(f, { x: p.x * pxPerIn, y: p.y * pxPerIn }));
