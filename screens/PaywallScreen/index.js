import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { useEntitlements, FREE_AI_TRIES } from "../../context/EntitlementsContext";
import { report } from "../../utils/report";
import { colors, radius } from "../../utils/theme";

const PRICE = "$9.99";

// Sort order (longest plan first) and display labels per RevenueCat package type.
const PLAN_RANK = {
    ANNUAL: 0,
    SIX_MONTH: 1,
    THREE_MONTH: 2,
    TWO_MONTH: 3,
    MONTHLY: 4,
    WEEKLY: 5,
    LIFETIME: 6,
};
const PLAN_LABELS = {
    WEEKLY: { label: "Weekly", period: "week" },
    MONTHLY: { label: "Monthly", period: "month" },
    ANNUAL: { label: "Yearly", period: "year" },
    TWO_MONTH: { label: "2 Months", period: "2 mo" },
    THREE_MONTH: { label: "Quarterly", period: "3 mo" },
    SIX_MONTH: { label: "6 Months", period: "6 mo" },
    LIFETIME: { label: "Lifetime", period: "" },
};
const planLabel = (pkg) =>
    PLAN_LABELS[pkg.packageType] || {
        label: pkg.product?.title || "Plan",
        period: "",
    };

const FEATURES = [
    {
        icon: "scan-outline",
        title: "Unlimited floor-plan recognition",
        sub: "Turn any photo into an editable plan, as often as you like.",
    },
    {
        icon: "image-outline",
        title: "Unlimited Plan from a Photo",
        sub: "Snap and convert without limits.",
    },
    {
        icon: "sparkles-outline",
        title: "Unlimited AI Redesign",
        sub: "Drop any item into your room and reimagine it endlessly.",
    },
    {
        icon: "flash-outline",
        title: "First to new AI features",
        sub: "Every future AI tool included, no extra cost.",
    },
];

