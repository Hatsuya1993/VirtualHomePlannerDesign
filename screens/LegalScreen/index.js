import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { colors } from "../../utils/theme";
import { PRIVACY_HTML, TERMS_HTML } from "./content";

const DOCS = {
    privacy: { title: "Privacy Policy", html: PRIVACY_HTML },
    terms: { title: "Terms of Use", html: TERMS_HTML },
};

// Renders a legal document (privacy | terms) in a WebView, chosen by route param.
export const LegalScreen = ({ navigation, route }) => {
    const doc = DOCS[route.params?.doc] ?? DOCS.privacy;

    // Open external links / mailto: in the system browser instead of the WebView.
    const handleRequest = (req) => {
        const url = req?.url || "";
        if (url.startsWith("http") || url.startsWith("mailto:")) {
            Linking.openURL(url).catch(() => {});
            return false;
        }
        return true;
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
                <Text style={styles.title}>{doc.title}</Text>
                <View style={styles.iconBtn} />
            </View>

            <WebView
                originWhitelist={["*"]}
                source={{ html: doc.html }}
                style={styles.web}
                onShouldStartLoadWithRequest={handleRequest}
                showsVerticalScrollIndicator
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    iconBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.text },
    web: { flex: 1, backgroundColor: colors.background },
});
