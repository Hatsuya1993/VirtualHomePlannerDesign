import { Platform } from "react-native";
import Purchases from "react-native-purchases";

// Must match the Entitlement identifier you create in the RevenueCat dashboard.
export const ENTITLEMENT_ID = "pro";

const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

// True when a RevenueCat public SDK key is configured for this platform. When
// false the app falls back to the (dev) stub subscribe path.
export const purchasesAvailable = !!apiKey;

let configured = false;
export const configurePurchases = () => {
    if (!apiKey || configured) return configured;
    Purchases.configure({ apiKey });
    configured = true;
    return true;
};

// Does this customer have the active "pro" entitlement?
export const isProInfo = (customerInfo) =>
    !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];

export { Purchases };
