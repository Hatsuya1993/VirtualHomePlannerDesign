import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { FadeSlideIn } from "./FadeSlideIn";
import { Stepper } from "./FurnitureEditSheet";
import { useUnits } from "../context/UnitsContext";
import { MAX_FLOOR_HEIGHT_IN, MIN_FLOOR_HEIGHT_IN } from "../utils/floors";
import { colors, radius } from "../utils/theme";

// Bottom sheet for a multi-floor design: switch floor, add one (PRO), and
// rename / set the height of / delete the current one. Floors are listed top
// floor first, like a building.
export const FloorSheet = ({
    visible,
    floors,
    activeIndex,
    pro,
    onSelect,
    onAdd,
    onRename,
    onHeight,
    onDelete,
    onClose,
}) => {
    const { units } = useUnits();
    if (!visible) return null;
    const active = floors[activeIndex];
    const metric = units.system === "m" || units.system === "cm";
    const order = floors.map((f, i) => i).reverse();

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={styles.sheet}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Floors</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {order.map((i) => {
                        const f = floors[i];
                        const isActive = i === activeIndex;
                        return (
                            <Pressable
                                key={f.id}
                                onPress={() => onSelect(i)}
                                style={({ pressed }) => [
                                    styles.floorRow,
                                    isActive && styles.floorRowActive,
                                    pressed && !isActive && styles.floorRowPressed,
                                ]}
                            >
                                <Ionicons
                                    name={isActive ? "layers" : "layers-outline"}
                                    size={20}
                                    color={isActive ? colors.primary : colors.textMuted}
                                />
                                <View style={styles.floorText}>
                                    <Text style={[styles.floorName, isActive && styles.floorNameActive]}>
                                        {f.name}
                                    </Text>
                                    <Text style={styles.floorMeta}>
                                        {f.walls.length} walls · {f.furniture.length} items
                                    </Text>
                                </View>
                                {isActive && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                            </Pressable>
                        );
                    })}
                </ScrollView>

                <AnimatedPressable onPress={() => onAdd(false)} scaleTo={0.97} style={styles.addButton}>
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                    <Text style={styles.addText}>Add floor above</Text>
                    {!pro && (
                        <View style={styles.proBadge}>
                            <Text style={styles.proText}>PRO</Text>
                        </View>
                    )}
                </AnimatedPressable>
                <Text style={styles.addHint}>
                    Starts with the outer walls of the top floor, so it lines up.{" "}
                    <Text style={styles.addLink} onPress={() => onAdd(true)}>
                        Add a blank floor instead
                    </Text>
                </Text>

                <Text style={styles.sectionLabel}>{active.name}</Text>
                <Stepper
                    label="Floor height"
                    value={active.heightIn}
                    onChange={(v) => onHeight(activeIndex, v)}
                    step={metric ? 1 / 2.54 : 1}
                    min={MIN_FLOOR_HEIGHT_IN}
                    max={MAX_FLOOR_HEIGHT_IN}
                    units={units}
                />
                <View style={styles.actions}>
                    <AnimatedPressable
                        onPress={() => onRename(activeIndex)}
                        scaleTo={0.96}
                        style={[styles.action, styles.actionGhost]}
                    >
                        <Ionicons name="pencil" size={16} color={colors.text} />
                        <Text style={styles.actionText}>Rename</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                        onPress={() => onDelete(activeIndex)}
                        disabled={floors.length <= 1}
                        scaleTo={0.96}
                        style={[styles.action, styles.actionDanger, floors.length <= 1 && styles.disabled]}
                    >
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        <Text style={[styles.actionText, { color: colors.danger }]}>Delete floor</Text>
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
        maxHeight: "85%",
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
    },
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
    list: { flexGrow: 0, maxHeight: 240 },
    listContent: { paddingVertical: 4, gap: 6 },
    floorRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        height: 58,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
    },
    floorRowActive: {
        backgroundColor: colors.primarySoft,
        borderWidth: 1.5,
        borderColor: colors.primary,
    },
    floorRowPressed: { opacity: 0.7 },
    floorText: { flex: 1, marginLeft: 12 },
    floorName: { fontSize: 15, fontWeight: "700", color: colors.text },
    floorNameActive: { color: colors.primary },
    floorMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    addButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 48,
        marginTop: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
    },
    addText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginLeft: 6 },
    proBadge: {
        marginLeft: 8,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: colors.accent,
    },
    proText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
    addHint: {
        fontSize: 12,
        color: colors.textMuted,
        textAlign: "center",
        marginTop: 8,
        lineHeight: 17,
    },
    addLink: { color: colors.primary, fontWeight: "700" },
    sectionLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 20,
        marginBottom: 2,
    },
    actions: { flexDirection: "row", gap: 10, marginTop: 14 },
    action: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 44,
        borderRadius: radius.pill,
    },
    actionGhost: { backgroundColor: colors.surfaceAlt },
    actionDanger: { backgroundColor: colors.dangerSoft },
    actionText: { fontSize: 14, fontWeight: "700", color: colors.text, marginLeft: 6 },
    disabled: { opacity: 0.4 },
});
