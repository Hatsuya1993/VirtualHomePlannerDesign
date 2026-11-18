import * as THREE from "three";
import { floorFinish } from "../../utils/finishes";

// Procedural textures for the floor and wall finishes picked in the Design
// sheet. Like the original wood floor and plaster, everything is generated
// into small RGBA arrays (no image assets, nothing downloaded), and each
// finish is generated once per scene and shared.
//
// The original oak floor and default wall paint are NOT made here — the
// screen keeps using its own generators for those, so designs that never
// pick a finish look exactly as before.

const hash2 = (x, y) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const rgb = (hex) => {
    const n = parseInt((hex || "#999999").replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
// Smooth value noise in [0, 1) at scale `s` pixels.
const vnoise = (x, y, s, seed = 0) => {
    const gx = x / s;
    const gy = y / s;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0 + seed, y0);
    const b = hash2(x0 + 1 + seed, y0);
    const c = hash2(x0 + seed, y0 + 1);
    const d = hash2(x0 + 1 + seed, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

const makeTex = (W, H, pixel, aniso) => {
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const [r, g, b] = pixel(x, y);
            const i = (y * W + x) * 4;
            data[i] = clamp255(r);
            data[i + 1] = clamp255(g);
            data[i + 2] = clamp255(b);
            data[i + 3] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = aniso || 1;
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
};

// ---- floors -----------------------------------------------------------------

// Staggered wood planks in the finish's base color (same recipe as the
// original oak floor, recolored).
const woodPlanks = (base, aniso) => {
    const c = rgb(base);
    const plankH = 64;
    const rows = Array.from({ length: 8 }, (_, r) => ({
        tone: 0.86 + hash2(r, 7) * 0.3,
        seam: Math.floor(hash2(r, 3) * 512),
        len: 150 + hash2(r, 5) * 170,
    }));
    return makeTex(
        512,
        512,
        (x, y) => {
            const ri = Math.floor(y / plankH);
            const row = rows[ri % rows.length];
            const yIn = y - ri * plankH;
            let v = Math.sin(yIn * 0.5 + row.seam * 0.01) * 5 + (hash2(Math.floor(x / 20), ri * 13) - 0.5) * 12;
            v += (hash2(x, y) - 0.5) * 8;
            if (yIn < 2 || yIn > plankH - 2) v -= 36;
            const local = (((x - row.seam) % row.len) + row.len) % row.len;
            if (local < 2) v -= 30;
            return [c.r * row.tone + v, c.g * row.tone + v, c.b * row.tone + v];
        },
        aniso
    );
};

// Zig-zag (herringbone-style) parquet: 45° planks alternating per column.
const herringbone = (base, aniso) => {
    const c = rgb(base);
    const CW = 32; // column width (px)
    const P = 90; // plank length along the slant (px)
    return makeTex(
        256,
        256,
        (x, y) => {
            const col = Math.floor(x / CW);
            const lx = x - col * CW;
            const slant = col % 2 ? lx : CW - lx;
            const t = y + slant;
            const idx = Math.floor(t / P);
            const tone = 0.82 + hash2(col, idx) * 0.32;
            let v = (hash2(x, y) - 0.5) * 8 + Math.sin(t * 0.6) * 3;
            if (((t % P) + P) % P < 2.2 || lx < 1.2) v -= 40;
            return [c.r * tone + v, c.g * tone + v, c.b * tone + v];
        },
        aniso
    );
};

// One square tile with grout around its edge (repeat = tile size).
const tiles = (base, grout, veins, aniso) => {
    const c = rgb(base);
    const g = rgb(grout);
    const N = 256;
    return makeTex(
        N,
        N,
        (x, y) => {
            if (x < 3 || y < 3) return [g.r, g.g, g.b];
            let v = (vnoise(x, y, 40) - 0.5) * 14 + (hash2(x, y) - 0.5) * 5;
            if (veins) {
                const n = vnoise(x, y, 60, 9) * 6 + vnoise(x, y, 18, 4) * 1.5;
                const s = Math.abs(Math.sin((x * 0.7 + y) * 0.02 + n));
                if (s < 0.06) v -= (0.06 - s) * 900;
            }
            return [c.r + v, c.g + v, c.b + v];
        },
        aniso
    );
};

const speckled = (base, scale, amount, aniso, size = 256) => {
    const c = rgb(base);
    return makeTex(
        size,
        size,
        (x, y) => {
            const v = (vnoise(x, y, scale) - 0.5) * amount + (hash2(x, y) - 0.5) * amount * 0.6;
            return [c.r + v, c.g + v, c.b + v];
        },
        aniso
    );
};

// Floor texture + how many feet one repeat covers + surface roughness.
export const makeFinishFloorTexture = (key, aniso) => {
    const f = floorFinish(key);
    let tex;
    let tileFt;
    let roughness = 0.6;
    if (f.kind === "wood") {
        tex = woodPlanks(f.base, aniso);
        tileFt = 6;
    } else if (f.kind === "herringbone") {
        tex = herringbone(f.base, aniso);
        tileFt = 3;
    } else if (f.kind === "tile") {
        tex = tiles(f.base, f.line, key === "marble", aniso);
        tileFt = (f.tileIn || 18) / 12;
        roughness = key === "marble" ? 0.25 : 0.45;
    } else if (key === "concrete") {
        tex = speckled(f.base, 50, 26, aniso);
        tileFt = 8;
        roughness = 0.8;
    } else {
        tex = speckled(f.base, 3, 18, aniso, 128); // carpet pile
        tileFt = 2;
        roughness = 1;
    }
    tex.repeat.set(1 / tileFt, 1 / tileFt);
    return { tex, roughness };
};

// ---- walls -----------------------------------------------------------------

const lighten = (c, k) => ({ r: c.r + (255 - c.r) * k, g: c.g + (255 - c.g) * k, b: c.b + (255 - c.b) * k });

// Wall texture for a finish ({ texture, color }) — the color is baked in so
// mortar/grout stay light. Returns { tex, tileFt, roughness }.
export const makeFinishWallTexture = ({ texture, color }, aniso) => {
    const c = rgb(color);
    if (texture === "brick") {
        // 2 ft square: 9 courses, 3 bricks per course, running bond.
        const mortar = { r: 214, g: 206, b: 196 };
        const tex = makeTex(
            256,
            256,
            (x, y) => {
                const ch = 256 / 9;
                const row = Math.floor(y / ch);
                const off = row % 2 ? 256 / 6 : 0;
                const bx = (((x + off) % 256) + 256) % 256;
                const col = Math.floor(bx / (256 / 3));
                if (y - row * ch < 3 || bx - col * (256 / 3) < 3) return [mortar.r, mortar.g, mortar.b];
                const tone = 0.82 + hash2(row, col) * 0.3;
                const v = (hash2(x, y) - 0.5) * 16 + (vnoise(x, y, 12) - 0.5) * 18;
                return [c.r * tone + v, c.g * tone + v, c.b * tone + v];
            },
            aniso
        );
        return { tex, tileFt: 2, roughness: 0.95 };
    }
    if (texture === "panel") {
        // Vertical boards, 6" wide, with dark grooves and grain.
        const tex = makeTex(
            256,
            256,
            (x, y) => {
                const bw = 256 / 4;
                const board = Math.floor(x / bw);
                const lx = x - board * bw;
                const tone = 0.88 + hash2(board, 11) * 0.22;
                let v = Math.sin(lx * 0.45 + board) * 4 + (vnoise(x, y, 30, board) - 0.5) * 14;
                if (lx < 3) v -= 55;
                return [c.r * tone + v, c.g * tone + v, c.b * tone + v];
            },
            aniso
        );
        return { tex, tileFt: 2, roughness: 0.7 };
    }
    if (texture === "stripes") {
        // Classic striped wallpaper: 4" stripes, color + a lighter tint.
        const light = lighten(c, 0.45);
        const tex = makeTex(
            256,
            256,
            (x, y) => {
                const band = Math.floor(x / 64) % 2;
                const base = band ? light : c;
                const v = (hash2(x, y) - 0.5) * 6;
                const edge = x % 64 < 2 ? -18 : 0;
                return [base.r + v + edge, base.g + v + edge, base.b + v + edge];
            },
            aniso
        );
        return { tex, tileFt: 2, roughness: 0.9 };
    }
    if (texture === "tile") {
        // 6" glazed tiles with light grout.
        const tex = makeTex(
            256,
            256,
            (x, y) => {
                const s = 64;
                if (x % s < 3 || y % s < 3) return [236, 234, 230];
                const v = (vnoise(x, y, 50) - 0.5) * 8;
                return [c.r + v, c.g + v, c.b + v];
            },
            aniso
        );
        return { tex, tileFt: 2, roughness: 0.35 };
    }
    if (texture === "concrete") {
        const tex = speckled(color, 40, 24, aniso);
        return { tex, tileFt: 6, roughness: 0.95 };
    }
    // paint: soft plaster speckle in the chosen color
    const tex = makeTex(
        128,
        128,
        (x, y) => {
            const n = (hash2(x, y) - 0.5) * 6 + (hash2(Math.floor(x / 8), Math.floor(y / 8)) - 0.5) * 8;
            return [c.r + n, c.g + n, c.b + n];
        },
        aniso
    );
    return { tex, tileFt: 2.5, roughness: 0.95 };
};
