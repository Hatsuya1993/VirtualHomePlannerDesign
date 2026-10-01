import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as StoreReview from "expo-store-review";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { PromptModal } from "../../components/PromptModal";
import { FadeSlideIn } from "../../components/FadeSlideIn";
import { useAuth } from "../../context/AuthContext";
import { useEntitlements, FREE_AI_TRIES } from "../../context/EntitlementsContext";
import { reportAuth } from "../../utils/report";
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

export const AccountScreen = ({ navigation }) => {
    const { user, logout, deleteAccount } = useAuth();
    const { pro, aiTriesLeft, purchasesAvailable, restore } = useEntitlements();
    const email = user?.email ?? "";
    const name = user?.displayName || (email ? email.split("@")[0] : "Your Account");
    const isPro = pro;
    const providerId = user?.providerData?.[0]?.providerId;

    const handleLogout = () => {
        Alert.alert("Log out", "Are you sure you want to log out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Log Out",
                style: "destructive",
                onPress: () => logout().catch(() => { }),
            },
        ]);
    };

    const runDelete = async (password) => {
        try {
            await deleteAccount({ password });
            // onAuthStateChanged flips the app back to the Welcome flow.
        } catch (e) {
            if (e.code === "app/needs-password") {
                Alert.alert("Password needed", "Please try again and enter your password.");
            } else if (e.code === "auth/requires-recent-login") {
                Alert.alert(
                    "Re-login required",
                    "For your security, log out and log back in, then delete your account."
                );
            } else {
                reportAuth(e, { feature: "delete-account" });
                Alert.alert("Couldn't delete account", e?.message ?? "Please try again.");
            }
        }
    };

    // Email/password accounts must re-enter their password to confirm.
    const [passwordPromptVisible, setPasswordPromptVisible] = useState(false);

    const confirmDelete = () => {
        // Password accounts must re-authenticate before Firebase will delete
        // them, so we always collect the password — on every platform.
        if (providerId === "password") {
            setPasswordPromptVisible(true);
        } else {
            runDelete();
        }
    };

    const handleDelete = () => {
        Alert.alert(
            "Delete account",
            "This permanently deletes your account and all your designs. To prevent abuse, this email can't be used to sign up again. This can't be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: confirmDelete },
            ]
        );
    };

    const handleRate = async () => {
        try {
            if (await StoreReview.hasAction()) {
                // Shows the native in-app rating prompt (or opens the store page).
                await StoreReview.requestReview();
            } else {
                Alert.alert(
                    "Rate us",
                    "Ratings will be available once the app is on the App Store."
                );
            }
        } catch {
            Alert.alert("Rate us", "Couldn't open the rating prompt right now.");
        }
    };

    const handleContact = () => {
        const url = `mailto:biztech755@gmail.com?subject=${encodeURIComponent(
            "Virtual Home Planner — Support"
        )}`;
        Linking.openURL(url).catch(() =>
            Alert.alert("Contact us", "Email us at biztech755@gmail.com")
        );
    };

    const handleRestore = async () => {
        if (!purchasesAvailable) {
            // No RevenueCat configured — entitlement syncs automatically via account.
            Alert.alert(
                "Restore Purchases",
                pro
                    ? "Your Pro subscription is active."
                    : "No active subscription found on this account.",
                [
                    { text: "OK", style: "cancel" },
                    { text: "Go Pro", onPress: () => navigation.navigate("Paywall") },
                ]
            );
            return;
        }
        try {
            const ok = await restore();
            Alert.alert(
                ok ? "Restored" : "No purchases found",
                ok
                    ? "Your Pro subscription is active."
                    : "We couldn't find an active subscription on this account."
            );
        } catch (e) {
            reportAuth(e, { feature: "restore" });
            Alert.alert("Restore failed", e?.message ?? "Please try again.");
        }
    };

    const handlePress = (key) => {
        if (key === "restore") {
            handleRestore();
            return;
        }
        if (key === "logout") {
            handleLogout();
            return;
        }
        if (key === "delete") {
            handleDelete();
            return;
        }
        if (key === "rate") {
            handleRate();
            return;
        }
        if (key === "privacy") {
            navigation.navigate("Legal", { doc: "privacy" });
            return;
        }
        if (key === "terms") {
            navigation.navigate("Legal", { doc: "terms" });
            return;
        }
        if (key === "contact") {
            handleContact();
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

                {/* Pro / upgrade */}
                <FadeSlideIn delay={60}>
                    <AnimatedPressable
                        onPress={() => navigation.navigate("Paywall")}
                        scaleTo={0.98}
                        style={[styles.proCard, isPro && styles.proCardActive]}
                    >
                        <View style={styles.proIcon}>
                            <Ionicons
                                name={isPro ? "checkmark-circle" : "sparkles"}
                                size={22}
                                color="#FFFFFF"
                            />
                        </View>
                        <View style={styles.proTextWrap}>
                            <Text style={styles.proTitle}>
                                {isPro ? "Pro member" : "Upgrade to Pro"}
                            </Text>
                            <Text style={styles.proSub}>
                                {isPro
                                    ? "You have unlimited AI."
                                    : `${aiTriesLeft} of ${FREE_AI_TRIES} free AI ${aiTriesLeft === 1 ? "try" : "tries"
                                    } left`}
                            </Text>
                        </View>
                        {!isPro && (
                            <Ionicons
                                name="chevron-forward"
                                size={20}
                                color="rgba(255,255,255,0.9)"
                            />
                        )}
                    </AnimatedPressable>
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
            <PromptModal
                visible={passwordPromptVisible}
                title="Confirm password"
                message="Enter your password to permanently delete your account."
                placeholder="Password"
                confirmLabel="Delete"
                secure
                destructive
                onSubmit={(password) => runDelete(password)}
                onClose={() => setPasswordPromptVisible(false)}
            />
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
    proCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.primary,
        borderRadius: radius.lg,
        padding: 16,
        marginBottom: 20,
        ...shadow.card,
    },
    proCardActive: {
        backgroundColor: colors.success,
    },
    proIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.22)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    proTextWrap: { flex: 1 },
    proTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
    proSub: {
        fontSize: 13,
        color: "rgba(255,255,255,0.9)",
        marginTop: 2,
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
