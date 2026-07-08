import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { colors, radius } from "../utils/theme";
import { feetInchesToInches, formatFeetInches, formatInches, inchesToFeet } from "../utils/units";

const KEYS = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    ["blank", "0", "back"],
];

const toParts = (totalInches) => {
    const { feet, inches } = inchesToFeet(totalInches);
    return { ft: String(feet), in: String(inches) };
};

// Two-stage "Wall Size" bottom sheet: a read-only summary (length / height /
// thickness), and a tap-through editor with a custom ft/in numeric keypad.
// Editing length actually resizes the wall (endpoint moves along its
// existing direction); height/thickness are stored as metadata on the wall.
export const WallSizeSheet = ({ visible, wall, pixelsPerFoot, onClose, onApply }) => {
    const [stage, setStage] = useState("summary");
    const [activeField, setActiveField] = useState(null); // "length" | "height" | "thickness"
    const [activeUnit, setActiveUnit] = useState("ft"); // "ft" | "in"
    const [justFocused, setJustFocused] = useState(true);
    const [values, setValues] = useState({
        lengthFt: "0",
        lengthIn: "0",
        heightFt: "0",
        heightIn: "0",
        thicknessFt: "0",
        thicknessIn: "0",
    });

    // Re-seed the fields only when the sheet actually opens — not on every
    // render — so dragging a wall's endpoint on the canvas underneath (while
    // this sheet happens to be open) doesn't keep resetting it back to the
    // summary stage or clobbering in-progress edits.
    useEffect(() => {
        if (visible && wall) {
            const dx = wall.x2 - wall.x1;
            const dy = wall.y2 - wall.y1;
            const lengthInches = (Math.hypot(dx, dy) / pixelsPerFoot) * 12;
            const l = toParts(lengthInches);
            const h = toParts(wall.heightIn ?? 118);
            const t = toParts(wall.thicknessIn ?? 8);
            setValues({
                lengthFt: l.ft,
                lengthIn: l.in,
                heightFt: h.ft,
                heightIn: h.in,
                thicknessFt: t.ft,
                thicknessIn: t.in,
            });
            setStage("summary");
            setActiveField(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Live-sync just the length fields while the wall's endpoints change —
    // e.g. the user dragging a corner on the canvas underneath this sheet —
    // without touching stage/height/thickness or fighting keypad input
    // (typing never changes `wall`, only dragging does).
    useEffect(() => {
        if (!visible || !wall) return;
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const lengthInches = (Math.hypot(dx, dy) / pixelsPerFoot) * 12;
        const l = toParts(lengthInches);
        setValues((v) => ({ ...v, lengthFt: l.ft, lengthIn: l.in }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wall?.x1, wall?.y1, wall?.x2, wall?.y2, visible, pixelsPerFoot]);

    if (!visible || !wall) return null;

    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lengthInches = (Math.hypot(dx, dy) / pixelsPerFoot) * 12;
    const heightInches = wall.heightIn ?? 118;
    const thicknessInches = wall.thicknessIn ?? 8;

    const openEditor = (field) => {
        setStage("editor");
        setActiveField(field);
        setActiveUnit("ft");
        setJustFocused(true);
    };

    const focusSegment = (field, unit) => {
        setActiveField(field);
        setActiveUnit(unit);
        setJustFocused(true);
    };

    const pressDigit = (d) => {
        if (!activeField) return;
        const key = `${activeField}${activeUnit === "ft" ? "Ft" : "In"}`;
        setValues((v) => {
            const base = justFocused ? "" : v[key];
            let next = (base + d).replace(/^0+(?=\d)/, "");
            let n = parseInt(next || "0", 10);
            if (activeUnit === "in") n = Math.min(11, n);
            else n = Math.min(999, n);
            return { ...v, [key]: String(n) };
        });
        setJustFocused(false);
    };

    const pressBackspace = () => {
        if (!activeField) return;
        const key = `${activeField}${activeUnit === "ft" ? "Ft" : "In"}`;
        setValues((v) => ({ ...v, [key]: v[key].slice(0, -1) || "0" }));
        setJustFocused(false);
    };

    const clearRow = (field) => {
        setValues((v) => ({ ...v, [`${field}Ft`]: "0", [`${field}In`]: "0" }));
        focusSegment(field, "ft");
    };

    const handleDone = () => {
        const lengthTotal = feetInchesToInches(
            parseInt(values.lengthFt, 10) || 0,
            parseInt(values.lengthIn, 10) || 0
        );
        const heightTotal = feetInchesToInches(
            parseInt(values.heightFt, 10) || 0,
            parseInt(values.heightIn, 10) || 0
        );
        const thicknessTotal = feetInchesToInches(
            parseInt(values.thicknessFt, 10) || 0,
            parseInt(values.thicknessIn, 10) || 0
        );
        onApply({
            lengthIn: Math.max(1, lengthTotal),
            heightIn: heightTotal,
            thicknessIn: thicknessTotal,
        });
        onClose();
    };

    const Segment = ({ field, unit, value }) => {
        const active = activeField === field && activeUnit === unit;
        return (
            <Pressable
                onPress={() => focusSegment(field, unit)}
                style={[styles.segment, active && styles.segmentActive]}
            >
                <Text style={styles.segmentValue}>{value}</Text>
                <Text style={styles.segmentUnit}>{unit}</Text>
            </Pressable>
        );
    };

    const EditRow = ({ field, label }) => (
        <View style={styles.editRow}>
            <Text style={styles.editLabel}>{label}</Text>
            <View
                style={[
                    styles.editBox,
                    activeField === field && styles.editBoxActive,
                ]}
            >
                <Segment field={field} unit="ft" value={values[`${field}Ft`]} />
                <Segment field={field} unit="in" value={values[`${field}In`]} />
                <Pressable onPress={() => clearRow(field)} style={styles.clearBtn} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
            </View>
        </View>
    );

    return (
        <FadeSlideIn offset={40} style={styles.sheet}>
            <View style={styles.grabber} />

                    {stage === "summary" ? (
                        <>
                            <View style={styles.header}>
                                <View style={styles.headerSide} />
                                <Text style={styles.title}>Wall Size</Text>
                                <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                                    <Ionicons name="close" size={18} color={colors.text} />
                                </Pressable>
                            </View>

                            <SummaryRow
                                label="Wall length"
                                pro
                                value={formatFeetInches(lengthInches)}
                                onPress={() => openEditor("length")}
                            />
                            <SummaryRow
                                label="Wall height"
                                value={formatFeetInches(heightInches)}
                                onPress={() => openEditor("height")}
                            />
                            <SummaryRow
                                label="Wall Thickness"
                                pro
                                value={formatInches(thicknessInches)}
                                onPress={() => openEditor("thickness")}
                            />

                            <Pressable style={styles.moreInfo} onPress={() => {}}>
                                <Text style={styles.moreInfoText}>More info</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <View style={styles.header}>
                                <Pressable style={styles.headerSide} onPress={() => {}}>
                                    <Text style={styles.unitsLink}>Units</Text>
                                </Pressable>
                                <Text style={styles.title}>Wall Size</Text>
                                <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                                    <Ionicons name="close" size={18} color={colors.text} />
                                </Pressable>
                            </View>

                            <EditRow field="length" label="Length:" />
                            <EditRow field="height" label="Height:" />
                            <EditRow field="thickness" label="Thickness:" />

                            <View style={styles.keypad}>
                                {KEYS.map((row, ri) => (
                                    <View key={ri} style={styles.keyRow}>
                                        {row.map((k, ki) => {
                                            if (k === "blank") {
                                                return (
                                                    <View
                                                        key={`blank${ri}${ki}`}
                                                        style={[styles.key, styles.keyBlank]}
                                                    />
                                                );
                                            }
                                            if (k === "back") {
                                                return (
                                                    <Pressable
                                                        key={k}
                                                        onPress={pressBackspace}
                                                        style={styles.key}
                                                    >
                                                        <Ionicons
                                                            name="backspace-outline"
                                                            size={22}
                                                            color={colors.text}
                                                        />
                                                    </Pressable>
                                                );
                                            }
                                            return (
                                                <Pressable
                                                    key={k}
                                                    onPress={() => pressDigit(k)}
                                                    style={styles.key}
                                                >
                                                    <Text style={styles.keyText}>{k}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>

                            <View style={styles.actionsRow}>
                                <AnimatedPressable
                                    onPress={onClose}
                                    scaleTo={0.96}
                                    style={[styles.actionButton, styles.cancelButton]}
                                >
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </AnimatedPressable>
                                <AnimatedPressable
                                    onPress={handleDone}
                                    scaleTo={0.96}
                                    style={[styles.actionButton, styles.doneButton]}
                                >
                                    <Text style={styles.doneText}>Done</Text>
                                </AnimatedPressable>
                            </View>
                        </>
                    )}
        </FadeSlideIn>
    );
};

const SummaryRow = ({ label, value, pro, onPress }) => (
    <Pressable onPress={onPress} style={styles.summaryRow}>
        <View style={styles.summaryLabelRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            {pro && (
                <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                </View>
            )}
        </View>
        <Text style={styles.summaryValue}>{value}</Text>
    </Pressable>
);

const styles = StyleSheet.create({
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 28,
        shadowColor: "#0F172A",
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -6 },
        elevation: 16,
    },
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: 14,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    headerSide: {
        width: 50,
    },
    title: {
        fontSize: 17,
        fontWeight: "700",
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
    unitsLink: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.info,
    },
    summaryRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    summaryLabelRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    summaryLabel: {
        fontSize: 15,
        color: colors.text,
    },
    proBadge: {
        backgroundColor: colors.successSoft,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 8,
    },
    proBadgeText: {
        fontSize: 10,
        fontWeight: "800",
        color: colors.success,
    },
    summaryValue: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.info,
    },
    moreInfo: {
        marginTop: 10,
    },
    moreInfoText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.info,
    },
    editRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    editLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
        width: 80,
    },
    editBox: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 4,
    },
    editBoxActive: {
        borderColor: colors.info,
    },
    segment: {
        flexDirection: "row",
        alignItems: "baseline",
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 6,
    },
    segmentActive: {
        backgroundColor: colors.infoSoft,
    },
    segmentValue: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
        marginRight: 4,
    },
    segmentUnit: {
        fontSize: 13,
        color: colors.textMuted,
    },
    clearBtn: {
        marginLeft: "auto",
        padding: 6,
    },
    keypad: {
        marginTop: 8,
        marginBottom: 16,
    },
    keyRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    key: {
        flex: 1,
        marginHorizontal: 4,
        paddingVertical: 14,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    keyText: {
        fontSize: 20,
        fontWeight: "600",
        color: colors.text,
    },
    keyBlank: {
        backgroundColor: "transparent",
    },
    actionsRow: {
        flexDirection: "row",
        gap: 12,
    },
    actionButton: {
        flex: 1,
        borderRadius: radius.pill,
        paddingVertical: 15,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelButton: {
        backgroundColor: colors.surfaceAlt,
    },
    cancelText: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
    },
    doneButton: {
        backgroundColor: colors.dark,
    },
    doneText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
