import { Ionicons } from "@expo/vector-icons";
import { GLView } from "expo-gl";
import { Renderer } from "expo-three";
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    ActivityIndicator,
    Animated,
    PanResponder,
    PixelRatio,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import * as THREE from "three";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { chainRoom, roomOutline } from "../../utils/roomGeometry";
import { buildFurniture, insideCollider } from "../../utils/furniture3D";
import { floorsFromParams, floorShortLabel } from "../../utils/floors";
import { createCameraRig } from "./cameraRig";
import {
    addEnvironment,
    addFurnitureShadows,
    addWallOcclusion,
    groupWalls,
    HORIZON,
    updateWallCutaway,
} from "./sceneExtras";
import { report } from "../../utils/report";
import { colors, radius } from "../../utils/theme";

const PIXELS_PER_FOOT = 26; // matches the assumed drawing scale used in PlanPreviewScreen
const DEFAULT_HEIGHT_IN = 118; // 9'10", matches WallSizeSheet's default
const DEFAULT_THICKNESS_IN = 8;
const WALL_COLLIDE_MARGIN = 0.28; // how close the camera may get to a solid wall segment
const FURNITURE_COLLIDE_MARGIN = 0.35; // and to the edge of a piece of furniture
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

// Builds the Three.js scene (floor, ceiling, extruded walls, furniture, a
// pendant light) from the 2D plan, in feet, centered on the room.
const buildScene = (walls, { maxAnisotropy = 1, furniture = [], origin = null } = {}) => {
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
    // A multi-floor building passes one shared origin so every floor lines up.
    const centerX = origin ? origin.x : xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const centerY = origin ? origin.y : ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
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
    let ceilingMesh = null; // exposed so the dollhouse/top views can hide it
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
        ceilingMesh = ceiling;
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

    // Per-wall records for the screen: the meshes each wall produced (so the
    // dollhouse view can lower walls facing the camera), its frame, and the
    // solid spans between doorways (for the floor occlusion strips).
    const wallParts = [];

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
        const firstChild = scene.children.length;

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

        const solidSpans = [];
        let sc = -L / 2;
        openings
            .filter((o) => o.floorGap)
            .forEach((o) => {
                if (o.u0 > sc) solidSpans.push([sc, o.u0]);
                sc = Math.max(sc, o.u1);
            });
        if (sc < L / 2) solidSpans.push([sc, L / 2]);
        wallParts.push({
            objects: scene.children.slice(firstChild),
            mid,
            dir,
            n: { x: -dir.z, z: dir.x },
            angle,
            thickness,
            solidSpans,
        });
    });

    // Furniture placed in the 2D plan, built from the shared catalog in the
    // same content → feet mapping as the walls.
    const { group: furnitureGroup, colliders: furnitureColliders } = buildFurniture(
        furniture,
        toFeet
    );
    scene.add(furnitureGroup);

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

    return {
        scene,
        ceilingHeight,
        roomCenter,
        doors,
        collisionSegments,
        furnitureColliders,
        wallParts,
        ceilingMesh,
        pendant: [cord, shade],
        roomPolygon,
        toFeet,
    };
};

const SLAB_COLOR = "#E9E5DE";

// A floor slab: the room outline extruded `depth` feet downward from the
// floor level, with optional holes (stairwells) as world-feet polygons.
const floorSlabGeometry = (outline, depth, holes = []) => {
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.z)));
    (holes ?? []).forEach((h) => shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.z)))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    // Shape (x, y) → world (x, z); extrusion (+z) → downward. Sit a hair
    // below the floor surface so the wood floor isn't z-fighting the slab top.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, -0.01, 0);
    return geo;
};

