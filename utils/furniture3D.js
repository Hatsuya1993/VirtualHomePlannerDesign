import * as THREE from "three";
import { catalogEntry, PIXELS_PER_FOOT, shade } from "./furnitureCatalog";
import { stairLayout } from "./stairs";

// Procedural low-poly 3D models for the furniture catalog. Every builder
// works in feet, returns a THREE.Group whose origin sits on the floor at the
// piece's center, with width along x, depth along z and the front facing +z —
// matching the 2D glyph's local frame (front = +y) after the plan → world
// mapping used by Room3DScreen (content x → world x, content y → world z).

const METAL = "#8A9097";
const DARK = "#26292D";
const WHITE = "#F7F7F5";
const CERAMIC = "#FAFAFA";
const STONE = "#DAD6CF";
const GLASS = "#BCDFF0";
const WOOD_DARK = "#5B4636";
// No environment map is set up, so a truly metallic mirror would render black;
// a slightly glowing, glossy pale blue reads as reflective glass instead.
const MIRROR_GLASS = { metalness: 0.1, roughness: 0.08, emissive: "#9FB8C6", emissiveIntensity: 0.35 };

// Small per-build material cache so pieces sharing a color share a material.
const makeMaterials = () => {
    const cache = new Map();
    return (color, opts = {}) => {
        const key = `${color}|${JSON.stringify(opts)}`;
        let m = cache.get(key);
        if (!m) {
            m = new THREE.MeshStandardMaterial({
                color,
                roughness: opts.roughness ?? 0.75,
                metalness: opts.metalness ?? 0,
                ...(opts.emissive
                    ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 0.6 }
                    : {}),
                ...(opts.opacity != null
                    ? { transparent: true, opacity: opts.opacity, depthWrite: false }
                    : {}),
                side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
            });
            cache.set(key, m);
        }
        return m;
    };
};

// Builder context: helpers that add primitives to `g`.
const kit = (g, mat) => {
    const box = (w, h, d, color, x, y, z, opts) => {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d)),
            typeof color === "string" ? mat(color, opts) : color
        );
        m.position.set(x, y, z);
        g.add(m);
        return m;
    };
    const cyl = (rTop, rBot, h, color, x, y, z, opts = {}, seg = 16) => {
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(rTop, rBot, Math.max(0.01, h), seg, 1, !!opts.open),
            mat(color, opts)
        );
        m.position.set(x, y, z);
        g.add(m);
        return m;
    };
    const sphere = (r, color, x, y, z, opts, detail = 1) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color, opts));
        m.position.set(x, y, z);
        g.add(m);
        return m;
    };
    // Four legs inset from the footprint corners.
    const legs = (w, d, h, r, color, inset = 0.12, square = false) => {
        const xs = [-w / 2 + inset, w / 2 - inset];
        const zs = [-d / 2 + inset, d / 2 - inset];
        xs.forEach((x) =>
            zs.forEach((z) =>
                square ? box(r * 2, h, r * 2, color, x, h / 2, z) : cyl(r, r * 0.8, h, color, x, h / 2, z, {}, 8)
            )
        );
    };
    const add = (obj) => {
        g.add(obj);
        return obj;
    };
    // A child group (e.g. a tilted backrest) with its own kit.
    const sub = (setup) => {
        const child = new THREE.Group();
        setup(child);
        g.add(child);
        return kit(child, mat);
    };
    return { box, cyl, sphere, legs, add, sub, mat };
};

const seatCount = (wFt) => Math.max(1, Math.min(4, Math.round((wFt * 12) / 30)));

