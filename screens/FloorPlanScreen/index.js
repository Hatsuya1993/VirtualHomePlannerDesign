import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { recognizeFloorPlan, recognizedToWalls } from "../../utils/autoRecognize";
import { useEntitlements } from "../../context/EntitlementsContext";
import { report } from "../../utils/report";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdjustPhotoModal } from "../../components/AdjustPhotoModal";
import { SafeImage } from "../../components/SafeImage";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import {
    DrawGlyph,
    PlanThumb,
    RoomOutline,
} from "../../components/FloorPlanShapes";
import { colors, radius, shadow } from "../../utils/theme";

// Fixed drawing scale so a generated diagram has the SAME real-world size on
// every device (previously shapes were scaled to fit the screen, which made
// their measured dimensions change with screen width). The room outlines are
// authored in a ~120×100 unit space; each unit maps to a fixed number of feet
// at the app's 26 px/ft, giving sensible, device-independent room sizes.
const PIXELS_PER_FOOT = 26; // must match the scale used across the app
const FEET_PER_UNIT = 0.15; // a single blank room: 80-unit outline → 12 ft
const CONTENT_SCALE = FEET_PER_UNIT * PIXELS_PER_FOOT; // px per outline unit
// Multi-room preset apartments span the same unit space as a single blank room
// but represent a whole home, so they use a larger real-world scale — otherwise
// each bedroom comes out tiny and cramped to walk through in 3D.
const PRESET_FEET_PER_UNIT = 0.3; // 80-unit apartment → ~24 ft across
const PRESET_SCALE = PRESET_FEET_PER_UNIT * PIXELS_PER_FOOT;

const IMPORT_OPTIONS = [
    {
        key: "upload",
        title: "Upload Floor Plan",
        subtitle: "Photo Gallery or Camera",
        icon: "cloud-upload-outline",
    },
];

const BLANK_SHAPES = [
    { key: "rectangular", label: "Rectangular", variant: "rectangular" },
    { key: "lshape", label: "L-shape", variant: "lshape" },
    { key: "tshape", label: "T-shape", variant: "tshape" },
    { key: "cut", label: "Cut", variant: "cut" },
    { key: "rounded", label: "Rounded", variant: "rounded" },
    { key: "zshape", label: "Z-shape", variant: "zshape" },
];

// Sample a quadratic Bézier into `steps` straight points (skipping the start).
const quadPoints = (p0, c, p1, steps) => {
    const out = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        out.push([
            mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
            mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1],
        ]);
    }
    return out;
};

// Corner outlines for each "Start from Blank" shape, in the same 120×100
// space used by the shape thumbnails (FloorPlanShapes). Each is a closed
// polygon of [x, y] points; the arched top of "rounded" is tessellated.
const SHAPE_POLYGONS = {
    rectangular: [[20, 25], [100, 25], [100, 80], [20, 80]],
    lshape: [[20, 25], [70, 25], [70, 50], [100, 50], [100, 80], [20, 80]],
    tshape: [
        [40, 22], [80, 22], [80, 45], [102, 45],
        [102, 80], [18, 80], [18, 45], [40, 45],
    ],
    cut: [[20, 25], [82, 25], [100, 43], [100, 80], [20, 80]],
    zshape: [
        [20, 25], [72, 25], [72, 48], [100, 48],
        [100, 80], [48, 80], [48, 58], [20, 58],
    ],
    rounded: [
        [20, 80],
        [20, 50],
        ...quadPoints([20, 50], [20, 25], [60, 25], 6),
        ...quadPoints([60, 25], [100, 25], [100, 50], 6),
        [100, 80],
    ],
};

// Convert an outline polygon into wall segments, scaled up to content space
// (~PIXELS_PER_FOOT) and centered horizontally on a `screenWidth`-wide canvas.
// Doors/windows for each "Start from Blank" shape (same thumbnail format the
// outlines use), so a selected shape carries them into Plan Preview.
const SHAPE_OPENINGS = {
    rectangular: {
        doors: [{ hinge: [34, 25], open: [34, 37], flip: true }],
        windows: [[40, 80, 54, 80], [66, 80, 80, 80]],
    },
    lshape: {
        doors: [{ hinge: [20, 38], open: [32, 38] }],
        windows: [[34, 25, 46, 25], [100, 58, 100, 70], [56, 80, 70, 80]],
    },
    tshape: {
        doors: [{ hinge: [52, 80], open: [52, 68] }],
        windows: [[48, 22, 60, 22], [102, 54, 102, 66]],
    },
    cut: {
        doors: [{ hinge: [32, 80], open: [32, 68] }],
        windows: [[36, 25, 50, 25], [100, 52, 100, 64]],
    },
    rounded: {
        doors: [{ hinge: [52, 80], open: [52, 68] }],
        windows: [[30, 80, 42, 80], [76, 80, 88, 80]],
    },
    zshape: {
        doors: [{ hinge: [20, 34], open: [32, 34] }],
        windows: [[32, 25, 46, 25], [100, 56, 100, 68]],
    },
};

