import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { Stepper } from "./FurnitureEditSheet";
import { useUnits } from "../context/UnitsContext";
import { catalogEntry, FURNITURE_COLORS } from "../utils/furnitureCatalog";
import { stairSteps } from "../utils/stairs";
import { formatLength } from "../utils/units";
import { colors, radius } from "../utils/theme";

const TYPES = [
    { key: "straight", label: "Straight", catalog: "straightStairs" },
    { key: "L", label: "L-shape", catalog: "lStairs" },
    { key: "U", label: "U-shape", catalog: "uStairs" },
    { key: "spiral", label: "Spiral", catalog: "spiralStairs" },
];
const RAIL_COLORS = ["#3B3F45", "#2F3237", "#9AA1A9", "#F4F1EA", "#7A5C43", "#C9A86A"];

// A row of mutually exclusive options.
const Segmented = ({ options, value, onChange }) => (
    <View style={styles.segment}>
        {options.map((o) => {
            const active = o.key === value;
            return (
                <Pressable
                    key={o.key}
                    onPress={() => onChange(o.key)}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
                </Pressable>
            );
        })}
    </View>
);

const Swatches = ({ list, value, onChange }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
        {list.map((c) => {
            const active = c.toLowerCase() === (value || "").toLowerCase();
            return (
                <Pressable
                    key={c}
                    onPress={() => onChange(c)}
                    style={[styles.swatchRing, active && styles.swatchRingActive]}
                >
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                </Pressable>
            );
        })}
    </ScrollView>
);

