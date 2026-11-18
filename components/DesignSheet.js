import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import {
    DEFAULT_FLOOR_FINISH,
    FLOOR_FINISHES,
    WALL_COLORS,
    WALL_TEXTURES,
    floorPattern2D,
    wallTexture,
} from "../utils/finishes";
import { colors, radius } from "../utils/theme";

const ProBadge = () => (
    <View style={styles.proBadge}>
        <Text style={styles.proText}>PRO</Text>
    </View>
);

// Small square preview of a floor finish, drawn with the same pattern as
// the plan (at a larger scale so planks/tiles read at thumbnail size).
const FloorSwatch = ({ finishKey }) => {
    const box = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const p = floorPattern2D(finishKey, box, 1.6);
    return (
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Rect x={0} y={0} width={100} height={100} fill={p.base} />
            {p.rects.map((r, i) => (
                <G key={i} transform={r.rot ? `rotate(${r.rot} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}>
                    <Rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
                </G>
            ))}
            {p.lines.map((l, i) => (
                <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={p.lineColor} strokeWidth={1.5} />
            ))}
        </Svg>
    );
};

// "Design" bottom sheet: floor finish for the current floor level, and wall
// finish (paint color or a tinted texture) for the selected wall or every
// wall on the floor. Textures and premium floors are PRO.
export const DesignSheet = ({
    visible,
    initialTab = "floor",
    floorName,
    floorFinishKey,
    wallFinish,
    hasSelectedWall,
    pro,
    onApply,
    onProBlocked,
    onClose,
}) => {
    const [tab, setTab] = useState(initialTab);
    const [floorDraft, setFloorDraft] = useState(floorFinishKey);
    const [wallDraft, setWallDraft] = useState(wallFinish);

    useEffect(() => {
        if (visible) {
            setTab(initialTab);
            setFloorDraft(floorFinishKey || DEFAULT_FLOOR_FINISH);
            setWallDraft(wallFinish);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    if (!visible || !wallDraft) return null;

    const pickFloor = (f) => {
        if (f.pro && !pro) return onProBlocked();
        setFloorDraft(f.key);
    };
    const pickTexture = (t) => {
        if (t.pro && !pro) return onProBlocked();
        // A texture starts in its natural color (paint keeps the current one).
        setWallDraft((w) => ({ texture: t.key, color: t.key === "paint" ? w.color : t.color ?? w.color }));
    };

    const wallChanged =
        wallDraft.texture !== wallFinish.texture ||
        (wallDraft.color || "").toLowerCase() !== (wallFinish.color || "").toLowerCase();
    const floorChanged = floorDraft !== (floorFinishKey || DEFAULT_FLOOR_FINISH);

    const apply = (allWalls) => {
        onApply({
            floorFinish: floorChanged ? floorDraft : null,
            wallFinish: wallChanged || allWalls ? wallDraft : null,
            allWalls: allWalls || !hasSelectedWall,
        });
        onClose();
    };

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Design</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <View style={styles.tabs}>
                    {[
                        { key: "floor", label: "Floor", icon: "grid-outline" },
                        { key: "walls", label: "Walls", icon: "color-palette-outline" },
                    ].map((t) => {
                        const active = t.key === tab;
                        return (
                            <Pressable
                                key={t.key}
                                onPress={() => setTab(t.key)}
                                style={[styles.tab, active && styles.tabActive]}
                            >
                                <Ionicons name={t.icon} size={16} color={active ? colors.text : colors.textMuted} />
                                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                    {tab === "floor" ? (
                        <>
                            <Text style={styles.scope}>Floor finish for {floorName}</Text>
                            <View style={styles.grid}>
                                {FLOOR_FINISHES.map((f) => {
                                    const active = f.key === floorDraft;
                                    return (
                                        <Pressable key={f.key} onPress={() => pickFloor(f)} style={styles.tile}>
                                            <View style={[styles.swatchBox, active && styles.swatchBoxActive]}>
                                                <FloorSwatch finishKey={f.key} />
                                                {f.pro && !pro && (
                                                    <View style={styles.badgeCorner}>
                                                        <ProBadge />
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.tileLabel, active && styles.tileLabelActive]} numberOfLines={1}>
                                                {f.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.scope}>
                                {hasSelectedWall ? "Selected wall" : `All walls on ${floorName}`}
                            </Text>
                            <Text style={styles.label}>Finish</Text>
                            <View style={styles.chips}>
                                {WALL_TEXTURES.map((t) => {
                                    const active = t.key === wallDraft.texture;
                                    return (
                                        <Pressable
                                            key={t.key}
                                            onPress={() => pickTexture(t)}
                                            style={[styles.chip, active && styles.chipActive]}
                                        >
                                            <Ionicons
                                                name={t.icon}
                                                size={15}
                                                color={active ? "#FFFFFF" : colors.text}
                                            />
                                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                                            {t.pro && !pro && <ProBadge />}
                                        </Pressable>
                                    );
                                })}
                            </View>
                            <Text style={styles.label}>
                                {wallDraft.texture === "paint" ? "Paint color" : `${wallTexture(wallDraft.texture).label} color`}
                            </Text>
                            <View style={styles.colors}>
                                {[
                                    ...(WALL_COLORS.includes(wallDraft.color) ? [] : [wallDraft.color]),
                                    ...WALL_COLORS,
                                ].map((c) => {
                                    const active = c.toLowerCase() === (wallDraft.color || "").toLowerCase();
                                    return (
                                        <Pressable
                                            key={c}
                                            onPress={() => setWallDraft((w) => ({ ...w, color: c }))}
                                            style={[styles.colorRing, active && styles.colorRingActive]}
                                        >
                                            <View style={[styles.colorDot, { backgroundColor: c }]} />
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}
                </ScrollView>

                <View style={styles.actions}>
                    {hasSelectedWall && tab === "walls" && (
                        <AnimatedPressable onPress={() => apply(true)} scaleTo={0.96} style={[styles.button, styles.buttonGhost]}>
                            <Text style={[styles.buttonText, styles.buttonGhostText]}>Apply to all walls</Text>
                        </AnimatedPressable>
                    )}
                    <AnimatedPressable
                        onPress={() => apply(false)}
                        disabled={!wallChanged && !floorChanged}
                        scaleTo={0.96}
                        style={[styles.button, !wallChanged && !floorChanged && styles.buttonDisabled]}
                    >
                        <Text style={styles.buttonText}>Apply</Text>
                    </AnimatedPressable>
                </View>
            </FadeSlideIn>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", zIndex: 40 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.35)" },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 30,
        maxHeight: "86%",
        shadowColor: "#0F172A",
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -6 },
        elevation: 16,
    },
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.border,
        marginBottom: 6,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
    headerSide: { width: 30 },
    title: { fontSize: 17, fontWeight: "800", color: colors.text },
    closeCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    tabs: { flexDirection: "row", padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginTop: 4 },
    tab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 36,
        borderRadius: radius.pill,
    },
    tabActive: { backgroundColor: colors.surface, shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
    tabTextActive: { color: colors.text },
    body: { flexGrow: 0, marginTop: 12 },
    scope: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
    tile: { width: "33.333%", padding: 5, alignItems: "center" },
    swatchBox: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: radius.md,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "transparent",
    },
    swatchBoxActive: { borderColor: colors.primary },
    badgeCorner: { position: "absolute", top: 6, right: 6 },
    tileLabel: { fontSize: 12, fontWeight: "600", color: colors.text, marginTop: 5 },
    tileLabelActive: { color: colors.primary, fontWeight: "800" },
    label: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 6, marginBottom: 8 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 36,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
    },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
    chipTextActive: { color: "#FFFFFF" },
    colors: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    colorRing: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    colorRingActive: { borderColor: colors.primary },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.2)" },
    proBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: colors.accent },
    proText: { fontSize: 10, fontWeight: "800", color: "#FFFFFF" },
    actions: { flexDirection: "row", gap: 10, marginTop: 16 },
    button: {
        flex: 1,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    buttonDisabled: { opacity: 0.45 },
    buttonText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
    buttonGhost: { backgroundColor: colors.surfaceAlt },
    buttonGhostText: { color: colors.text },
});