const BUILDERS = {
    box: ({ k, w, d, h, color }) => {
        k.box(w, h, d, color, 0, h / 2, 0);
    },

    sofa: ({ k, w, d, h, color }) => {
        const legH = 0.25;
        const seatH = Math.min(h * 0.52, 1.6);
        const baseH = seatH - 0.35 - legH;
        const backT = Math.min(d * 0.24, 0.75);
        const armW = Math.min(w * 0.11, 0.55);
        const armH = seatH + (h - seatH) * 0.35;
        const dark = shade(color, -0.15);
        k.legs(w, d, legH, 0.06, WOOD_DARK, 0.2);
        k.box(w, baseH, d, dark, 0, legH + baseH / 2, 0);
        k.box(w, h - legH, backT, dark, 0, legH + (h - legH) / 2, -d / 2 + backT / 2);
        [-1, 1].forEach((s) =>
            k.box(armW, armH - legH, d, shade(color, -0.08), s * (w / 2 - armW / 2), legH + (armH - legH) / 2, 0)
        );
        const n = seatCount(w);
        const innerW = w - armW * 2;
        const cw = innerW / n;
        for (let i = 0; i < n; i++) {
            const x = -innerW / 2 + cw * (i + 0.5);
            k.box(cw - 0.04, 0.35, d - backT - 0.06, color, x, legH + baseH + 0.175, backT / 2);
            const bc = k.box(cw - 0.06, (h - seatH) * 0.8, 0.4, shade(color, 0.05), x, seatH + (h - seatH) * 0.4, -d / 2 + backT + 0.2);
            bc.rotation.x = -0.12;
        }
    },

    sectional: ({ k, w, d, h, color }) => {
        const legH = 0.25;
        const seatH = Math.min(h * 0.52, 1.6);
        const baseH = seatH - 0.35 - legH;
        const seatD = Math.min(d * 0.45, 3);
        const backT = Math.min(seatD * 0.24, 0.75);
        const armW = Math.min(w * 0.07, 0.55);
        const armH = seatH + (h - seatH) * 0.35;
        const chaiseW = Math.min(w * 0.4, seatD);
        const dark = shade(color, -0.15);
        // main run along the back
        k.box(w, baseH, seatD, dark, 0, legH + baseH / 2, -d / 2 + seatD / 2);
        // chaise extending forward on the right
        k.box(chaiseW, baseH, d - seatD, dark, w / 2 - chaiseW / 2, legH + baseH / 2, -d / 2 + seatD + (d - seatD) / 2);
        k.box(w, h - legH, backT, dark, 0, legH + (h - legH) / 2, -d / 2 + backT / 2);
        k.box(armW, armH - legH, seatD, shade(color, -0.08), -w / 2 + armW / 2, legH + (armH - legH) / 2, -d / 2 + seatD / 2);
        k.box(armW, armH - legH, d, shade(color, -0.08), w / 2 - armW / 2, legH + (armH - legH) / 2, 0);
        // legs at the outer corners
        [
            [-w / 2 + 0.2, -d / 2 + 0.2],
            [w / 2 - 0.2, -d / 2 + 0.2],
            [w / 2 - 0.2, d / 2 - 0.2],
            [w / 2 - chaiseW + 0.2, d / 2 - 0.2],
            [-w / 2 + 0.2, -d / 2 + seatD - 0.2],
        ].forEach(([x, z]) => k.cyl(0.06, 0.05, legH, WOOD_DARK, x, legH / 2, z, {}, 8));
        // seat cushions
        const mainW = w - armW - chaiseW;
        const n = Math.max(1, Math.round((mainW * 12) / 28));
        const cw = mainW / n;
        for (let i = 0; i < n; i++) {
            const x = -w / 2 + armW + cw * (i + 0.5);
            k.box(cw - 0.04, 0.35, seatD - backT - 0.06, color, x, legH + baseH + 0.175, -d / 2 + backT + (seatD - backT) / 2);
            const bc = k.box(cw - 0.06, (h - seatH) * 0.8, 0.4, shade(color, 0.05), x, seatH + (h - seatH) * 0.4, -d / 2 + backT + 0.2);
            bc.rotation.x = -0.12;
        }
        k.box(chaiseW - armW - 0.06, 0.35, d - backT - 0.06, color, w / 2 - chaiseW / 2 - armW / 2, legH + baseH + 0.175, backT / 2);
    },

    armchair: ({ k, w, d, h, color }) => {
        const legH = 0.3;
        const seatH = Math.min(h * 0.5, 1.5);
        const baseH = seatH - 0.35 - legH;
        const backT = Math.min(d * 0.24, 0.6);
        const armW = Math.min(w * 0.18, 0.5);
        const armH = seatH + (h - seatH) * 0.4;
        const dark = shade(color, -0.15);
        k.legs(w, d, legH, 0.05, WOOD_DARK, 0.15);
        k.box(w, baseH, d, dark, 0, legH + baseH / 2, 0);
        k.box(w, h - legH, backT, dark, 0, legH + (h - legH) / 2, -d / 2 + backT / 2);
        [-1, 1].forEach((s) =>
            k.box(armW, armH - legH, d, shade(color, -0.08), s * (w / 2 - armW / 2), legH + (armH - legH) / 2, 0)
        );
        k.box(w - armW * 2 - 0.04, 0.35, d - backT - 0.06, color, 0, legH + baseH + 0.175, backT / 2);
        const bc = k.box(w - armW * 2 - 0.06, (h - seatH) * 0.8, 0.4, shade(color, 0.05), 0, seatH + (h - seatH) * 0.4, -d / 2 + backT + 0.2);
        bc.rotation.x = -0.15;
    },

    ottoman: ({ k, w, d, h, color }) => {
        const legH = Math.min(0.3, h * 0.25);
        k.legs(w, d, legH, 0.05, WOOD_DARK, 0.15);
        k.box(w, h - legH, d, color, 0, legH + (h - legH) / 2, 0);
    },

    table: ({ k, w, d, h, color }) => {
        const top = Math.min(0.12, h * 0.12);
        k.box(w, top, d, color, 0, h - top / 2, 0, { roughness: 0.5 });
        const legR = Math.max(0.05, Math.min(w, d) * 0.035);
        k.legs(w, d, h - top, legR, shade(color, -0.2), Math.max(0.15, legR * 2), true);
    },

    roundTable: ({ k, w, d, h, color }) => {
        const top = Math.min(0.12, h * 0.12);
        const t = k.cyl(w / 2, w / 2, top, color, 0, h - top / 2, 0, { roughness: 0.5 }, 32);
        t.scale.z = d / w;
        k.cyl(0.12, 0.16, h - top, shade(color, -0.2), 0, (h - top) / 2, 0, {}, 12);
        const b = k.cyl(w * 0.22, w * 0.25, 0.08, shade(color, -0.25), 0, 0.04, 0, {}, 24);
        b.scale.z = d / w;
    },

    tv: ({ k, w, d, h, color }) => {
        const standH = Math.min(0.25, h * 0.1);
        k.box(w * 0.35, 0.04, d * 0.6, METAL, 0, 0.02, 0, { metalness: 0.6, roughness: 0.4 });
        k.box(0.12, standH, 0.08, METAL, 0, standH / 2, 0, { metalness: 0.6, roughness: 0.4 });
        const screenH = h - standH;
        k.box(w, screenH, 0.12, color, 0, standH + screenH / 2, -0.02, { roughness: 0.4 });
        k.box(w - 0.08, screenH - 0.08, 0.01, "#101820", 0, standH + screenH / 2, 0.045, {
            roughness: 0.15,
            emissive: "#1B2A3A",
            emissiveIntensity: 0.5,
        });
    },

    cabinet: ({ k, w, d, h, color, entry }) => {
        const variant = entry.variant;
        const plinth = entry.elev > 0 ? 0 : 0.25;
        const bodyH = h - plinth;
        if (plinth) k.box(w - 0.1, plinth, d - 0.1, shade(color, -0.3), 0, plinth / 2, -0.03);
        k.box(w, bodyH, d, color, 0, plinth + bodyH / 2, 0, { roughness: 0.6 });
        const front = d / 2 + 0.01;
        if (variant === "media") {
            k.box(w * 0.55, bodyH * 0.5, 0.02, shade(color, -0.35), 0, plinth + bodyH * 0.5, front);
            [-1, 1].forEach((s) =>
                k.box(w * 0.2, bodyH * 0.8, 0.02, shade(color, 0.08), s * w * 0.36, plinth + bodyH / 2, front)
            );
            return;
        }
        if (variant === "drawers") {
            const cols = Math.max(1, Math.min(3, Math.round((w * 12) / 22)));
            const rows = Math.max(1, Math.min(5, Math.round(bodyH / 0.75)));
            const cw = w / cols;
            const rh = bodyH / rows;
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const x = -w / 2 + cw * (c + 0.5);
                    const y = plinth + rh * (r + 0.5);
                    k.box(cw - 0.05, rh - 0.05, 0.03, shade(color, 0.06), x, y, front);
                    k.box(Math.min(0.35, cw * 0.3), 0.04, 0.06, METAL, x, y + rh * 0.2, front + 0.04, { metalness: 0.7, roughness: 0.35 });
                }
            }
            return;
        }
        // doors
        const n = w > 2.2 ? 2 : 1;
        const dw = w / n;
        for (let i = 0; i < n; i++) {
            const x = -w / 2 + dw * (i + 0.5);
            k.box(dw - 0.05, bodyH - 0.06, 0.03, shade(color, 0.06), x, plinth + bodyH / 2, front);
            const hx = n === 2 ? (i === 0 ? dw / 2 - 0.15 : -dw / 2 + 0.15) : dw / 2 - 0.15;
            k.box(0.04, Math.min(0.5, bodyH * 0.3), 0.06, METAL, x + hx, plinth + bodyH * (entry.elev > 0 ? 0.25 : 0.75), front + 0.04, {
                metalness: 0.7,
                roughness: 0.35,
            });
        }
    },

    bookshelf: ({ k, w, d, h, color }) => {
        const t = 0.07;
        const c = shade(color, -0.05);
        [-1, 1].forEach((s) => k.box(t, h, d, c, s * (w / 2 - t / 2), h / 2, 0));
        k.box(w, t, d, c, 0, h - t / 2, 0);
        k.box(w, t, d, c, 0, t / 2 + 0.15, 0);
        k.box(w, h, 0.03, shade(color, -0.2), 0, h / 2, -d / 2 + 0.015);
        const shelves = Math.max(2, Math.floor(h / 1.1));
        const gap = (h - 0.22) / shelves;
        const palette = ["#B5523B", "#3E6A8A", "#D4A24C", "#5E8C61", "#7B5E8A", "#C9C2B6", "#2F3237"];
        let seed = 7;
        const rnd = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        for (let i = 0; i < shelves; i++) {
            const y0 = 0.15 + t + gap * i;
            if (i > 0) k.box(w - t * 2, t, d - 0.04, c, 0, y0 - t / 2, 0.01);
            let x = -w / 2 + t + 0.03;
            while (x < w / 2 - t - 0.15) {
                const bw = 0.08 + rnd() * 0.1;
                const bh = Math.min(gap - 0.1, 0.55 + rnd() * 0.35);
                if (rnd() < 0.12) {
                    x += bw * 2; // occasional gap
                    continue;
                }
                k.box(bw - 0.01, bh, d * 0.75, palette[Math.floor(rnd() * palette.length)], x + bw / 2, y0 + bh / 2, 0.02);
                x += bw;
            }
        }
    },

    wardrobe: ({ k, w, d, h, color }) => {
        const plinth = 0.2;
        k.box(w - 0.1, plinth, d - 0.1, shade(color, -0.3), 0, plinth / 2, -0.03);
        k.box(w, h - plinth, d, color, 0, plinth + (h - plinth) / 2, 0, { roughness: 0.6 });
        const n = w > 2.6 ? 2 : 1;
        const dw = w / n;
        for (let i = 0; i < n; i++) {
            const x = -w / 2 + dw * (i + 0.5);
            k.box(dw - 0.04, h - plinth - 0.06, 0.03, shade(color, 0.05), x, plinth + (h - plinth) / 2, d / 2 + 0.01);
            const hx = n === 2 ? (i === 0 ? dw / 2 - 0.12 : -dw / 2 + 0.12) : dw / 2 - 0.12;
            k.box(0.04, 0.9, 0.06, METAL, x + hx, plinth + (h - plinth) * 0.5, d / 2 + 0.05, { metalness: 0.7, roughness: 0.35 });
        }
    },

    fireplace: ({ k, w, d, h, color }) => {
        const boxW = w * 0.6;
        const boxH = h * 0.55;
        const side = (w - boxW) / 2;
        [-1, 1].forEach((s) => k.box(side, h, d, color, s * (w / 2 - side / 2), h / 2, 0));
        k.box(boxW, h - boxH, d, color, 0, boxH + (h - boxH) / 2, 0);
        k.box(w + 0.3, 0.15, d + 0.25, shade(color, -0.1), 0, h + 0.075, 0.05);
        k.box(boxW, boxH, 0.05, "#2A2523", 0, boxH / 2, -d / 2 + 0.05);
        k.box(boxW, 0.05, d, "#3A3330", 0, 0.025, 0);
        // glowing fire
        k.sphere(Math.min(boxW, boxH) * 0.18, "#F2913D", 0, 0.2, 0, { emissive: "#F27B1D", emissiveIntensity: 1 }, 1).scale.set(1.6, 1, 0.8);
        k.box(boxW * 0.7, 0.1, 0.2, "#4A3426", 0, 0.08, 0);
        // hearth
        k.box(w + 0.4, 0.06, 0.6, shade(color, -0.25), 0, 0.03, d / 2 + 0.3);
    },

    piano: ({ k, w, d, h, color }) => {
        const keysD = Math.min(d * 0.35, 0.55);
        const bodyD = d - keysD;
        const keyH = Math.min(h * 0.58, 2.4);
        k.box(w, h, bodyD, color, 0, h / 2, -d / 2 + bodyD / 2, { roughness: 0.25 });
        k.box(w - 0.3, 0.2, keysD, color, 0, keyH - 0.15, d / 2 - keysD / 2, { roughness: 0.25 });
        k.box(w - 0.4, 0.05, keysD * 0.8, WHITE, 0, keyH - 0.02, d / 2 - keysD * 0.45, { roughness: 0.3 });
        const blacks = Math.round((w - 0.4) / 0.09);
        for (let i = 0; i < blacks; i++) {
            if ([2, 6].includes(i % 7)) continue;
            k.box(0.04, 0.04, keysD * 0.45, "#111111", -w / 2 + 0.25 + i * 0.09, keyH + 0.02, d / 2 - keysD * 0.6);
        }
        [-1, 1].forEach((s) => k.box(0.15, keyH - 0.25, 0.15, color, s * (w / 2 - 0.1), (keyH - 0.25) / 2, d / 2 - 0.12, { roughness: 0.25 }));
    },

    floorLamp: ({ k, w, h, color }) => {
        k.cyl(w * 0.32, w * 0.36, 0.08, "#4A4A4A", 0, 0.04, 0, { metalness: 0.5, roughness: 0.4 }, 20);
        k.cyl(0.03, 0.03, h - 0.9, "#6B6B6B", 0, (h - 0.9) / 2, 0, { metalness: 0.6, roughness: 0.35 }, 8);
        k.cyl(w * 0.32, w / 2, 1.1, color, 0, h - 0.55, 0, {
            open: true,
            doubleSide: true,
            emissive: "#FFE7B0",
            emissiveIntensity: 0.55,
        }, 24);
        k.sphere(0.15, "#FFF6DA", 0, h - 0.6, 0, { emissive: "#FFF2C4", emissiveIntensity: 1 }, 1);
    },

    plant: ({ k, w, h, color }) => {
        const potH = Math.min(h * 0.35, 1.3);
        const potR = w * 0.3;
        k.cyl(potR, potR * 0.75, potH, "#B86F4B", 0, potH / 2, 0, { roughness: 0.85 }, 18);
        k.cyl(potR * 0.92, potR * 0.92, 0.04, "#4A3426", 0, potH - 0.04, 0, {}, 18);
        const foliageH = h - potH;
        const blobs = 6;
        for (let i = 0; i < blobs; i++) {
            const a = (i / blobs) * Math.PI * 2;
            const t = (i % 3) / 3;
            const r = w * (0.2 + 0.12 * ((i * 5) % 3) / 2);
            k.sphere(
                w * 0.22,
                i % 2 ? color : shade(color, 0.15),
                Math.cos(a) * r,
                potH + foliageH * (0.3 + t * 0.45),
                Math.sin(a) * r,
                { roughness: 0.9 },
                0
            );
        }
        k.sphere(w * 0.26, shade(color, -0.1), 0, potH + foliageH * 0.8, 0, { roughness: 0.9 }, 0);
        k.cyl(0.03, 0.04, foliageH * 0.6, "#5B4636", 0, potH + foliageH * 0.3, 0, {}, 6);
    },

    rug: ({ k, w, d, color }) => {
        k.box(w, 0.02, d, shade(color, -0.2), 0, 0.012, 0, { roughness: 1 });
        const inset = Math.min(w, d) * 0.08;
        k.box(w - inset * 2, 0.022, d - inset * 2, color, 0, 0.014, 0, { roughness: 1 });
    },

    roundRug: ({ k, w, d, color }) => {
        const a = k.cyl(w / 2, w / 2, 0.02, shade(color, -0.2), 0, 0.012, 0, { roughness: 1 }, 40);
        a.scale.z = d / w;
        const b = k.cyl(w * 0.4, w * 0.4, 0.022, color, 0, 0.014, 0, { roughness: 1 }, 40);
        b.scale.z = d / w;
    },

    bed: ({ k, w, d, h, color }) => {
        const legH = 0.3;
        const frameH = 0.55;
        const mattH = 0.75;
        const headT = 0.25;
        const top = legH + frameH + mattH;
        k.legs(w, d, legH, 0.08, WOOD_DARK, 0.15, true);
        k.box(w, frameH, d, "#7A5C43", 0, legH + frameH / 2, 0, { roughness: 0.6 });
        k.box(w, Math.max(h, top + 0.5), headT, "#7A5C43", 0, Math.max(h, top + 0.5) / 2, -d / 2 + headT / 2, { roughness: 0.6 });
        k.box(w - 0.12, mattH, d - headT - 0.06, WHITE, 0, legH + frameH + mattH / 2, headT / 2, { roughness: 0.9 });
        // pillows
        const pillowsN = w * 12 >= 50 ? 2 : 1;
        const pw = (w - 0.4) / pillowsN;
        for (let i = 0; i < pillowsN; i++) {
            const p = k.box(pw - 0.15, 0.3, 1.1, "#FFFFFF", -w / 2 + 0.2 + pw * (i + 0.5), top + 0.12, -d / 2 + headT + 0.75, { roughness: 0.95 });
            p.rotation.x = -0.15;
        }
        // blanket over the lower part of the mattress, draping over the sides
        const blanketD = d * 0.66;
        k.box(w + 0.04, 0.1, blanketD, color, 0, top + 0.03, d / 2 - blanketD / 2 + 0.02, { roughness: 0.95 });
        [-1, 1].forEach((s) =>
            k.box(0.05, mattH * 0.9, blanketD, color, s * (w / 2 + 0.02), top - mattH * 0.45, d / 2 - blanketD / 2 + 0.02, { roughness: 0.95 })
        );
        k.box(w + 0.04, mattH * 0.9, 0.05, color, 0, top - mattH * 0.45, d / 2 + 0.02, { roughness: 0.95 });
    },

    bunkBed: ({ k, w, d, h, color }) => {
        const post = 0.22;
        [-1, 1].forEach((sx) =>
            [-1, 1].forEach((sz) => k.box(post, h, post, color, sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)))
        );
        const levels = [0.9, h * 0.62];
        levels.forEach((y, li) => {
            k.box(w - post, 0.35, d - post, color, 0, y - 0.18, 0);
            k.box(w - post - 0.1, 0.5, d - post - 0.1, WHITE, 0, y + 0.25, 0, { roughness: 0.9 });
            k.box(w - post - 0.12, 0.08, (d - post) * 0.65, li ? "#7FA7C9" : "#E0B97E", 0, y + 0.53, (d - post) * 0.17, { roughness: 0.95 });
            k.box((w - post) * 0.7, 0.25, 0.9, "#FFFFFF", 0, y + 0.6, -d / 2 + 0.75, { roughness: 0.95 });
        });
        // guard rails on the top bunk
        [-1, 1].forEach((sx) => k.box(0.1, 0.5, d - post, color, sx * (w / 2 - 0.05), levels[1] + 0.9, 0));
        k.box(w, 0.5, 0.1, color, 0, levels[1] + 0.9, -d / 2 + 0.05);
        k.box(w, 0.5, 0.1, color, 0, levels[1] + 0.9, d / 2 - 0.05);
        // ladder on the right side, toward the foot
        const lz = d * 0.2;
        [lz - 0.6, lz + 0.6].forEach((z) => k.box(0.1, levels[1] + 0.4, 0.1, color, w / 2 + 0.2, (levels[1] + 0.4) / 2, z));
        for (let i = 1; i <= 4; i++) {
            k.box(0.06, 0.06, 1.2, color, w / 2 + 0.2, (levels[1] * i) / 5, lz);
        }
    },

    crib: ({ k, w, d, h, color }) => {
        const post = 0.15;
        [-1, 1].forEach((sx) =>
            [-1, 1].forEach((sz) => k.box(post, h, post, color, sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)))
        );
        const mattY = 1.2;
        k.box(w - 0.1, 0.12, d - 0.1, color, 0, mattY - 0.06, 0);
        k.box(w - 0.2, 0.35, d - 0.2, "#DDEBF3", 0, mattY + 0.17, 0, { roughness: 0.9 });
        [mattY - 0.1, h - 0.06].forEach((y) => {
            k.box(w, 0.1, 0.1, color, 0, y, -d / 2 + 0.05);
            k.box(w, 0.1, 0.1, color, 0, y, d / 2 - 0.05);
            k.box(0.1, 0.1, d, color, -w / 2 + 0.05, y, 0);
            k.box(0.1, 0.1, d, color, w / 2 - 0.05, y, 0);
        });
        const slatH = h - mattY;
        const addSlats = (len, along) => {
            const n = Math.floor(len / 0.2);
            for (let i = 1; i < n; i++) {
                const u = -len / 2 + (len * i) / n;
                along.forEach(([fx, fz]) => {
                    k.cyl(0.025, 0.025, slatH, color, fx(u), mattY - 0.05 + slatH / 2, fz(u), {}, 6);
                });
            }
        };
        addSlats(w, [
            [(u) => u, () => -d / 2 + 0.05],
            [(u) => u, () => d / 2 - 0.05],
        ]);
        addSlats(d, [
            [() => -w / 2 + 0.05, (u) => u],
            [() => w / 2 - 0.05, (u) => u],
        ]);
    },

    bench: ({ k, w, d, h, color, entry }) => {
        if (entry.variant === "upholstered") {
            BUILDERS.ottoman({ k, w, d, h, color });
            return;
        }
        const top = 0.15;
        k.box(w, top, d, color, 0, h - top / 2, 0, { roughness: 0.6 });
        [-1, 1].forEach((s) => k.box(0.12, h - top, d - 0.1, shade(color, -0.15), s * (w / 2 - 0.3), (h - top) / 2, 0));
    },

    chair: ({ k, w, d, h, color }) => {
        const seatH = Math.min(1.5, h * 0.5);
        const seatT = 0.12;
        const backT = Math.min(0.15, d * 0.12);
        k.legs(w, d, seatH - seatT, 0.04, shade(color, -0.2), 0.1, true);
        k.box(w, seatT, d, shade(color, 0.08), 0, seatH - seatT / 2, 0);
        [-1, 1].forEach((s) => k.box(0.08, h - seatH, backT, shade(color, -0.2), s * (w / 2 - 0.1), seatH + (h - seatH) / 2, -d / 2 + backT / 2));
        k.box(w - 0.1, (h - seatH) * 0.5, backT * 0.7, color, 0, seatH + (h - seatH) * 0.7, -d / 2 + backT / 2);
    },

    stool: ({ k, w, h, color }) => {
        k.cyl(w * 0.4, w * 0.38, 0.15, shade(color, 0.15), 0, h - 0.075, 0, { roughness: 0.5 }, 20);
        k.cyl(0.05, 0.05, h - 0.15, METAL, 0, (h - 0.15) / 2, 0, { metalness: 0.7, roughness: 0.35 }, 8);
        k.cyl(w * 0.35, w * 0.4, 0.06, METAL, 0, 0.03, 0, { metalness: 0.7, roughness: 0.35 }, 20);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(w * 0.3, 0.025, 6, 20),
            k.mat(METAL, { metalness: 0.7, roughness: 0.35 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * 0.35;
        k.add(ring);
    },

    counter: ({ k, w, d, h, color, entry }) => {
        const island = entry.variant === "island";
        const plinth = 0.3;
        const topT = 0.12;
        const bodyD = island ? d - 0.2 : d - 0.08;
        k.box(w - 0.1, plinth, bodyD - 0.2, "#3A3A3A", 0, plinth / 2, island ? 0 : -0.1);
        k.box(w, h - plinth - topT, bodyD, color, 0, plinth + (h - plinth - topT) / 2, island ? 0 : -0.04);
        k.box(w + (island ? 0.1 : 0), topT, d, island ? "#E9E6E1" : STONE, 0, h - topT / 2, 0, { roughness: 0.35 });
        const fronts = island ? [1, -1] : [1];
        fronts.forEach((sz) => {
            const n = Math.max(1, Math.round(w / 1.5));
            const dw = w / n;
            for (let i = 0; i < n; i++) {
                const x = -w / 2 + dw * (i + 0.5);
                const fz = sz * (bodyD / 2 + 0.01) + (island ? 0 : -0.04);
                k.box(dw - 0.05, 0.5, 0.03, shade(color, 0.05), x, h - topT - 0.32, fz);
                k.box(dw - 0.05, h - plinth - topT - 0.7, 0.03, shade(color, 0.05), x, plinth + (h - plinth - topT - 0.7) / 2 + 0.02, fz);
                k.box(0.3, 0.04, 0.05, METAL, x, h - topT - 0.32, fz + sz * 0.03, { metalness: 0.7, roughness: 0.35 });
            }
        });
    },

    sink: (p) => {
        const { k, w, d, h } = p;
        BUILDERS.counter(p);
        k.box(w * 0.7, 0.03, d * 0.58, "#9EA5AD", 0, h + 0.005, d * 0.04, { metalness: 0.8, roughness: 0.25 });
        k.box(w * 0.64, 0.02, d * 0.5, "#6E757D", 0, h + 0.012, d * 0.04, { metalness: 0.8, roughness: 0.3 });
        k.cyl(0.05, 0.06, 0.9, METAL, 0, h + 0.45, -d * 0.38, { metalness: 0.85, roughness: 0.2 }, 10);
        k.box(0.06, 0.06, 0.6, METAL, 0, h + 0.88, -d * 0.38 + 0.3, { metalness: 0.85, roughness: 0.2 });
    },

    stove: ({ k, w, d, h, color }) => {
        k.box(w, h - 0.05, d, color, 0, (h - 0.05) / 2, 0, { metalness: 0.5, roughness: 0.4 });
        k.box(w - 0.04, 0.05, d - 0.04, DARK, 0, h - 0.025, 0, { roughness: 0.15 });
        [
            [-w * 0.23, -d * 0.2],
            [w * 0.23, -d * 0.2],
            [-w * 0.23, d * 0.18],
            [w * 0.23, d * 0.18],
        ].forEach(([x, z]) => {
            k.cyl(w * 0.13, w * 0.13, 0.02, "#4A4F57", x, h + 0.01, z, { roughness: 0.4 }, 20);
            k.cyl(w * 0.06, w * 0.06, 0.03, "#2B2E33", x, h + 0.02, z, {}, 14);
        });
        k.box(w - 0.1, h * 0.55, 0.03, "#1E2124", 0, h * 0.38, d / 2 + 0.01, { roughness: 0.15 });
        k.box(w * 0.6, h * 0.25, 0.01, "#3A4048", 0, h * 0.4, d / 2 + 0.03, { roughness: 0.1 });
        k.box(w * 0.7, 0.05, 0.08, METAL, 0, h * 0.68, d / 2 + 0.07, { metalness: 0.8, roughness: 0.3 });
        k.box(w, 0.4, 0.15, color, 0, h + 0.2, -d / 2 + 0.075, { metalness: 0.5, roughness: 0.4 });
    },

    fridge: ({ k, w, d, h, color }) => {
        k.box(w, h, d - 0.1, color, 0, h / 2, -0.05, { metalness: 0.55, roughness: 0.35 });
        const split = h * 0.32;
        const fz = d / 2 - 0.05;
        [-1, 1].forEach((s) => {
            k.box(w / 2 - 0.02, h - split - 0.03, 0.1, color, s * w * 0.25, split + (h - split) / 2, fz, { metalness: 0.55, roughness: 0.3 });
            k.box(0.05, h * 0.35, 0.08, METAL, s * 0.12, split + (h - split) * 0.5, fz + 0.09, { metalness: 0.85, roughness: 0.2 });
        });
        k.box(w - 0.02, split - 0.04, 0.1, color, 0, split / 2, fz, { metalness: 0.55, roughness: 0.3 });
        k.box(w * 0.6, 0.05, 0.08, METAL, 0, split - 0.25, fz + 0.09, { metalness: 0.85, roughness: 0.2 });
    },

    dishwasher: ({ k, w, d, h, color }) => {
        k.box(w, h - 0.12, d - 0.06, color, 0, (h - 0.12) / 2, -0.03, { metalness: 0.5, roughness: 0.35 });
        k.box(w, 0.12, d, STONE, 0, h - 0.06, 0, { roughness: 0.35 });
        k.box(w - 0.04, h - 0.5, 0.03, shade(color, 0.08), 0, (h - 0.5) / 2 + 0.25, d / 2 - 0.02, { metalness: 0.6, roughness: 0.3 });
        k.box(w * 0.7, 0.04, 0.06, METAL, 0, h - 0.35, d / 2 + 0.03, { metalness: 0.85, roughness: 0.2 });
    },

    toilet: ({ k, w, d, h, color }) => {
        const tankD = d * 0.28;
        k.box(w, h * 0.45, tankD, color, 0, h - h * 0.225, -d / 2 + tankD / 2, { roughness: 0.25 });
        k.box(w + 0.04, 0.06, tankD + 0.04, color, 0, h + 0.03, -d / 2 + tankD / 2, { roughness: 0.25 });
        const bowlD = d - tankD;
        const bowl = k.cyl(w * 0.42, w * 0.3, h * 0.5, color, 0, h * 0.25, -d / 2 + tankD + bowlD / 2, { roughness: 0.25 }, 24);
        bowl.scale.z = bowlD / (w * 0.84);
        const seat = k.cyl(w * 0.44, w * 0.44, 0.06, color, 0, h * 0.5 + 0.03, -d / 2 + tankD + bowlD / 2, { roughness: 0.3 }, 24);
        seat.scale.z = bowlD / (w * 0.88);
        k.box(w * 0.3, h * 0.5, tankD * 0.6, color, 0, h * 0.25, -d / 2 + tankD * 0.9, { roughness: 0.25 });
    },

    bathtub: ({ k, w, d, h, color }) => {
        const rim = Math.min(w, d) * 0.12;
        k.box(w, h, rim, color, 0, h / 2, -d / 2 + rim / 2, { roughness: 0.2 });
        k.box(w, h, rim, color, 0, h / 2, d / 2 - rim / 2, { roughness: 0.2 });
        k.box(rim, h, d - rim * 2, color, -w / 2 + rim / 2, h / 2, 0, { roughness: 0.2 });
        k.box(rim, h, d - rim * 2, color, w / 2 - rim / 2, h / 2, 0, { roughness: 0.2 });
        k.box(w - rim * 2, 0.3, d - rim * 2, color, 0, 0.15, 0, { roughness: 0.2 });
        k.box(w - rim * 2, 0.02, d - rim * 2, GLASS, 0, h * 0.6, 0, { opacity: 0.45, roughness: 0.05 });
        k.cyl(0.04, 0.05, 0.4, METAL, -w / 2 + rim / 2, h + 0.2, 0, { metalness: 0.85, roughness: 0.2 }, 10);
        k.box(0.35, 0.05, 0.05, METAL, -w / 2 + rim / 2 + 0.15, h + 0.38, 0, { metalness: 0.85, roughness: 0.2 });
    },

    shower: ({ k, w, d, h, color }) => {
        k.box(w, 0.25, d, color, 0, 0.125, 0, { roughness: 0.4 });
        k.cyl(0.08, 0.08, 0.01, "#7D848C", 0, 0.255, 0, { metalness: 0.7 }, 12);
        // glass on the open front and right sides; back/left assumed to be walls
        k.box(w, h - 0.25, 0.03, GLASS, 0, 0.25 + (h - 0.25) / 2, d / 2 - 0.02, { opacity: 0.25, roughness: 0.05, doubleSide: true });
        k.box(0.03, h - 0.25, d, GLASS, w / 2 - 0.02, 0.25 + (h - 0.25) / 2, 0, { opacity: 0.25, roughness: 0.05, doubleSide: true });
        k.box(w, 0.05, 0.05, METAL, 0, h, d / 2 - 0.02, { metalness: 0.85, roughness: 0.2 });
        k.box(0.05, 0.05, d, METAL, w / 2 - 0.02, h, 0, { metalness: 0.85, roughness: 0.2 });
        k.box(0.05, h * 0.3, 0.05, METAL, 0, h * 0.72, -d / 2 + 0.05, { metalness: 0.85, roughness: 0.2 });
        k.box(0.05, 0.05, 0.5, METAL, 0, h * 0.86, -d / 2 + 0.3, { metalness: 0.85, roughness: 0.2 });
        k.cyl(0.25, 0.2, 0.06, METAL, 0, h * 0.85, -d / 2 + 0.55, { metalness: 0.85, roughness: 0.2 }, 16);
    },

    vanity: ({ k, w, d, h, color }) => {
        const topT = 0.1;
        k.box(w, h - topT - 0.3, d - 0.05, color, 0, 0.3 + (h - topT - 0.3) / 2, -0.025);
        k.legs(w, d - 0.1, 0.3, 0.04, METAL, 0.1);
        k.box(w, topT, d, "#EEEBE6", 0, h - topT / 2, 0, { roughness: 0.3 });
        const n = w > 2.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
            const dw = w / n;
            const x = -w / 2 + dw * (i + 0.5);
            k.box(dw - 0.05, h - topT - 0.4, 0.03, shade(color, 0.08), x, 0.3 + (h - topT - 0.4) / 2 + 0.03, d / 2 - 0.01);
            k.box(0.04, 0.4, 0.05, METAL, x + (i === 0 ? dw / 2 - 0.12 : -dw / 2 + 0.12), h - topT - 0.5, d / 2 + 0.03, { metalness: 0.8 });
        }
        const basin = k.cyl(w * 0.24, w * 0.18, 0.35, CERAMIC, 0, h + 0.17, d * 0.04, { roughness: 0.2 }, 24);
        basin.scale.z = (d * 0.56) / (w * 0.48);
        k.cyl(0.04, 0.05, 0.6, METAL, 0, h + 0.3, -d * 0.38, { metalness: 0.85, roughness: 0.2 }, 10);
        k.box(0.05, 0.05, 0.35, METAL, 0, h + 0.58, -d * 0.38 + 0.17, { metalness: 0.85, roughness: 0.2 });
    },

    washer: ({ k, w, d, h, color }) => {
        k.box(w, h, d, color, 0, h / 2, 0, { roughness: 0.35 });
        k.box(w - 0.04, h * 0.14, 0.03, "#E6E9EC", 0, h * 0.9, d / 2 + 0.01);
        k.cyl(0.07, 0.07, 0.05, "#9AA1A9", w * 0.3, h * 0.9, d / 2 + 0.04, { metalness: 0.6 }, 14).rotation.x = Math.PI / 2;
        const r = Math.min(w, h) * 0.3;
        const ring = k.cyl(r, r, 0.08, "#C9CDD2", 0, h * 0.45, d / 2 + 0.03, { metalness: 0.5, roughness: 0.3 }, 28);
        ring.rotation.x = Math.PI / 2;
        const glass = k.cyl(r * 0.78, r * 0.78, 0.09, "#46515C", 0, h * 0.45, d / 2 + 0.04, { roughness: 0.1 }, 28);
        glass.rotation.x = Math.PI / 2;
    },

    desk: ({ k, w, d, h, color, entry }) => {
        const top = 0.1;
        k.box(w, top, d, color, 0, h - top / 2, 0, { roughness: 0.5 });
        [-1, 1].forEach((s) => k.box(0.1, h - top, d - 0.1, shade(color, -0.2), s * (w / 2 - 0.1), (h - top) / 2, 0));
        k.box(w - 0.2, 0.5, 0.05, shade(color, -0.15), 0, h - top - 0.25, -d / 2 + 0.1);
        if (entry.variant === "vanity") {
            k.box(w * 0.6, 1.8, 0.06, "#C9A86A", 0, h + 0.9, -d / 2 + 0.08, { roughness: 0.4 });
            k.box(w * 0.55, 1.7, 0.02, "#DCEBF2", 0, h + 0.9, -d / 2 + 0.12, MIRROR_GLASS);
            return;
        }
        // monitor + keyboard
        k.box(0.5, 0.03, 0.35, DARK, 0, h + 0.015, -d * 0.25);
        k.box(0.08, 0.6, 0.06, DARK, 0, h + 0.3, -d * 0.28);
        k.box(Math.min(w * 0.4, 2), 1.1, 0.06, DARK, 0, h + 0.95, -d * 0.24, { roughness: 0.3 });
        k.box(Math.min(w * 0.4, 2) - 0.06, 1.04, 0.01, "#1B2A3A", 0, h + 0.95, -d * 0.24 + 0.035, { emissive: "#24425E", emissiveIntensity: 0.6 });
        k.box(Math.min(w * 0.3, 1.4), 0.03, 0.45, "#E6E8EB", 0, h + 0.015, d * 0.12);
    },

    officeChair: ({ k, w, d, h, color }) => {
        const seatH = Math.min(1.6, h * 0.45);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const spoke = k.box(w * 0.45, 0.06, 0.1, "#3B3F45", Math.cos(a) * w * 0.22, 0.2, Math.sin(a) * w * 0.22);
            spoke.rotation.y = -a;
            k.sphere(0.07, "#222", Math.cos(a) * w * 0.44, 0.07, Math.sin(a) * w * 0.44, {}, 0);
        }
        k.cyl(0.06, 0.06, seatH - 0.3, METAL, 0, 0.2 + (seatH - 0.3) / 2, 0, { metalness: 0.8, roughness: 0.3 }, 8);
        k.box(w * 0.7, 0.25, d * 0.65, color, 0, seatH, 0.05);
        const back = k.box(w * 0.65, h - seatH - 0.1, 0.15, color, 0, seatH + (h - seatH) / 2, -d * 0.3);
        back.rotation.x = -0.12;
        [-1, 1].forEach((s) => {
            k.box(0.08, 0.6, 0.08, "#3B3F45", s * w * 0.36, seatH + 0.3, 0.05);
            k.box(0.14, 0.06, d * 0.4, "#3B3F45", s * w * 0.36, seatH + 0.6, 0.05);
        });
    },

    treadmill: ({ k, w, d, h, color }) => {
        k.box(w, 0.4, d, color, 0, 0.2, 0.1);
        k.box(w * 0.72, 0.05, d * 0.8, "#4A4F57", 0, 0.42, 0.25, { roughness: 0.95 });
        [-1, 1].forEach((s) => {
            const post = k.box(0.12, h - 0.4, 0.12, color, s * (w / 2 - 0.1), 0.4 + (h - 0.4) / 2, -d / 2 + 0.4);
            post.rotation.x = 0.15;
            k.box(0.1, 0.1, 1.2, color, s * (w / 2 - 0.1), h * 0.7, -d / 2 + 0.9);
        });
        k.box(w, 0.6, 0.3, "#3B3F45", 0, h - 0.2, -d / 2 + 0.25);
        k.box(w * 0.5, 0.35, 0.02, "#24425E", 0, h - 0.18, -d / 2 + 0.41, { emissive: "#24425E", emissiveIntensity: 0.5 });
    },

    lounger: ({ k, w, d, h, color }) => {
        const frameH = h * 0.7;
        k.legs(w, d, frameH - 0.1, 0.05, "#E7E2D6", 0.15, true);
        k.box(w, 0.1, d, "#E7E2D6", 0, frameH - 0.05, 0);
        k.box(w - 0.1, 0.18, d * 0.68, color, 0, frameH + 0.09, d * 0.15, { roughness: 0.95 });
        const backL = d * 0.32;
        // backrest hinged at the head end of the seat cushion, raised ~40°
        const back = k.sub((grp) => {
            grp.position.set(0, frameH, -d / 2 + backL);
            grp.rotation.x = 0.7;
        });
        back.box(w - 0.1, 0.18, backL, color, 0, 0.09, -backL / 2, { roughness: 0.95 });
    },

    grill: ({ k, w, d, h, color }) => {
        const bodyH = h * 0.45;
        const baseY = h - bodyH;
        k.legs(w * 0.6, d, baseY, 0.05, "#3B3F45", 0.1, true);
        k.box(w * 0.6, bodyH * 0.5, d, color, 0, baseY + bodyH * 0.25, 0, { metalness: 0.3, roughness: 0.5 });
        const lid = k.cyl(d / 2, d / 2, w * 0.6, color, 0, baseY + bodyH * 0.5, 0, { metalness: 0.3, roughness: 0.5 }, 18);
        lid.rotation.z = Math.PI / 2;
        lid.scale.x = 0.7;
        [-1, 1].forEach((s) => k.box(w * 0.2, 0.06, d * 0.8, "#8A9097", s * w * 0.4, baseY + bodyH * 0.45, 0, { metalness: 0.6 }));
        k.box(w * 0.3, 0.05, 0.05, METAL, 0, baseY + bodyH * 0.85, d / 2 + 0.08, { metalness: 0.8 });
        k.box(w * 0.5, 0.05, d * 0.8, "#3B3F45", 0, baseY * 0.3, 0);
    },

    // Stairs from the shared layout (inches, local frame) — see utils/stairs.js.
    stairs: ({ k, color, item }) => {
        const L = stairLayout(item);
        const ft = (v) => v / 12;
        const open = item.stair?.risers === "open" || item.stair?.type === "spiral";
        const railColor = item.stair?.railColor || "#3B3F45";
        const treadMat = k.mat(color, { roughness: 0.6 });
        const railMat = k.mat(railColor, { metalness: 0.4, roughness: 0.45 });
        const TREAD_T = 0.13; // ft

        // Each tread/landing: its polygon extruded downward from its top —
        // a thin slab for open risers, solid to the floor for closed ones.
        L.treads.forEach((t) => {
            const shape = new THREE.Shape(t.poly.map((p) => new THREE.Vector2(ft(p.x), ft(p.y))));
            const top = ft(t.top);
            const depth = open ? TREAD_T : top;
            const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
            geo.rotateX(Math.PI / 2); // shape y → +z, extrusion → down
            const m = new THREE.Mesh(geo, treadMat);
            m.position.y = top;
            k.add(m);
        });

        // A straight beam between two points (stringers, rails).
        const beam = (a, b, thick, mat) => {
            const len = a.distanceTo(b);
            if (len < 0.01) return;
            const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), mat);
            m.position.copy(a).add(b).multiplyScalar(0.5);
            m.lookAt(b);
            k.add(m);
        };
        const v3 = (p, top) => new THREE.Vector3(ft(p.x), ft(top), ft(p.y));

        // Open stairs get stringers under both sides of each flight.
        if (open && !L.post) {
            const line = L.treads.map((t) => ({ ...t.center, top: t.top }));
            [-1, 1].forEach((side) => {
                for (let i = 1; i < line.length; i++) {
                    const a = line[i - 1];
                    const b = line[i];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const off = (L.flightW / 2 - 1) * side;
                    const o = { x: (dy / len) * off, y: (-dx / len) * off };
                    beam(
                        v3({ x: a.x + o.x, y: a.y + o.y }, a.top - 2),
                        v3({ x: b.x + o.x, y: b.y + o.y }, b.top - 2),
                        0.16,
                        treadMat
                    );
                }
            });
        }

        // Spiral: central column.
        if (L.post) {
            k.cyl(ft(L.post.r), ft(L.post.r), ft(item.h + 36), railColor, 0, ft(item.h + 36) / 2, 0, {
                metalness: 0.4,
                roughness: 0.45,
            }, 12);
        }

        // Handrails with balusters every other step.
        L.rails.forEach((rail) => {
            for (let i = 1; i < rail.length; i++) beam(v3(rail[i - 1], rail[i - 1].top), v3(rail[i], rail[i].top), 0.12, railMat);
            rail.forEach((p, i) => {
                if (i % 2 && i !== rail.length - 1) return;
                const footTop = p.top - 36;
                k.cyl(0.03, 0.03, ft(36), railColor, ft(p.x), ft(footTop) + ft(36) / 2, ft(p.y), {
                    metalness: 0.4,
                    roughness: 0.45,
                }, 6);
            });
        });
    },

    mirror: ({ k, w, d, h, color }) => {
        const tilt = 0.12;
        // leaning back against the wall behind it
        const m = k.sub((grp) => {
            grp.rotation.x = -tilt;
            grp.position.set(0, 0, d / 2);
        });
        m.box(w, h, 0.08, color, 0, h / 2, -0.04, { metalness: 0.4, roughness: 0.4 });
        m.box(w - 0.18, h - 0.18, 0.01, "#DCEBF2", 0, h / 2, 0.005, MIRROR_GLASS);
    },
};

