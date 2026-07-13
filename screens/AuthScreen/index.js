import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { useAuth } from "../../context/AuthContext";
import { firebaseReady } from "../../utils/firebase";
import {
    appleAuthAvailable,
    isAppleCancel,
    isGoogleCancel,
    signInWithApple,
    signInWithGoogle,
} from "../../utils/socialAuth";
import { reportAuth } from "../../utils/report";
import { colors, radius } from "../../utils/theme";

// Map common Firebase auth error codes to friendly messages.
const friendlyError = (e) => {
    switch (e?.code) {
        case "auth/invalid-email":
            return "That email address doesn't look right.";
        case "auth/email-already-in-use":
            return "An account with this email already exists. Try logging in.";
        case "auth/weak-password":
            return "Please use a stronger password (at least 6 characters).";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Incorrect email or password.";
        case "auth/network-request-failed":
            return "Network error. Check your connection and try again.";
        case "auth/invalid-api-key":
        case "auth/configuration-not-found":
            return "Firebase isn't configured yet. Add your keys to .env and restart.";
        default:
            return e?.message ?? "Something went wrong. Please try again.";
    }
};

// One screen serves both Register and Login, driven by route params.mode.
export const AuthScreen = ({ navigation, route }) => {
    const isLogin = route.params?.mode === "login";
    const { register, login, resetPassword } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    // On success, onAuthStateChanged flips the app into the signed-in stack —
    // no manual navigation needed here.
    const submit = async () => {
        if (!firebaseReady) {
            Alert.alert(
                "Not configured",
                "Add your Firebase keys to .env (EXPO_PUBLIC_FIREBASE_*) and restart with npx expo start -c."
            );
            return;
        }
        if (!email.trim() || !password) {
            Alert.alert("Missing info", "Enter your email and password.");
            return;
        }
        if (!isLogin && password.length < 6) {
            Alert.alert("Weak password", "Use at least 6 characters.");
            return;
        }
        setBusy(true);
        try {
            if (isLogin) await login(email, password);
            else await register(email, password);
        } catch (e) {
            reportAuth(e, { feature: isLogin ? "login" : "register" });
            Alert.alert(isLogin ? "Login failed" : "Sign up failed", friendlyError(e));
        } finally {
            setBusy(false);
        }
    };

    const [appleReady, setAppleReady] = useState(false);
    useEffect(() => {
        appleAuthAvailable().then(setAppleReady);
    }, []);

    const runSocial = async (fn, isCancel, label) => {
        setBusy(true);
        try {
            await fn(); // success flips into the app via onAuthStateChanged
        } catch (e) {
            if (!isCancel(e)) {
                reportAuth(e, { feature: `social-${label.toLowerCase()}` });
                Alert.alert(`${label} sign-in failed`, friendlyError(e));
            }
        } finally {
            setBusy(false);
        }
    };
    const handleGoogle = () => runSocial(signInWithGoogle, isGoogleCancel, "Google");
    const handleApple = () => runSocial(signInWithApple, isAppleCancel, "Apple");

    const handleForgotPassword = async () => {
        if (!email.trim()) {
            Alert.alert(
                "Reset password",
                "Enter your email above first, then tap Forgot password."
            );
            return;
        }
        try {
            await resetPassword(email);
            Alert.alert(
                "Check your email",
                `We sent a password reset link to ${email.trim()}.`
            );
        } catch (e) {
            Alert.alert("Couldn't send reset", friendlyError(e));
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.85}
                    style={styles.iconBtn}
                    hitSlop={8}
                >
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                </AnimatedPressable>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.title}>
                        {isLogin ? "Welcome back" : "Create your account"}
                    </Text>
                    <Text style={styles.subtitle}>
                        {isLogin
                            ? "Log in to continue designing your home."
                            : "Sign up to start designing your home."}
                    </Text>

                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.textFaint}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        autoComplete="email"
                    />

                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textFaint}
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    {isLogin && (
                        <AnimatedPressable
                            onPress={handleForgotPassword}
                            scaleTo={0.96}
                            style={styles.forgot}
                            hitSlop={6}
                        >
                            <Text style={styles.forgotText}>Forgot password?</Text>
                        </AnimatedPressable>
                    )}

                    <AnimatedPressable
                        onPress={submit}
                        scaleTo={0.97}
                        disabled={busy}
                        style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    >
                        {busy ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.primaryText}>
                                {isLogin ? "Log In" : "Create Account"}
                            </Text>
                        )}
                    </AnimatedPressable>

                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.orText}>or</Text>
                        <View style={styles.line} />
                    </View>

                    <AnimatedPressable
                        onPress={handleGoogle}
                        scaleTo={0.97}
                        disabled={busy}
                        style={[styles.socialBtn, styles.googleBtn]}
                    >
                        <Ionicons name="logo-google" size={20} color="#EA4335" />
                        <Text style={styles.socialText}>Continue with Google</Text>
                    </AnimatedPressable>

                    {appleReady && (
                        <AnimatedPressable
                            onPress={handleApple}
                            scaleTo={0.97}
                            disabled={busy}
                            style={[styles.socialBtn, styles.appleBtn]}
                        >
                            <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                            <Text style={[styles.socialText, styles.appleText]}>
                                Continue with Apple
                            </Text>
                        </AnimatedPressable>
                    )}

                    <View style={styles.switchRow}>
                        <Text style={styles.switchText}>
                            {isLogin ? "New here? " : "Already have an account? "}
                        </Text>
                        <AnimatedPressable
                            onPress={() =>
                                navigation.replace(isLogin ? "Register" : "Login")
                            }
                            scaleTo={0.96}
                            hitSlop={6}
                        >
                            <Text style={styles.switchLink}>
                                {isLogin ? "Create an account" : "Log in"}
                            </Text>
                        </AnimatedPressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    flex: { flex: 1 },
    header: {
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    iconBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        color: colors.text,
        marginTop: 8,
    },
    subtitle: {
        fontSize: 15,
        color: colors.textMuted,
        marginTop: 8,
        marginBottom: 24,
        lineHeight: 21,
    },
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.textMuted,
        marginBottom: 8,
        marginTop: 14,
    },
    input: {
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.text,
    },
    forgot: {
        alignSelf: "flex-end",
        marginTop: 12,
    },
    forgotText: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.info,
    },
    primaryBtn: {
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 24,
    },
    primaryText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "800",
    },
    btnDisabled: {
        opacity: 0.6,
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginVertical: 22,
    },
    line: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    orText: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.textMuted,
    },
    socialBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: radius.pill,
        paddingVertical: 15,
        marginBottom: 12,
    },
    googleBtn: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    appleBtn: {
        backgroundColor: "#000000",
    },
    socialText: {
        fontSize: 15,
        fontWeight: "700",
        color: colors.text,
    },
    appleText: {
        color: "#FFFFFF",
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 22,
    },
    switchText: {
        fontSize: 15,
        color: colors.textMuted,
    },
    switchLink: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.info,
    },
});
