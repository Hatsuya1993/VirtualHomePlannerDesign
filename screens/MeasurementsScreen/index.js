import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
    Circle,
    ClipPath,
    Defs,
    G,
    Line,
    Polygon,
    Rect,
    Text as SvgText,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import { useUnits } from "../../context/UnitsContext";
import { chainRoom } from "../../utils/roomGeometry";
import { formatLength } from "../../utils/units";
import { colors, radius } from "../../utils/theme";

const PIXELS_PER_FOOT = 26;
const WALL_COLOR = "#3F4756";
const WALL_WIDTH = 9;
const FLOOR_COLOR = "#C4A981";

// Distance (in content px) to a label in the user-selected unit, e.g. "3' 10"".
const pxToLabel = (px, units) => formatLength((px / PIXELS_PER_FOOT) * 12, units);

// Nearest wall hit of a ray from P along unit `dir`. Returns { dist, point }.
const rayHit = (P, dir, walls) => {
    let best = null;
    for (const w of walls) {
        const ax = w.x1;
        const ay = w.y1;
        const ex = w.x2 - w.x1;
        const ey = w.y2 - w.y1;
        const det = ex * dir.y - dir.x * ey;
        if (Math.abs(det) < 1e-9) continue;
        const t = (-(ax - P.x) * ey + ex * (ay - P.y)) / det;
        const s = (dir.x * (ay - P.y) - dir.y * (ax - P.x)) / det;
        if (t > 0.001 && s >= -0.0001 && s <= 1.0001 && (!best || t < best.dist)) {
            best = { dist: t, point: { x: P.x + dir.x * t, y: P.y + dir.y * t } };
        }
    }
    return best;
};

const pointInPolygon = (p, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const hit =
            yi > p.y !== yj > p.y &&
            p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (hit) inside = !inside;
    }
    return inside;
};

const DIRECTIONS = [
    { key: "up", dir: { x: 0, y: -1 } },
    { key: "down", dir: { x: 0, y: 1 } },
    { key: "left", dir: { x: -1, y: 0 } },
    { key: "right", dir: { x: 1, y: 0 } },
];

// Measure distances from a single draggable point to the surrounding walls in
// each of the four axis directions, updating live as the point moves.
export const MeasurementsScreen = ({ navigation, route }) => {
    const walls = route.params?.walls ?? [];
    const { units } = useUnits();
    const [canvas, setCanvas] = useState({ w: 0, h: 0 });

    const { polygon } = chainRoom(walls);

    // Start the point at the room centroid (bounding-box center is fine here).
    const [point, setPoint] = useState(() => {
        if (polygon.length === 0) return { x: 0, y: 0 };
        const xs = polygon.map((p) => p.x);
        const ys = polygon.map((p) => p.y);
        return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
        };
    });

    // Drag the point (one finger); two fingers pinch-zoom the plan.
    const handleDragMove = (_target, contentPoint) => {
        if (polygon.length >= 3 && !pointInPolygon(contentPoint, polygon)) return;
        setPoint(contentPoint);
    };
    const { transform, panHandlers } = usePinchPanZoom({
        hitTest: () => "point", // any single-finger drag grabs the point
        onDragMove: handleDragMove,
        onTap: (contentPoint) => handleDragMove(null, contentPoint),
    });

    const pointsAttr = polygon.map((p) => `${p.x},${p.y}`).join(" ");
    const measures = DIRECTIONS.map(({ key, dir }) => {
        const hit = rayHit(point, dir, walls);
        return { key, hit };
    });

    const fontSize = 13 / transform.s;
    const labelBg = 15 / transform.s;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.94}
                    style={styles.doneButton}
                >
                    <Text style={styles.doneText}>Done</Text>
                </AnimatedPressable>
                <Text style={styles.title}>Measurements</Text>
                <View style={styles.doneButton} />
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
                {...panHandlers}
            >
                <Svg width="100%" height="100%">
                    <Defs>
                        <ClipPath id="room">
                            <Polygon points={pointsAttr} />
                        </ClipPath>
                    </Defs>

                    <G
                        transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}
                    >
                        {/* Floor */}
                        {polygon.length >= 3 && (
                            <Polygon points={pointsAttr} fill={FLOOR_COLOR} />
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
                                r={7 / transform.s}
                                fill="#F2F5F8"
                                stroke={WALL_COLOR}
                                strokeWidth={2.5 / transform.s}
                            />
                        ))}

                        {/* Measurement crosshair lines to the walls */}
                        {measures.map(({ key, hit }) =>
                            hit ? (
                                <Line
                                    key={`m${key}`}
                                    x1={point.x}
                                    y1={point.y}
                                    x2={hit.point.x}
                                    y2={hit.point.y}
                                    stroke={WALL_COLOR}
                                    strokeWidth={1.4 / transform.s}
                                />
                            ) : null
                        )}

                        {/* Distance labels at the midpoint of each ray */}
                        {measures.map(({ key, hit }) => {
                            if (!hit) return null;
                            const mx = (point.x + hit.point.x) / 2;
                            const my = (point.y + hit.point.y) / 2;
                            const label = pxToLabel(hit.dist, units);
                            // Size the background to the text (SVG has no autosize).
                            const halfW = (label.length * fontSize * 0.32) + labelBg * 0.6;
                            return (
                                <G key={`l${key}`}>
                                    <Rect
                                        x={mx - halfW}
                                        y={my - labelBg}
                                        width={halfW * 2}
                                        height={labelBg * 2}
                                        rx={4 / transform.s}
                                        fill={FLOOR_COLOR}
                                        opacity={0.85}
                                    />
                                    <SvgText
                                        x={mx}
                                        y={my + fontSize * 0.35}
                                        fontSize={fontSize}
                                        fontWeight="700"
                                        fill={colors.text}
                                        textAnchor="middle"
                                    >
                                        {label}
                                    </SvgText>
                                </G>
                            );
                        })}

                        {/* The draggable point */}
                        <Circle
                            cx={point.x}
                            cy={point.y}
                            r={18 / transform.s}
                            fill="#FFFFFF"
                            opacity={0.5}
                        />
                        <Line
                            x1={point.x - 12 / transform.s}
                            y1={point.y}
                            x2={point.x + 12 / transform.s}
                            y2={point.y}
                            stroke={colors.primary}
                            strokeWidth={2.5 / transform.s}
                            strokeLinecap="round"
                        />
                        <Line
                            x1={point.x}
                            y1={point.y - 12 / transform.s}
                            x2={point.x}
                            y2={point.y + 12 / transform.s}
                            stroke={colors.primary}
                            strokeWidth={2.5 / transform.s}
                            strokeLinecap="round"
                        />
                    </G>
                </Svg>
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
        minWidth: 64,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: "center",
    },
    doneText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    canvas: {
        flex: 1,
        overflow: "hidden",
    },
});
