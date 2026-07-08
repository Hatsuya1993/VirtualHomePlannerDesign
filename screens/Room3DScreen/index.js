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
import { chainRoom } from "../../utils/roomGeometry";
import { colors, radius } from "../../utils/theme";

const PIXELS_PER_FOOT = 26; // matches the assumed drawing scale used in PlanPreviewScreen
const DEFAULT_HEIGHT_IN = 118; // 9'10", matches WallSizeSheet's default
const DEFAULT_THICKNESS_IN = 8;
const EYE_HEIGHT_FT = 5.5;
const WALK_SPEED = 5; // feet per second at full joystick deflection
const WALL_MARGIN_FT = 0.8; // how close the camera may get to a wall before being blocked
const LOOK_SENSITIVITY = 0.006; // radians per screen-pixel of drag
const MAX_PITCH = Math.PI / 2 - 0.05;
const JOYSTICK_RADIUS = 40;

const FLOOR_COLOR = "#7C5A38";
const WALL_COLOR = "#DFDAD1";
const CEILING_COLOR = "#E6E3DD";

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

// Standard ray-casting point-in-polygon test, operating on {x,z} points.
const pointInPolygon = (x, z, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const zi = poly[i].z;
        const xj = poly[j].x;
        const zj = poly[j].z;
        const intersect =
            zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

// Cheap approximation of "is a small collision circle around (x,z) fully
// inside the room" — cross-checks 4 offset points rather than doing a true
// (and much more complex) polygon inset, so the camera can't press its eye
// right up against a wall surface.
const insideWithMargin = (x, z, poly, margin) =>
    pointInPolygon(x, z, poly) &&
    pointInPolygon(x - margin, z, poly) &&
    pointInPolygon(x + margin, z, poly) &&
    pointInPolygon(x, z - margin, poly) &&
    pointInPolygon(x, z + margin, poly);

// Builds the Three.js scene (floor, ceiling, extruded walls, a pendant
// light) from the 2D wall list, in feet, centered on the room.
const buildScene = (walls) => {
    const scene = new THREE.Scene();

    const { polygon } = chainRoom(walls);
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

    // Floor + ceiling share the same footprint shape.
    const shapePts = roomPolygon.map((f) => new THREE.Vector2(f.x, f.z));
    if (shapePts.length >= 3) {
        const shape = new THREE.Shape(shapePts);

        const floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(
            floorGeo,
            new THREE.MeshStandardMaterial({
                color: FLOOR_COLOR,
                side: THREE.DoubleSide,
                roughness: 0.85,
            })
        );
        scene.add(floor);

        const ceilingGeo = new THREE.ShapeGeometry(shape);
        ceilingGeo.rotateX(-Math.PI / 2);
        ceilingGeo.translate(0, ceilingHeight, 0);
        const ceiling = new THREE.Mesh(
            ceilingGeo,
            new THREE.MeshStandardMaterial({
                color: CEILING_COLOR,
                side: THREE.DoubleSide,
                roughness: 0.95,
            })
        );
        scene.add(ceiling);
    }

    // Walls: one box per drawn segment. Windows/doors aren't cut out yet —
    // walls render solid.
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: WALL_COLOR,
        side: THREE.DoubleSide,
        roughness: 0.9,
    });
    walls.forEach((w) => {
        const a = toFeet(w.x1, w.y1);
        const b = toFeet(w.x2, w.y2);
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 0.01) return;
        const height = (w.heightIn ?? DEFAULT_HEIGHT_IN) / 12;
        const thickness = (w.thicknessIn ?? DEFAULT_THICKNESS_IN) / 12;
        const angle = Math.atan2(b.z - a.z, b.x - a.x);

        const geo = new THREE.BoxGeometry(length, height, thickness);
        const mesh = new THREE.Mesh(geo, wallMaterial);
        mesh.position.set((a.x + b.x) / 2, height / 2, (a.z + b.z) / 2);
        mesh.rotation.y = -angle;
        scene.add(mesh);
    });

    // Lighting: soft ambient fill plus a warm point light where a pendant
    // fixture would hang, centered over the room's actual floor area.
    scene.add(new THREE.AmbientLight("#FFFFFF", 0.35));
    const bulb = new THREE.PointLight("#FFF3D6", 0.7, 40, 2);
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

    return { scene, ceilingHeight, roomCenter, roomPolygon };
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
    const unmountedRef = useRef(false);
    useEffect(() => {
        return () => {
            unmountedRef.current = true;
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

            const pixelRatio = PixelRatio.get();
            const renderer = new Renderer({ gl });
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(winWidth, winHeight);
            renderer.setClearColor("#DFE3E8");

            const { scene, ceilingHeight, roomCenter, roomPolygon } = buildScene(walls);
            console.log(
                "Room3D: scene built, children:",
                scene.children.length,
                "roomCenter:",
                roomCenter
            );

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
            let stopped = false;

            const loop = () => {
                if (stopped || unmountedRef.current) return;
                try {
                    requestAnimationFrame(loop);
                    const now = Date.now();
                    const dt = Math.min(0.1, (now - last) / 1000);
                    last = now;

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

                        // Keep the camera inside the traced room: try the full
                        // move, then slide along whichever single axis is
                        // still open if the full move would exit through a
                        // wall, rather than just freezing against it.
                        if (roomPolygon.length < 3) {
                            camera.position.x = nextX;
                            camera.position.z = nextZ;
                        } else if (
                            insideWithMargin(nextX, nextZ, roomPolygon, WALL_MARGIN_FT)
                        ) {
                            camera.position.x = nextX;
                            camera.position.z = nextZ;
                        } else if (
                            insideWithMargin(nextX, curZ, roomPolygon, WALL_MARGIN_FT)
                        ) {
                            camera.position.x = nextX;
                        } else if (
                            insideWithMargin(curX, nextZ, roomPolygon, WALL_MARGIN_FT)
                        ) {
                            camera.position.z = nextZ;
                        }
                    }

                    renderer.render(scene, camera);
                    gl.endFrameEXP();
                } catch (err) {
                    stopped = true;
                    console.error("Room3D render loop error:", err);
                    setGlError(`render loop: ${err?.message ?? err}`);
                }
            };
            loop();
        } catch (err) {
            console.error("Room3D setup error:", err);
            setGlError(`setup: ${err?.message ?? err}`);
        }
    };

    const todo = (what) => () => console.log("TODO:", what);

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View
                style={[styles.glWrap, { width: winWidth, height: winHeight }]}
                {...lookResponder.panHandlers}
            >
                <GLView
                    style={{ width: winWidth, height: winHeight }}
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

                <View style={styles.headerRight}>
                    <AnimatedPressable onPress={todo("undo")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="arrow-undo-outline" size={23} color="#FFFFFF" />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("snapshot")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="camera" size={24} color="#FFFFFF" />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("share")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="share-outline" size={24} color="#FFFFFF" />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("more")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
                    </AnimatedPressable>
                </View>
            </View>

            {/* Search pill */}
            <View style={styles.searchRow} pointerEvents="box-none">
                <AnimatedPressable onPress={todo("search")} scaleTo={0.95} style={styles.searchPill}>
                    <Ionicons name="search" size={16} color={colors.textMuted} />
                    <Text style={styles.searchText}>Search</Text>
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

                <AnimatedPressable onPress={todo("add furniture")} scaleTo={0.9} style={styles.tool}>
                    <Ionicons name="add" size={30} color="#FFFFFF" />
                    <Text style={styles.toolLabel}>Add Furniture</Text>
                </AnimatedPressable>
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
