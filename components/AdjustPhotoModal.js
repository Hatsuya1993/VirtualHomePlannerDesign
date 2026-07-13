import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    PanResponder,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { SafeImage } from "./SafeImage";
import { colors, radius } from "../utils/theme";

const MIN_CROP = 48; // minimum crop size in display points
const HANDLE = 26;

// Bottom-sheet editor shown after a floor plan photo is picked/captured.
// The user drags/resizes a crop rectangle; crop/rotate/flip are baked into
// the image via expo-image-manipulator.
export const AdjustPhotoModal = ({ visible, asset, onCancel, onDone }) => {
    const [working, setWorking] = useState(null);
    const [container, setContainer] = useState({ w: 0, h: 0 });
    const [crop, setCrop] = useState(null);
    const [busy, setBusy] = useState(false);

    const cropRef = useRef(null);
    const startRef = useRef(null);
    const boundsRef = useRef(null);
    cropRef.current = crop;

    // Reset editing state whenever a new asset arrives.
    useEffect(() => {
        if (asset) {
            setWorking({ uri: asset.uri, width: asset.width, height: asset.height });
        }
    }, [asset]);

    // Layout of the image inside the container (contain-fit).
    const layout =
        container.w && working
            ? (() => {
                  const scale = Math.min(
                      container.w / working.width,
                      container.h / working.height
                  );
                  const dispW = working.width * scale;
                  const dispH = working.height * scale;
                  return {
                      scale,
                      dispW,
                      dispH,
                      offsetX: (container.w - dispW) / 2,
                      offsetY: (container.h - dispH) / 2,
                  };
              })()
            : null;

    // Reset crop rectangle to the full image whenever the layout changes.
    const layoutKey = layout
        ? `${layout.offsetX.toFixed(1)}:${layout.offsetY.toFixed(1)}:${layout.dispW.toFixed(1)}:${layout.dispH.toFixed(1)}`
        : "";
    useEffect(() => {
        if (layout) {
            setCrop({
                x: layout.offsetX,
                y: layout.offsetY,
                w: layout.dispW,
                h: layout.dispH,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutKey]);

    const bounds = layout
        ? {
              minX: layout.offsetX,
              minY: layout.offsetY,
              maxX: layout.offsetX + layout.dispW,
              maxY: layout.offsetY + layout.dispH,
          }
        : null;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // Drag the whole crop rectangle.
    const moveResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startRef.current = cropRef.current;
            },
            onPanResponderMove: (_e, g) => {
                const s = startRef.current;
                const b = boundsRef.current;
                if (!s || !b) return;
                const x = clamp(s.x + g.dx, b.minX, b.maxX - s.w);
                const y = clamp(s.y + g.dy, b.minY, b.maxY - s.h);
                setCrop({ ...s, x, y });
            },
        })
    ).current;

    // Keep bounds accessible inside the persistent responders.
    boundsRef.current = bounds;

    // Build a corner-resize responder. sx/sy indicate which edges move.
    const makeCorner = (sx, sy) =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startRef.current = cropRef.current;
            },
            onPanResponderMove: (_e, g) => {
                const s = startRef.current;
                const b = boundsRef.current;
                if (!s || !b) return;
                let { x, y, w, h } = s;
                if (sx < 0) {
                    const nx = clamp(s.x + g.dx, b.minX, s.x + s.w - MIN_CROP);
                    w = s.x + s.w - nx;
                    x = nx;
                } else {
                    w = clamp(s.w + g.dx, MIN_CROP, b.maxX - s.x);
                }
                if (sy < 0) {
                    const ny = clamp(s.y + g.dy, b.minY, s.y + s.h - MIN_CROP);
                    h = s.y + s.h - ny;
                    y = ny;
                } else {
                    h = clamp(s.h + g.dy, MIN_CROP, b.maxY - s.y);
                }
                setCrop({ x, y, w, h });
            },
        });

    const corners = useRef({
        tl: makeCorner(-1, -1),
        tr: makeCorner(1, -1),
        bl: makeCorner(-1, 1),
        br: makeCorner(1, 1),
    }).current;

    if (!asset || !working) {
        return <Modal visible={visible} transparent animationType="slide" />;
    }

    const runManip = async (actions) => {
        setBusy(true);
        try {
            const result = await ImageManipulator.manipulateAsync(
                working.uri,
                actions,
                { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            setWorking(result);
        } catch (e) {
            // keep previous image on failure
        } finally {
            setBusy(false);
        }
    };

    const resetImage = () =>
        setWorking({ uri: asset.uri, width: asset.width, height: asset.height });

    const finish = async () => {
        if (!layout || !crop) {
            onDone({ uri: working.uri });
            return;
        }
        const originX = clamp(
            Math.round((crop.x - layout.offsetX) / layout.scale),
            0,
            working.width - 1
        );
        const originY = clamp(
            Math.round((crop.y - layout.offsetY) / layout.scale),
            0,
            working.height - 1
        );
        const w = clamp(
            Math.round(crop.w / layout.scale),
            1,
            working.width - originX
        );
        const h = clamp(
            Math.round(crop.h / layout.scale),
            1,
            working.height - originY
        );

        // Skip the round-trip if the crop is essentially the whole image.
        const isFull =
            originX <= 1 &&
            originY <= 1 &&
            w >= working.width - 2 &&
            h >= working.height - 2;
        if (isFull) {
            onDone({ uri: working.uri });
            return;
        }

        setBusy(true);
        try {
            const result = await ImageManipulator.manipulateAsync(
                working.uri,
                [{ crop: { originX, originY, width: w, height: h } }],
                { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            onDone({ uri: result.uri });
        } catch (e) {
            onDone({ uri: working.uri });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Adjust photo</Text>
                        <AnimatedPressable
                            onPress={onCancel}
                            scaleTo={0.85}
                            style={styles.closeButton}
                            hitSlop={8}
                        >
                            <Ionicons name="close" size={20} color={colors.text} />
                        </AnimatedPressable>
                    </View>

                    {/* Image + crop overlay */}
                    <View
                        style={styles.imageWrap}
                        onLayout={(e) =>
                            setContainer({
                                w: e.nativeEvent.layout.width,
                                h: e.nativeEvent.layout.height,
                            })
                        }
                    >
                        <SafeImage
                            source={{ uri: working?.uri }}
                            style={styles.image}
                            resizeMode="contain"
                        />

                        {crop && (
                            <>
                                {/* Dim outside the crop rectangle */}
                                <View style={[styles.dim, { left: 0, top: 0, right: 0, height: crop.y }]} pointerEvents="none" />
                                <View style={[styles.dim, { left: 0, top: crop.y + crop.h, right: 0, bottom: 0 }]} pointerEvents="none" />
                                <View style={[styles.dim, { left: 0, top: crop.y, width: crop.x, height: crop.h }]} pointerEvents="none" />
                                <View style={[styles.dim, { left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }]} pointerEvents="none" />

                                {/* Crop frame (draggable) */}
                                <View
                                    style={[
                                        styles.cropFrame,
                                        { left: crop.x, top: crop.y, width: crop.w, height: crop.h },
                                    ]}
                                    {...moveResponder.panHandlers}
                                >
                                    <View style={[styles.gridV, { left: "33.33%" }]} />
                                    <View style={[styles.gridV, { left: "66.66%" }]} />
                                    <View style={[styles.gridH, { top: "33.33%" }]} />
                                    <View style={[styles.gridH, { top: "66.66%" }]} />
                                </View>

                                {/* Corner handles */}
                                <View style={[styles.handleHit, { left: crop.x - HANDLE / 2, top: crop.y - HANDLE / 2 }]} {...corners.tl.panHandlers}>
                                    <View style={[styles.corner, styles.cornerTL]} />
                                </View>
                                <View style={[styles.handleHit, { left: crop.x + crop.w - HANDLE / 2, top: crop.y - HANDLE / 2 }]} {...corners.tr.panHandlers}>
                                    <View style={[styles.corner, styles.cornerTR]} />
                                </View>
                                <View style={[styles.handleHit, { left: crop.x - HANDLE / 2, top: crop.y + crop.h - HANDLE / 2 }]} {...corners.bl.panHandlers}>
                                    <View style={[styles.corner, styles.cornerBL]} />
                                </View>
                                <View style={[styles.handleHit, { left: crop.x + crop.w - HANDLE / 2, top: crop.y + crop.h - HANDLE / 2 }]} {...corners.br.panHandlers}>
                                    <View style={[styles.corner, styles.cornerBR]} />
                                </View>
                            </>
                        )}

                        {busy && (
                            <View style={styles.busy}>
                                <ActivityIndicator color="#FFFFFF" />
                            </View>
                        )}
                    </View>

                    {/* Transform tools */}
                    <View style={styles.toolRow}>
                        <ToolButton icon="refresh-outline" label="Rotate left" mirror onPress={() => runManip([{ rotate: -90 }])} />
                        <ToolButton icon="refresh-outline" label="Rotate right" onPress={() => runManip([{ rotate: 90 }])} />
                        <ToolButton icon="swap-horizontal-outline" label="Flip" onPress={() => runManip([{ flip: ImageManipulator.FlipType.Horizontal }])} />
                        <ToolButton icon="arrow-undo-outline" label="Reset" onPress={resetImage} />
                    </View>

                    {/* Actions */}
                    <View style={styles.actionRow}>
                        <AnimatedPressable
                            onPress={() => onDone({ uri: asset.uri })}
                            scaleTo={0.96}
                            style={[styles.actionButton, styles.skipButton]}
                        >
                            <Text style={styles.skipText}>Skip</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            onPress={finish}
                            scaleTo={0.96}
                            style={[styles.actionButton, styles.continueButton]}
                        >
                            <Text style={styles.continueText}>Continue</Text>
                        </AnimatedPressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const ToolButton = ({ icon, label, onPress, mirror }) => (
    <AnimatedPressable onPress={onPress} scaleTo={0.9} style={styles.tool}>
        <View style={mirror && { transform: [{ scaleX: -1 }] }}>
            <Ionicons name={icon} size={22} color={colors.text} />
        </View>
        <Text style={styles.toolLabel}>{label}</Text>
    </AnimatedPressable>
);

const CORNER = 20;
const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 28,
        maxHeight: "92%",
    },
    header: {
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    closeButton: {
        position: "absolute",
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    imageWrap: {
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: "#111827",
        aspectRatio: 0.82,
    },
    image: {
        width: "100%",
        height: "100%",
    },
    dim: {
        position: "absolute",
        backgroundColor: "rgba(0,0,0,0.45)",
    },
    cropFrame: {
        position: "absolute",
        borderWidth: 1.5,
        borderColor: "#FFFFFF",
    },
    gridV: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255,255,255,0.5)",
    },
    gridH: {
        position: "absolute",
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255,255,255,0.5)",
    },
    handleHit: {
        position: "absolute",
        width: HANDLE,
        height: HANDLE,
        alignItems: "center",
        justifyContent: "center",
    },
    corner: {
        width: CORNER,
        height: CORNER,
        borderColor: "#FFFFFF",
    },
    cornerTL: { borderLeftWidth: 3, borderTopWidth: 3 },
    cornerTR: { borderRightWidth: 3, borderTopWidth: 3 },
    cornerBL: { borderLeftWidth: 3, borderBottomWidth: 3 },
    cornerBR: { borderRightWidth: 3, borderBottomWidth: 3 },
    busy: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.25)",
    },
    toolRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingVertical: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        marginTop: 4,
    },
    tool: {
        alignItems: "center",
    },
    toolLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.textMuted,
        marginTop: 6,
    },
    actionRow: {
        flexDirection: "row",
        gap: 12,
    },
    actionButton: {
        borderRadius: radius.pill,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    skipButton: {
        flex: 1,
        backgroundColor: colors.surfaceAlt,
    },
    skipText: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
    },
    continueButton: {
        flex: 1.3,
        backgroundColor: colors.dark,
    },
    continueText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
