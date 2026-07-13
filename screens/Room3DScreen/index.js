import { Ionicons } from "@expo/vector-icons";
import { GLView } from "expo-gl";
import { Renderer } from "expo-three";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    PanResponder,
    PixelRatio,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import * as THREE from "three";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { chainRoom, roomOutline } from "../../utils/roomGeometry";
import { report } from "../../utils/report";
import { colors, radius } from "../../utils/theme";

const PIXELS_PER_FOOT = 26; // matches the assumed drawing scale used in PlanPreviewScreen
const DEFAULT_HEIGHT_IN = 118; // 9'10", matches WallSizeSheet's default
const DEFAULT_THICKNESS_IN = 8;
const EYE_HEIGHT_FT = 5.5;
const WALK_SPEED = 5; // feet per second at full joystick deflection
const WALL_COLLIDE_MARGIN = 0.28; // how close the camera may get to a solid wall segment
const LOOK_SENSITIVITY = 0.006; // radians per screen-pixel of drag
const MAX_PITCH = Math.PI / 2 - 0.05;
const JOYSTICK_RADIUS = 40;

const FLOOR_COLOR = "#7C5A38";
const WALL_COLOR = "#DFDAD1";
const CEILING_COLOR = "#E6E3DD";
const BASEBOARD_COLOR = "#F3EFE8";
const BASEBOARD_HEIGHT_FT = 0.32;
const FLOOR_TILE_FT = 6; // world feet spanned by one wood-texture tile

// Vertical placement of openings, in feet.
const WINDOW_SILL_FT = 3; // bottom of a window off the floor
const WINDOW_HEIGHT_FT = 3.6; // window opening height
const DOOR_HEIGHT_FT = 6.75; // top of a doorway off the floor (~81")
const GLASS_COLOR = "#BCDFF0";
const FRAME_COLOR = "#EFEDE8"; // white casing / jamb / mullions
const DOOR_COLOR = "#E7E2D9"; // painted door leaf
const HANDLE_COLOR = "#9A9690"; // brushed-metal handle
const DOOR_OPEN_RAD = 1.4; // how far the door swings open (~80°)
const DOOR_OPEN_MS = 1200; // swing-open animation duration

// Deterministic RNG + spatial hash for the procedural textures below, so the
// generated wood grain / plaster speckle is identical every render.
const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash2 = (x, y) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// Turns a raw RGBA byte array into a repeating, mip-mapped, sRGB texture.
// DataTexture defaults to nearest filtering / no mipmaps, so we set those
// explicitly for a smooth surface.
const makeDataTexture = (data, w, h, repeat, maxAnisotropy) => {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = maxAnisotropy || 1;
    tex.encoding = THREE.sRGBEncoding;
    if (repeat) tex.repeat.set(repeat, repeat);
    tex.needsUpdate = true;
    return tex;
};

// Procedural wood-plank floor: staggered rows of planks with per-plank tone
// variation, long grain streaks, and darkened seams.
const makeWoodFloorTexture = (maxAnisotropy) => {
    const W = 512;
    const H = 512;
    const data = new Uint8Array(W * H * 4);
    const rng = mulberry32(20240709);
    const plankH = 64; // divides 512 evenly → seamless vertical tiling
    const nRows = Math.ceil(H / plankH);
    const rows = [];
    for (let r = 0; r < nRows; r++) {
        rows.push({
            tone: 0.82 + rng() * 0.4,
            hue: (rng() - 0.5) * 12,
            seam: Math.floor(rng() * W),
            plankLen: 150 + rng() * 170,
        });
    }
    const base = { r: 122, g: 86, b: 52 };
    for (let y = 0; y < H; y++) {
        const rIndex = Math.floor(y / plankH);
        const row = rows[rIndex % nRows];
        const yIn = y - rIndex * plankH;
        for (let x = 0; x < W; x++) {
            let v = 0;
            v += Math.sin(yIn * 0.5 + row.seam * 0.01) * 5; // fine grain lines
            v += Math.sin(yIn * 1.7 + 2) * 3;
            v += (hash2(Math.floor(x / 20), rIndex * 13) - 0.5) * 12; // slow streaks
            v += (hash2(x, y) - 0.5) * 8; // speckle
            if (yIn < 2) v -= 42; // plank top seam
            else if (yIn < 4) v -= 18;
            if (yIn > plankH - 2) v -= 30; // plank bottom seam
            const local =
                (((x - row.seam) % row.plankLen) + row.plankLen) % row.plankLen;
            if (local < 2) v -= 34; // staggered end seams
            const i = (y * W + x) * 4;
            data[i] = clamp255(base.r * row.tone + row.hue + v);
            data[i + 1] = clamp255(base.g * row.tone + row.hue * 0.6 + v);
            data[i + 2] = clamp255(base.b * row.tone + v);
            data[i + 3] = 255;
        }
    }
    return makeDataTexture(data, W, H, 1 / FLOOR_TILE_FT, maxAnisotropy);
};

