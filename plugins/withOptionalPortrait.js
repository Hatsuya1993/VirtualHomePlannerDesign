const { withAndroidManifest } = require("expo/config-plugins");

// "orientation": "portrait" locks the app's activity to portrait, which makes
// Google Play infer that a portrait screen is *required* — hiding the app from
// devices that don't report android.hardware.screen.portrait (some tablets,
// Chromebooks/desktops, Android XR). Declaring the feature as optional keeps
// the app portrait-only while leaving it installable everywhere.

const OPTIONAL_FEATURES = ["android.hardware.screen.portrait"];

// Exported for testing: mark each feature as optional on a parsed manifest.
const markFeaturesOptional = (manifest, names = OPTIONAL_FEATURES) => {
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    for (const name of names) {
        const existing = manifest["uses-feature"].find((f) => f.$?.["android:name"] === name);
        if (existing) existing.$["android:required"] = "false";
        else manifest["uses-feature"].push({ $: { "android:name": name, "android:required": "false" } });
    }
    return manifest;
};

const withOptionalPortrait = (config) =>
    withAndroidManifest(config, (cfg) => {
        markFeaturesOptional(cfg.modResults.manifest);
        return cfg;
    });

module.exports = withOptionalPortrait;
module.exports.markFeaturesOptional = markFeaturesOptional;
