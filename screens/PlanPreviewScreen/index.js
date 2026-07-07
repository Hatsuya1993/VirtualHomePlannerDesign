import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
    Circle,
    ClipPath,
    Defs,
    G,
    Image as SvgImage,
    Line,
    Polygon,
    Rect,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { colors, radius } from "../../utils/theme";

const WALL_COLOR = "#4C7CA8";
const WALL_WIDTH = 9;

// Order wall segments into a polygon by chaining nearest endpoints.
const chainWalls = (walls) => {
    if (walls.length === 0) return [];
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
    return pts;
};

// Deterministic RNG so the floor pattern is stable across renders.
const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PLANK_COLORS = ["#D9C09F", "#D3B893", "#DEC7A8", "#CFB28C", "#E2CCAF"];
const ROW_H = 14;

// Generate wood planks covering a bounding box (to be clipped to the room).
const buildPlanks = (bbox) => {
    const rng = mulberry32(1993);
    const planks = [];
    for (let y = bbox.minY; y < bbox.maxY; y += ROW_H) {
        let x = bbox.minX - rng() * 60;
        while (x < bbox.maxX) {
            const w = 55 + rng() * 70;
            planks.push({
                x,
                y,
                w: w - 1.2,
                h: ROW_H - 1.2,
                color: PLANK_COLORS[Math.floor(rng() * PLANK_COLORS.length)],
            });
            x += w;
        }
    }
    return planks;
};

// Read-only preview of the traced room: wood floor fill, blue walls with
// corner knobs, over the faded source photo.
export const PlanPreviewScreen = ({ navigation, route }) => {
    const walls = route.params?.walls ?? [];
    const imageUri = route.params?.imageUri;
    const [canvas, setCanvas] = useState({ w: 0, h: 0 });

    const polygon = chainWalls(walls);
    const pointsAttr = polygon.map((p) => `${p.x},${p.y}`).join(" ");

    let planks = [];
    if (polygon.length >= 3) {
        const xs = polygon.map((p) => p.x);
        const ys = polygon.map((p) => p.y);
        planks = buildPlanks({
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        });
    }

    const imgRect = canvas.w
        ? {
              x: 32,
              y: canvas.h * 0.14,
              width: canvas.w - 64,
              height: canvas.h * 0.68,
          }
        : null;

    const todo = (what) => () => console.log("TODO:", what);

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.navigate("FloorPlan")}
                    scaleTo={0.85}
                    style={styles.iconButton}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={26} color={colors.text} />
                </AnimatedPressable>

                <View style={styles.headerRight}>
                    <AnimatedPressable onPress={todo("undo")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="arrow-undo-outline" size={23} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("snapshot")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="camera" size={24} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("share")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="share-outline" size={24} color={colors.text} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={todo("more")} scaleTo={0.85} style={styles.iconButton} hitSlop={6}>
                        <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
                    </AnimatedPressable>
                </View>
            </View>

            {/* Canvas */}
            <View
                style={styles.canvas}
                onLayout={(e) =>
                    setCanvas({
                        w: e.nativeEvent.layout.width,
                        h: e.nativeEvent.layout.height,
                    })
                }
            >
                <Svg width="100%" height="100%">
                    <Defs>
                        <ClipPath id="room">
                            <Polygon points={pointsAttr} />
                        </ClipPath>
                    </Defs>

                    {/* Faded source photo */}
                    {imageUri && imgRect && (
                        <SvgImage
                            href={{ uri: imageUri }}
                            x={imgRect.x}
                            y={imgRect.y}
                            width={imgRect.width}
                            height={imgRect.height}
                            preserveAspectRatio="xMidYMid meet"
                            opacity={0.3}
                        />
                    )}

                    {/* Wood floor clipped to the room */}
                    {polygon.length >= 3 && (
                        <G clipPath="url(#room)">
                            <Polygon points={pointsAttr} fill="#C4A981" />
                            {planks.map((p, i) => (
                                <Rect
                                    key={i}
                                    x={p.x}
                                    y={p.y}
                                    width={p.w}
                                    height={p.h}
                                    fill={p.color}
                                />
                            ))}
                        </G>
                    )}

                    {/* Walls */}
                    {walls.map((w, i) => (
                        <Line
                            key={`w${i}`}
                            x1={w.x1}
                            y1={w.y1}
                            x2={w.x2}
                            y2={w.y2}
                            stroke={WALL_COLOR}
                            strokeWidth={WALL_WIDTH}
                            strokeLinecap="round"
                        />
                    ))}

                    {/* Corner knobs */}
                    {polygon.map((p, i) => (
                        <Circle
                            key={`k${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={7}
                            fill="#F2F5F8"
                            stroke={WALL_COLOR}
                            strokeWidth={2.5}
                        />
                    ))}
                </Svg>
            </View>

            {/* Toolbar */}
            <View style={styles.toolbar}>
                <AnimatedPressable onPress={todo("open 3D plan")} scaleTo={0.9} style={styles.tool}>
                    <Text style={styles.threeD}>3D</Text>
                    <Text style={styles.toolLabel}>Open 3D plan</Text>
                </AnimatedPressable>

                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.9}
                    style={styles.tool}
                >
                    <Ionicons name="pencil" size={26} color={colors.text} />
                    <Text style={styles.toolLabel}>Draw Wall</Text>
                </AnimatedPressable>

                <AnimatedPressable onPress={todo("resize")} scaleTo={0.9} style={styles.tool}>
                    <Ionicons name="resize-outline" size={26} color={colors.text} />
                    <Text style={styles.toolLabel}>Resize</Text>
                </AnimatedPressable>

                <AnimatedPressable onPress={todo("add")} scaleTo={0.9} style={styles.tool}>
                    <Ionicons name="add" size={30} color={colors.text} />
                    <Text style={styles.toolLabel}>Add</Text>
                </AnimatedPressable>
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
    canvas: {
        flex: 1,
        overflow: "hidden",
    },
    toolbar: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: 24,
        paddingBottom: 30,
        paddingTop: 8,
    },
    tool: {
        alignItems: "center",
        minWidth: 64,
    },
    threeD: {
        fontSize: 24,
        fontWeight: "900",
        color: colors.text,
        lineHeight: 28,
    },
    toolLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.text,
        marginTop: 4,
    },
});
