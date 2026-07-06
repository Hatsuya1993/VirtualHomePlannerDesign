import { Ionicons } from "@expo/vector-icons";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import { colors, radius, shadow } from "../../utils/theme";

// Saved designs — replace with data from storage / backend.
const DESIGNS = [
    {
        id: "1",
        title: "Floor Plan Project",
        updatedAt: "an hour ago",
        synced: false,
        thumbnail: null, // e.g. require("../../assets/...") or { uri }
    },
];

// Rendered/exported photos of designs. Empty for now.
const GALLERY = [];

const MAX_PREVIEW = 3;

const DesignCard = ({ design, onPress }) => (
    <AnimatedPressable
        onPress={() => onPress(design.id)}
        style={[styles.gridCell, styles.designCard]}
    >
        <View style={styles.thumb}>
            {design.thumbnail ? (
                <Image
                    source={design.thumbnail}
                    style={styles.thumbImage}
                    resizeMode="cover"
                />
            ) : (
                <Ionicons name="image-outline" size={32} color={colors.textFaint} />
            )}
        </View>
        <View style={styles.cardFooter}>
            <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {design.title}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                    {design.updatedAt}
                </Text>
            </View>
            <Ionicons
                name={design.synced ? "cloud-done-outline" : "cloud-offline-outline"}
                size={18}
                color={design.synced ? colors.success : colors.textFaint}
            />
        </View>
    </AnimatedPressable>
);

export const DesignsScreen = () => {
    const preview = DESIGNS.slice(0, MAX_PREVIEW);

    const handleOpen = (id) => console.log("open design", id);
    const handleShowAll = () => console.log("show all designs");
    const handleSync = () => console.log("sync now");
    const handleGallerySeeAll = () => console.log("gallery see all");
    const handleSignIn = () => console.log("sign in");

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.heading}>My Designs</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Sync banner */}
                <FadeSlideIn>
                    <View style={styles.banner}>
                        <Ionicons
                            name="cloud-offline-outline"
                            size={20}
                            color={colors.danger}
                        />
                        <Text style={styles.bannerText}>
                            Don't lose your progress
                        </Text>
                        <AnimatedPressable
                            onPress={handleSync}
                            scaleTo={0.92}
                            style={styles.bannerButton}
                        >
                            <Text style={styles.bannerButtonText}>Sync now</Text>
                        </AnimatedPressable>
                    </View>
                </FadeSlideIn>

                {/* Saved designs grid */}
                <View style={styles.grid}>
                    {preview.map((design, index) => (
                        <FadeSlideIn
                            key={design.id}
                            delay={100 + index * 90}
                            style={styles.gridSlot}
                        >
                            <DesignCard design={design} onPress={handleOpen} />
                        </FadeSlideIn>
                    ))}

                    {DESIGNS.length > 0 && (
                        <FadeSlideIn
                            delay={100 + preview.length * 90}
                            style={styles.gridSlot}
                        >
                            <AnimatedPressable
                                onPress={handleShowAll}
                                style={[styles.gridCell, styles.showAll]}
                            >
                                <View style={styles.showAllInner}>
                                    <Text style={styles.showAllText}>
                                        Show all ({DESIGNS.length})
                                    </Text>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={18}
                                        color={colors.textMuted}
                                    />
                                </View>
                            </AnimatedPressable>
                        </FadeSlideIn>
                    )}
                </View>

                {/* Gallery */}
                <FadeSlideIn delay={300}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Gallery</Text>
                        <AnimatedPressable
                            onPress={handleGallerySeeAll}
                            style={styles.seeAll}
                        >
                            <Text style={styles.seeAllText}>See all</Text>
                            <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={colors.textMuted}
                            />
                        </AnimatedPressable>
                    </View>

                    {GALLERY.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No ready photos yet</Text>
                            <AnimatedPressable
                                onPress={handleSignIn}
                                scaleTo={0.94}
                                style={styles.signInButton}
                            >
                                <Text style={styles.signInText}>Sign in</Text>
                            </AnimatedPressable>
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {GALLERY.map((photo) => (
                                <View key={photo.id} style={styles.gridSlot}>
                                    <View style={[styles.gridCell, styles.designCard]}>
                                        <View style={styles.thumb}>
                                            <Image
                                                source={photo.image}
                                                style={styles.thumbImage}
                                                resizeMode="cover"
                                            />
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </FadeSlideIn>
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
    banner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.dangerSoft,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 20,
    },
    bannerText: {
        flex: 1,
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
        marginLeft: 10,
    },
    bannerButton: {
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    bannerButtonText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "700",
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
    thumbImage: {
        width: "100%",
        height: "100%",
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
    showAll: {
        aspectRatio: 0.83,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
    },
    showAllInner: {
        flexDirection: "row",
        alignItems: "center",
    },
    showAllText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.textMuted,
        marginRight: 6,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 4,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: "800",
        color: colors.text,
    },
    seeAll: {
        flexDirection: "row",
        alignItems: "center",
    },
    seeAllText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.textMuted,
        marginRight: 2,
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: colors.textMuted,
        marginBottom: 20,
    },
    signInButton: {
        backgroundColor: colors.primarySoft,
        borderRadius: radius.pill,
        paddingHorizontal: 28,
        paddingVertical: 12,
    },
    signInText: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: "700",
    },
});