// Procedural plaster wall: the base wall color with very faint fine speckle
// and larger soft blotches, so flat walls catch light unevenly like paint.
const makeWallTexture = (maxAnisotropy) => {
    const W = 128;
    const H = 128;
    const data = new Uint8Array(W * H * 4);
    const base = { r: 223, g: 218, b: 209 };
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let n = (hash2(x, y) - 0.5) * 6;
            n += (hash2(Math.floor(x / 8), Math.floor(y / 8)) - 0.5) * 8;
            const i = (y * W + x) * 4;
            data[i] = clamp255(base.r + n);
            data[i + 1] = clamp255(base.g + n);
            data[i + 2] = clamp255(base.b + n);
            data[i + 3] = 255;
        }
    }
    return makeDataTexture(data, W, H, 1, maxAnisotropy);
};

// True center of mass of a simple polygon — unlike the bounding-box center,
// this is reliably inside the shape even for triangles, L-shapes, or other
// non-rectangular rooms (a bounding-box center can land near an edge or
// even outside the polygon for those).
const polygonCentroid = (pts) => {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        const cross = p0.x * p1.y - p1.x * p0.y;
        area += cross;
        cx += (p0.x + p1.x) * cross;
        cy += (p0.y + p1.y) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-6) {
        const n = pts.length || 1;
        return {
            x: pts.reduce((s, p) => s + p.x, 0) / n,
            y: pts.reduce((s, p) => s + p.y, 0) / n,
        };
    }
    return { x: cx / (6 * area), y: cy / (6 * area) };
};

// Distance from point (x,z) to a stored collision segment {ax,az,bx,bz}.
const distanceToWallSegment = (x, z, s) => {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq ? ((x - s.ax) * dx + (z - s.az) * dz) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz));
};

