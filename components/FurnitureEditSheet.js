import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { useUnits } from "../context/UnitsContext";
import { catalogEntry, FURNITURE_COLORS } from "../utils/furnitureCatalog";
import { formatLength } from "../utils/units";
import { colors, radius } from "../utils/theme";

const MIN_IN = 1;
const MAX_IN = 480; // 40 ft
const MAX_ELEV_IN = 120;

// One dimension row with − / + buttons. Holding a button repeats, speeding up
// the longer it is held. `step` is in inches (1" imperial, 1 cm metric).
const Stepper = ({ label, value, onChange, step, min, max, units }) => {
    const timer = useRef(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const stop = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };
    useEffect(() => stop, []);

    const bump = (dir, mult = 1) => {
        const next = Math.max(min, Math.min(max, valueRef.current + dir * step * mult));
        // Snap to whole steps so repeated metric bumps don't drift.
        onChange(Math.round(next / step) * step);
    };

    const startRepeat = (dir) => {
        let n = 0;
        const tick = () => {
            n += 1;
            bump(dir, n > 12 ? 6 : n > 5 ? 3 : 1);
            timer.current = setTimeout(tick, 90);
        };
        timer.current = setTimeout(tick, 300);
    };

    // A render helper (not a component) so the Pressables keep their identity
    // across re-renders — otherwise a hold-to-repeat would lose its press-out.
    const btn = (dir, icon) => (
        <Pressable
            onPress={() => bump(dir)}
            onLongPress={() => startRepeat(dir)}
            onPressOut={stop}
            delayLongPress={300}
            hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
        >
            <Ionicons name={icon} size={20} color={colors.text} />
        </Pressable>
    );

    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <View style={styles.stepper}>
                {btn(-1, "remove")}
                <Text style={styles.stepValue}>{formatLength(value, units)}</Text>
                {btn(1, "add")}
            </View>
        </View>
    );
};

// Bottom sheet for editing one placed piece: width / depth / height, height
// off the floor (for TVs, wall cabinets…) and color. Edits are kept as a
// draft and applied in one step (one undo point) with "Apply".
export const FurnitureEditSheet = ({ visible, item, onApply, onClose }) => {
    const { units } = useUnits();
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        if (visible && item) {
            setDraft({ w: item.w, d: item.d, h: item.h, elev: item.elev ?? 0, color: item.color });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item?.id]);

    if (!visible || !item || !draft) return null;

    const entry = catalogEntry(item.type);
    const metric = units.system === "m" || units.system === "cm";
    const step = metric ? 1 / 2.54 : 1;
    const isRug = entry.shape === "rug" || entry.shape === "roundRug";
    const round = entry.shape === "roundTable" || entry.shape === "roundRug" || entry.shape === "stool";
    const set = (k) => (v) =>
        setDraft((d) => {
            // Round pieces stay round: width and depth move together.
            if (round && (k === "w" || k === "d")) return { ...d, w: v, d: v };
            return { ...d, [k]: v };
        });
    const swatches = [entry.color, ...FURNITURE_COLORS.filter((c) => c !== entry.color)];

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>{entry.name}</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <Stepper
                    label={round ? "Diameter" : "Width"}
                    value={draft.w}
                    onChange={set("w")}
                    step={step}
                    min={MIN_IN}
                    max={MAX_IN}
                    units={units}
                />
                {!round && (
                    <Stepper
                        label="Depth"
                        value={draft.d}
                        onChange={set("d")}
                        step={step}
                        min={MIN_IN}
                        max={MAX_IN}
                        units={units}
                    />
                )}
                {!isRug && (
                    <>
                        <Stepper
                            label="Height"
                            value={draft.h}
                            onChange={set("h")}
                            step={step}
                            min={MIN_IN}
                            max={MAX_IN}
                            units={units}
                        />
                        <Stepper
                            label="Off floor"
                            value={draft.elev}
                            onChange={set("elev")}
                            step={step}
                            min={0}
                            max={MAX_ELEV_IN}
                            units={units}
                        />
                    </>
                )}

                <Text style={styles.sectionLabel}>Color</Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.swatchRow}
                >
                    {swatches.map((c) => {
                        const active = c.toLowerCase() === (draft.color || "").toLowerCase();
                        return (
                            <Pressable
                                key={c}
                                onPress={() => setDraft((d) => ({ ...d, color: c }))}
                                style={[styles.swatchRing, active && styles.swatchRingActive]}
                            >
                                <View style={[styles.swatch, { backgroundColor: c }]} />
                            </Pressable>
                        );
                    })}
                </ScrollView>

                <View style={styles.actions}>
                    <AnimatedPressable
                        onPress={() =>
                            setDraft({
                                w: entry.w,
                                d: entry.d,
                                h: entry.h,
                                elev: entry.elev ?? 0,
                                color: entry.color,
                            })
                        }
                        scaleTo={0.96}
                        style={[styles.button, styles.buttonGhost]}
                    >
                        <Text style={[styles.buttonText, styles.buttonGhostText]}>Reset</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={() => {
                            onApply(draft);
                            onClose();
                        }}
                        scaleTo={0.96}
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>Apply</Text>
                    </AnimatedPressable>
                </View>
            </FadeSlideIn>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "flex-end",
        zIndex: 40,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.35)",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 30,
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
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        marginBottom: 4,
    },
    headerSide: { width: 30 },
    title: {
        fontSize: 17,
        fontWeight: "800",
        color: colors.text,
    },
    closeCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    rowLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
    },
    stepper: {
        flexDirection: "row",
        alignItems: "center",
    },
    stepBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    stepBtnPressed: {
        backgroundColor: colors.primarySoft,
    },
    stepValue: {
        minWidth: 96,
        textAlign: "center",
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
    },
    sectionLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
        marginTop: 14,
        marginBottom: 8,
    },
    swatchRow: {
        gap: 8,
        paddingVertical: 2,
    },
    swatchRing: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 2,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    swatchRingActive: {
        borderColor: colors.primary,
    },
    swatch: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(0,0,0,0.2)",
    },
    actions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 20,
    },
    button: {
        flex: 1,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    buttonText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    buttonGhost: {
        backgroundColor: colors.surfaceAlt,
    },
    buttonGhostText: {
        color: colors.text,
    },
});
