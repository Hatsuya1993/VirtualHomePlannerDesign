import * as ImageManipulator from "expo-image-manipulator";

// Automatic floor-plan recognition via a Claude vision model. The image is
// downscaled and sent to the Anthropic Messages API, which returns the walls,
// doors and windows as pixel coordinates in the (downscaled) image space.
//
// The API key is read from an EXPO_PUBLIC_ env var so it's configurable without
// code changes. NOTE: EXPO_PUBLIC_ vars are bundled into the app, so the key is
// visible to anyone with the build — for production, proxy this through a
// backend instead of shipping the key on-device.
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_DIM = 1500; // downscale longest side → faster/cheaper and within limits

const getKey = () => process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || "";
const getModel = () => process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || "claude-sonnet-5";

const buildPrompt = (w, h) =>
    `You are an expert at reading architectural floor plans. The attached image is a floor plan ${w}px wide and ${h}px tall (origin top-left, x right, y down).

Identify the STRUCTURAL WALLS as straight line segments, plus door and window openings.

Return ONLY strict minified JSON (no prose, no markdown fences) of exactly this shape:
{"walls":[[x1,y1,x2,y2],...],"doors":[[x1,y1,x2,y2],...],"windows":[[x1,y1,x2,y2],...],"estimatedWidthFeet":<number>}

Rules:
- All coordinates are integers in image pixels, within [0,${w}] x [0,${h}].
- "walls": endpoints of each wall centerline. Merge collinear runs into one segment. Where walls meet at a corner or T-junction, make them share the EXACT same endpoint coordinate so the room is closed with no gaps.
- "doors"/"windows": the two endpoints of the opening span along the wall it sits on.
- Ignore furniture, fixtures, dimensions, text and hatching — only real walls.
- "estimatedWidthFeet": your best estimate of the plan's overall real width in feet. Read dimension labels if visible; otherwise estimate from typical room sizes. Never 0.
Output the JSON object only.`;

// Pull the first {...} JSON object out of a text blob (models sometimes add
// stray prose or code fences despite instructions).
const extractJson = (text) => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }
};

const isSeg = (s) =>
    Array.isArray(s) && s.length === 4 && s.every((n) => Number.isFinite(n));

export const recognizeFloorPlan = async (uri) => {
    const key = getKey();
    if (!key) {
        throw new Error(
            "No AI key configured. Set EXPO_PUBLIC_ANTHROPIC_API_KEY and restart the bundler."
        );
    }

    // Downscale and base64-encode the image.
    const img = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_DIM } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!img.base64) throw new Error("Could not read the selected image.");

    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: 4096,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/jpeg",
                                data: img.base64,
                            },
                        },
                        { type: "text", text: buildPrompt(img.width, img.height) },
                    ],
                },
            ],
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 180)}`);
    }

    const json = await res.json();
    const text = (json.content || []).map((c) => c.text || "").join("");
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.walls)) {
        throw new Error("The AI response didn't contain a readable floor plan.");
    }

    const walls = parsed.walls.filter(isSeg).map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));
    if (walls.length < 3) {
        throw new Error("Couldn't detect enough walls in this image.");
    }

    return {
        walls,
        doors: (parsed.doors || []).filter(isSeg),
        windows: (parsed.windows || []).filter(isSeg),
        estimatedWidthFeet: Number(parsed.estimatedWidthFeet) || null,
        imageWidth: img.width,
        imageHeight: img.height,
    };
};

const PIXELS_PER_FOOT = 26; // matches the drawing scale used across the app

const nearestWallHit = (walls, px, py) => {
    let best = null;
    walls.forEach((w, index) => {
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 ? ((px - w.x1) * dx + (py - w.y1) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
        if (!best || d < best.d) best = { index, t, d };
    });
    return best;
};

// Merge wall endpoints within `eps` (content px) onto a shared point, so
// recognized corners close cleanly instead of leaving hairline gaps; drops any
// degenerate (near-zero-length) segments.
const snapWalls = (walls, eps) => {
    const nodes = [];
    const snap = (p) => {
        for (const n of nodes) {
            if (Math.hypot(n.x - p.x, n.y - p.y) <= eps) return n;
        }
        const n = { x: p.x, y: p.y };
        nodes.push(n);
        return n;
    };
    return walls
        .map((w) => {
            const a = snap({ x: w.x1, y: w.y1 });
            const b = snap({ x: w.x2, y: w.y2 });
            return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
        })
        .filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > eps);
};

// Recognition result (image-pixel coords) → Plan Preview walls: scaled to a
// plausible real size via the model's width estimate, centered on screen, with
// corners snapped and doors/windows attached to their nearest wall.
export const recognizedToWalls = (rec, screenWidth) => {
    const raw = rec.walls;
    if (!raw || raw.length < 3) return [];
    const xs = raw.flatMap((w) => [w.x1, w.x2]);
    const ys = raw.flatMap((w) => [w.y1, w.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const bw = maxX - minX || 1;
    const realWidthFt = Math.max(8, Math.min(80, rec.estimatedWidthFeet || 24));
    const scale = (realWidthFt * PIXELS_PER_FOOT) / bw;
    const offX = (screenWidth - bw * scale) / 2 - minX * scale;
    const offY = 220 - minY * scale;
    const TX = (x) => x * scale + offX;
    const TY = (y) => y * scale + offY;

    let walls = raw.map((w) => ({
        x1: TX(w.x1),
        y1: TY(w.y1),
        x2: TX(w.x2),
        y2: TY(w.y2),
        openings: [],
    }));
    walls = snapWalls(walls, 14);

    const attach = (span, kind, extra) => {
        const mx = (TX(span[0]) + TX(span[2])) / 2;
        const my = (TY(span[1]) + TY(span[3])) / 2;
        const hit = nearestWallHit(walls, mx, my);
        if (!hit || hit.d > 40) return;
        const width = Math.hypot(TX(span[2]) - TX(span[0]), TY(span[3]) - TY(span[1]));
        walls[hit.index].openings.push({
            kind,
            t: hit.t,
            width: Math.max(18, width),
            ...extra,
        });
    };
    (rec.windows || []).forEach((s) => attach(s, "window", {}));
    (rec.doors || []).forEach((s) => attach(s, "door", { hinge: "a", flip: false }));
    return walls;
};
