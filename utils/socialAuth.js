import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
    GoogleSignin,
    statusCodes,
} from "@react-native-google-signin/google-signin";
import {
    GoogleAuthProvider,
    OAuthProvider,
    signInWithCredential,
} from "firebase/auth";
import { auth } from "./firebase";

// --- Google -------------------------------------------------------------

let googleConfigured = false;
const ensureGoogleConfigured = () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!webClientId) {
        throw new Error(
            "Google sign-in isn't configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env."
        );
    }
    if (!googleConfigured) {
        // webClientId must be the Firebase project's *Web* OAuth client ID — it's
        // the audience Firebase expects on the returned ID token. iosClientId is
        // required on iOS (the native SDK can't find it without a
        // GoogleService-Info.plist); it's ignored on Android.
        GoogleSignin.configure({ webClientId, iosClientId });
        googleConfigured = true;
    }
};

export const signInWithGoogle = async () => {
    ensureGoogleConfigured();
    // Android-only check; harmless no-op on iOS.
    try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    } catch {
        // ignore — iOS / already available
    }
    const res = await GoogleSignin.signIn();
    // idToken location moved to `res.data` in newer library versions.
    const idToken = res?.data?.idToken ?? res?.idToken;
    if (!idToken) throw new Error("No Google ID token returned.");
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
};

export const isGoogleCancel = (e) =>
    e?.code === statusCodes.SIGN_IN_CANCELLED || e?.code === statusCodes.IN_PROGRESS;

// Clear the cached Google session. Without this, signing out of Firebase leaves
// the native Google SDK still holding the last account, so the next
// "Continue with Google" signs straight back in without offering the account
// picker. Best-effort: never block app sign-out on it.
export const signOutGoogle = async () => {
    try {
        await GoogleSignin.signOut();
    } catch {
        // nothing cached, or configure() was never called this session
    }
};

// --- Apple --------------------------------------------------------------

const CHARSET =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
const randomNonce = (len = 32) => {
    const bytes = Crypto.getRandomBytes(len);
    return Array.from(bytes)
        .map((b) => CHARSET[b % CHARSET.length])
        .join("");
};

export const appleAuthAvailable = async () => {
    if (Platform.OS !== "ios") return false;
    try {
        return await AppleAuthentication.isAvailableAsync();
    } catch {
        return false;
    }
};

export const signInWithApple = async () => {
    // Apple requires a nonce: send the SHA-256 hash, then hand Firebase the raw
    // value so it can verify the token matches.
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
    );
    const appleCred = await AppleAuthentication.signInAsync({
        requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
    });
    if (!appleCred.identityToken) {
        throw new Error("No Apple identity token returned.");
    }
    const credential = new OAuthProvider("apple.com").credential({
        idToken: appleCred.identityToken,
        rawNonce,
    });
    await signInWithCredential(auth, credential);
};

export const isAppleCancel = (e) => e?.code === "ERR_REQUEST_CANCELED";
