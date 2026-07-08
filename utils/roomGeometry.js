const CLOSE_EPS = 18; // content-space gap tolerance to call two endpoints "joined"
export const CORNER_JOIN_EPS = 4; // content-space tolerance to treat endpoints as the same corner

// Chain wall segments into a room outline by repeatedly hopping to the
// nearest unused endpoint. Also reports whether the result is a genuinely
// closed loop (every wall used, and the path returns to its start point) —
// that's what a solid floor fill / 3D conversion require.
export const chainRoom = (walls) => {
    if (walls.length === 0) return { polygon: [], closed: false };
    const used = new Set([0]);
    const pts = [
        { x: walls[0].x1, y: walls[0].y1 },
        { x: walls[0].x2, y: walls[0].y2 },
    ];
    let cur = pts[1];
    while (used.size < walls.length) {
        let best = null;
        walls.forEach((w, i) => {
            if (used.has(i)) return;
            const d1 = Math.hypot(w.x1 - cur.x, w.y1 - cur.y);
            const d2 = Math.hypot(w.x2 - cur.x, w.y2 - cur.y);
            const rev = d2 < d1;
            const d = rev ? d2 : d1;
            if (!best || d < best.d) best = { i, d, rev };
        });
        if (!best) break;
        used.add(best.i);
        const w = walls[best.i];
        const next = best.rev ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
        pts.push(next);
        cur = next;
    }
    const closed =
        used.size === walls.length &&
        pts.length >= 3 &&
        Math.hypot(cur.x - pts[0].x, cur.y - pts[0].y) <= CLOSE_EPS;
    return { polygon: pts, closed };
};

// Shortest distance from point p to the segment a—b.
const distanceToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : clampUnit(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq);
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    return Math.hypot(p.x - cx, p.y - cy);
};
const clampUnit = (t) => Math.max(0, Math.min(1, t));

// The closest point to p that lies on the segment a—b (clamped to the ends).
export const projectOntoSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : clampUnit(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq);
    return { x: a.x + t * dx, y: a.y + t * dy };
};

// Index of the wall closest to point p, if within maxDist — otherwise null.
export const hitTestWall = (walls, p, maxDist) => {
    let best = null;
    walls.forEach((w, i) => {
        const d = distanceToSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
        if (d <= maxDist && (!best || d < best.d)) best = { index: i, d };
    });
    return best ? best.index : null;
};

// All wall endpoints, optionally excluding one or more (wall index, end)
// pairs — used so a dragged endpoint/group doesn't just snap to itself.
// `exclude` may be a single { index, end } or an array of them.
export const collectEndpoints = (walls, exclude) => {
    const excludes = !exclude ? [] : Array.isArray(exclude) ? exclude : [exclude];
    const isExcluded = (i, end) =>
        excludes.some((ex) => ex && ex.index === i && ex.end === end);
    const pts = [];
    walls.forEach((w, i) => {
        if (!isExcluded(i, 1)) pts.push({ x: w.x1, y: w.y1 });
        if (!isExcluded(i, 2)) pts.push({ x: w.x2, y: w.y2 });
    });
    return pts;
};

// Every (wall index, end) pair whose endpoint sits at `anchor` (within
// `eps`) — i.e. every wall that meets at this corner. Dragging should move
// all of them together so the room doesn't tear apart at a shared joint.
export const findCornerGroup = (walls, anchor, eps = CORNER_JOIN_EPS) => {
    const group = [];
    walls.forEach((w, i) => {
        if (Math.hypot(w.x1 - anchor.x, w.y1 - anchor.y) <= eps) {
            group.push({ index: i, end: 1 });
        }
        if (Math.hypot(w.x2 - anchor.x, w.y2 - anchor.y) <= eps) {
            group.push({ index: i, end: 2 });
        }
    });
    return group;
};

// Snaps `point` onto the nearest entry in `endpoints` if one is within
// `radius`; otherwise returns `point` unchanged. Also reports whether a
// snap occurred, so callers can show a visual indicator.
export const snapPoint = (point, endpoints, radius) => {
    let best = null;
    endpoints.forEach((p) => {
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d <= radius && (!best || d < best.d)) best = { point: p, d };
    });
    return best ? { point: best.point, snapped: true } : { point, snapped: false };
};