// Builds the Three.js scene (floor, ceiling, extruded walls, a pendant
// light) from the 2D wall list, in feet, centered on the room.
const buildScene = (walls, { maxAnisotropy = 1 } = {}) => {
    const scene = new THREE.Scene();
    // Door pivots to animate open in the render loop: { pivot, base, target }.
    const doors = [];
    // Solid wall spans (feet) for walk collision — doorways are omitted so
    // the camera can pass through them; windows stay solid (sill wall).
    const collisionSegments = [];

    // Use the robust outer-boundary tracer for the floor/ceiling footprint so
    // it covers the whole room even for split-node or interior/divider layouts
    // (the simple chain tracer leaves part of the floor uncovered). Fall back to
    // the chain if the outline can't be traced.
    const polygon = roomOutline(walls) || chainRoom(walls).polygon;
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    const centerX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const centerY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const toFeet = (x, y) => ({
        x: (x - centerX) / PIXELS_PER_FOOT,
        z: (y - centerY) / PIXELS_PER_FOOT,
    });

    const wallHeights = walls.map((w) => (w.heightIn ?? DEFAULT_HEIGHT_IN) / 12);
    const ceilingHeight = wallHeights.length
        ? Math.max(...wallHeights)
        : DEFAULT_HEIGHT_IN / 12;

    // A point reliably inside the room (unlike the bounding-box origin
    // above, which is just this scene's coordinate reference and can sit
    // near an edge or outside the floor for non-rectangular rooms) — used
    // to place the camera and the pendant light sensibly regardless of
    // room shape.
    let roomCenter = { x: 0, z: 0 };
    if (polygon.length >= 3) {
        const centroid = polygonCentroid(polygon);
        roomCenter = toFeet(centroid.x, centroid.y);
    }

    // The room outline in world feet — used both for the floor/ceiling mesh
    // and, back in the screen component, as the walk-collision boundary.
    const roomPolygon = polygon.map((p) => toFeet(p.x, p.y));

    // Floor + ceiling share the same footprint shape. The shape is authored
    // in (x = feet-x, y = feet-z); rotating +90° about X maps that y onto
    // world +z so the floor lines up with the walls (a -90° rotation would
    // mirror it in z, which only shows up in non-rectangular rooms).
    const shapePts = roomPolygon.map((f) => new THREE.Vector2(f.x, f.z));
    if (shapePts.length >= 3) {
        const shape = new THREE.Shape(shapePts);

        const floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(Math.PI / 2);
        const floor = new THREE.Mesh(
            floorGeo,
            new THREE.MeshStandardMaterial({
                map: makeWoodFloorTexture(maxAnisotropy),
                side: THREE.DoubleSide,
                roughness: 0.6,
                metalness: 0.02,
            })
        );
        scene.add(floor);

        const ceilingGeo = new THREE.ShapeGeometry(shape);
        ceilingGeo.rotateX(Math.PI / 2);
        ceilingGeo.translate(0, ceilingHeight, 0);
        const ceiling = new THREE.Mesh(
            ceilingGeo,
            new THREE.MeshStandardMaterial({
                color: CEILING_COLOR,
                side: THREE.DoubleSide,
                roughness: 0.98,
            })
        );
        scene.add(ceiling);
    }

    // Shared source texture for walls — cloned per panel so each can tile it
    // at a scale matching its own dimensions.
    const wallTexBase = makeWallTexture(maxAnisotropy);
    const baseboardMaterial = new THREE.MeshStandardMaterial({
        color: BASEBOARD_COLOR,
        side: THREE.DoubleSide,
        roughness: 0.55,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: GLASS_COLOR,
        transparent: true,
        opacity: 0.24,
        roughness: 0.06,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: FRAME_COLOR,
        roughness: 0.5,
        side: THREE.DoubleSide,
    });
    const doorLeafMaterial = new THREE.MeshStandardMaterial({
        color: DOOR_COLOR,
        roughness: 0.55,
        side: THREE.DoubleSide,
    });
    const handleMaterial = new THREE.MeshStandardMaterial({
        color: HANDLE_COLOR,
        metalness: 0.8,
        roughness: 0.3,
    });
    const makeWallMat = (segLen, segH) => {
        const tex = wallTexBase.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, segLen / 2.5), Math.max(1, segH / 2.5));
        return new THREE.MeshStandardMaterial({
            map: tex,
            side: THREE.DoubleSide,
            roughness: 0.95,
        });
    };

    // Walls: each drawn segment is rebuilt as a set of boxes around its
    // openings — a floor-to-header gap for doors, a sill-to-header gap (with
    // a glass pane) for windows — plus a baseboard interrupted at doorways.
    walls.forEach((w) => {
        const a = toFeet(w.x1, w.y1);
        const b = toFeet(w.x2, w.y2);
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 0.01) return;
        const height = (w.heightIn ?? DEFAULT_HEIGHT_IN) / 12;
        const thickness = (w.thicknessIn ?? DEFAULT_THICKNESS_IN) / 12;
        const angle = Math.atan2(b.z - a.z, b.x - a.x);
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const dir = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };

        // Place a mesh at local offset `cu` (feet along the wall from its
        // midpoint) and world height `cy`, oriented along the wall.
        const place = (mesh, cu, cy) => {
            mesh.position.set(mid.x + dir.x * cu, cy, mid.z + dir.z * cu);
            mesh.rotation.y = -angle;
            scene.add(mesh);
        };
        const addPanel = (u0, u1, y0, y1) => {
            const segLen = u1 - u0;
            const segH = y1 - y0;
            if (segLen <= 0.002 || segH <= 0.002) return;
            const geo = new THREE.BoxGeometry(segLen, segH, thickness);
            place(new THREE.Mesh(geo, makeWallMat(segLen, segH)), (u0 + u1) / 2, (y0 + y1) / 2);
        };

        // Openings as intervals along the wall (u from -L/2..L/2), clamped
        // to the wall and sorted so we can walk left-to-right.
        const openings = (w.openings ?? [])
            .map((op) => {
                const width = op.width / PIXELS_PER_FOOT;
                const cu = (op.t - 0.5) * L;
                const kind = op.kind || "window";
                // Doors and plain openings are floor-to-header gaps you can
                // walk through; windows sit above a sill.
                const floorGap = kind === "door" || kind === "opening";
                const sill = floorGap ? 0 : Math.min(WINDOW_SILL_FT, height * 0.45);
                const head = floorGap
                    ? Math.min(DOOR_HEIGHT_FT, height - 0.03)
                    : Math.min(sill + WINDOW_HEIGHT_FT, height - 0.03);
                return {
                    u0: Math.max(-L / 2, cu - width / 2),
                    u1: Math.min(L / 2, cu + width / 2),
                    sill,
                    head,
                    kind,
                    floorGap,
                    hinge: op.hinge,
                    flip: op.flip,
                };
            })
            .filter((o) => o.u1 - o.u0 > 0.02)
            .sort((p, q) => p.u0 - q.u0);

        const LINE = 0.06; // thickness of the white jamb-lining boards

        // A cased window: white jamb lining around the reveal, a glass pane,
        // cross mullions, and a small sill board.
        const buildWindow = (o) => {
            const wOpen = o.u1 - o.u0;
            const cuC = (o.u0 + o.u1) / 2;
            const cyC = (o.sill + o.head) / 2;
            const gH = o.head - o.sill;
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, gH, thickness), frameMaterial), o.u0 + LINE / 2, cyC);
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, gH, thickness), frameMaterial), o.u1 - LINE / 2, cyC);
            place(new THREE.Mesh(new THREE.BoxGeometry(wOpen, LINE, thickness), frameMaterial), cuC, o.head - LINE / 2);
            place(new THREE.Mesh(new THREE.BoxGeometry(wOpen, LINE, thickness), frameMaterial), cuC, o.sill + LINE / 2);

            const glassW = wOpen - 2 * LINE;
            const glassHt = gH - 2 * LINE;
            place(new THREE.Mesh(new THREE.BoxGeometry(glassW, glassHt, 0.02), glassMaterial), cuC, cyC);
            // cross mullions dividing the glass into panes
            place(new THREE.Mesh(new THREE.BoxGeometry(0.04, glassHt, 0.06), frameMaterial), cuC, cyC);
            place(new THREE.Mesh(new THREE.BoxGeometry(glassW, 0.04, 0.06), frameMaterial), cuC, cyC);
            // sill board, protruding slightly into the room on both faces
            place(
                new THREE.Mesh(
                    new THREE.BoxGeometry(wOpen + 0.14, 0.08, thickness + 0.18),
                    frameMaterial
                ),
                cuC,
                o.sill + LINE
            );
        };

        // A doorway: white jamb lining plus an actual door leaf hung on its
        // hinge (from the 2D hinge/flip data), rendered ajar, with a handle.
        const buildDoor = (o) => {
            const wOpen = o.u1 - o.u0;
            const cuC = (o.u0 + o.u1) / 2;
            const top = o.head;
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, top, thickness), frameMaterial), o.u0 + LINE / 2, top / 2);
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, top, thickness), frameMaterial), o.u1 - LINE / 2, top / 2);
            place(new THREE.Mesh(new THREE.BoxGeometry(wOpen, LINE, thickness), frameMaterial), cuC, top - LINE / 2);

            const leafW = wOpen - 2 * LINE - 0.03;
            const leafH = top - LINE - 0.06;
            const leafThk = 0.14;
            // Hinge at the 'a' (u0) end by default; leaf extends toward the
            // opposite jamb. flip mirrors which way it swings open.
            const hingeAtU0 = o.hinge !== "b";
            const hingeU = hingeAtU0 ? o.u0 + LINE : o.u1 - LINE;
            const dirSign = hingeAtU0 ? 1 : -1;

            const pivot = new THREE.Group();
            pivot.position.set(mid.x + dir.x * hingeU, 0, mid.z + dir.z * hingeU);
            const base = -angle;
            const target = DOOR_OPEN_RAD * (o.flip ? 1 : -1) * dirSign;
            pivot.rotation.y = base; // starts closed; render loop swings it open
            scene.add(pivot);
            doors.push({ pivot, base, target });

            const leaf = new THREE.Mesh(
                new THREE.BoxGeometry(leafW, leafH, leafThk),
                doorLeafMaterial
            );
            leaf.position.set((dirSign * leafW) / 2, 0.03 + leafH / 2, 0);
            pivot.add(leaf);

            // handle knobs on both faces, near the leaf's free edge
            const hx = dirSign * (leafW - 0.16);
            const hy = 3.0;
            [leafThk / 2 + 0.03, -leafThk / 2 - 0.03].forEach((hz) => {
                const knob = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 10, 8),
                    handleMaterial
                );
                knob.position.set(hx, hy, hz);
                pivot.add(knob);
            });
        };

        // A plain cased pass-through: the same white jamb lining as a door,
        // but no leaf and no glass — just an open archway you can walk through.
        const buildOpening = (o) => {
            const wOpen = o.u1 - o.u0;
            const cuC = (o.u0 + o.u1) / 2;
            const top = o.head;
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, top, thickness), frameMaterial), o.u0 + LINE / 2, top / 2);
            place(new THREE.Mesh(new THREE.BoxGeometry(LINE, top, thickness), frameMaterial), o.u1 - LINE / 2, top / 2);
            place(new THREE.Mesh(new THREE.BoxGeometry(wOpen, LINE, thickness), frameMaterial), cuC, top - LINE / 2);
        };

        let cursor = -L / 2;
        openings.forEach((o) => {
            if (o.u0 > cursor) addPanel(cursor, o.u0, 0, height); // solid before
            if (o.sill > 0) addPanel(o.u0, o.u1, 0, o.sill); // wall below window
            if (o.head < height) addPanel(o.u0, o.u1, o.head, height); // header
            if (o.kind === "door") buildDoor(o);
            else if (o.kind === "opening") buildOpening(o);
            else buildWindow(o);
            cursor = Math.max(cursor, o.u1);
        });
        if (cursor < L / 2) addPanel(cursor, L / 2, 0, height); // solid after

        // Baseboard along the foot, interrupted at any floor-level gap
        // (doors and openings); windows leave the floor line intact.
        const addBase = (u0, u1) => {
            const segLen = u1 - u0;
            if (segLen <= 0.01) return;
            const geo = new THREE.BoxGeometry(segLen, BASEBOARD_HEIGHT_FT, thickness + 0.06);
            place(new THREE.Mesh(geo, baseboardMaterial), (u0 + u1) / 2, BASEBOARD_HEIGHT_FT / 2);
        };
        let bc = -L / 2;
        openings
            .filter((o) => o.floorGap)
            .forEach((o) => {
                if (o.u0 > bc) addBase(bc, o.u0);
                bc = Math.max(bc, o.u1);
            });
        if (bc < L / 2) addBase(bc, L / 2);

        // Collision spans: the wall minus its doorways (same gaps as the
        // baseboard). Each solid span becomes a segment the camera bumps
        // into; the door gaps are left open so you can walk through them.
        const pushSeg = (u0, u1) => {
            if (u1 - u0 < 0.05) return;
            collisionSegments.push({
                ax: mid.x + dir.x * u0,
                az: mid.z + dir.z * u0,
                bx: mid.x + dir.x * u1,
                bz: mid.z + dir.z * u1,
            });
        };
        let cc = -L / 2;
        openings
            .filter((o) => o.floorGap)
            .forEach((o) => {
                if (o.u0 > cc) pushSeg(cc, o.u0);
                cc = Math.max(cc, o.u1);
            });
        if (cc < L / 2) pushSeg(cc, L / 2);
    });

    // Lighting: a hemisphere fill (warm floor bounce / cool ceiling), a warm
    // pendant point light, and a soft directional for surface definition.
    scene.add(new THREE.HemisphereLight("#FFFFFF", "#8A7A66", 0.55));
    const dir = new THREE.DirectionalLight("#FFFFFF", 0.18);
    dir.position.set(roomCenter.x + 3, ceilingHeight + 2, roomCenter.z + 3);
    scene.add(dir);
    const bulb = new THREE.PointLight("#FFF0D2", 0.85, 45, 2);
    bulb.position.set(roomCenter.x, ceilingHeight - 2.2, roomCenter.z);
    scene.add(bulb);

    // A simple pendant lamp mesh (cord + shade) purely for visual flavor.
    const cordGeo = new THREE.CylinderGeometry(0.02, 0.02, 2, 6);
    const cord = new THREE.Mesh(
        cordGeo,
        new THREE.MeshStandardMaterial({ color: "#777777" })
    );
    cord.position.set(roomCenter.x, ceilingHeight - 1.1, roomCenter.z);
    scene.add(cord);
    const shadeGeo = new THREE.ConeGeometry(0.45, 0.6, 24, 1, true);
    const shade = new THREE.Mesh(
        shadeGeo,
        new THREE.MeshStandardMaterial({
            color: "#F5EEDD",
            side: THREE.DoubleSide,
            emissive: "#FFF6DD",
            emissiveIntensity: 0.3,
        })
    );
    shade.position.set(roomCenter.x, ceilingHeight - 2.1, roomCenter.z);
    scene.add(shade);

    return { scene, ceilingHeight, roomCenter, doors, collisionSegments };
};

