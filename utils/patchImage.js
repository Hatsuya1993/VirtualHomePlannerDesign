// Global safety net for the native RCTImageLoader error
// "No suitable image URL loader found for (null)".
//
// It fires whenever ANY <Image source={{ uri }}> (ours OR a third-party
// library's — e.g. an auth/analytics SDK) renders with a null/empty uri. Our
// own images are already guarded, but a library's internal <Image> we can't
// edit can still trigger it.
//
// In React Native 0.86, <Image> is a plain function component (no `.render` to
// monkeypatch), but RN exposes an official global hook —
// unstable_setImageComponentDecorator — that wraps EVERY <Image> in the app.
// RN reads it once, at Image module-load time, so this file must run before
// anything imports Image (i.e. it's the very first import in index.js).
//
// ImageInjection.js pulls in only React (not Image), so importing the setter
// here does not prematurely load Image and lose our chance to inject.
import * as React from "react";
import { unstable_setImageComponentDecorator } from "react-native/Libraries/Image/ImageInjection";

// An <Image> source that will make RCTImageLoader throw with "(null)":
//   - source is null / undefined entirely
//   - a { uri } object whose uri is null / undefined / ""
//   - an array of only such empty entries
// (A numeric require() asset is always valid, so it's never "empty".)
const isEmptySource = (source) => {
    if (source == null) return true;
    if (typeof source === "number") return false;
    if (Array.isArray(source)) {
        return source.length === 0 || source.every(isEmptySource);
    }
    if (typeof source === "object") {
        if ("uri" in source) return !source.uri;
        // Some libraries pass {} or other objects with no usable ref.
        return !source.uri && !source.width && Object.keys(source).length === 0;
    }
    return false;
};

try {
    unstable_setImageComponentDecorator((ImageComponent) => {
        const NullUriSafeImage = (props) => {
            // An empty source is what makes RCTImageLoader throw. Render nothing
            // rather than mount a native image view with no uri (stripping to an
            // empty source still reaches the loader and errors).
            if (props && isEmptySource(props.source)) {
                return null;
            }
            return React.createElement(ImageComponent, props);
        };
        NullUriSafeImage.displayName = "NullUriSafeImage";
        return NullUriSafeImage;
    });
} catch {
    // Fail open: if RN's injection API ever changes, worst case is the
    // (harmless, dev-only) red box returns — never a crash.
}

// Dev-only: a dependency fires a native RCTImageLoader load with a null URL on
// some transitions ("No suitable image URL loader found for (null)"). It does
// NOT come through the RN <Image> component (the decorator above is applied and
// never sees it), it's harmless (a silent no-op in production), and
// LogBox.ignoreLogs doesn't catch it because it's a native-originated error.
// Drop it at the console.error boundary so it stops red-boxing in development.
if (__DEV__) {
    const IMG_LOADER_ERROR = "No suitable image URL loader found";
    const originalConsoleError = console.error;
    console.error = (...args) => {
        for (const arg of args) {
            if (typeof arg === "string" && arg.includes(IMG_LOADER_ERROR)) {
                return;
            }
        }
        originalConsoleError.apply(console, args);
    };
}
