import { Ionicons } from "@expo/vector-icons";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import { colors, radius, shadow } from "../../utils/theme";

const CREATE_ITEMS = [
    {
        key: "3d-design",
        title: "3D Design",
        subtitle: "Build your home in 3D",
        image: require("../../assets/create/3d-design.jpg"),
    },
    {
        key: "plan-from-photo",
        title: "Plan from a Photo",
        subtitle: "Convert any floor plan into 3D",
        badge: "AI",
        image: require("../../assets/create/plan-from-photo.jpg"),
    },
    {
        key: "room-scan",
        title: "Room Scan",
        subtitle: "Turn your real room into a 3D plan",
        pro: true,
        image: require("../../assets/create/room-scan.jpg"),
    },
    {
        key: "ai-redesign",
        title: "AI Redesign",
        subtitle: "Reimagine any room from a photo",
        image: require("../../assets/create/ai-redesign.jpg"),
    },
    {
        key: "design-order",
        title: "Design Order",
        subtitle: "A pro designer creates your project",
        image: require("../../assets/create/design-order.jpg"),
    },
];

export const CreateScreen = ({ navigation }) => {
    const handleStart = (key) => {
        if (key === "3d-design") {
            navigation.navigate("FloorPlan");
            return;
        }
        // TODO: navigate to the remaining create flows
        console.log("start", key);
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.heading}>Create</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {CREATE_ITEMS.map((item, index) => (
                    <FadeSlideIn key={item.key} delay={index * 90}>
                        <View style={styles.card}>
                            <View style={styles.banner}>
                                <Image
                                    source={item.image}
                                    style={styles.bannerImage}
                                    resizeMode="cover"
                                />
                                {item.badge ? (
                                    <View style={styles.badge}>
                                        <Ionicons
                                            name="sparkles"
                                            size={12}
                                            color="#FFFFFF"
                                        />
                                        <Text style={styles.badgeText}>
                                            {item.badge}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            <View style={styles.titleRow}>
                                <View style={styles.titleTextWrap}>
                                    <View style={styles.titleLine}>
                                        <Text style={styles.title}>{item.title}</Text>
                                        {item.pro ? (
                                            <View style={styles.proBadge}>
                                                <Text style={styles.proText}>PRO</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text style={styles.subtitle}>
                                        {item.subtitle}
                                    </Text>
                                </View>

                                <AnimatedPressable
                                    onPress={() => handleStart(item.key)}
                                    scaleTo={0.92}
                                    style={styles.startButton}
                                >
                                    <Text style={styles.startText}>START</Text>
                                </AnimatedPressable>
                            </View>
                        </View>
                    </FadeSlideIn>
                ))}
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
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        marginBottom: 20,
        overflow: "hidden",
        ...shadow.card,
    },
    banner: {
        height: 180,
    },
    bannerImage: {
        width: "100%",
        height: "100%",
    },
    badge: {
        position: "absolute",
        top: 12,
        left: 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(17, 24, 39, 0.75)",
        borderRadius: radius.sm,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "700",
        marginLeft: 4,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
    },
    titleTextWrap: {
        flex: 1,
        marginRight: 12,
    },
    titleLine: {
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 20,
        fontWeight: "800",
        color: colors.text,
    },
    proBadge: {
        backgroundColor: colors.successSoft,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 10,
    },
    proText: {
        color: colors.success,
        fontSize: 12,
        fontWeight: "800",
    },
    subtitle: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 4,
    },
    startButton: {
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingHorizontal: 22,
        paddingVertical: 12,
    },
    startText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "800",
        letterSpacing: 0.5,
    },
});
