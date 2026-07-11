import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { AnimatedPressable } from "../../components/AnimatedPressable";
import { chooseImage } from "../../utils/imagePick";
import { generateRedesign } from "../../utils/aiRedesign";
import { colors, radius, shadow } from "../../utils/theme";

export const AiRedesignScreen = ({ navigation }) => {
    const [room, setRoom] = useState(null);
    const [item, setItem] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);

    const pickRoom = async () => {
        const a = await chooseImage();
        if (a) setRoom(a.uri);
    };
    const pickItem = async () => {
        const a = await chooseImage();
        if (a) setItem(a.uri);
    };

    const generate = async () => {
        if (!room || !item) return;
        setGenerating(true);
        try {
            const out = await generateRedesign(room, item);
            setResult(out.uri);
        } catch (e) {
            Alert.alert("AI Redesign", String(e?.message ?? e));
        } finally {
            setGenerating(false);
        }
    };

    const share = async () => {
        try {
            if (result && (await Sharing.isAvailableAsync())) {
                await Sharing.shareAsync(result, {
                    mimeType: "image/jpeg",
                    UTI: "public.jpeg",
                    dialogTitle: "Save your redesign",
                });
            }
        } catch (e) {
            Alert.alert("Save", String(e?.message ?? e));
        }
    };

    const startOver = () => {
        setResult(null);
        setRoom(null);
        setItem(null);
    };

    const canGenerate = !!room && !!item && !generating;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <View style={styles.header}>
                <AnimatedPressable
                    onPress={() => navigation.goBack()}
                    scaleTo={0.85}
                    style={styles.iconButton}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={26} color={colors.text} />
                </AnimatedPressable>
                <Text style={styles.title}>AI Redesign</Text>
                <View style={styles.iconButton} />
            </View>

            {result ? (
                <ScrollView contentContainerStyle={styles.content}>
                    <Image source={{ uri: result }} style={styles.resultImage} resizeMode="cover" />
                    <View style={styles.resultActions}>
                        <AnimatedPressable onPress={share} scaleTo={0.96} style={styles.primaryBtn}>
                            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.primaryText}>Save / Share</Text>
                        </AnimatedPressable>
                        <View style={styles.secondaryRow}>
                            <AnimatedPressable
                                onPress={() => setResult(null)}
                                scaleTo={0.96}
                                style={styles.secondaryBtn}
                            >
                                <Ionicons name="refresh" size={18} color={colors.text} />
                                <Text style={styles.secondaryText}>Try again</Text>
                            </AnimatedPressable>
                            <AnimatedPressable
                                onPress={startOver}
                                scaleTo={0.96}
                                style={styles.secondaryBtn}
                            >
                                <Ionicons name="images-outline" size={18} color={colors.text} />
                                <Text style={styles.secondaryText}>Start over</Text>
                            </AnimatedPressable>
                        </View>
                    </View>
                </ScrollView>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <Text style={styles.lead}>
                        Add a room, then the item you want to drop into it — the AI blends them
                        into one photo.
                    </Text>

                    <PhotoSlot
                        step="1"
                        label="Your room"
                        uri={room}
                        onPress={pickRoom}
                    />
                    <PhotoSlot
                        step="2"
                        label="The item to add"
                        uri={item}
                        onPress={pickItem}
                    />

                    <AnimatedPressable
                        onPress={generate}
                        scaleTo={0.97}
                        disabled={!canGenerate}
                        style={[styles.primaryBtn, styles.generateBtn, !canGenerate && styles.btnDisabled]}
                    >
                        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                        <Text style={styles.primaryText}>Generate</Text>
                    </AnimatedPressable>
                </ScrollView>
            )}

            {generating && (
                <View style={styles.overlay} pointerEvents="auto">
                    <View style={styles.overlayCard}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.overlayTitle}>Designing…</Text>
                        <Text style={styles.overlaySub}>
                            Placing the item into your room. This can take a moment.
                        </Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
};

const PhotoSlot = ({ step, label, uri, onPress }) => (
    <AnimatedPressable onPress={onPress} scaleTo={0.98} style={styles.slot}>
        {uri ? (
            <Image source={{ uri }} style={styles.slotImage} resizeMode="cover" />
        ) : (
            <View style={styles.slotEmpty}>
                <Ionicons name="add" size={30} color={colors.textMuted} />
            </View>
        )}
        <View style={styles.slotLabelRow}>
            <View style={styles.stepBadge}>
                <Text style={styles.stepText}>{step}</Text>
            </View>
            <Text style={styles.slotLabel}>{label}</Text>
            {uri ? (
                <Text style={styles.slotChange}>Change</Text>
            ) : (
                <Text style={styles.slotAdd}>Add photo</Text>
            )}
        </View>
    </AnimatedPressable>
);

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    iconButton: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    lead: {
        fontSize: 14,
        color: colors.textMuted,
        marginBottom: 18,
        lineHeight: 20,
    },
    slot: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        overflow: "hidden",
        marginBottom: 16,
        ...shadow.card,
    },
    slotImage: {
        width: "100%",
        height: 200,
    },
    slotEmpty: {
        height: 160,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceAlt,
    },
    slotLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
    },
    stepBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    stepText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "800",
    },
    slotLabel: {
        flex: 1,
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
    },
    slotAdd: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.info,
    },
    slotChange: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.textMuted,
    },
    primaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.dark,
        borderRadius: radius.pill,
        paddingVertical: 16,
    },
    generateBtn: {
        marginTop: 8,
    },
    btnDisabled: {
        opacity: 0.4,
    },
    primaryText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "800",
    },
    resultImage: {
        width: "100%",
        height: 380,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceAlt,
        marginBottom: 18,
    },
    resultActions: {
        gap: 12,
    },
    secondaryRow: {
        flexDirection: "row",
        gap: 12,
    },
    secondaryBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.pill,
        paddingVertical: 14,
    },
    secondaryText: {
        color: colors.text,
        fontSize: 15,
        fontWeight: "700",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.45)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
    },
    overlayCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 28,
        paddingHorizontal: 32,
        alignItems: "center",
        maxWidth: 300,
        ...shadow.floating,
    },
    overlayTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: colors.text,
        marginTop: 16,
    },
    overlaySub: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 6,
        textAlign: "center",
    },
});
