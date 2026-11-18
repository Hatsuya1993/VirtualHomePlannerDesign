import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Image as SvgImage, Line } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { GapWarningBanner } from "../../components/GapWarningBanner";
import {
    collectEndpoints,
    findCornerGroup,
    openEndpoints,
    snapPoint,
    wallsHaveGap,
} from "../../utils/roomGeometry";
import { colors, radius } from "../../utils/theme";

const GAP_HIGHLIGHT = "#EF4444"; // red marker for the loose wall ends causing a gap
const GRID = 26; // grid cell size in points (screen space)
const MIN_WALL = 12; // ignore accidental taps shorter than this (screen space)
const PICK_RADIUS = 28; // touch radius for grabbing an endpoint (screen space)
const SNAP_RADIUS = 26; // touch radius for snapping a drawn/dragged point onto an existing endpoint (screen space)
const WALL_WIDTH = 8; // content-space stroke width
const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Manual wall-drawing editor. The uploaded floor plan is shown faded so the
// user can trace walls over it.
//  • Draw Wall: one finger drag draws a line.
//  • Resize: one finger drags a wall endpoint.
//  • Two fingers: pinch to zoom + pan (any time).
//  • One finger with no tool: pan the canvas.
// Walls are stored in content coordinates; the whole scene is rendered inside
// an SVG transform group (translate + scale).
export const DrawWallsScreen = ({ navigation, route }) => {
    const imageUri = route.params?.imageUri;

    const [walls, setWalls] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [mode, setMode] = useState(null); // null | "draw" | "resize"
    const [current, setCurrent] = useState(null); // in-progress line (content coords)
    const [transform, setTransform] = useState({ s: 1, tx: 0, ty: 0 });
    const [canvas, setCanvas] = useState({ w: 0, h: 0 });
    const [warningVisible, setWarningVisible] = useState(false);

    // Furniture placed in Plan Preview isn't edited here, just carried back
    // to Plan Preview on "Done" so it survives a round of wall drawing.
    const furnitureRef = useRef(route.params?.furniture ?? []);
    // Same for the design's other floors and which one is being drawn.
    const floorsRef = useRef({ floors: route.params?.floors, floorIndex: route.params?.floorIndex });

    // Pick up edits made after "Done" (e.g. a wall deleted in Plan Preview)
    // when navigation lands back here with fresh params.
    useEffect(() => {
        if (route.params?.updatedWalls) {
            furnitureRef.current = route.params.furniture ?? furnitureRef.current;
            if (route.params.floors) {
                floorsRef.current = {
                    floors: route.params.floors,
                    floorIndex: route.params.floorIndex,
                };
            }
            setWalls(route.params.updatedWalls);
            setUndoStack([]);
            setRedoStack([]);
            navigation.setParams({ updatedWalls: undefined });
        }
    }, [route.params?.updatedWalls]);

    const hasGap = walls.length > 0 && wallsHaveGap(walls);
    // While warning about a gap, mark the loose wall ends so the user can see
    // exactly where the room is still open.
    const gapEnds = warningVisible && hasGap ? openEndpoints(walls) : [];

    // Latest values for the persistent PanResponder callbacks.
    const stateRef = useRef({});
    stateRef.current = { walls, mode };
    const transformRef = useRef(transform);
    transformRef.current = transform;
    const gestureRef = useRef(null);

    const screenToContent = (x, y) => {
        const t = transformRef.current;
        return { x: (x - t.tx) / t.s, y: (y - t.ty) / t.s };
    };

    const pushHistory = (before) => {
        setUndoStack((s) => [...s, before]);
        setRedoStack([]);
    };

    const undo = () => {
        setUndoStack((s) => {
            if (s.length === 0) return s;
            setRedoStack((r) => [...r, stateRef.current.walls]);
            setWalls(s[s.length - 1]);
            return s.slice(0, -1);
        });
    };

    const redo = () => {
        setRedoStack((r) => {
            if (r.length === 0) return r;
            setUndoStack((s) => [...s, stateRef.current.walls]);
            setWalls(r[r.length - 1]);
            return r.slice(0, -1);
        });
    };

    const nearestEndpoint = (x, y, radiusContent) => {
        let best = null;
        stateRef.current.walls.forEach((w, index) => {
            [
                { end: 1, px: w.x1, py: w.y1 },
                { end: 2, px: w.x2, py: w.y2 },
            ].forEach(({ end, px, py }) => {
                const d = Math.hypot(px - x, py - y);
                if (d <= radiusContent && (!best || d < best.d)) {
                    best = { index, end, d };
                }
            });
        });
        return best;
    };

    const touchesOf = (e) => {
        const t = e.nativeEvent.touches;
        return [
            { x: t[0].locationX, y: t[0].locationY },
            { x: t[1].locationX, y: t[1].locationY },
        ];
    };

    const beginZoom = (e) => {
        const [t0, t1] = touchesOf(e);
        gestureRef.current = {
            kind: "zoom",
            startDist: dist(t0, t1),
            startMid: mid(t0, t1),
            startTransform: { ...transformRef.current },
        };
        setCurrent(null); // abort any in-progress draw
    };

    const applyZoom = (e) => {
        const g = gestureRef.current;
        const [t0, t1] = touchesOf(e);
        const d = dist(t0, t1);
        const m = mid(t0, t1);
        const st = g.startTransform;
        const s = clamp((d / g.startDist) * st.s, MIN_SCALE, MAX_SCALE);
        // content point under the initial focal stays anchored to the moving focal
        const cx = (g.startMid.x - st.tx) / st.s;
        const cy = (g.startMid.y - st.ty) / st.s;
        setTransform({ s, tx: m.x - cx * s, ty: m.y - cy * s });
    };

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e, gs) => {
                if (gs.numberActiveTouches >= 2) {
                    beginZoom(e);
                    return;
                }
                const { locationX: x, locationY: y } = e.nativeEvent;
                const t = transformRef.current;
                const { mode: m } = stateRef.current;
                if (m === "draw") {
                    const raw = screenToContent(x, y);
                    const { point } = snapPoint(
                        raw,
                        collectEndpoints(stateRef.current.walls),
                        SNAP_RADIUS / t.s
                    );
                    gestureRef.current = { kind: "draw", start: point, s: t.s };
                    setCurrent({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
                } else if (m === "resize") {
                    const p = screenToContent(x, y);
                    const hit = nearestEndpoint(p.x, p.y, PICK_RADIUS / t.s);
                    if (hit) {
                        const hitWall = stateRef.current.walls[hit.index];
                        const anchor =
                            hit.end === 1
                                ? { x: hitWall.x1, y: hitWall.y1 }
                                : { x: hitWall.x2, y: hitWall.y2 };
                        gestureRef.current = {
                            kind: "resize",
                            group: findCornerGroup(stateRef.current.walls, anchor),
                            before: stateRef.current.walls,
                            s: t.s,
                            moved: false,
                        };
                    } else {
                        gestureRef.current = { kind: "pan", startTransform: { ...t } };
                    }
                } else {
                    gestureRef.current = { kind: "pan", startTransform: { ...t } };
                }
            },
            onPanResponderMove: (e, gs) => {
                const g = gestureRef.current;
                if (!g) return;

                // Promote to a zoom as soon as a second finger appears.
                if (gs.numberActiveTouches >= 2) {
                    if (g.kind !== "zoom") beginZoom(e);
                    else applyZoom(e);
                    return;
                }
                // While a zoom is winding down to one finger, wait for release.
                if (g.kind === "zoom") return;

                if (g.kind === "draw") {
                    const raw = {
                        x: g.start.x + gs.dx / g.s,
                        y: g.start.y + gs.dy / g.s,
                    };
                    const { point, snapped } = snapPoint(
                        raw,
                        collectEndpoints(stateRef.current.walls),
                        SNAP_RADIUS / g.s
                    );
                    setCurrent({
                        x1: g.start.x,
                        y1: g.start.y,
                        x2: point.x,
                        y2: point.y,
                        snapped,
                    });
                } else if (g.kind === "resize") {
                    g.moved = true;
                    const anchorMember = g.group[0];
                    const bw = g.before[anchorMember.index];
                    const anchorBefore =
                        anchorMember.end === 1
                            ? { x: bw.x1, y: bw.y1 }
                            : { x: bw.x2, y: bw.y2 };
                    const raw = {
                        x: anchorBefore.x + gs.dx / g.s,
                        y: anchorBefore.y + gs.dy / g.s,
                    };
                    const { point } = snapPoint(
                        raw,
                        collectEndpoints(stateRef.current.walls, g.group),
                        SNAP_RADIUS / g.s
                    );
                    setWalls((ws) =>
                        ws.map((w, i) => {
                            const hitsX1 = g.group.some(
                                (m) => m.index === i && m.end === 1
                            );
                            const hitsX2 = g.group.some(
                                (m) => m.index === i && m.end === 2
                            );
                            if (!hitsX1 && !hitsX2) return w;
                            return {
                                ...w,
                                ...(hitsX1 ? { x1: point.x, y1: point.y } : {}),
                                ...(hitsX2 ? { x2: point.x, y2: point.y } : {}),
                            };
                        })
                    );
                } else if (g.kind === "pan") {
                    const st = g.startTransform;
                    setTransform({ s: st.s, tx: st.tx + gs.dx, ty: st.ty + gs.dy });
                }
            },
            onPanResponderRelease: (_e, gs) => {
                const g = gestureRef.current;
                gestureRef.current = null;
                if (!g) return;
                if (g.kind === "draw") {
                    setCurrent(null);
                    if (Math.hypot(gs.dx, gs.dy) >= MIN_WALL) {
                        const raw = {
                            x: g.start.x + gs.dx / g.s,
                            y: g.start.y + gs.dy / g.s,
                        };
                        const { point: end } = snapPoint(
                            raw,
                            collectEndpoints(stateRef.current.walls),
                            SNAP_RADIUS / g.s
                        );
                        const before = stateRef.current.walls;
                        pushHistory(before);
                        setWalls([
                            ...before,
                            { x1: g.start.x, y1: g.start.y, x2: end.x, y2: end.y },
                        ]);
                    }
                } else if (g.kind === "resize" && g.moved) {
                    pushHistory(g.before);
                }
            },
        })
    ).current;

    const gridLines = [];
    if (mode === "draw" && canvas.w) {
        for (let x = GRID; x < canvas.w; x += GRID) gridLines.push({ v: x });
        for (let y = GRID; y < canvas.h; y += GRID) gridLines.push({ h: y });
    }

    const hasWalls = walls.length > 0;
    const imgRect = canvas.w
        ? {
              x: 32,
              y: canvas.h * 0.14,
              width: canvas.w - 64,
              height: canvas.h * 0.68,
          }
        : null;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => {
                        if (!hasWalls) {
                            navigation.goBack();
                        } else if (hasGap) {
                            setWarningVisible(true);
                        } else {
                            navigation.navigate("PlanPreview", {
                                walls,
                                imageUri,
                                furniture: furnitureRef.current,
                                ...floorsRef.current,
                            });
                        }
                    }}
                    scaleTo={0.94}
                    style={[styles.doneButton, hasWalls && styles.doneActive]}
                >
                    <Text style={[styles.doneText, hasWalls && styles.doneTextActive]}>
                        Done
                    </Text>
                </AnimatedPressable>

                <View style={styles.historyRow}>
                    <AnimatedPressable
                        onPress={undo}
                        scaleTo={0.85}
                        style={styles.historyButton}
                        hitSlop={8}
                        disabled={undoStack.length === 0}
                    >
                        <Ionicons
                            name="arrow-undo-outline"
                            size={24}
                            color={undoStack.length ? colors.text : colors.lineFaint}
                        />
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={redo}
                        scaleTo={0.85}
                        style={styles.historyButton}
                        hitSlop={8}
                        disabled={redoStack.length === 0}
                    >
                        <Ionicons
                            name="arrow-redo-outline"
                            size={24}
                            color={redoStack.length ? colors.text : colors.lineFaint}
                        />
                    </AnimatedPressable>
                </View>
            </View>

            {/* Gap warning */}
            <GapWarningBanner
                visible={warningVisible && hasGap}
                onDismiss={() => setWarningVisible(false)}
                message="You need to complete your room. The open ends are marked in red — connect them to close the gap."
            />

            {/* Canvas */}
            <View
                style={styles.canvas}
                onLayout={(e) =>
                    setCanvas({
                        w: e.nativeEvent.layout.width,
                        h: e.nativeEvent.layout.height,
                    })
                }
                {...responder.panHandlers}
            >
                <Svg width="100%" height="100%">
                    {/* Fixed screen-space grid while drawing */}
                    {gridLines.map((g, i) =>
                        g.v !== undefined ? (
                            <Line
                                key={`g${i}`}
                                x1={g.v}
                                y1={0}
                                x2={g.v}
                                y2={canvas.h}
                                stroke="#E3E6EC"
                                strokeWidth={1}
                            />
                        ) : (
                            <Line
                                key={`g${i}`}
                                x1={0}
                                y1={g.h}
                                x2={canvas.w}
                                y2={g.h}
                                stroke="#E3E6EC"
                                strokeWidth={1}
                            />
                        )
                    )}

                    {/* Zoomable / pannable content */}
                    <G
                        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
                    >
                        {imageUri && imgRect && (
                            <SvgImage
                                href={{ uri: imageUri }}
                                x={imgRect.x}
                                y={imgRect.y}
                                width={imgRect.width}
                                height={imgRect.height}
                                preserveAspectRatio="xMidYMid meet"
                                opacity={0.35}
                            />
                        )}

                        {walls.map((w, i) => (
                            <Line
                                key={`w${i}`}
                                x1={w.x1}
                                y1={w.y1}
                                x2={w.x2}
                                y2={w.y2}
                                stroke={colors.line}
                                strokeWidth={WALL_WIDTH}
                                strokeLinecap="round"
                            />
                        ))}

                        {current && (
                            <Line
                                x1={current.x1}
                                y1={current.y1}
                                x2={current.x2}
                                y2={current.y2}
                                stroke={colors.line}
                                strokeWidth={WALL_WIDTH}
                                strokeLinecap="round"
                                opacity={0.6}
                            />
                        )}

                        {current?.snapped && (
                            <Circle
                                cx={current.x2}
                                cy={current.y2}
                                r={10 / transform.s}
                                fill="none"
                                stroke={colors.primary}
                                strokeWidth={2.5 / transform.s}
                            />
                        )}

                        {mode === "resize" &&
                            walls.flatMap((w, i) => [
                                <Circle
                                    key={`e${i}a`}
                                    cx={w.x1}
                                    cy={w.y1}
                                    r={7 / transform.s}
                                    fill={colors.surface}
                                    stroke={colors.primary}
                                    strokeWidth={2.5 / transform.s}
                                />,
                                <Circle
                                    key={`e${i}b`}
                                    cx={w.x2}
                                    cy={w.y2}
                                    r={7 / transform.s}
                                    fill={colors.surface}
                                    stroke={colors.primary}
                                    strokeWidth={2.5 / transform.s}
                                />,
                            ])}

                        {/* Gap highlights: mark the loose wall ends causing the
                            open room, drawn last so they sit above everything. */}
                        {gapEnds.map((p, i) => (
                            <G key={`gap${i}`}>
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={18 / transform.s}
                                    fill={GAP_HIGHLIGHT}
                                    opacity={0.2}
                                />
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={11 / transform.s}
                                    fill="none"
                                    stroke={GAP_HIGHLIGHT}
                                    strokeWidth={3.5 / transform.s}
                                />
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={4 / transform.s}
                                    fill={GAP_HIGHLIGHT}
                                />
                            </G>
                        ))}
                    </G>
                </Svg>
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <AnimatedPressable
                    onPress={() => setMode(mode === "draw" ? null : "draw")}
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Ionicons
                        name="pencil"
                        size={26}
                        color={mode === "draw" ? colors.primary : colors.text}
                    />
                    <Text
                        style={[
                            styles.toolLabel,
                            mode === "draw" && { color: colors.primary },
                        ]}
                    >
                        Draw Wall
                    </Text>
                </AnimatedPressable>

                {hasWalls && (
                    <AnimatedPressable
                        onPress={() => setMode(mode === "resize" ? null : "resize")}
                        scaleTo={0.9}
                        style={styles.tool}
                    >
                        <Ionicons
                            name="resize-outline"
                            size={26}
                            color={mode === "resize" ? colors.primary : colors.text}
                        />
                        <Text
                            style={[
                                styles.toolLabel,
                                mode === "resize" && { color: colors.primary },
                            ]}
                        >
                            Resize
                        </Text>
                    </AnimatedPressable>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    doneButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: radius.pill,
    },
    doneActive: {
        backgroundColor: colors.primary,
    },
    doneText: {
        fontSize: 17,
        fontWeight: "700",
        color: colors.text,
    },
    doneTextActive: {
        color: "#FFFFFF",
    },
    historyRow: {
        flexDirection: "row",
    },
    historyButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    canvas: {
        flex: 1,
        overflow: "hidden",
    },
    toolbar: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 28,
        paddingBottom: 30,
        paddingTop: 8,
    },
    tool: {
        alignItems: "center",
    },
    toolLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginTop: 5,
    },
});
