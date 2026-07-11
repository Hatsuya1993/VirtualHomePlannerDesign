import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { UnitsSheet } from "./UnitsSheet";
import { useUnits } from "../context/UnitsContext";
import { colors, radius } from "../utils/theme";
import { formatLength, formatThickness, metricDecimals } from "../utils/units";

const IN_PER_METER = 39.3700787;

const KEYPAD_TOP = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
];

// How the editor lays out each dimension for a given unit system: feet uses two
// whole-number segments (ft + in); the others use a single field, and metric
// systems get a decimal-point key.
const UNIT_CONFIG = {
    ft: { segs: [{ key: "a", label: "ft" }, { key: "b", label: "in" }], decimal: false },
    in: { segs: [{ key: "a", label: "in" }], decimal: false },
    cm: { segs: [{ key: "a", label: "cm" }], decimal: true },
    m: { segs: [{ key: "a", label: "m" }], decimal: true },
};

// Trim trailing zeros so seeded editor values read cleanly (3.66, not 3.660).
const trimNum = (n, dec) => {
    let s = n.toFixed(dec);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
};

// Seed a field's editor segments from a value in inches, for the given system.
// `precision` controls metric decimal places (via metricDecimals).
const seedField = (inches, system, precision) => {
    if (system === "ft") {
        const rounded = Math.round(inches);
        return { a: String(Math.floor(rounded / 12)), b: String(rounded % 12) };
    }
    if (system === "in") return { a: String(Math.round(inches)), b: "0" };
    const dec = metricDecimals(precision);
    if (system === "cm") return { a: trimNum(inches * 2.54, dec), b: "0" };
    return { a: trimNum(inches / IN_PER_METER, dec), b: "0" }; // m
};

// Convert a field's editor segments (in the given system) back to inches.
const fieldToInches = (field, system) => {
    const a = parseFloat(field.a || "0") || 0;
    const b = parseFloat(field.b || "0") || 0;
    if (system === "ft") return a * 12 + b;
    if (system === "in") return a;
    if (system === "cm") return a / 2.54;
    return a * IN_PER_METER; // m
};

