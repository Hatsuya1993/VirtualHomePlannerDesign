import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { colors, radius } from "../../utils/theme";

// Three onboarding slides, each showcasing one core capability of the app.
const SLIDES = [
    {
        key: "3d",
        title: "Design your home in 3D",
        subtitle: "Lay out rooms in 2D, then step inside and walk through them in 3D.",
        image: require("../../assets/create/3d-design.jpg"),
    },
    {
        key: "photo",
        title: "Plan from a photo",
        subtitle: "Snap or upload a floor plan and turn it into an editable diagram in seconds.",
        image: require("../../assets/create/plan-from-photo.jpg"),
    },
    {
        key: "ai",
        title: "Redesign with AI",
        subtitle: "Drop any furniture or décor into your room and see it reimagined instantly.",
        image: require("../../assets/create/ai-redesign.jpg"),
    },
];

export const WelcomeScreen = ({ navigation }) => {
    const { width, height } = useWindowDimensions();
    const listRef = useRef(null);
    const [index, setIndex] = useState(0);
    const isLast = index === SLIDES.length - 1;

    const onScrollEnd = (e) => {
        setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    };
    const scrollTo = (i) =>
        listRef.current?.scrollToOffset({ offset: i * width, animated: true });

    const renderItem = ({ item }) => (
        <View style={[styles.slide, { width }]}>
            <Image
                source={item.image}
                style={[styles.image, { height: Math.round(height * 0.5) }]}
                resizeMode="cover"
            />
            <View style={styles.textWrap}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
            <FlatList
                ref={listRef}
                data={SLIDES}
                keyExtractor={(s) => s.key}
                renderItem={renderItem}
                horizontal
                pagingEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
            />

            <View style={styles.dots}>
                {SLIDES.map((s, i) => (
                    <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
                ))}
            </View>

            <View style={styles.footer}>
                {isLast ? (
                    <>
                        <AnimatedPressable
                            onPress={() => navigation.navigate("Register")}
                            scaleTo={0.97}
                            style={styles.primaryBtn}
                        >
                            <Text style={styles.primaryText}>Create Account</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            onPress={() => navigation.navigate("Login")}
                            scaleTo={0.98}
                            style={styles.loginLinkWrap}
                            hitSlop={8}
                        >
                            <Text style={styles.loginLink}>
                                Already have an account?{" "}
                                <Text style={styles.loginLinkStrong}>Log in</Text>
                            </Text>
                        </AnimatedPressable>
                    </>
                ) : (
                    <View style={styles.navRow}>
                        <AnimatedPressable
                            onPress={() => scrollTo(SLIDES.length - 1)}
                            scaleTo={0.95}
                            style={styles.skipBtn}
                            hitSlop={8}
                        >
                            <Text style={styles.skipText}>Skip</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            onPress={() => scrollTo(index + 1)}
                            scaleTo={0.92}
                            style={styles.nextBtn}
                        >
                            <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                        </AnimatedPressable>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    slide: {
        alignItems: "center",
    },
    image: {
        width: "100%",
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    textWrap: {
        paddingHorizontal: 28,
        alignItems: "center",
    },
    title: {
        fontSize: 26,
        fontWeight: "800",
        color: colors.text,
        marginTop: 34,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 15,
        color: colors.textMuted,
        marginTop: 12,
        textAlign: "center",
        lineHeight: 22,
    },
    dots: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        paddingVertical: 16,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.border,
    },
    dotActive: {
        width: 22,
        backgroundColor: colors.primary,
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 12,
        paddingTop: 4,
    },
    navRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    skipBtn: {
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    skipText: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.textMuted,
    },
    nextBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.dark,
        alignItems: "center",
        justifyContent: "center",
    },
    primaryBtn: {
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingVertical: 17,
        alignItems: "center",
        justifyContent: "center",
    },
    primaryText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "800",
    },
    loginLinkWrap: {
        alignItems: "center",
        paddingVertical: 16,
    },
    loginLink: {
        fontSize: 15,
        color: colors.textMuted,
    },
    loginLinkStrong: {
        color: colors.info,
        fontWeight: "800",
    },
});
