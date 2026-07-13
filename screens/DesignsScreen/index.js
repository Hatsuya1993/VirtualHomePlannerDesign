import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import { PlanMiniature } from "../../components/PlanMiniature";
import { useAuth } from "../../context/AuthContext";
import { useEntitlements } from "../../context/EntitlementsContext";
import { deleteDesign, renameDesign, subscribeDesigns } from "../../utils/designs";
import { report } from "../../utils/report";
import { colors, radius, shadow } from "../../utils/theme";

const formatWhen = (ts) => {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "Just now";
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
};

const DesignCard = ({ design, onOpen, onLongPress }) => (
    <AnimatedPressable
        onPress={() => onOpen(design)}
        onLongPress={() => onLongPress(design)}
        delayLongPress={300}
        style={[styles.gridCell, styles.designCard]}
    >
        <View style={styles.thumb}>
            {design.walls?.length ? (
                <PlanMiniature walls={design.walls} />
            ) : (
                <Ionicons name="image-outline" size={32} color={colors.textFaint} />
            )}
        </View>
        <View style={styles.cardFooter}>
            <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {design.name || "Untitled plan"}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                    {formatWhen(design.updatedAt)}
                </Text>
            </View>
            <Ionicons name="cloud-done-outline" size={18} color={colors.success} />
        </View>
    </AnimatedPressable>
);

export const DesignsScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { pro, loading, promptedRef, markPrompted } = useEntitlements();
    const [designs, setDesigns] = useState([]);

    useEffect(() => {
        if (!user) return undefined;
        return subscribeDesigns(user.uid, setDesigns, () => {});
    }, [user]);

    // Show the paywall once, shortly after login, for non-Pro users.
    useEffect(() => {
        if (loading || pro || promptedRef.current) return;
        markPrompted();
        navigation.navigate("Paywall");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, pro]);

    const openDesign = (design) => {
        navigation.navigate("PlanPreview", {
            walls: design.walls,
            designId: design.id,
            designName: design.name,
        });
    };

    const confirmDelete = (design) => {
        Alert.alert(
            "Delete design",
            `Delete "${design.name || "Untitled plan"}"? This can't be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                        deleteDesign(user.uid, design.id).catch((e) =>
                            report(e, { feature: "delete-design" })
                        ),
                },
            ]
        );
    };

    const promptRename = (design) => {
        if (Platform.OS !== "ios") return; // Alert.prompt is iOS-only
        Alert.prompt(
            "Rename design",
            "Enter a new title.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Save",
                    onPress: (text) => {
                        const next = (text || "").trim();
                        if (next)
                            renameDesign(user.uid, design.id, next).catch((e) =>
                                report(e, { feature: "rename-design" })
                            );
                    },
                },
            ],
            "plain-text",
            design.name === "Untitled plan" ? "" : design.name || ""
        );
    };

    // Long-press → edit, rename or delete.
    const showOptions = (design) => {
        Alert.alert(design.name || "Untitled plan", "What would you like to do?", [
            { text: "Edit", onPress: () => openDesign(design) },
            { text: "Rename", onPress: () => promptRename(design) },
            { text: "Delete", style: "destructive", onPress: () => confirmDelete(design) },
            { text: "Cancel", style: "cancel" },
        ]);
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.heading}>My Designs</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {designs.length === 0 ? (
                    <FadeSlideIn>
                        <View style={styles.emptyState}>
                            <Ionicons
                                name="albums-outline"
                                size={44}
                                color={colors.textFaint}
                            />
                            <Text style={styles.emptyText}>No saved designs yet</Text>
                            <Text style={styles.emptySub}>
                                Open a plan and tap Save to keep it here.
                            </Text>
                        </View>
                    </FadeSlideIn>
                ) : (
                    <View style={styles.grid}>
                        {designs.map((design, index) => (
                            <FadeSlideIn
                                key={design.id}
                                delay={index * 60}
                                style={styles.gridSlot}
                            >
                                <DesignCard
                                    design={design}
                                    onOpen={openDesign}
                                    onLongPress={showOptions}
                                />
                            </FadeSlideIn>
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    heading: {
        fontSize: 34,
        fontWeight: "800",
        color: colors.text,
        marginTop: 8,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 40,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    gridSlot: {
        width: "48%",
        marginBottom: 16,
    },
    gridCell: {
        width: "100%",
    },
    designCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        overflow: "hidden",
        ...shadow.card,
    },
    thumb: {
        aspectRatio: 1,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    cardFooter: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    cardText: {
        flex: 1,
        marginRight: 8,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
    },
    cardMeta: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 80,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
        marginTop: 16,
    },
    emptySub: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 6,
        textAlign: "center",
    },
});