// Two-stage "Wall Size" bottom sheet: a read-only summary (length / height /
// thickness), and a tap-through editor with a custom numeric keypad. The editor
// adapts to the unit chosen in the Units sheet — ft/in segments for feet, a
// single decimal field for meters/centimeters, a single field for inches.
// Editing length actually resizes the wall (endpoint moves along its existing
// direction); height/thickness are stored as metadata on the wall.
export const WallSizeSheet = ({ visible, wall, pixelsPerFoot, onClose, onApply }) => {
    const { units } = useUnits();
    const system = units.system;
    const cfg = UNIT_CONFIG[system] ?? UNIT_CONFIG.ft;
    // Metric decimal places from the "Decimals" setting; the decimal key only
    // appears when the chosen precision actually allows fractional digits.
    const metDec = metricDecimals(units.precision);
    const decimalAllowed = cfg.decimal && metDec > 0;

    const [unitsOpen, setUnitsOpen] = useState(false);
    const [stage, setStage] = useState("summary");
    const [activeField, setActiveField] = useState(null); // "length" | "height" | "thickness"
    const [activeSeg, setActiveSeg] = useState("a"); // "a" | "b"
    const [justFocused, setJustFocused] = useState(true);
    const [values, setValues] = useState({
        length: { a: "0", b: "0" },
        height: { a: "0", b: "0" },
        thickness: { a: "0", b: "0" },
    });

    const wallInches = () => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        return {
            length: (Math.hypot(dx, dy) / pixelsPerFoot) * 12,
            height: wall.heightIn ?? 118,
            thickness: wall.thicknessIn ?? 8,
        };
    };

    const seedAll = () => {
        const inch = wallInches();
        setValues({
            length: seedField(inch.length, system, units.precision),
            height: seedField(inch.height, system, units.precision),
            thickness: seedField(inch.thickness, system, units.precision),
        });
    };

    // Re-seed the fields only when the sheet actually opens — not on every
    // render — so dragging a wall's endpoint on the canvas underneath (while
    // this sheet happens to be open) doesn't keep resetting it back to the
    // summary stage or clobbering in-progress edits.
    useEffect(() => {
        if (visible && wall) {
            seedAll();
            setStage("summary");
            setActiveField(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Reconvert every field when the unit system OR decimal precision changes —
    // e.g. the user opens the Units sheet and switches to meters / a different
    // number of decimals — so the editor shows the new unit and precision.
    useEffect(() => {
        if (visible && wall) seedAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [system, units.precision]);

    // Live-sync just the length field while the wall's endpoints change — e.g.
    // the user dragging a corner on the canvas underneath this sheet — without
    // touching stage/height/thickness or fighting keypad input (typing never
    // changes `wall`, only dragging does).
    useEffect(() => {
        if (!visible || !wall) return;
        const inch = wallInches();
        setValues((v) => ({ ...v, length: seedField(inch.length, system, units.precision) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wall?.x1, wall?.y1, wall?.x2, wall?.y2, visible, pixelsPerFoot]);

    if (!visible || !wall) return null;

    const inch = wallInches();
    const lengthInches = inch.length;
    const heightInches = inch.height;
    const thicknessInches = inch.thickness;

    const openEditor = (field) => {
        setStage("editor");
        setActiveField(field);
        setActiveSeg("a");
        setJustFocused(true);
    };

    const focusSegment = (field, seg) => {
        setActiveField(field);
        setActiveSeg(seg);
        setJustFocused(true);
    };

    const pressKey = (k) => {
        if (!activeField) return;
        if (k === ".") {
            if (!decimalAllowed) return;
            setValues((v) => {
                const cur = justFocused ? "" : v[activeField][activeSeg];
                if (cur.includes(".")) return v;
                const next = (cur === "" ? "0" : cur) + ".";
                return { ...v, [activeField]: { ...v[activeField], [activeSeg]: next } };
            });
            setJustFocused(false);
            return;
        }
        setValues((v) => {
            const cur = justFocused ? "" : v[activeField][activeSeg];
            let next = cur + k;
            if (next.includes(".")) {
                // keep at most the allowed number of decimal places
                const [intPart, dec = ""] = next.split(".");
                next = `${intPart}.${dec.slice(0, metDec)}`;
            } else {
                next = next.replace(/^0+(?=\d)/, "");
                const n = parseInt(next || "0", 10);
                if (system === "ft" && activeSeg === "b") next = String(Math.min(11, n));
                else next = String(Math.min(9999, n));
            }
            return { ...v, [activeField]: { ...v[activeField], [activeSeg]: next } };
        });
        setJustFocused(false);
    };

    const pressBackspace = () => {
        if (!activeField) return;
        setValues((v) => {
            const cur = v[activeField][activeSeg];
            return {
                ...v,
                [activeField]: { ...v[activeField], [activeSeg]: cur.slice(0, -1) || "0" },
            };
        });
        setJustFocused(false);
    };

    const clearRow = (field) => {
        setValues((v) => ({ ...v, [field]: { a: "0", b: "0" } }));
        focusSegment(field, "a");
    };

    const handleDone = () => {
        onApply({
            lengthIn: Math.max(1, fieldToInches(values.length, system)),
            heightIn: fieldToInches(values.height, system),
            thicknessIn: fieldToInches(values.thickness, system),
        });
        onClose();
    };

    const keypadRows = [...KEYPAD_TOP, [decimalAllowed ? "." : "blank", "0", "back"]];

    const Segment = ({ field, seg, unitLabel, value }) => {
        const active = activeField === field && activeSeg === seg;
        return (
            <Pressable
                onPress={() => focusSegment(field, seg)}
                style={[styles.segment, active && styles.segmentActive]}
            >
                <Text style={styles.segmentValue}>{value}</Text>
                <Text style={styles.segmentUnit}>{unitLabel}</Text>
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
                {cfg.segs.map((s) => (
                    <Segment
                        key={s.key}
                        field={field}
                        seg={s.key}
                        unitLabel={s.label}
                        value={values[field][s.key]}
                    />
                ))}
                <Pressable onPress={() => clearRow(field)} style={styles.clearBtn} hitSlop={8}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
            </View>
        </View>
    );

    return (
        <>
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
                                value={formatLength(lengthInches, units)}
                                onPress={() => openEditor("length")}
                            />
                            <SummaryRow
                                label="Wall height"
                                value={formatLength(heightInches, units)}
                                onPress={() => openEditor("height")}
                            />
                            <SummaryRow
                                label="Wall Thickness"
                                pro
                                value={formatThickness(thicknessInches, units)}
                                onPress={() => openEditor("thickness")}
                            />

                            <Pressable style={styles.moreInfo} onPress={() => {}}>
                                <Text style={styles.moreInfoText}>More info</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <View style={styles.header}>
                                <Pressable style={styles.headerSide} onPress={() => setUnitsOpen(true)}>
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
                                {keypadRows.map((row, ri) => (
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
                                                    onPress={() => pressKey(k)}
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
        <UnitsSheet visible={unitsOpen} onClose={() => setUnitsOpen(false)} />
        </>
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
