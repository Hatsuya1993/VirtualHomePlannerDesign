import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FadeSlideIn } from "./FadeSlideIn";
import { useUnits } from "../context/UnitsContext";
import { statRows } from "../utils/planStats";
import { colors, radius } from "../utils/theme";

// Bottom sheet showing computed plan statistics (area, dimensions, counts) in
// the user-selected unit.
export const StatsSheet = ({ visible, stats, onClose }) => {
    const { units } = useUnits();
    if (!visible || !stats) return null;
    const rows = statRows(stats, units);

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Stats</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                {rows.map((r, i) => (
                    <View
                        key={r.label}
                        style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
                    >
                        <Text style={styles.rowLabel}>{r.label}</Text>
                        <Text style={styles.rowValue}>{r.value}</Text>
                    </View>
                ))}
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
        marginBottom: 8,
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
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 15,
    },
    rowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    rowLabel: {
        fontSize: 15,
        color: colors.textMuted,
    },
    rowValue: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
    },
});
