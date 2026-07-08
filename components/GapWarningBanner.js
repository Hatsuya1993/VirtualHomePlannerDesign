import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { colors, radius } from "../utils/theme";

const DEFAULT_MESSAGE =
    "You need to complete your room to switch to 3D. Please make sure that there are no gaps in the walls.";

// Dismissible floating banner warning about an open (non-closed) room outline.
export const GapWarningBanner = ({ visible, onDismiss, message = DEFAULT_MESSAGE }) => {
    if (!visible) return null;
    return (
        <View style={styles.card}>
            <View style={styles.icon}>
                <Ionicons name="alert" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.text}>{message}</Text>
            <AnimatedPressable
                onPress={onDismiss}
                scaleTo={0.85}
                style={styles.close}
                hitSlop={8}
            >
                <Ionicons name="close" size={18} color={colors.textMuted} />
            </AnimatedPressable>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        position: "absolute",
        top: 56,
        left: 16,
        right: 16,
        zIndex: 10,
        elevation: 10,
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        shadowColor: "#0F172A",
        shadowOpacity: 0.15,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
    },
    icon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.dark,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
        marginTop: 1,
    },
    text: {
        flex: 1,
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        lineHeight: 19,
    },
    close: {
        marginLeft: 8,
        padding: 2,
    },
});
