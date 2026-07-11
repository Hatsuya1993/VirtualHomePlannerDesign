import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { useUnits } from "../context/UnitsContext";
import { metricDecimals } from "../utils/units";
import { colors, radius } from "../utils/theme";

const PRECISIONS = [1, 2, 4, 8, 16]; // fraction denominators
const IMPERIAL_LABELS = {
    1: `1'6"`,
    2: `1'6 1/2"`,
    4: `1'6 1/4"`,
    8: `1'6 1/8"`,
    16: `1'6 1/16"`,
};

// Chip label reflects the selected unit: an imperial fraction example for
// feet/inches, or a decimal-places example (using π) for metric.
const chipLabel = (denom, system) => {
    if (system === "ft" || system === "in") return IMPERIAL_LABELS[denom];
    return `${Math.PI.toFixed(metricDecimals(denom))} ${system}`;
};

const SYSTEMS = [
    { key: "m", label: "Meters (m)" },
    { key: "cm", label: "Centimeters (cm)" },
    { key: "ft", label: "Feet (ft)" },
    { key: "in", label: "Inches (in)" },
];

// Bottom sheet for choosing the display unit + fraction precision. Changes are
// staged locally and only committed to the shared units context on "Apply", so
// every dimension in the app re-renders in the chosen unit at once.
export const UnitsSheet = ({ visible, onClose }) => {
    const { units, setUnits } = useUnits();
    const [system, setSystem] = useState(units.system);
    const [precision, setPrecision] = useState(units.precision);

    useEffect(() => {
        if (visible) {
            setSystem(units.system);
            setPrecision(units.precision);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    if (!visible) return null;

    const apply = () => {
        setUnits({ system, precision });
        onClose();
    };

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />

                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Units</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <Text style={styles.sectionTitle}>Decimals</Text>
                <Text style={styles.sectionSub}>Select a decimal number to display</Text>
                <View style={styles.decimalRow}>
                    {PRECISIONS.map((denom) => {
                        const active = precision === denom;
                        return (
                            <Pressable
                                key={denom}
                                onPress={() => setPrecision(denom)}
                                style={[styles.decimalChip, active && styles.decimalChipActive]}
                            >
                                <Text
                                    style={[
                                        styles.decimalText,
                                        active && styles.decimalTextActive,
                                    ]}
                                >
                                    {chipLabel(denom, system)}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <View style={styles.unitsHeaderRow}>
                    <MaterialCommunityIcons name="tape-measure" size={22} color={colors.text} />
                    <Text style={styles.unitsHeaderText}>Select Units</Text>
                </View>

                <View style={styles.list}>
                    {SYSTEMS.map((s, i) => {
                        const active = system === s.key;
                        return (
                            <Pressable
                                key={s.key}
                                onPress={() => setSystem(s.key)}
                                style={[
                                    styles.unitRow,
                                    i < SYSTEMS.length - 1 && styles.unitRowBorder,
                                ]}
                            >
                                <Text style={styles.unitLabel}>{s.label}</Text>
                                <View style={[styles.radio, active && styles.radioActive]}>
                                    {active && (
                                        <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                <AnimatedPressable onPress={apply} scaleTo={0.97} style={styles.applyButton}>
                    <Text style={styles.applyText}>Apply</Text>
                </AnimatedPressable>
            </FadeSlideIn>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "flex-end",
        zIndex: 20,
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
        marginBottom: 18,
    },
    headerSide: {
        width: 30,
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
    sectionTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: colors.text,
    },
    sectionSub: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 4,
        marginBottom: 14,
    },
    decimalRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 24,
    },
    decimalChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
    },
    decimalChipActive: {
        backgroundColor: colors.infoSoft,
    },
    decimalText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.info,
    },
    decimalTextActive: {
        color: colors.info,
        fontWeight: "800",
    },
    unitsHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
    },
    unitsHeaderText: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
    },
    list: {
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 16,
        marginBottom: 22,
    },
    unitRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 18,
    },
    unitRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    unitLabel: {
        fontSize: 16,
        color: colors.text,
    },
    radio: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    radioActive: {
        backgroundColor: colors.dark,
        borderColor: colors.dark,
    },
    applyButton: {
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingVertical: 17,
        alignItems: "center",
        justifyContent: "center",
    },
    applyText: {
        fontSize: 17,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
