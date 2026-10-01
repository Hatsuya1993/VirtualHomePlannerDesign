import { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { colors, radius } from "../utils/theme";

// Cross-platform replacement for Alert.prompt, which only exists on iOS and is a
// silent no-op on Android. Used anywhere we need a single line of text back from
// the user (renaming a plan, confirming a password before account deletion).
//
// `onSubmit` receives the entered string. `secure` masks input. `destructive`
// styles the confirm button for irreversible actions.
export const PromptModal = ({
    visible,
    title,
    message,
    placeholder,
    initialValue = "",
    confirmLabel = "OK",
    secure = false,
    destructive = false,
    onSubmit,
    onClose,
}) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);

    // Reset to the caller's value each time the prompt opens, otherwise the
    // previous entry (including a password) lingers in state.
    useEffect(() => {
        if (visible) {
            setValue(initialValue);
            // Let the modal finish presenting before focusing, or Android drops
            // the keyboard request.
            const t = setTimeout(() => inputRef.current?.focus(), 120);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [visible, initialValue]);

    const submit = () => {
        const trimmed = secure ? value : value.trim();
        if (!trimmed) return;
        onSubmit?.(trimmed);
        onClose?.();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.card}>
                    <Text style={styles.title}>{title}</Text>
                    {!!message && <Text style={styles.message}>{message}</Text>}

                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={value}
                        onChangeText={setValue}
                        placeholder={placeholder}
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={secure}
                        autoCapitalize={secure ? "none" : "sentences"}
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={submit}
                    />

                    <View style={styles.row}>
                        <AnimatedPressable
                            style={[styles.btn, styles.cancel]}
                            onPress={onClose}
                            scaleTo={0.97}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[
                                styles.btn,
                                destructive ? styles.destructive : styles.confirm,
                            ]}
                            onPress={submit}
                            scaleTo={0.97}
                        >
                            <Text style={styles.confirmText}>{confirmLabel}</Text>
                        </AnimatedPressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.35)",
    },
    card: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: colors.surface,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        shadowColor: "#0F172A",
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    title: {
        fontSize: 17,
        fontWeight: "700",
        color: colors.text,
    },
    message: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 20,
        color: "#64748B",
    },
    input: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: radius.lg,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === "ios" ? 12 : 8,
        fontSize: 16,
        color: colors.text,
    },
    row: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 16,
    },
    btn: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: radius.lg,
        alignItems: "center",
        justifyContent: "center",
    },
    cancel: {
        backgroundColor: "#F1F5F9",
    },
    cancelText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
    },
    confirm: {
        backgroundColor: colors.primary,
    },
    destructive: {
        backgroundColor: "#DC2626",
    },
    confirmText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
