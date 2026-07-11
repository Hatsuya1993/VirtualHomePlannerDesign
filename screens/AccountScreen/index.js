import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, shadow } from "../../utils/theme";

const MENU_ITEMS = [
    {
        key: "restore",
        label: "Restore Purchases",
        icon: "reload",
        color: colors.primary,
        background: colors.primarySoft,
    },
    {
        key: "rate",
        label: "Rate Us",
        icon: "star",
        color: colors.accent,
        background: colors.accentSoft,
    },
    {
        key: "privacy",
        label: "Privacy Policy",
        icon: "shield-checkmark",
        color: colors.info,
        background: colors.infoSoft,
    },
    {
        key: "terms",
        label: "Terms of Use",
        icon: "document-text",
        color: colors.violet,
        background: colors.violetSoft,
    },
    {
        key: "contact",
        label: "Contact Us",
        icon: "mail",
        color: colors.success,
        background: colors.successSoft,
    },
];

const getInitials = (name) =>
    name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");

export const AccountScreen = () => {
    const { user, logout } = useAuth();
    const email = user?.email ?? "";
    const name = user?.displayName || (email ? email.split("@")[0] : "Your Account");
    const isPro = false;

    const handleLogout = () => {
        Alert.alert("Log out", "Are you sure you want to log out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Log Out",
                style: "destructive",
                onPress: () => logout().catch(() => {}),
            },
        ]);
    };

    const handlePress = (key) => {
        if (key === "logout") {
            handleLogout();
            return;
        }
        // TODO: wire up navigation / actions per item
        console.log("pressed", key);
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.heading}>Account</Text>

                {/* Profile card */}
                <FadeSlideIn>
                    <View style={styles.card}>
                        <View style={styles.profileRow}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {getInitials(name)}
                                </Text>
                            </View>
                            <View style={styles.profileInfo}>
                                <Text style={styles.name} numberOfLines={1}>
                                    {name}
                                </Text>
                                <View style={styles.emailRow}>
                                    {!isPro && (
                                        <View style={styles.proBadge}>
                                            <Ionicons
                                                name="star"
                                                size={12}
                                                color="#FFFFFF"
                                            />
                                            <Text style={styles.proText}>Go Pro</Text>
                                        </View>
                                    )}
                                    <Text style={styles.email} numberOfLines={1}>
                                        {email}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </FadeSlideIn>

                {/* Settings list */}
                <FadeSlideIn delay={100}>
                    <View style={styles.card}>
                        {MENU_ITEMS.map((item, index) => (
                            <Pressable
                                key={item.key}
                                onPress={() => handlePress(item.key)}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    index > 0 && styles.menuRowBorder,
                                    pressed && styles.rowPressed,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.menuIcon,
                                        { backgroundColor: item.background },
                                    ]}
                                >
                                    <Ionicons
                                        name={item.icon}
                                        size={19}
                                        color={item.color}
                                    />
                                </View>
                                <Text style={styles.menuLabel}>{item.label}</Text>
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={colors.textFaint}
                                />
                            </Pressable>
                        ))}
                    </View>
                </FadeSlideIn>

                {/* Delete account */}
                <FadeSlideIn delay={200}>
                    <AnimatedPressable
                        onPress={() => handlePress("delete")}
                        scaleTo={0.97}
                        style={styles.dangerButton}
                    >
                        <Ionicons
                            name="trash-outline"
                            size={20}
                            color={colors.danger}
                        />
                        <Text style={styles.dangerText}>Delete Account</Text>
                    </AnimatedPressable>

                    {/* Log out */}
                    <AnimatedPressable
                        onPress={() => handlePress("logout")}
                        scaleTo={0.97}
                        style={styles.logoutButton}
                    >
                        <Text style={styles.logoutText}>Log Out</Text>
                    </AnimatedPressable>
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
    content: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    heading: {
        fontSize: 34,
        fontWeight: "800",
        color: colors.text,
        marginTop: 8,
        marginBottom: 20,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        marginBottom: 20,
        overflow: "hidden",
        ...shadow.card,
    },
    profileRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarText: {
        color: "#FFFFFF",
        fontSize: 22,
        fontWeight: "800",
    },
    profileInfo: {
        flex: 1,
        marginLeft: 16,
    },
    name: {
        fontSize: 19,
        fontWeight: "800",
        color: colors.text,
        marginBottom: 6,
    },
    emailRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    proBadge: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.accent,
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginRight: 8,
    },
    proText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "800",
        marginLeft: 3,
    },
    email: {
        flex: 1,
        fontSize: 14,
        color: colors.textMuted,
    },
    menuRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    menuRowBorder: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    rowPressed: {
        backgroundColor: colors.surfaceAlt,
    },
    menuIcon: {
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    menuLabel: {
        flex: 1,
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
    },
    dangerButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.dangerSoft,
        borderRadius: radius.md,
        paddingVertical: 16,
        marginBottom: 14,
    },
    dangerText: {
        color: colors.danger,
        fontSize: 16,
        fontWeight: "700",
        marginLeft: 8,
    },
    logoutButton: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        paddingVertical: 16,
        ...shadow.card,
    },
    logoutText: {
        color: colors.danger,
        fontSize: 16,
        fontWeight: "700",
    },
});