export const PaywallScreen = ({ navigation }) => {
    const { pro, aiTriesUsed, packages, purchasesAvailable, purchase, restore, activatePro } =
        useEntitlements();
    const [busy, setBusy] = useState(false);
    const triesLeft = Math.max(0, FREE_AI_TRIES - aiTriesUsed);

    // Show every package in the offering, labelled by its type, longest first.
    const plans = [...packages]
        .sort((a, b) => (PLAN_RANK[a.packageType] ?? 9) - (PLAN_RANK[b.packageType] ?? 9))
        .map((pkg) => ({ pkg, ...planLabel(pkg) }));

    const proAlert = () =>
        Alert.alert("You're Pro! 🎉", "Enjoy unlimited AI.", [
            { text: "Great", onPress: () => navigation.goBack() },
        ]);

    const handlePurchase = async (pkg) => {
        if (!pkg || busy) return;
        setBusy(true);
        try {
            if (await purchase(pkg)) proAlert();
        } catch (e) {
            if (!e?.userCancelled) {
                report(e, { feature: "purchase" });
                Alert.alert("Purchase failed", e?.message ?? "Please try again.");
            }
        } finally {
            setBusy(false);
        }
    };

    const handleRestore = async () => {
        setBusy(true);
        try {
            const ok = await restore();
            Alert.alert(
                ok ? "Restored" : "No purchases found",
                ok
                    ? "Your Pro subscription is active."
                    : "We couldn't find an active subscription on this account."
            );
            if (ok) navigation.goBack();
        } catch (e) {
            report(e, { feature: "restore" });
            Alert.alert("Restore failed", e?.message ?? "Please try again.");
        } finally {
            setBusy(false);
        }
    };

    // Dev fallback when RevenueCat isn't configured.
    const subscribeStub = async () => {
        setBusy(true);
        try {
            await activatePro();
            proAlert();
        } catch (e) {
            report(e, { feature: "subscribe" });
            Alert.alert("Couldn't complete", e?.message ?? "Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.85}
                    style={styles.closeBtn}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                </AnimatedPressable>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.crown}>
                    <Ionicons name="sparkles" size={30} color="#FFFFFF" />
                </View>
                <Text style={styles.title}>Go Pro</Text>
                <Text style={styles.subtitle}>
                    Unlock every AI feature in the app, with no limits.
                </Text>

                <View style={styles.card}>
                    {FEATURES.map((f, i) => (
                        <View
                            key={f.title}
                            style={[styles.feature, i > 0 && styles.featureBorder]}
                        >
                            <View style={styles.featureIcon}>
                                <Ionicons name={f.icon} size={20} color={colors.primary} />
                            </View>
                            <View style={styles.featureText}>
                                <Text style={styles.featureTitle}>{f.title}</Text>
                                <Text style={styles.featureSub}>{f.sub}</Text>
                            </View>
                            <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={colors.success}
                            />
                        </View>
                    ))}
                </View>

                {!pro && (
                    <Text style={styles.triesNote}>
                        {triesLeft > 0
                            ? `You have ${triesLeft} of ${FREE_AI_TRIES} free AI generations left.`
                            : "You've used all 3 free AI generations."}
                    </Text>
                )}

                {__DEV__ && (
                    <Text style={styles.debug}>
                        RC:{" "}
                        {purchasesAvailable
                            ? `${packages.length} pkg [${packages
                                  .map((p) => p.packageType)
                                  .join(", ")}]`
                            : "no SDK key"}
                    </Text>
                )}
            </ScrollView>

            <View style={styles.footer}>
                {pro ? (
                    <View style={[styles.subscribeBtn, styles.proActive]}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.subscribeText}>You're a Pro member</Text>
                    </View>
                ) : plans.length > 0 ? (
                    <>
                        {plans.map(({ pkg, label, period }) => (
                            <AnimatedPressable
                                key={pkg.identifier}
                                onPress={() => handlePurchase(pkg)}
                                disabled={busy}
                                scaleTo={0.97}
                                style={styles.subscribeBtn}
                            >
                                {busy ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.subscribeText}>
                                        {label} · {pkg.product.priceString}
                                        {period ? `/${period}` : ""}
                                    </Text>
                                )}
                            </AnimatedPressable>
                        ))}
                        <AnimatedPressable
                            onPress={handleRestore}
                            disabled={busy}
                            scaleTo={0.97}
                            style={styles.restore}
                            hitSlop={8}
                        >
                            <Text style={styles.restoreText}>Restore purchases</Text>
                        </AnimatedPressable>
                        <Text style={styles.finePrint}>
                            Recurring billing. Cancel anytime in Settings.
                        </Text>
                    </>
                ) : (
                    <>
                        <AnimatedPressable
                            onPress={subscribeStub}
                            disabled={busy}
                            scaleTo={0.97}
                            style={styles.subscribeBtn}
                        >
                            {busy ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.subscribeText}>
                                    Subscribe · {PRICE}/month
                                </Text>
                            )}
                        </AnimatedPressable>
                        <Text style={styles.finePrint}>
                            {purchasesAvailable
                                ? "Loading plans…"
                                : "Cancel anytime. Billed monthly."}
                        </Text>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row",
        justifyContent: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        alignItems: "center",
    },
    crown: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 8,
        marginBottom: 16,
    },
    title: {
        fontSize: 30,
        fontWeight: "800",
        color: colors.text,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textMuted,
        textAlign: "center",
        marginTop: 8,
        marginBottom: 24,
        lineHeight: 21,
    },
    card: {
        alignSelf: "stretch",
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: 16,
    },
    feature: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
    },
    featureBorder: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    featureIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    featureText: { flex: 1, marginRight: 10 },
    featureTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
    featureSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    triesNote: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 20,
        textAlign: "center",
    },
    debug: {
        fontSize: 11,
        color: colors.textFaint,
        marginTop: 12,
        textAlign: "center",
    },
    footer: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 8,
    },
    subscribeBtn: {
        flexDirection: "row",
        gap: 8,
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingVertical: 17,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    restore: {
        alignItems: "center",
        paddingVertical: 8,
    },
    restoreText: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.info,
    },
    proActive: {
        backgroundColor: colors.success,
    },
    subscribeText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "800",
    },
    finePrint: {
        fontSize: 12,
        color: colors.textFaint,
        textAlign: "center",
        marginTop: 12,
    },
});