// First-person 3D walkthrough of the traced room: drag anywhere to look
// around, drag the on-screen stick to walk in that direction.
export const Room3DScreen = ({ navigation, route }) => {
    const walls = route.params?.walls ?? [];

    // Explicit, synchronously-available numeric dimensions for the GL
    // surface. gl.drawingBufferWidth/Height (and even RN's own onLayout on
    // an absolutely-positioned wrapper) can report 0 depending on layout
    // timing — driving the renderer/camera from this hook instead sidesteps
    // that whole class of bug.
    const { width: winWidth, height: winHeight } = useWindowDimensions();

    const yawRef = useRef(0);
    const pitchRef = useRef(0);
    const lookStartRef = useRef(null);
    const walkVecRef = useRef({ x: 0, y: 0 }); // x: strafe, y: forward (-1..1)
    const [glError, setGlError] = useState(null);

    const resizeHandlerRef = useRef(null);
    const glCleanupRef = useRef(null);
    const unmountedRef = useRef(false);
    useEffect(() => {
        return () => {
            unmountedRef.current = true;
            // Free the scene's geometries/materials/textures and the renderer so
            // the 3D view's memory is released when you leave it.
            glCleanupRef.current?.();
            glCleanupRef.current = null;
        };
    }, []);

    // Propagate any later window-size change (e.g. orientation) to an
    // already-running renderer/camera.
    useEffect(() => {
        resizeHandlerRef.current?.(winWidth, winHeight);
    }, [winWidth, winHeight]);

    const lookResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                lookStartRef.current = {
                    x: e.nativeEvent.pageX,
                    y: e.nativeEvent.pageY,
                    yaw: yawRef.current,
                    pitch: pitchRef.current,
                };
            },
            onPanResponderMove: (e) => {
                const s = lookStartRef.current;
                if (!s) return;
                const dx = e.nativeEvent.pageX - s.x;
                const dy = e.nativeEvent.pageY - s.y;
                yawRef.current = s.yaw - dx * LOOK_SENSITIVITY;
                pitchRef.current = Math.max(
                    -MAX_PITCH,
                    Math.min(MAX_PITCH, s.pitch - dy * LOOK_SENSITIVITY)
                );
            },
            onPanResponderRelease: () => {
                lookStartRef.current = null;
            },
        })
    ).current;

    const onContextCreate = async (gl) => {
        try {
            console.log(
                "Room3D: context created, gl buffer",
                gl.drawingBufferWidth,
                gl.drawingBufferHeight,
                "using window size",
                winWidth,
                winHeight,
                "walls:",
                walls.length
            );

            // Must match the GLView's native drawing-buffer scale so the scene
            // fills the whole buffer (the buffer is already allocated at this
            // resolution; rendering smaller would just letterbox into a corner).
            const pixelRatio = PixelRatio.get();
            const renderer = new Renderer({ gl });
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(winWidth, winHeight);
            renderer.setClearColor("#DFE3E8");
            // Correct color pipeline: our textures/colors are authored in
            // sRGB, so the renderer must encode its output the same way —
            // without this the whole scene looks flat and washed out.
            renderer.outputEncoding = THREE.sRGBEncoding;

            const maxAnisotropy =
                renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
            const { scene, ceilingHeight, roomCenter, doors, collisionSegments } =
                buildScene(walls, { maxAnisotropy });
            const blocked = (x, z) =>
                collisionSegments.some(
                    (s) => distanceToWallSegment(x, z, s) < WALL_COLLIDE_MARGIN
                );
            console.log(
                "Room3D: scene built, children:",
                scene.children.length,
                "roomCenter:",
                roomCenter
            );

            // Release every GPU/CPU resource when the screen unmounts. Shared
            // materials get disposed more than once (harmless), and each mesh's
            // texture (incl. per-wall clones) is freed via material.map.
            glCleanupRef.current = () => {
                try {
                    scene.traverse((obj) => {
                        obj.geometry?.dispose?.();
                        const mat = obj.material;
                        if (!mat) return;
                        const mats = Array.isArray(mat) ? mat : [mat];
                        for (const m of mats) {
                            m.map?.dispose?.();
                            m.dispose?.();
                        }
                    });
                    renderer.dispose?.();
                } catch (e) {
                    // best-effort cleanup
                }
            };

            const camera = new THREE.PerspectiveCamera(
                70,
                winWidth / winHeight,
                0.05,
                1000
            );
            camera.rotation.order = "YXZ";
            camera.position.set(
                roomCenter.x,
                Math.min(EYE_HEIGHT_FT, ceilingHeight - 0.5),
                roomCenter.z
            );

            // If a real layout event arrives after this (or with a
            // different size than our fallback guess), resize live.
            resizeHandlerRef.current = (width, height) => {
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            };

            const forward = new THREE.Vector3();
            const right = new THREE.Vector3();
            let last = Date.now();
            const openStart = Date.now();
            let stopped = false;

            const loop = () => {
                if (stopped || unmountedRef.current) return;
                try {
                    requestAnimationFrame(loop);
                    const now = Date.now();
                    const dt = Math.min(0.1, (now - last) / 1000);
                    last = now;

                    // Swing doors open once on entry (ease-out cubic).
                    if (doors.length) {
                        const p = Math.min(1, (now - openStart) / DOOR_OPEN_MS);
                        const eased = 1 - Math.pow(1 - p, 3);
                        for (const d of doors) {
                            d.pivot.rotation.y = d.base + d.target * eased;
                        }
                    }

                    camera.rotation.set(pitchRef.current, yawRef.current, 0, "YXZ");

                    const walk = walkVecRef.current;
                    if (walk.x !== 0 || walk.y !== 0) {
                        camera.getWorldDirection(forward);
                        forward.y = 0;
                        if (forward.lengthSq() > 0) forward.normalize();
                        right.crossVectors(forward, camera.up).normalize();

                        const step = WALK_SPEED * dt;
                        const moveX =
                            -walk.y * forward.x * step + walk.x * right.x * step;
                        const moveZ =
                            -walk.y * forward.z * step + walk.x * right.z * step;

                        const curX = camera.position.x;
                        const curZ = camera.position.z;
                        const nextX = curX + moveX;
                        const nextZ = curZ + moveZ;

                        // Bump into solid walls, but walk freely through door
                        // gaps (and anywhere with no wall). Try the full move,
                        // else slide along whichever single axis is still clear
                        // rather than freezing against the wall.
                        if (!blocked(nextX, nextZ)) {
                            camera.position.x = nextX;
                            camera.position.z = nextZ;
                        } else if (!blocked(nextX, curZ)) {
                            camera.position.x = nextX;
                        } else if (!blocked(curX, nextZ)) {
                            camera.position.z = nextZ;
                        }
                    }

                    renderer.render(scene, camera);
                    gl.endFrameEXP();
                } catch (err) {
                    stopped = true;
                    console.error("Room3D render loop error:", err);
                    report(err, { feature: "3d", phase: "render-loop" });
                    setGlError(`render loop: ${err?.message ?? err}`);
                }
            };
            loop();
        } catch (err) {
            console.error("Room3D setup error:", err);
            report(err, { feature: "3d", phase: "setup" });
            setGlError(`setup: ${err?.message ?? err}`);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View
                style={[styles.glWrap, { width: winWidth, height: winHeight }]}
                {...lookResponder.panHandlers}
            >
                <GLView
                    style={{ width: winWidth, height: winHeight }}
                    msaaSamples={2}
                    onContextCreate={onContextCreate}
                />
            </View>

            {walls.length === 0 && (
                <View style={styles.centerMessage} pointerEvents="none">
                    <Text style={styles.centerMessageText}>
                        No room data was passed to this screen.
                    </Text>
                </View>
            )}

            {glError && (
                <View style={styles.errorBox} pointerEvents="none">
                    <Text style={styles.errorText}>{glError}</Text>
                </View>
            )}

            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.85}
                    style={styles.iconButton}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={26} color="#FFFFFF" />
                </AnimatedPressable>
            </View>

            {/* Bottom controls */}
            <View style={styles.bottomBar} pointerEvents="box-none">
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Text style={styles.twoD}>2D</Text>
                    <Text style={styles.toolLabel}>Open 2D plan</Text>
                </AnimatedPressable>

                <Joystick onChange={(v) => (walkVecRef.current = v)} />

                {/* Spacer keeps the joystick centered opposite the 2D button */}
                <View style={styles.tool} />
            </View>
        </SafeAreaView>
    );
};

