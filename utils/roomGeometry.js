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

const GAP_EPS = 14; // content-space tolerance for "this endpoint touches another wall"

// Robust "does the wall layout have a gap" test. Unlike chainRoom's closed
// flag (which assumes the whole room is one simple loop and every wall is on
// its boundary), this only asks: does any wall have a loose, dangling end?
// An endpoint counts as connected if it lands on ANY other wall — either at
// that wall's own endpoint or partway along it (a T-junction). This means
// interior/dividing walls no longer trigger a false "gaps in the walls"
// warning, as long as the room is genuinely sealed.
export const wallsHaveGap = (walls, eps = GAP_EPS) => {
    if (walls.length < 3) return true; // can't enclose an area
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const ends = [
            { x: w.x1, y: w.y1 },
            { x: w.x2, y: w.y2 },
        ];
        for (const p of ends) {
            let connected = false;
            for (let j = 0; j < walls.length && !connected; j++) {
                if (j === i) continue;
                const o = walls[j];
                if (
                    distanceToSegment(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= eps
                ) {
                    connected = true;
                }
            }
            if (!connected) return true; // a dangling end = a gap
        }
    }
    return false;
};

// Trace the outer boundary polygon of the walls, robust to interior/divider
// walls and to the greedy chainRoom tracer failing to form one loop. Endpoints
// are merged into shared nodes; starting from the bottom-most node we walk the
// outer face by always taking the sharpest right turn (interior stays on the
// left), which correctly ignores interior/divider walls at any orientation.
// Returns the boundary points, or null if the walls don't enclose a region.
export const roomOutline = (walls, eps = GAP_EPS) => {
    const nodes = [];
    const nodeOf = (p) => {
        for (let i = 0; i < nodes.length; i++) {
            if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= eps) return i;
        }
        nodes.push({ x: p.x, y: p.y });
        return nodes.length - 1;
    };
    const adj = new Map();
    const link = (a, b) => {
        if (!adj.has(a)) adj.set(a, new Set());
        adj.get(a).add(b);
    };
    for (const w of walls) {
        const a = nodeOf({ x: w.x1, y: w.y1 });
        const b = nodeOf({ x: w.x2, y: w.y2 });
        if (a === b) continue;
        link(a, b);
        link(b, a);
    }
    if (nodes.length < 3) return null;

    // Bottom-most (then left-most) node is guaranteed on the outer boundary.
    let start = 0;
    for (let i = 1; i < nodes.length; i++) {
        if (
            nodes[i].y > nodes[start].y ||
            (nodes[i].y === nodes[start].y && nodes[i].x < nodes[start].x)
        ) {
            start = i;
        }
    }
    if (!adj.has(start)) return null;

    const vec = (a, b) => ({ x: nodes[b].x - nodes[a].x, y: nodes[b].y - nodes[a].y });
    // Signed turn from incoming direction `din` to outgoing `dout` (screen
    // coords, y-down). We always take the sharpest right turn (smallest value),
    // which hugs the outer boundary with the interior on the left.
    const turn = (din, dout) =>
        Math.atan2(din.x * dout.y - din.y * dout.x, din.x * dout.x + din.y * dout.y);
    const nextFrom = (cur, din, prevNode) => {
        let best = null;
        for (const n of adj.get(cur)) {
            if (n === prevNode) continue;
            const t = turn(din, vec(cur, n));
            if (best === null || t < best.t) best = { n, t };
        }
        return best;
    };

    // First step: pretend we arrived travelling in +x (from the left).
    const first = nextFrom(start, { x: 1, y: 0 }, -1);
    if (!first) return null;
    let prev = start;
    let cur = first.n;

    const outline = [start];
    let guard = 0;
    const maxSteps = walls.length * 2 + 6;
    while (cur !== start && guard++ < maxSteps) {
        outline.push(cur);
        const step = nextFrom(cur, vec(prev, cur), prev);
        if (!step) return null; // dangling end — not a sealed boundary
        prev = cur;
        cur = step.n;
    }
    if (cur !== start || outline.length < 3) return null;
    return outline.map((i) => ({ x: nodes[i].x, y: nodes[i].y }));
};

// The dangling wall endpoints responsible for a gap — the loose ends that
// don't touch any other wall. Used to highlight exactly where the room is open.
// Coincident loose ends are de-duplicated so a spot is marked once.
export const openEndpoints = (walls, eps = GAP_EPS) => {
    const open = [];
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const ends = [
            { x: w.x1, y: w.y1 },
            { x: w.x2, y: w.y2 },
        ];
        for (const p of ends) {
            let connected = false;
            for (let j = 0; j < walls.length && !connected; j++) {
                if (j === i) continue;
                const o = walls[j];
                if (
                    distanceToSegment(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= eps
                ) {
                    connected = true;
                }
            }
            if (!connected) open.push(p);
        }
    }
    const uniq = [];
    for (const p of open) {
        if (!uniq.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= eps)) uniq.push(p);
    }
    return uniq;
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
