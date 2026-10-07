import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase web config — paste yours from the Firebase console (Project settings
// → Your apps → Web app) into `.env` as EXPO_PUBLIC_FIREBASE_*. These values are
// not secret (the web config is meant to be client-visible), but keep them in
// .env so they're easy to swap between projects.
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// True once the env values are present — lets the UI show a friendly message
// instead of a raw "invalid-api-key" error when Firebase isn't configured yet.
export const firebaseReady = !!firebaseConfig.apiKey && !!firebaseConfig.appId;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth wires AsyncStorage persistence so the login survives restarts.
// It throws if called twice (e.g. Fast Refresh) — fall back to getAuth then.
let auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch {
    auth = getAuth(app);
}

// Callable Cloud Functions proxy the AI features so their API keys stay
// server-side. Region must match the functions' deployment region.
export const functions = getFunctions(app, "us-central1");

// Firestore holds the "reserved" (deleted-account) email hashes.
export const db = getFirestore(app);

export { auth };