// Builds every floor of a design with buildScene, stacked at its elevation
// in one scene sharing a single origin. Each floor lives in its own group (so
// the 3D floor picker can hide the ones above), with its contact shadows,
// wall occlusion and cutaway wall groups. Returns per-floor data for the
// camera (walk collision, room center, ceiling) plus the overall bounds.
const buildBuilding = (floors, { maxAnisotropy = 1 } = {}) => {
    const scene = new THREE.Scene();
    // Shared origin: the center of every floor's walls together.
    const pts = floors.flatMap((f) => (f.walls ?? []).flatMap((w) => [w.x1, w.y1, w.x2, w.y2]));
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    const origin = xs.length
        ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
        : { x: 0, y: 0 };

    let elevIn = 0;
    const levels = floors.map((f, i) => {
        const base = elevIn / 12;
        elevIn += f.heightIn || 120;
        const group = new THREE.Group();
        group.position.y = base;
        scene.add(group);
        if (!f.walls?.length) {
            return { group, base, empty: true, doors: [], wallGroups: [], pendant: [], ceilingMesh: null };
        }
        const r = buildScene(f.walls, { maxAnisotropy, furniture: f.furniture ?? [], origin });
        // Move the floor's meshes into its group. Upper floors drop the
        // scene-wide fill lights (only one set is needed) but keep their
        // own pendant lamp.
        [...r.scene.children].forEach((o) => {
            if (i > 0 && (o.isHemisphereLight || o.isDirectionalLight)) return;
            group.add(o);
        });
        // Upper floors sit on a slab filling the gap down to the walls below.
        if (i > 0 && r.roomPolygon.length >= 3) {
            const below = floors[i - 1];
            const belowWallFt = Math.max(
                ...(below.walls?.length ? below.walls : [{}]).map((w) => (w.heightIn ?? DEFAULT_HEIGHT_IN) / 12)
            );
            const depth = Math.min(1.5, Math.max(0.15, (below.heightIn || 120) / 12 - belowWallFt));
            const slab = new THREE.Mesh(
                floorSlabGeometry(r.roomPolygon, depth, f.slabHoles),
                new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.9 })
            );
            group.add(slab);
        }
        addFurnitureShadows(group, f.furniture ?? [], r.toFeet);
        addWallOcclusion(group, r.wallParts);
        const wallGroups = groupWalls(group, r.wallParts, r.roomCenter);

        // Walk collision for this floor (see the single-floor notes below).
        const furnitureSegments = r.furnitureColliders
            .filter((c) => !insideCollider(c, r.roomCenter.x, r.roomCenter.z))
            .flatMap((c) => c.segs);
        const blocked = (x, z) =>
            r.collisionSegments.some((sg) => distanceToWallSegment(x, z, sg) < WALL_COLLIDE_MARGIN) ||
            furnitureSegments.some((sg) => distanceToWallSegment(x, z, sg) < FURNITURE_COLLIDE_MARGIN);

        return {
            group,
            base,
            empty: false,
            doors: r.doors,
            wallGroups,
            ceilingMesh: r.ceilingMesh,
            pendant: r.pendant,
            roomCenter: r.roomCenter,
            ceilingHeight: r.ceilingHeight,
            roomPolygon: r.roomPolygon,
            blocked,
            toFeet: r.toFeet,
        };
    });

    // Floors with no walls borrow the nearest floor's footprint for the camera.
    const solid = levels.filter((l) => !l.empty);
    const fallback = solid[0];
    levels.forEach((l) => {
        if (!l.empty || !fallback) return;
        Object.assign(l, {
            roomCenter: fallback.roomCenter,
            ceilingHeight: fallback.ceilingHeight,
            roomPolygon: fallback.roomPolygon,
            blocked: () => false,
        });
    });
    const allPts = solid.flatMap((l) => l.roomPolygon ?? []);
    return { scene, levels, allPts, origin };
};

// Bounding box of the room outline in world feet.
const roomBounds = (pts, fallback) => {
    if (!pts || pts.length < 3) {
        return { minX: fallback.x - 6, maxX: fallback.x + 6, minZ: fallback.z - 6, maxZ: fallback.z + 6 };
    }
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
    };
};

