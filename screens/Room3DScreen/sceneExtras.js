import * as THREE from "three";
import { catalogEntry } from "../../utils/furnitureCatalog";

// Cheap visual upgrades for the 3D room — all baked into a few tiny
// textures and flat planes, so they cost almost nothing per frame (no
// real-time shadow maps or post-processing):
//
//  - a soft sky gradient + distance fog, and a ground plane around the room
//  - contact shadows under furniture (a blurred footprint decal)
//  - ambient-occlusion strips darkening the floor along the base of walls
//  - per-wall groups so the dollhouse view can lower the walls facing you

export const SKY_TOP = "#BFD8EA";
export const HORIZON = "#EEF0EC";
const GROUND_COLOR = "#E4DFD5";

const hexRgb = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const dataTex = (data, w, h) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
};

// Vertical sky gradient used as the scene background.
const makeSkyTexture = () => {
    const H = 64;
    const data = new Uint8Array(2 * H * 4);
    const top = hexRgb(SKY_TOP);
    const bottom = hexRgb(HORIZON);
    for (let y = 0; y < H; y++) {
        const t = Math.pow(y / (H - 1), 1.4); // row 0 = bottom of the screen
        for (let x = 0; x < 2; x++) {
            const i = (y * 2 + x) * 4;
            for (let c = 0; c < 3; c++) data[i + c] = bottom[c] + (top[c] - bottom[c]) * t;
            data[i + 3] = 255;
        }
    }
    const tex = dataTex(data, 2, H);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
};

// Soft rounded-rectangle blob: opaque in the middle, fading to nothing at
// the edges. Stretched over a piece's footprint it reads as a contact shadow.
const makeShadowTexture = () => {
    const N = 64;
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const u = (x / (N - 1)) * 2 - 1;
            const v = (y / (N - 1)) * 2 - 1;
            const r = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
            const a = Math.max(0, Math.min(1, (1 - r) / 0.42));
            const i = (y * N + x) * 4;
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
        }
    }
    return dataTex(data, N, N);
};

// 1-D falloff: dark at v = 0 (against the wall), clear at v = 1.
const makeAoTexture = () => {
    const H = 32;
    const data = new Uint8Array(2 * H * 4);
    for (let y = 0; y < H; y++) {
        const a = Math.pow(1 - y / (H - 1), 2.2);
        for (let x = 0; x < 2; x++) {
            const i = (y * 2 + x) * 4;
            data[i + 3] = Math.round(255 * a);
        }
    }
    return dataTex(data, 2, H);
};

const decalMaterial = (map, opacity) =>
    new THREE.MeshBasicMaterial({
        map,
        color: "#000000",
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
    });

// Flat plane lying on the floor, centered at (x, z), rotated by `angle`
// about +y (same convention as the walls/furniture), sized w × d.
const floorDecal = (material, x, y, z, w, d, angle) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = angle;
    m.renderOrder = 1;
    return m;
};

// Background, fog and the ground around the room.
export const addEnvironment = (scene) => {
    const sky = makeSkyTexture();
    scene.background = sky;
    scene.fog = new THREE.Fog(HORIZON, 70, 240);
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 1 })
    );
    ground.position.y = -0.03; // just under the room's floor
    scene.add(ground);
    // A soft overhead fill so the dollhouse view has gentle form shading.
    const fill = new THREE.DirectionalLight("#FFFFFF", 0.22);
    fill.position.set(-8, 30, 14);
    scene.add(fill);
    return () => sky.dispose();
};

// Contact shadows under floor-standing furniture.
export const addFurnitureShadows = (scene, furniture, toFeet) => {
    if (!furniture?.length) return;
    const mat = decalMaterial(makeShadowTexture(), 0.34);
    furniture.forEach((f) => {
        const shape = catalogEntry(f.type).shape;
        if (shape === "rug" || shape === "roundRug" || (f.elev ?? 0) > 6) return;
        const p = toFeet(f.x, f.y);
        const w = f.w / 12;
        const d = f.d / 12;
        // Slightly larger than the footprint so the blur spills out around it.
        const m = floorDecal(mat, p.x, 0.03, p.z, w * 1.12 + 0.5, d * 1.12 + 0.5, (-(f.rot || 0) * Math.PI) / 180);
        scene.add(m);
    });
};

// Darken the floor along both faces of every wall, skipping doorways.
export const addWallOcclusion = (scene, wallParts) => {
    if (!wallParts?.length) return;
    const mat = decalMaterial(makeAoTexture(), 0.3);
    const STRIP = 0.9; // ft of falloff away from the wall
    wallParts.forEach((wp) => {
        wp.solidSpans.forEach(([u0, u1]) => {
            const len = u1 - u0;
            if (len < 0.05) return;
            const cu = (u0 + u1) / 2;
            [1, -1].forEach((side) => {
                const off = side * (wp.thickness / 2 + STRIP / 2);
                const x = wp.mid.x + wp.dir.x * cu + wp.n.x * off;
                const z = wp.mid.z + wp.dir.z * cu + wp.n.z * off;
                const m = floorDecal(mat, x, 0.006, z, len, STRIP, -wp.angle);
                // The texture's dark (v = 0) edge ends up on the plane's +n
                // side, which faces the wall for the strip on the -n side;
                // turn the +n strip around so its dark edge faces the wall too.
                if (side === 1) m.rotation.y += Math.PI;
                scene.add(m);
            });
        });
    });
};

// Move each wall's meshes into their own group so the dollhouse view can
// lower the walls between the camera and the room. Meshes keep their world
// position (the scene root has an identity transform).
export const groupWalls = (scene, wallParts, roomCenter) =>
    wallParts.map((wp) => {
        const group = new THREE.Group();
        wp.objects.forEach((o) => {
            scene.remove(o);
            group.add(o);
        });
        scene.add(group);
        // Orient the normal to point out of the room.
        let { x: nx, z: nz } = wp.n;
        if (nx * (wp.mid.x - roomCenter.x) + nz * (wp.mid.z - roomCenter.z) < 0) {
            nx = -nx;
            nz = -nz;
        }
        return { group, mid: wp.mid, nx, nz, cut: 1 };
    });

const CUT_SCALE = 0.1; // lowered walls keep ~10% of their height (a low "dollhouse" rim)

// Ease every wall group toward full height or lowered, depending on mode and
// which side of the wall the camera is on. Returns true while animating.
export const updateWallCutaway = (wallGroups, mode, camPos, dt) => {
    let animating = false;
    const k = 1 - Math.exp(-10 * dt);
    wallGroups.forEach((wg) => {
        let target = 1;
        if (mode === "orbit") {
            const side = (camPos.x - wg.mid.x) * wg.nx + (camPos.z - wg.mid.z) * wg.nz;
            if (side > 0.25) target = CUT_SCALE;
        }
        const next = wg.cut + (target - wg.cut) * k;
        if (Math.abs(target - next) > 0.002) animating = true;
        wg.cut = Math.abs(target - next) <= 0.002 ? target : next;
        wg.group.scale.y = wg.cut;
    });
    return animating;
};