// Build every placed piece of a design into world space. `toFeet(x, y)` maps
// content-space pixels to world feet ({ x, z }), as used for the walls.
// Returns { group, colliders } where colliders are the footprint edges (in
// feet) of pieces tall enough to bump into while walking.
export const buildFurniture = (furniture, toFeet) => {
    const group = new THREE.Group();
    const colliders = [];
    if (!Array.isArray(furniture) || furniture.length === 0) return { group, colliders };
    const mat = makeMaterials();

    furniture.forEach((f) => {
        try {
            const entry = catalogEntry(f.type);
            const builder = BUILDERS[entry.shape] ?? BUILDERS.box;
            const w = Math.max(0.1, f.w / 12);
            const d = Math.max(0.1, f.d / 12);
            const h = Math.max(0.02, f.h / 12);
            const color = f.color || entry.color;

            const piece = new THREE.Group();
            builder({ k: kit(piece, mat), w, d, h, color, entry: { ...entry, elev: f.elev ?? entry.elev ?? 0 }, item: f });

            const p = toFeet(f.x, f.y);
            piece.position.set(p.x, (f.elev ?? 0) / 12, p.z);
            // 2D rotation is clockwise on screen (y down); in world space that
            // is a negative rotation about +y (see Room3DScreen's wall mapping).
            piece.rotation.y = (-(f.rot || 0) * Math.PI) / 180;
            group.add(piece);

            // Walk collision: only pieces that sit on the floor and are tall
            // enough to bump into (rugs, raised cabinets etc. are ignored).
            // Stairs aren't obstacles: walking onto them climbs (Room3DScreen).
            if (
                (f.elev ?? 0) < 2 * 12 &&
                h > 0.9 &&
                entry.shape !== "rug" &&
                entry.shape !== "roundRug" &&
                entry.shape !== "stairs"
            ) {
                const a = (-(f.rot || 0) * Math.PI) / 180;
                const cos = Math.cos(a);
                const sin = Math.sin(a);
                const corner = (lx, lz) => ({
                    x: p.x + lx * cos + lz * sin,
                    z: p.z - lx * sin + lz * cos,
                });
                const c = [
                    corner(-w / 2, -d / 2),
                    corner(w / 2, -d / 2),
                    corner(w / 2, d / 2),
                    corner(-w / 2, d / 2),
                ];
                const segs = c.map((pt, i) => {
                    const q = c[(i + 1) % 4];
                    return { ax: pt.x, az: pt.z, bx: q.x, bz: q.z };
                });
                colliders.push({ corners: c, segs });
            }
        } catch (e) {
            // A single bad piece shouldn't take the whole 3D view down.
            console.warn("furniture build failed", f?.type, e);
        }
    });

    return { group, colliders };
};

// Is a world point (feet) inside a collider's footprint?
export const insideCollider = (col, x, z) => {
    let inside = false;
    const c = col.corners;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
        const xi = c[i].x;
        const zi = c[i].z;
        const xj = c[j].x;
        const zj = c[j].z;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
};

export { PIXELS_PER_FOOT };