const MODES = [
    { key: "orbit", label: "Orbit", icon: "cube-outline" },
    { key: "top", label: "Top", icon: "map-outline" },
    { key: "walk", label: "Walk", icon: "walk-outline" },
];

const HINTS = {
    orbit: "Drag to spin · Pinch to zoom · Two fingers to move · Double-tap to focus",
    top: "Drag to move · Pinch to zoom · Double-tap to focus",
    walk: "Drag to look around · Use the stick to walk · Double-tap the floor to go there",
};
const HINTS_KEY = "room3d.hintsSeen.v1";
const HINT_MS = 4200;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;

// 3D view of the plan with three camera modes — Orbit (dollhouse, default),
// Top (plan view) and Walk (first person) — plus soft shadows, a sky and a
// render-on-demand loop that stops drawing when nothing moves.
export const Room3DScreen = ({ navigation, route }) => {
    const planName = route.params?.name;
    // Every floor of the design (a single floor for older plans).
    const floors = useRef(floorsFromParams(route.params)).current;
    const startFloor = Math.min(route.params?.floorIndex ?? 0, floors.length - 1);
    const hasAnyWalls = floors.some((f) => f.walls?.length);

    // Explicit, synchronously-available numeric dimensions for the GL
    // surface. gl.drawingBufferWidth/Height (and even RN's own onLayout on
    // an absolutely-positioned wrapper) can report 0 depending on layout
    // timing — driving the renderer/camera from this hook instead sidesteps
    // that whole class of bug.
    const { width: winWidth, height: winHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const winRef = useRef({ w: winWidth, h: winHeight });
    winRef.current = { w: winWidth, h: winHeight };

    const [mode, setModeState] = useState("orbit");
    // Which floor is in focus: it and every floor below are shown, the ones
    // above are hidden; Walk mode walks on it.
    const [focusFloor, setFocusFloorState] = useState(startFloor);
    const focusRef = useRef(startFloor);
    const levelsRef = useRef(null);
    const modeRef = useRef("orbit");
    const [ready, setReady] = useState(false);
    const [hint, setHint] = useState(null);
    const [glError, setGlError] = useState(null);

    const rigRef = useRef(null);
    const dirtyRef = useRef(true); // force a redraw on the next frame
    const floorTapRef = useRef(null); // (screenX, screenY) → world floor tap, set once GL is up
    const resizeHandlerRef = useRef(null);
    const glCleanupRef = useRef(null);
    const unmountedRef = useRef(false);
    const hintsSeenRef = useRef({});
    const hintTimer = useRef(null);
    const hintOpacity = useRef(new Animated.Value(0)).current;
    const loaderOpacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        return () => {
            unmountedRef.current = true;
            clearTimeout(hintTimer.current);
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

    // --- hints: shown once per mode (remembered across launches) ---------
    const showHint = (m) => {
        if (hintsSeenRef.current[m]) return;
        hintsSeenRef.current = { ...hintsSeenRef.current, [m]: true };
        AsyncStorage.setItem(HINTS_KEY, JSON.stringify(hintsSeenRef.current)).catch(() => {});
        clearTimeout(hintTimer.current);
        setHint(HINTS[m]);
        Animated.timing(hintOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        hintTimer.current = setTimeout(() => {
            Animated.timing(hintOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(
                () => !unmountedRef.current && setHint(null)
            );
        }, HINT_MS);
    };

    useEffect(() => {
        AsyncStorage.getItem(HINTS_KEY)
            .then((raw) => {
                try {
                    hintsSeenRef.current = raw ? JSON.parse(raw) : {};
                } catch {
                    hintsSeenRef.current = {};
                }
            })
            .catch(() => {})
            .finally(() => !unmountedRef.current && showHint("orbit"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fade the "Building your room…" overlay out after the first frame.
    useEffect(() => {
        if (ready) {
            Animated.timing(loaderOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
        }
    }, [ready, loaderOpacity]);

    const changeMode = (m) => {
        if (m === mode) return;
        setModeState(m);
        modeRef.current = m;
        rigRef.current?.setMode(m);
        dirtyRef.current = true;
        showHint(m);
    };

    const resetView = () => {
        rigRef.current?.reset();
        dirtyRef.current = true;
    };

    // Focus a floor: show it and the floors below, hide the ones above, and
    // move the camera to its level. `teleport` is false when walking up or
    // down stairs (the walker is carried there instead).
    const setFocusFloor = (i, teleport = true) => {
        const levels = levelsRef.current;
        focusRef.current = i;
        setFocusFloorState(i);
        if (!levels || !rigRef.current) return;
        levels.forEach((l, j) => (l.group.visible = j <= i));
        rigRef.current.setLevel(
            {
                baseY: levels[i].base,
                blocked: levels[i].blocked,
                roomCenter: levels[i].roomCenter,
                ceilingHeight: levels[i].ceilingHeight,
            },
            teleport
        );
        dirtyRef.current = true;
    };

    // --- gestures on the 3D surface ----------------------------------------
    // One finger: orbit / pan / look (by mode). Two fingers: pinch + pan.
    // Quick double tap: focus (orbit/top) or glide there (walk).
    const gestureRef = useRef(null);
    const lastTapRef = useRef({ t: 0, x: 0, y: 0 });

    const touchPoints = (e) =>
        (e.nativeEvent.touches || []).map((t) => ({ x: t.pageX, y: t.pageY, lx: t.locationX, ly: t.locationY }));

    const surfaceResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e) => {
                const pts = touchPoints(e);
                const p = pts[0] || { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
                gestureRef.current = {
                    start: { x: p.x, y: p.y, lx: e.nativeEvent.locationX, ly: e.nativeEvent.locationY },
                    last: { x: p.x, y: p.y },
                    lastT: Date.now(),
                    vx: 0,
                    moved: 0,
                    multi: false,
                    pinch: null,
                    t0: Date.now(),
                };
            },
            onPanResponderMove: (e) => {
                const g = gestureRef.current;
                const rig = rigRef.current;
                if (!g || !rig) return;
                const pts = touchPoints(e);
                const h = winRef.current.h;
                if (pts.length >= 2) {
                    const [a, b] = pts;
                    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                    if (g.pinch) {
                        rig.zoom(g.pinch.dist / dist);
                        rig.pan(mid.x - g.pinch.mid.x, mid.y - g.pinch.mid.y, h);
                    }
                    g.pinch = { dist, mid };
                    g.multi = true;
                    g.moved = Infinity;
                    dirtyRef.current = true;
                    return;
                }
                if (pts.length !== 1) return;
                const p = pts[0];
                if (g.pinch) {
                    // Pinch winding down to one finger: restart from here
                    // instead of jumping.
                    g.pinch = null;
                    g.last = { x: p.x, y: p.y };
                    return;
                }
                const dx = p.x - g.last.x;
                const dy = p.y - g.last.y;
                const now = Date.now();
                const dt = Math.max(1, now - g.lastT) / 1000;
                g.vx = g.vx * 0.6 + (dx / dt) * 0.4;
                g.last = { x: p.x, y: p.y };
                g.lastT = now;
                g.moved = Math.max(g.moved, Math.hypot(p.x - g.start.x, p.y - g.start.y));
                rig.drag(dx, dy, h);
                dirtyRef.current = true;
            },
            onPanResponderRelease: () => {
                const g = gestureRef.current;
                gestureRef.current = null;
                const rig = rigRef.current;
                if (!g || !rig) return;
                const isTap = !g.multi && g.moved < TAP_SLOP && Date.now() - g.t0 < 350;
                if (isTap) {
                    const last = lastTapRef.current;
                    const now = Date.now();
                    if (
                        now - last.t < DOUBLE_TAP_MS &&
                        Math.hypot(g.start.x - last.x, g.start.y - last.y) < 40
                    ) {
                        floorTapRef.current?.(g.start.lx, g.start.ly);
                        lastTapRef.current = { t: 0, x: 0, y: 0 };
                    } else {
                        lastTapRef.current = { t: now, x: g.start.x, y: g.start.y };
                    }
                    return;
                }
                // Let an orbit spin coast if the finger was still moving.
                if (!g.multi && Date.now() - g.lastT < 80) rig.fling(g.vx);
                dirtyRef.current = true;
            },
            onPanResponderTerminate: () => {
                gestureRef.current = null;
            },
        })
    ).current;

    const onContextCreate = async (gl) => {
        try {
            // Must match the GLView's native drawing-buffer scale so the scene
            // fills the whole buffer (the buffer is already allocated at this
            // resolution; rendering smaller would just letterbox into a corner).
            const pixelRatio = PixelRatio.get();
            const renderer = new Renderer({ gl });
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(winWidth, winHeight);
            renderer.setClearColor(HORIZON);
            // Our textures/colors are authored in sRGB; filmic tone mapping
            // rolls off bright highlights (lamps, white walls) gracefully and
            // gives richer contrast at no measurable cost.
            renderer.outputEncoding = THREE.sRGBEncoding;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.95;

            const maxAnisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
            // Furniture you'd bump into blocks walking too — except any piece
            // the camera starts inside (e.g. a table at the room's center),
            // which would otherwise trap you. (Handled per floor in buildBuilding.)
            const { scene, levels, allPts } = buildBuilding(floors, { maxAnisotropy });
            levelsRef.current = levels;
            const disposeEnv = addEnvironment(scene);
            const doors = levels.flatMap((l) => l.doors);
            const wallGroups = levels.flatMap((l) => l.wallGroups);
            const start = levels[focusRef.current];
            levels.forEach((l, i) => (l.group.visible = i <= focusRef.current));

            // Release every GPU/CPU resource when the screen unmounts.
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
                    disposeEnv();
                    renderer.dispose?.();
                } catch (e) {
                    // best-effort cleanup
                }
            };

            const rig = createCameraRig({
                bounds: roomBounds(allPts, start.roomCenter),
                roomCenter: start.roomCenter,
                ceilingHeight: start.ceilingHeight,
                blocked: start.blocked,
                baseY: start.base,
                aspect: winWidth / winHeight,
            });
            rig.setMode(modeRef.current);
            rigRef.current = rig;

            const camera = new THREE.PerspectiveCamera(rig.fov, winWidth / winHeight, 0.05, 600);

            resizeHandlerRef.current = (width, height) => {
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                rig.setAspect(width / height);
                dirtyRef.current = true;
            };

            // Double-tap → the point on the floor under the finger.
            const raycaster = new THREE.Raycaster();
            const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const hit = new THREE.Vector3();
            floorTapRef.current = (sx, sy) => {
                const { w, h } = winRef.current;
                floorPlane.constant = -rig.baseY; // the focused floor's level
                raycaster.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), camera);
                if (raycaster.ray.intersectPlane(floorPlane, hit)) {
                    rig.floorTap(hit.x, hit.z);
                    dirtyRef.current = true;
                }
            };

            let last = Date.now();
            const openStart = Date.now();
            let doorsDone = doors.length === 0;
            let stopped = false;
            let firstFrame = true;
            let shownMode = null;
            const lastPos = new THREE.Vector3(Infinity, 0, 0);
            const lastLook = new THREE.Vector3();
            let lastFov = 0;

            const loop = () => {
                if (stopped || unmountedRef.current) return;
                try {
                    requestAnimationFrame(loop);
                    const now = Date.now();
                    const dt = Math.min(0.1, (now - last) / 1000);
                    last = now;

                    rig.update(dt);
                    let needsDraw = dirtyRef.current || rig.busy;

                    // Ceiling and pendant only make sense from inside.
                    if (shownMode !== rig.mode) {
                        shownMode = rig.mode;
                        const inside = rig.mode === "walk";
                        levels.forEach((l) => {
                            if (l.ceilingMesh) l.ceilingMesh.visible = inside;
                            l.pendant.forEach((m) => (m.visible = inside));
                        });
                        needsDraw = true;
                    }

                    // Swing doors open once on entry (ease-out cubic).
                    if (!doorsDone) {
                        const p = Math.min(1, (now - openStart) / DOOR_OPEN_MS);
                        const eased = 1 - Math.pow(1 - p, 3);
                        for (const d of doors) d.pivot.rotation.y = d.base + d.target * eased;
                        doorsDone = p >= 1;
                        needsDraw = true;
                    }

                    if (updateWallCutaway(wallGroups, rig.mode, rig.pos, dt)) needsDraw = true;

                    // Render on demand: skip the frame entirely when the
                    // camera hasn't moved and nothing is animating — the
                    // last frame stays on screen and the GPU idles.
                    if (
                        lastPos.distanceToSquared(rig.pos) > 1e-7 ||
                        lastLook.distanceToSquared(rig.look) > 1e-7 ||
                        Math.abs(lastFov - rig.fov) > 1e-3
                    ) {
                        needsDraw = true;
                    }
                    if (!needsDraw) return;
                    dirtyRef.current = false;

                    camera.position.copy(rig.pos);
                    camera.lookAt(rig.look);
                    if (Math.abs(camera.fov - rig.fov) > 1e-3) {
                        camera.fov = rig.fov;
                        camera.updateProjectionMatrix();
                    }
                    lastPos.copy(rig.pos);
                    lastLook.copy(rig.look);
                    lastFov = rig.fov;

                    renderer.render(scene, camera);
                    gl.endFrameEXP();
                    if (firstFrame) {
                        firstFrame = false;
                        setReady(true);
                    }
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
            setReady(true);
        }
    };

    return (
        <View style={styles.root}>
            <View
                style={[styles.glWrap, { width: winWidth, height: winHeight }]}
                {...surfaceResponder.panHandlers}
            >
                <GLView
                    style={{ width: winWidth, height: winHeight }}
                    msaaSamples={2}
                    onContextCreate={onContextCreate}
                />
            </View>

            {/* Loading overlay until the first frame is drawn */}
            <Animated.View
                pointerEvents={ready ? "none" : "auto"}
                style={[styles.loader, { opacity: loaderOpacity }]}
            >
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loaderText}>Building your room…</Text>
            </Animated.View>

            {!hasAnyWalls && (
                <View style={styles.centerMessage} pointerEvents="none">
                    <Text style={styles.centerMessageText}>No room data was passed to this screen.</Text>
                </View>
            )}

            {/* Controls overlay. Top and bottom bars are absolutely anchored
                (with the safe-area insets) rather than pushed apart by flex,
                which didn't stretch to full height on iOS. */}
            <View style={[styles.overlay, { width: winWidth, height: winHeight }]} pointerEvents="box-none">
                {/* Top bar: close, plan name, mode switch */}
                <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
                    <View style={styles.titleRow} pointerEvents="box-none">
                        <AnimatedPressable
                            onPress={() => navigation.goBack()}
                            scaleTo={0.85}
                            style={styles.roundButton}
                            hitSlop={8}
                        >
                            <Ionicons name="close" size={22} color="#FFFFFF" />
                        </AnimatedPressable>
                        <View style={styles.titlePill}>
                            <Text style={styles.titleText} numberOfLines={1}>
                                {planName || "3D view"}
                                {floors.length > 1 ? ` · ${floors[focusFloor]?.name}` : ""}
                            </Text>
                        </View>
                        <View style={styles.roundSpacer} />
                    </View>

                    <View style={styles.segment}>
                        {MODES.map((m) => {
                            const active = m.key === mode;
                            return (
                                <AnimatedPressable
                                    key={m.key}
                                    onPress={() => changeMode(m.key)}
                                    scaleTo={0.94}
                                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                                >
                                    <Ionicons
                                        name={m.icon}
                                        size={16}
                                        color={active ? colors.text : "#FFFFFF"}
                                    />
                                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                                        {m.label}
                                    </Text>
                                </AnimatedPressable>
                            );
                        })}
                    </View>
                </View>

                {glError && (
                    <View style={[styles.errorBox, { top: insets.top + 110 }]} pointerEvents="none">
                        <Text style={styles.errorText}>{glError}</Text>
                    </View>
                )}

                <View
                    style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 12) }]}
                    pointerEvents="box-none"
                >
                {/* Floor picker (multi-floor designs): top floor first */}
                {floors.length > 1 && (
                    <View style={[styles.floorPicker, { top: insets.top + 120 }]}>
                        {floors
                            .map((f, i) => i)
                            .reverse()
                            .map((i) => {
                                const active = i === focusFloor;
                                return (
                                    <AnimatedPressable
                                        key={floors[i].id}
                                        onPress={() => setFocusFloor(i)}
                                        scaleTo={0.9}
                                        style={[styles.floorButton, active && styles.floorButtonActive]}
                                    >
                                        <Text style={[styles.floorButtonText, active && styles.floorButtonTextActive]}>
                                            {floorShortLabel(i)}
                                        </Text>
                                    </AnimatedPressable>
                                );
                            })}
                    </View>
                )}

                {/* First-time hint for the current mode */}
                {hint && (
                    <Animated.View style={[styles.hint, { opacity: hintOpacity }]} pointerEvents="none">
                        <Ionicons name="hand-left-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.hintText}>{hint}</Text>
                    </Animated.View>
                )}

                {/* Bottom bar: 2D, joystick (walk only), reset */}
                <View style={styles.bottomBar} pointerEvents="box-none">
                    <AnimatedPressable
                        onPress={() => navigation.goBack()}
                        scaleTo={0.9}
                        style={styles.toolPill}
                    >
                        <Text style={styles.twoD}>2D</Text>
                        <Text style={styles.toolLabel}>Plan</Text>
                    </AnimatedPressable>

                    <AnimatedPressable onPress={resetView} scaleTo={0.9} style={styles.toolPill}>
                        <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
                        <Text style={styles.toolLabel}>Reset</Text>
                    </AnimatedPressable>

                    {/* Walk stick pinned to the exact bottom-center, on its own
                        layer so it stays centered whatever sits either side. */}
                    {mode === "walk" && (
                        <View style={styles.stickLayer} pointerEvents="box-none">
                            <Joystick
                                onChange={(v) => {
                                    rigRef.current?.setStick(v);
                                    dirtyRef.current = true;
                                }}
                            />
                        </View>
                    )}
                </View>
                </View>
            </View>
        </View>
    );
};

