import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActionSheetIOS,
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdjustPhotoModal } from "../../components/AdjustPhotoModal";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import {
    DrawGlyph,
    PlanThumb,
    RoomOutline,
} from "../../components/FloorPlanShapes";
import { colors, radius, shadow } from "../../utils/theme";

const IMPORT_OPTIONS = [
    {
        key: "upload",
        title: "Upload Floor Plan",
        subtitle: "Photo Gallery or Camera",
        icon: "cloud-upload-outline",
    },
    {
        key: "scan",
        title: "Scan Your Room",
        subtitle: "Scan your room and turn it into a 3D layout",
        icon: "scan-outline",
        pro: true,
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
    const [floorPlan, setFloorPlan] = useState(null);
    const [pendingAsset, setPendingAsset] = useState(null);

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
            return;
        }
        // TODO: handle "scan" (PRO room scan flow)
        console.log("import", key);
    };

    const startAutoRecognition = (uri) => {
        // TODO: run PRO automatic wall recognition on the uploaded plan
        console.log("automatic recognition", uri);
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
    const handleSelectShape = (key) => console.log("shape", key);
    const handleSelectPlan = (key) => console.log("plan", key);

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
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
                {floorPlan && (
                    <FadeSlideIn>
                        <View style={styles.previewCard}>
                            <Image
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
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
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