// Draggable walk stick. The knob's visual offset is driven by an Animated
// value (so dragging never triggers a screen re-render); the normalized
// direction is reported to the parent via `onChange` for the render loop.
const Joystick = ({ onChange }) => {
    const anim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (_e, gs) => {
                const d = Math.hypot(gs.dx, gs.dy);
                const clamped = d > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / d : 1;
                const kx = gs.dx * clamped;
                const ky = gs.dy * clamped;
                anim.setValue({ x: kx, y: ky });
                onChange({ x: kx / JOYSTICK_RADIUS, y: ky / JOYSTICK_RADIUS });
            },
            onPanResponderRelease: () => {
                anim.setValue({ x: 0, y: 0 });
                onChange({ x: 0, y: 0 });
            },
        })
    ).current;

    return (
        <View style={styles.stickBase} {...responder.panHandlers}>
            <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.7)" style={styles.stickChevronUp} />
            <Animated.View
                style={[styles.stickKnob, { transform: anim.getTranslateTransform() }]}
            >
                <Text style={styles.stickLabel}>360°</Text>
            </Animated.View>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" style={styles.stickChevronDown} />
        </View>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#000000",
    },
    glWrap: {
        position: "absolute",
        top: 0,
        left: 0,
    },
    centerMessage: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
    },
    centerMessageText: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 15,
        fontWeight: "600",
        textAlign: "center",
    },
    errorBox: {
        position: "absolute",
        top: 60,
        left: 16,
        right: 16,
        backgroundColor: "rgba(200,30,30,0.92)",
        borderRadius: 12,
        padding: 14,
    },
    errorText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "600",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    headerRight: {
        flexDirection: "row",
    },
    iconButton: {
        paddingHorizontal: 9,
        paddingVertical: 6,
        borderRadius: radius.pill,
    },
    searchRow: {
        position: "absolute",
        right: 16,
        bottom: 118,
        alignItems: "flex-end",
    },
    searchPill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.85)",
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    searchText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.textMuted,
        marginLeft: 6,
    },
    bottomBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 28,
        paddingBottom: 30,
        paddingTop: 8,
    },
    tool: {
        alignItems: "center",
        minWidth: 72,
    },
    twoD: {
        fontSize: 24,
        fontWeight: "900",
        color: "#FFFFFF",
        lineHeight: 28,
    },
    toolLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#FFFFFF",
        marginTop: 4,
        textAlign: "center",
    },
    stickBase: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
    },
    stickKnob: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "rgba(20,20,20,0.85)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)",
        alignItems: "center",
        justifyContent: "center",
    },
    stickLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    stickChevronUp: {
        position: "absolute",
        top: 2,
    },
    stickChevronDown: {
        position: "absolute",
        bottom: 2,
    },
});