// Design sheet for a placed stair: type, size, steps, turn direction,
// handrails, risers and colors. Edits are drafted and applied as one undo step.
export const StairEditSheet = ({ visible, item, onApply, onClose }) => {
    const { units } = useUnits();
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        if (visible && item) {
            setDraft({ type: item.type, w: item.w, d: item.d, h: item.h, color: item.color, stair: { ...item.stair } });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item?.id]);

    if (!visible || !item || !draft) return null;

    const st = draft.stair;
    const metric = units.system === "m" || units.system === "cm";
    const step = metric ? 1 / 2.54 : 1;
    const isSpiral = st.type === "spiral";
    const turns = st.type !== "straight";
    const steps = stairSteps(draft);
    const rise = draft.h / steps;
    const setStair = (patch) => setDraft((d) => ({ ...d, stair: { ...d.stair, ...patch } }));

    // Switching type adopts that type's default footprint so the layout fits.
    const setType = (key) => {
        const t = TYPES.find((x) => x.key === key);
        const c = catalogEntry(t.catalog);
        setDraft((d) => ({
            ...d,
            type: t.catalog,
            w: c.w,
            d: c.d,
            stair: {
                ...d.stair,
                type: key,
                ...(key === "spiral" ? { risers: "open", handrail: d.stair.handrail === "none" ? "none" : "both" } : {}),
            },
        }));
    };

    const swatches = [catalogEntry(draft.type).color, ...FURNITURE_COLORS.filter((c) => c !== catalogEntry(draft.type).color)];

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Design stairs</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                    <Text style={styles.label}>Type</Text>
                    <Segmented options={TYPES} value={st.type} onChange={setType} />

                    {isSpiral ? (
                        <Stepper
                            label="Diameter"
                            value={draft.w}
                            onChange={(v) => setDraft((d) => ({ ...d, w: v, d: v }))}
                            step={step}
                            min={48}
                            max={120}
                            units={units}
                        />
                    ) : (
                        <>
                            <Stepper
                                label="Width"
                                value={draft.w}
                                onChange={(v) => setDraft((d) => ({ ...d, w: v }))}
                                step={step}
                                min={st.type === "straight" ? 24 : 60}
                                max={240}
                                units={units}
                            />
                            <Stepper
                                label="Length"
                                value={draft.d}
                                onChange={(v) => setDraft((d) => ({ ...d, d: v }))}
                                step={step}
                                min={48}
                                max={300}
                                units={units}
                            />
                        </>
                    )}
                    {(st.type === "L" || st.type === "U") && (
                        <Stepper
                            label="Flight width"
                            value={st.flightW || 36}
                            onChange={(v) => setStair({ flightW: v })}
                            step={step}
                            min={24}
                            max={60}
                            units={units}
                        />
                    )}

                    <View style={styles.row}>
                        <View>
                            <Text style={styles.rowLabel}>Steps</Text>
                            <Text style={styles.rowSub}>
                                {formatLength(rise, units)} rise each
                                {st.steps ? "" : " · auto"}
                            </Text>
                        </View>
                        <View style={styles.stepper}>
                            <Pressable
                                onPress={() => setStair({ steps: Math.max(3, steps - 1) })}
                                style={styles.stepBtn}
                                hitSlop={6}
                            >
                                <Ionicons name="remove" size={20} color={colors.text} />
                            </Pressable>
                            <Text style={styles.stepValue}>{steps}</Text>
                            <Pressable
                                onPress={() => setStair({ steps: Math.min(40, steps + 1) })}
                                style={styles.stepBtn}
                                hitSlop={6}
                            >
                                <Ionicons name="add" size={20} color={colors.text} />
                            </Pressable>
                        </View>
                    </View>
                    {st.steps ? (
                        <Text style={styles.link} onPress={() => setStair({ steps: null })}>
                            Use the recommended number of steps
                        </Text>
                    ) : null}

                    {turns && (
                        <>
                            <Text style={styles.label}>{isSpiral ? "Turns" : "Turn direction"}</Text>
                            <Segmented
                                options={[
                                    { key: "left", label: isSpiral ? "Counter-clockwise" : "Left" },
                                    { key: "right", label: isSpiral ? "Clockwise" : "Right" },
                                ]}
                                value={st.turn || "left"}
                                onChange={(v) => setStair({ turn: v })}
                            />
                        </>
                    )}

                    <Text style={styles.label}>Handrail</Text>
                    <Segmented
                        options={
                            isSpiral
                                ? [
                                      { key: "none", label: "None" },
                                      { key: "both", label: "Outer" },
                                  ]
                                : [
                                      { key: "none", label: "None" },
                                      { key: "left", label: "Left" },
                                      { key: "right", label: "Right" },
                                      { key: "both", label: "Both" },
                                  ]
                        }
                        value={st.handrail || "both"}
                        onChange={(v) => setStair({ handrail: v })}
                    />

                    {!isSpiral && (
                        <>
                            <Text style={styles.label}>Risers</Text>
                            <Segmented
                                options={[
                                    { key: "closed", label: "Closed" },
                                    { key: "open", label: "Open" },
                                ]}
                                value={st.risers || "closed"}
                                onChange={(v) => setStair({ risers: v })}
                            />
                        </>
                    )}

                    <Text style={styles.label}>Steps color</Text>
                    <Swatches list={swatches} value={draft.color} onChange={(c) => setDraft((d) => ({ ...d, color: c }))} />
                    {st.handrail !== "none" && (
                        <>
                            <Text style={styles.label}>Railing color</Text>
                            <Swatches list={RAIL_COLORS} value={st.railColor} onChange={(c) => setStair({ railColor: c })} />
                        </>
                    )}
                </ScrollView>

                <AnimatedPressable
                    onPress={() => {
                        onApply({ type: draft.type, w: draft.w, d: draft.d, color: draft.color, stair: draft.stair });
                        onClose();
                    }}
                    scaleTo={0.96}
                    style={styles.apply}
                >
                    <Text style={styles.applyText}>Apply</Text>
                </AnimatedPressable>
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
        maxHeight: "88%",
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
    body: { flexGrow: 0 },
    label: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 14, marginBottom: 8 },
    segment: { flexDirection: "row", padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
    segmentItem: { flex: 1, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    segmentItemActive: { backgroundColor: colors.surface, shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    segmentText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    rowLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
    rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    stepper: { flexDirection: "row", alignItems: "center" },
    stepBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    stepValue: { minWidth: 56, textAlign: "center", fontSize: 15, fontWeight: "700", color: colors.text },
    link: { color: colors.primary, fontWeight: "700", fontSize: 13, marginTop: 8 },
    swatchRow: { gap: 8, paddingVertical: 2 },
    swatchRing: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 2,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    swatchRingActive: { borderColor: colors.primary },
    swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.2)" },
    apply: {
        height: 48,
        marginTop: 16,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    applyText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