// Nearest raw wall to a thumbnail-space point, with the projected fraction
// (0..1) along it — used to attach a door/window to the wall it sits on.
const nearestWallHit = (rawWalls, px, py) => {
    let best = null;
    rawWalls.forEach((w, index) => {
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

// Core converter: raw thumbnail-space wall segments + thumbnail-format
// doors/windows → Plan Preview walls with openings, scaled to content space
// and centered on a `screenWidth`-wide canvas.
const buildRoom = (rawWalls, doors, windows, screenWidth, scale = CONTENT_SCALE) => {
    if (rawWalls.length < 3) return [];
    const xs = rawWalls.flatMap((w) => [w.x1, w.x2]);
    const ys = rawWalls.flatMap((w) => [w.y1, w.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const offX = (screenWidth - (maxX - minX) * scale) / 2 - minX * scale;
    const offY = 220 - minY * scale;
    const TX = (x) => x * scale + offX;
    const TY = (y) => y * scale + offY;

    const walls = rawWalls.map((w) => ({
        x1: TX(w.x1),
        y1: TY(w.y1),
        x2: TX(w.x2),
        y2: TY(w.y2),
        openings: [],
    }));

    (windows || []).forEach(([wx1, wy1, wx2, wy2]) => {
        const hit = nearestWallHit(rawWalls, (wx1 + wx2) / 2, (wy1 + wy2) / 2);
        if (!hit || hit.d > 8) return;
        walls[hit.index].openings.push({
            kind: "window",
            t: hit.t,
            width: Math.hypot(wx2 - wx1, wy2 - wy1) * scale,
        });
    });

    (doors || []).forEach((d) => {
        const [hx, hy] = d.hinge;
        const [ox, oy] = d.open;
        const dx = ox - hx;
        const dy = oy - hy;
        // The far jamb (closed leaf position) is the hinge point rotated 90°.
        const cx = d.flip ? hx + dy : hx - dy;
        const cy = d.flip ? hy - dx : hy + dx;
        const hit = nearestWallHit(rawWalls, (hx + cx) / 2, (hy + cy) / 2);
        if (!hit || hit.d > 8) return;
        const w = rawWalls[hit.index];
        const wl2 = (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2;
        const tOf = (x, y) =>
            wl2 ? ((x - w.x1) * (w.x2 - w.x1) + (y - w.y1) * (w.y2 - w.y1)) / wl2 : 0;
        walls[hit.index].openings.push({
            kind: "door",
            t: hit.t,
            width: Math.hypot(dx, dy) * scale,
            hinge: tOf(hx, hy) <= tOf(cx, cy) ? "a" : "b",
            flip: !!d.flip,
        });
    });

    return walls;
};

// A "Start from Blank" shape → Plan Preview walls (with its door/windows).
const shapeToWalls = (variant, screenWidth) => {
    const poly = SHAPE_POLYGONS[variant];
    if (!poly) return [];
    const rawWalls = poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    });
    const spec = SHAPE_OPENINGS[variant] || {};
    return buildRoom(rawWalls, spec.doors, spec.windows, screenWidth);
};

// A preset plan (outer shell + interior walls + doors/windows) → Plan Preview.
const presetToRoom = (plan, screenWidth) => {
    const raw = [];
    if (plan.shell) {
        const [x, y, w, h] = plan.shell;
        raw.push({ x1: x, y1: y, x2: x + w, y2: y });
        raw.push({ x1: x + w, y1: y, x2: x + w, y2: y + h });
        raw.push({ x1: x + w, y1: y + h, x2: x, y2: y + h });
        raw.push({ x1: x, y1: y + h, x2: x, y2: y });
    }
    (plan.walls || []).forEach(([x1, y1, x2, y2]) => raw.push({ x1, y1, x2, y2 }));
    return buildRoom(raw, plan.doors, plan.windows, screenWidth, PRESET_SCALE);
};

const PLANS = [
    { key: "scratch", label: "Draw Walls From Scratch", draw: true },
    {
        key: "1b1b-a",
        label: "1 Bedroom · 1 Bath",
        shell: [20, 22, 80, 58],
        walls: [[44, 58, 44, 80], [20, 58, 44, 58]],
        doors: [
            { hinge: [32, 58], open: [32, 48] },
            { hinge: [20, 42], open: [32, 42] },
        ],
        windows: [[40, 22, 52, 22], [70, 22, 82, 22], [100, 40, 100, 52]],
        beds: [[68, 30]],
        toilets: [[26, 66]],
    },
    {
        key: "1b1b-b",
        label: "1 Bedroom · 1 Bath",
        shell: [20, 22, 80, 58],
        walls: [[20, 48, 42, 48], [42, 22, 42, 48]],
        doors: [
            { hinge: [32, 48], open: [32, 58] },
            { hinge: [34, 80], open: [34, 68] },
        ],
        windows: [[100, 34, 100, 46], [100, 58, 100, 70]],
        beds: [[64, 38]],
        toilets: [[25, 28]],
    },
    {
        key: "1b1b-c",
        label: "1 Bedroom · 1 Bath",
        shell: [40, 20, 56, 62],
        dashedWalls: [[24, 20, 24, 50], [24, 20, 40, 20], [24, 50, 40, 50]],
        walls: [[40, 60, 62, 60], [62, 60, 62, 82]],
        doors: [
            { hinge: [52, 60], open: [52, 50] },
            { hinge: [72, 82], open: [72, 70] },
        ],
        windows: [[96, 30, 96, 42]],
        beds: [[74, 26]],
        toilets: [[46, 66]],
    },
    {
        key: "1b1b-d",
        label: "1 Bedroom · 1 Bath",
        shell: [34, 20, 52, 62],
        walls: [[62, 40, 86, 40], [62, 40, 62, 68], [62, 68, 86, 68]],
        doors: [
            { hinge: [62, 64], open: [72, 64], flip: true },
            { hinge: [46, 82], open: [46, 70] },
        ],
        windows: [[44, 20, 56, 20]],
        beds: [[38, 26]],
        baths: [[68, 45]],
    },
    {
        key: "1b1b-e",
        label: "1 Bedroom · 1 Bath",
        shell: [18, 24, 84, 54],
        walls: [[58, 24, 58, 78], [58, 60, 102, 60]],
        doors: [
            { hinge: [58, 36], open: [48, 36] },
            { hinge: [70, 60], open: [70, 70] },
            { hinge: [18, 50], open: [30, 50] },
        ],
        windows: [[66, 24, 80, 24], [18, 32, 18, 42]],
        beds: [[70, 32]],
        baths: [[74, 64]],
    },
    {
        key: "2b1b-a",
        label: "2 Bedrooms · 1 Bath",
        shell: [18, 22, 84, 60],
        walls: [
            [56, 22, 56, 82],
            [18, 52, 56, 52],
            [70, 62, 70, 82],
            [70, 62, 102, 62],
        ],
        doors: [
            { hinge: [56, 34], open: [46, 34] },
            { hinge: [56, 70], open: [46, 70] },
            { hinge: [70, 68], open: [80, 68] },
            { hinge: [102, 40], open: [90, 40] },
        ],
        windows: [[28, 22, 40, 22], [70, 22, 84, 22]],
        beds: [[26, 30], [26, 60]],
        toilets: [[82, 68]],
    },
    {
        key: "2b1b-b",
        label: "2 Bedrooms · 1 Bath",
        shell: [36, 20, 66, 62],
        dashedWalls: [[24, 20, 24, 82], [24, 20, 36, 20], [24, 82, 36, 82]],
        walls: [[36, 48, 102, 48], [62, 48, 62, 82]],
        doors: [
            { hinge: [86, 48], open: [86, 38] },
            { hinge: [62, 70], open: [52, 70] },
            { hinge: [102, 64], open: [90, 64] },
        ],
        windows: [[102, 26, 102, 38]],
        beds: [[44, 28], [78, 60]],
        baths: [[40, 62]],
    },
    {
        key: "1b1b-f",
        label: "1 Bedroom · 1 Bath",
        shell: [16, 26, 88, 50],
        walls: [[64, 26, 64, 76], [64, 50, 104, 50]],
        doors: [
            { hinge: [16, 40], open: [30, 40] },
            { hinge: [64, 42], open: [54, 42] },
            { hinge: [76, 50], open: [76, 60] },
        ],
        windows: [[30, 26, 44, 26], [104, 58, 104, 68]],
        beds: [[74, 32]],
        toilets: [[82, 58]],
    },
    {
        key: "1b2b-a",
        label: "1 Bedroom · 2 Baths",
        shell: [20, 22, 80, 58],
        walls: [
            [50, 22, 50, 52],
            [20, 52, 50, 52],
            [76, 22, 76, 44],
            [76, 44, 100, 44],
            [70, 60, 70, 80],
            [70, 60, 100, 60],
        ],
        doors: [
            { hinge: [50, 40], open: [60, 40] },
            { hinge: [76, 36], open: [66, 36] },
            { hinge: [70, 72], open: [60, 72] },
            { hinge: [36, 80], open: [36, 68] },
        ],
        windows: [[56, 22, 68, 22]],
        beds: [[26, 30]],
        toilets: [[82, 27]],
        baths: [[74, 66]],
    },
    {
        key: "2b2b-a",
        label: "2 Bedrooms · 2 Baths",
        shell: [24, 20, 72, 64],
        walls: [
            [58, 20, 58, 84],
            [24, 42, 58, 42],
            [24, 64, 58, 64],
            [58, 34, 96, 34],
        ],
        doors: [
            { hinge: [58, 40], open: [48, 40] },
            { hinge: [58, 54], open: [48, 54] },
            { hinge: [58, 76], open: [48, 76] },
            { hinge: [70, 34], open: [70, 44] },
            { hinge: [74, 84], open: [74, 72] },
        ],
        windows: [[24, 26, 24, 36], [96, 52, 96, 64]],
        beds: [[30, 26], [30, 70]],
        baths: [[30, 49]],
        toilets: [[72, 23]],
    },
];

export const FloorPlanScreen = ({ navigation }) => {
    const { width: winWidth } = useWindowDimensions();
    const { canUseAi, onAiSuccess } = useEntitlements();
    const [floorPlan, setFloorPlan] = useState(null);
    const [pendingAsset, setPendingAsset] = useState(null);
    const [recognizing, setRecognizing] = useState(false);

    const pickSource = async (source) => {
        const options = {
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.8,
        };
        try {
            let result;
            if (source === "camera") {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Camera access needed",
                        "Enable camera access in Settings to capture a floor plan."
                    );
                    return;
                }
                result = await ImagePicker.launchCameraAsync(options);
            } else {
                const perm =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Photo access needed",
                        "Enable photo access in Settings to choose a floor plan."
                    );
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync(options);
            }

            if (!result.canceled) {
                setPendingAsset(result.assets[0]);
            }
        } catch (e) {
            Alert.alert(
                "Something went wrong",
                "Couldn't open the image source. Please try again."
            );
        }
    };

    const chooseUploadSource = () => {
        if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ["Photo Gallery", "Camera", "Cancel"],
                    cancelButtonIndex: 2,
                    userInterfaceStyle: "dark",
                },
                (index) => {
                    if (index === 0) pickSource("gallery");
                    else if (index === 1) pickSource("camera");
                }
            );
        } else {
            Alert.alert("Upload Floor Plan", undefined, [
                { text: "Photo Gallery", onPress: () => pickSource("gallery") },
                { text: "Camera", onPress: () => pickSource("camera") },
                { text: "Cancel", style: "cancel" },
            ]);
        }
    };

    const handleImport = (key) => {
        if (key === "upload") {
            chooseUploadSource();
        }
    };

    const startAutoRecognition = async (uri) => {
        if (!canUseAi) {
            navigation.navigate("Paywall");
            return;
        }
        setRecognizing(true);
        try {
            const rec = await recognizeFloorPlan(uri);
            const walls = recognizedToWalls(rec, winWidth);
            if (walls.length < 3) {
                throw new Error("Couldn't build a room from the detected walls.");
            }
            onAiSuccess();
            navigation.navigate("PlanPreview", { walls });
        } catch (e) {
            report(e, { feature: "recognition", source: "floorplan" });
            Alert.alert("Automatic Recognition", String(e?.message ?? e));
        } finally {
            setRecognizing(false);
        }
    };
    const startManualDrawing = (uri) => {
        navigation.navigate("DrawWalls", { imageUri: uri });
    };

    // Shown after a floor plan photo is confirmed. Cancel returns to this screen.
    const showImportOptions = (uri) => {
        if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    title: "Floor Plan Import",
                    options: [
                        "Automatic Recognition (PRO)",
                        "Manual Walls Drawing",
                        "Cancel",
                    ],
                    cancelButtonIndex: 2,
                    userInterfaceStyle: "dark",
                },
                (index) => {
                    if (index === 0) startAutoRecognition(uri);
                    else if (index === 1) startManualDrawing(uri);
                }
            );
        } else {
            Alert.alert("Floor Plan Import", undefined, [
                {
                    text: "Automatic Recognition (PRO)",
                    onPress: () => startAutoRecognition(uri),
                },
                {
                    text: "Manual Walls Drawing",
                    onPress: () => startManualDrawing(uri),
                },
                { text: "Cancel", style: "cancel" },
            ]);
        }
    };
    // Selecting a "Start from Blank" shape opens Plan Preview with that
    // outline already drawn as walls.
    const handleSelectShape = (variant) => {
        const walls = shapeToWalls(variant, winWidth);
        if (walls.length) navigation.navigate("PlanPreview", { walls });
    };
    // "Draw Walls From Scratch" opens the empty editor; the furnished presets
    // open Plan Preview with their walls, doors and windows drawn.
    const handleSelectPlan = (key) => {
        const plan = PLANS.find((p) => p.key === key);
        if (!plan) return;
        if (plan.draw) {
            navigation.navigate("DrawWalls", {});
            return;
        }
        const walls = presetToRoom(plan, winWidth);
        if (walls.length) navigation.navigate("PlanPreview", { walls });
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.navigate("HomeScreen")}
                    scaleTo={0.9}
                    style={styles.backButton}
                    hitSlop={10}
                >
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                </AnimatedPressable>
                <Text style={styles.headerTitle}>Floor Plan</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Selected floor plan preview */}
                {floorPlan?.uri && (
                    <FadeSlideIn>
                        <View style={styles.previewCard}>
                            <SafeImage
                                source={{ uri: floorPlan.uri }}
                                style={styles.previewImage}
                                resizeMode="cover"
                            />
                            <AnimatedPressable
                                onPress={() => setFloorPlan(null)}
                                scaleTo={0.88}
                                style={styles.previewClose}
                                hitSlop={8}
                            >
                                <Ionicons name="close" size={18} color="#FFFFFF" />
                            </AnimatedPressable>
                            <View style={styles.previewFooter}>
                                <View style={styles.previewText}>
                                    <Text style={styles.previewTitle}>
                                        Floor plan ready
                                    </Text>
                                    <Text style={styles.previewSubtitle}>
                                        Continue to convert it into 3D
                                    </Text>
                                </View>
                                <AnimatedPressable
                                    onPress={() => showImportOptions(floorPlan.uri)}
                                    scaleTo={0.94}
                                    style={styles.previewButton}
                                >
                                    <Text style={styles.previewButtonText}>
                                        Continue
                                    </Text>
                                </AnimatedPressable>
                            </View>
                        </View>
                    </FadeSlideIn>
                )}

                {/* Import options */}
                {IMPORT_OPTIONS.map((opt, index) => (
                    <FadeSlideIn key={opt.key} delay={index * 80}>
                        <AnimatedPressable
                            onPress={() => handleImport(opt.key)}
                            scaleTo={0.98}
                            style={styles.optionCard}
                        >
                            <View style={styles.optionIcon}>
                                <Ionicons
                                    name={opt.icon}
                                    size={24}
                                    color={colors.text}
                                />
                            </View>
                            <View style={styles.optionText}>
                                <View style={styles.optionTitleRow}>
                                    <Text style={styles.optionTitle}>
                                        {opt.title}
                                    </Text>
                                    {opt.pro && (
                                        <View style={styles.proBadge}>
                                            <Text style={styles.proText}>PRO</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.optionSubtitle}>
                                    {opt.subtitle}
                                </Text>
                            </View>
                        </AnimatedPressable>
                    </FadeSlideIn>
                ))}

                {/* Start from blank */}
                <FadeSlideIn delay={160}>
                    <Text style={styles.sectionTitle}>Start from Blank</Text>
                </FadeSlideIn>

                <View style={styles.grid}>
                    {BLANK_SHAPES.map((shape, index) => (
                        <FadeSlideIn
                            key={shape.key}
                            delay={200 + index * 60}
                            style={styles.gridSlot}
                        >
                            <AnimatedPressable
                                onPress={() => handleSelectShape(shape.key)}
                                style={styles.tile}
                            >
                                <View style={styles.tileArt}>
                                    <RoomOutline variant={shape.variant} />
                                </View>
                                <Text style={styles.tileLabel}>{shape.label}</Text>
                            </AnimatedPressable>
                        </FadeSlideIn>
                    ))}
                </View>

                {/* Preset plans */}
                <View style={[styles.grid, styles.gridTopGap]}>
                    {PLANS.map((plan, index) => (
                        <FadeSlideIn
                            key={plan.key}
                            delay={200 + index * 60}
                            style={styles.gridSlot}
                        >
                            <AnimatedPressable
                                onPress={() => handleSelectPlan(plan.key)}
                                style={styles.tile}
                            >
                                <View style={styles.tileArt}>
                                    {plan.draw ? (
                                        <DrawGlyph />
                                    ) : (
                                        <PlanThumb
                                            shell={plan.shell}
                                            walls={plan.walls}
                                            dashedWalls={plan.dashedWalls}
                                            doors={plan.doors}
                                            windows={plan.windows}
                                            beds={plan.beds}
                                            toilets={plan.toilets}
                                            baths={plan.baths}
                                        />
                                    )}
                                </View>
                                <Text style={styles.tileLabel} numberOfLines={1}>
                                    {plan.label}
                                </Text>
                            </AnimatedPressable>
                        </FadeSlideIn>
                    ))}
                </View>
            </ScrollView>

            <AdjustPhotoModal
                visible={pendingAsset !== null}
                asset={pendingAsset}
                onCancel={() => setPendingAsset(null)}
                onDone={({ uri }) => {
                    setFloorPlan({ uri });
                    setPendingAsset(null);
                    // let the adjust sheet finish dismissing before presenting
                    setTimeout(() => showImportOptions(uri), 450);
                }}
            />

            {recognizing && (
                <View style={styles.recognizeOverlay} pointerEvents="auto">
                    <View style={styles.recognizeCard}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.recognizeTitle}>Recognizing floor plan…</Text>
                        <Text style={styles.recognizeSub}>
                            Detecting walls, doors and windows with AI.
                        </Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    recognizeOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.45)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
    },
    recognizeCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 28,
        paddingHorizontal: 32,
        alignItems: "center",
        maxWidth: 300,
        ...shadow.floating,
    },
    recognizeTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: colors.text,
        marginTop: 16,
    },
    recognizeSub: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 6,
        textAlign: "center",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 40,
    },
    previewCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        overflow: "hidden",
        marginBottom: 20,
        ...shadow.card,
    },
    previewImage: {
        width: "100%",
        height: 200,
        backgroundColor: colors.surfaceAlt,
    },
    previewClose: {
        position: "absolute",
        top: 12,
        right: 12,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "rgba(17, 24, 39, 0.6)",
        alignItems: "center",
        justifyContent: "center",
    },
    previewFooter: {
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
    },
    previewText: {
        flex: 1,
        marginRight: 12,
    },
    previewTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
    },
    previewSubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    previewButton: {
        backgroundColor: colors.primary,
        borderRadius: radius.pill,
        paddingHorizontal: 20,
        paddingVertical: 11,
    },
    previewButtonText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "700",
    },
    optionCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: 14,
        marginBottom: 14,
        ...shadow.card,
    },
    optionIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    optionText: {
        flex: 1,
    },
    optionTitleRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: colors.text,
    },
    optionSubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    proBadge: {
        backgroundColor: colors.successSoft,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginLeft: 8,
    },
    proText: {
        color: colors.success,
        fontSize: 11,
        fontWeight: "800",
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: "800",
        color: colors.text,
        marginTop: 12,
        marginBottom: 16,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    gridTopGap: {
        marginTop: 4,
    },
    gridSlot: {
        width: "48%",
        marginBottom: 18,
    },
    tile: {
        width: "100%",
    },
    tileArt: {
        aspectRatio: 1.5,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        padding: 14,
    },
    tileLabel: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
        marginTop: 8,
    },
});