// Draggable walk stick. The knob's visual offset is driven by an Animated
// value (so dragging never triggers a screen re-render); the normalized
// direction is reported to the parent via `onChange` for the render loop.
// The rig applies the deadzone and response curve.
const Joystick = ({ onChange }) => {
    const anim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderMove: (_e, gs) => {
                const d = Math.hypot(gs.dx, gs.dy);
                const clamped = d > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / d : 1;
                const kx = gs.dx * clamped;
                const ky = gs.dy * clamped;
                anim.setValue({ x: kx, y: ky });
                onChangeRef.current({ x: kx / JOYSTICK_RADIUS, y: ky / JOYSTICK_RADIUS });
            },
            onPanResponderRelease: () => {
                Animated.spring(anim, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
                onChangeRef.current({ x: 0, y: 0 });
            },
            onPanResponderTerminate: () => {
                anim.setValue({ x: 0, y: 0 });
                onChangeRef.current({ x: 0, y: 0 });
            },
        })
    ).current;

    return (
        <View style={styles.stickBase} {...responder.panHandlers}>
            <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.75)" style={styles.stickChevronUp} />
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.75)" style={styles.stickChevronDown} />
            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.75)" style={styles.stickChevronLeft} />
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.75)" style={styles.stickChevronRight} />
            <Animated.View style={[styles.stickKnob, { transform: anim.getTranslateTransform() }]}>
                <Ionicons name="walk" size={20} color="#FFFFFF" />
            </Animated.View>
        </View>
    );
};

