import { useState } from "react";
import {
    ActionSheetIOS,
    Alert,
    Platform,
    useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { recognizeFloorPlan, recognizedToWalls } from "../utils/autoRecognize";

// "Plan from a Photo": pick or take a photo, (optionally crop via a modal), run
// AI floor-plan recognition, and open Plan Preview with the resulting diagram.
// Returns the picker trigger plus the state a screen needs to render the crop
// modal and a "recognizing…" overlay.
export const usePhotoToPlan = (navigation) => {
    const { width } = useWindowDimensions();
    const [pendingAsset, setPendingAsset] = useState(null);
    const [recognizing, setRecognizing] = useState(false);

    const pickFrom = async (source) => {
        const options = { mediaTypes: ["images"], allowsEditing: false, quality: 0.8 };
        try {
            let result;
            if (source === "camera") {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Camera access needed",
                        "Enable camera access in Settings to capture a floor plan."
                    );
                    return;
                }
                result = await ImagePicker.launchCameraAsync(options);
            } else {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(
                        "Photo access needed",
                        "Enable photo access in Settings to choose a floor plan."
                    );
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync(options);
            }
            if (!result.canceled) setPendingAsset(result.assets[0]);
        } catch (e) {
            Alert.alert(
                "Something went wrong",
                "Couldn't open the image source. Please try again."
            );
        }
    };

    // Open the Gallery/Camera chooser.
    const start = () => {
        if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ["Photo Gallery", "Camera", "Cancel"],
                    cancelButtonIndex: 2,
                    userInterfaceStyle: "dark",
                },
                (index) => {
                    if (index === 0) pickFrom("gallery");
                    else if (index === 1) pickFrom("camera");
                }
            );
        } else {
            Alert.alert("Plan from a Photo", undefined, [
                { text: "Photo Gallery", onPress: () => pickFrom("gallery") },
                { text: "Camera", onPress: () => pickFrom("camera") },
                { text: "Cancel", style: "cancel" },
            ]);
        }
    };

    const onCropCancel = () => setPendingAsset(null);

    const onCropDone = async ({ uri }) => {
        setPendingAsset(null);
        setRecognizing(true);
        try {
            const rec = await recognizeFloorPlan(uri);
            const walls = recognizedToWalls(rec, width);
            if (walls.length < 3) {
                throw new Error("Couldn't build a room from the detected walls.");
            }
            navigation.navigate("PlanPreview", { walls });
        } catch (e) {
            Alert.alert("Plan from a Photo", String(e?.message ?? e));
        } finally {
            setRecognizing(false);
        }
    };

    return { start, pendingAsset, recognizing, onCropDone, onCropCancel };
};
