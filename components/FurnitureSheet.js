import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import Svg from "react-native-svg";
import { FadeSlideIn } from "./FadeSlideIn";
import { FurnitureGlyph } from "./FurnitureGlyph";
import { useUnits } from "../context/UnitsContext";
import {
    FURNITURE_CATEGORIES,
    FURNITURE_ITEMS,
    PX_PER_IN,
} from "../utils/furnitureCatalog";
import { formatLength } from "../utils/units";
import { colors, radius } from "../utils/theme";

const ALL = "all";

// A catalog tile's thumbnail: the item's top-view glyph scaled to fit.
const Thumb = ({ entry }) => {
    const W = entry.w * PX_PER_IN;
    const D = entry.d * PX_PER_IN;
    const pad = Math.max(W, D) * 0.12 + 2;
    return (
        <Svg
            width="100%"
            height="100%"
            viewBox={`${-W / 2 - pad} ${-D / 2 - pad} ${W + pad * 2} ${D + pad * 2}`}
            preserveAspectRatio="xMidYMid meet"
        >
            <FurnitureGlyph item={entry} sw={Math.max(W, D) / 90} />
        </Svg>
    );
};

// Bottom sheet listing every catalog item, filterable by category or search.
// Calls onPick(type) when a tile is tapped.
export const FurnitureSheet = ({ visible, onPick, onClose }) => {
    const { units } = useUnits();
    const { height: winH } = useWindowDimensions();
    const [category, setCategory] = useState(ALL);
    const [search, setSearch] = useState("");

    const items = useMemo(() => {
        const q = search.trim().toLowerCase();
        return FURNITURE_ITEMS.filter((it) => {
            if (q) {
                const cat = FURNITURE_CATEGORIES.find((c) => c.key === it.category);
                return (
                    it.name.toLowerCase().includes(q) ||
                    (cat?.label.toLowerCase().includes(q) ?? false)
                );
            }
            return category === ALL || it.category === category;
        });
    }, [category, search]);

    if (!visible) return null;

    const chips = [{ key: ALL, label: "All", icon: "view-grid-outline" }, ...FURNITURE_CATEGORIES];

    return (
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <FadeSlideIn offset={40} style={[styles.sheet, { height: winH * 0.72 }]}>
                <View style={styles.grabber} />
                <View style={styles.header}>
                    <View style={styles.headerSide} />
                    <Text style={styles.title}>Add Furniture</Text>
                    <Pressable onPress={onClose} style={styles.closeCircle} hitSlop={8}>
                        <Ionicons name="close" size={18} color={colors.text} />
                    </Pressable>
                </View>

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search furniture"
                        placeholderTextColor={colors.textFaint}
                        style={styles.searchInput}
                        returnKeyType="search"
                        autoCorrect={false}
                    />
                    {search ? (
                        <Pressable onPress={() => setSearch("")} hitSlop={8}>
                            <Ionicons name="close-circle" size={17} color={colors.textFaint} />
                        </Pressable>
                    ) : null}
                </View>

                {!search && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                        style={styles.chipScroll}
                    >
                        {chips.map((c) => {
                            const active = c.key === category;
                            return (
                                <Pressable
                                    key={c.key}
                                    onPress={() => setCategory(c.key)}
                                    style={[styles.chip, active && styles.chipActive]}
                                >
                                    <MaterialCommunityIcons
                                        name={c.icon}
                                        size={16}
                                        color={active ? "#FFFFFF" : colors.text}
                                    />
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {c.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                <ScrollView
                    contentContainerStyle={styles.grid}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {items.map((it) => (
                        <Pressable
                            key={it.type}
                            onPress={() => onPick(it.type)}
                            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                        >
                            <View style={styles.thumb}>
                                <Thumb entry={it} />
                            </View>
                            <Text style={styles.tileName} numberOfLines={1}>
                                {it.name}
                            </Text>
                            <Text style={styles.tileDims} numberOfLines={1}>
                                {formatLength(it.w, units)} × {formatLength(it.d, units)}
                            </Text>
                        </Pressable>
                    ))}
                    {items.length === 0 && (
                        <Text style={styles.empty}>No furniture matches "{search}".</Text>
                    )}
                </ScrollView>
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
        paddingTop: 10,
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
        paddingHorizontal: 20,
        paddingVertical: 8,
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
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginTop: 4,
        paddingHorizontal: 12,
        height: 42,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceAlt,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        color: colors.text,
        paddingVertical: 0,
    },
    chipScroll: {
        flexGrow: 0,
        marginTop: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    chipRow: {
        paddingHorizontal: 16,
        paddingBottom: 14,
        gap: 8,
    },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        height: 34,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
    },
    chipActive: {
        backgroundColor: colors.primary,
    },
    chipText: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 6,
    },
    chipTextActive: {
        color: "#FFFFFF",
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 36,
    },
    tile: {
        width: "33.333%",
        padding: 6,
        alignItems: "center",
        borderRadius: radius.md,
    },
    tilePressed: {
        backgroundColor: colors.primarySoft,
    },
    thumb: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: radius.md,
        backgroundColor: "#F3EDE3",
        padding: 8,
    },
    tileName: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.text,
        marginTop: 6,
    },
    tileDims: {
        fontSize: 11,
        fontWeight: "500",
        color: colors.textMuted,
        marginTop: 1,
    },
    empty: {
        width: "100%",
        textAlign: "center",
        color: colors.textMuted,
        marginTop: 30,
        fontSize: 14,
    },
});