const GLASS = "rgba(17,24,39,0.58)"; // translucent dark for controls over a light sky

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: HORIZON,
    },
    glWrap: {
        position: "absolute",
        top: 0,
        left: 0,
    },
    overlay: {
        position: "absolute",
        top: 0,
        left: 0,
    },
    loader: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#EEF1F5",
    },
    loaderText: {
        marginTop: 14,
        fontSize: 15,
        fontWeight: "600",
        color: colors.textMuted,
    },
    centerMessage: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
    },
    centerMessageText: {
        color: colors.textMuted,
        fontSize: 15,
        fontWeight: "600",
        textAlign: "center",
    },
    errorBox: {
        position: "absolute",
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
    topBar: {
        position: "absolute",
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        alignItems: "center",
    },
    bottomArea: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "stretch",
        justifyContent: "space-between",
    },
    roundButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: GLASS,
        alignItems: "center",
        justifyContent: "center",
    },
    roundSpacer: {
        width: 40,
    },
    titlePill: {
        flexShrink: 1,
        marginHorizontal: 10,
        paddingHorizontal: 14,
        height: 32,
        borderRadius: radius.pill,
        backgroundColor: GLASS,
        justifyContent: "center",
    },
    titleText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "700",
    },
    segment: {
        flexDirection: "row",
        marginTop: 10,
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: GLASS,
    },
    segmentItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        height: 34,
        borderRadius: radius.pill,
    },
    segmentItemActive: {
        backgroundColor: "#FFFFFF",
    },
    segmentText: {
        marginLeft: 6,
        fontSize: 13,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    segmentTextActive: {
        color: colors.text,
    },
    hint: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "center",
        maxWidth: "88%",
        marginBottom: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radius.lg,
        backgroundColor: GLASS,
    },
    hintText: {
        marginLeft: 8,
        flexShrink: 1,
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "600",
    },
    bottomBar: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingBottom: 14,
        paddingTop: 4,
        minHeight: 96 + 18, // room for the walk stick, so the bar doesn't jump between modes
    },
    toolPill: {
        width: 72,
        height: 64,
        borderRadius: radius.lg,
        backgroundColor: GLASS,
        alignItems: "center",
        justifyContent: "center",
    },
    twoD: {
        fontSize: 20,
        fontWeight: "900",
        color: "#FFFFFF",
        lineHeight: 24,
    },
    toolLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#FFFFFF",
        marginTop: 2,
    },
    floorPicker: {
        position: "absolute",
        right: 12,
        padding: 4,
        gap: 4,
        borderRadius: 22,
        backgroundColor: GLASS,
    },
    floorButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    floorButtonActive: {
        backgroundColor: "#FFFFFF",
    },
    floorButtonText: {
        fontSize: 14,
        fontWeight: "800",
        color: "#FFFFFF",
    },
    floorButtonTextActive: {
        color: colors.text,
    },
    stickLayer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 14,
        alignItems: "center",
    },
    stickBase: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: GLASS,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.25)",
        alignItems: "center",
        justifyContent: "center",
    },
    stickKnob: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.85)",
        alignItems: "center",
        justifyContent: "center",
    },
    stickChevronUp: { position: "absolute", top: 4 },
    stickChevronDown: { position: "absolute", bottom: 4 },
    stickChevronLeft: { position: "absolute", left: 4 },
    stickChevronRight: { position: "absolute", right: 4 },
});
