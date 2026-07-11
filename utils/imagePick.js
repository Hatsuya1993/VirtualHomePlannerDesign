import { ActionSheetIOS, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

const launch = async (source) => {
    const options = { mediaTypes: ["images"], allowsEditing: false, quality: 0.9 };
    if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert("Camera access needed", "Enable camera access in Settings.");
            return null;
        }
        const r = await ImagePicker.launchCameraAsync(options);
        return r.canceled ? null : r.assets[0];
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        Alert.alert("Photo access needed", "Enable photo access in Settings.");
        return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync(options);
    return r.canceled ? null : r.assets[0];
};

// Show a Gallery/Camera chooser and resolve with the picked asset (or null if
// cancelled / permission denied). Promise-based so callers can `await` it.
export const chooseImage = () =>
    new Promise((resolve) => {
        const pick = (src) => launch(src).then(resolve).catch(() => resolve(null));
        if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ["Photo Gallery", "Camera", "Cancel"],
                    cancelButtonIndex: 2,
                    userInterfaceStyle: "dark",
                },
                (i) => {
                    if (i === 0) pick("gallery");
                    else if (i === 1) pick("camera");
                    else resolve(null);
                }
            );
        } else {
            Alert.alert("Add a photo", undefined, [
                { text: "Photo Gallery", onPress: () => pick("gallery") },
                { text: "Camera", onPress: () => pick("camera") },
                { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
            ]);
        }
    });
