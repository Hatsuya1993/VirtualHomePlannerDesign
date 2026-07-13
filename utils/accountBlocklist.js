import * as Crypto from "expo-crypto";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Emails of deleted accounts are stored as SHA-256 hashes (doc id) so the raw
// address is never exposed and the collection can't be enumerated — a lookup
// only works if you already know the email you're checking.
const emailHash = (email) =>
    Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        String(email).trim().toLowerCase()
    );

// Reserve an email so it can't be used to sign up again.
export const blockEmail = async (email) => {
    if (!email) return;
    const h = await emailHash(email);
    await setDoc(doc(db, "blockedEmails", h), { blockedAt: serverTimestamp() });
};

// True if this email belongs to a previously-deleted account.
export const isEmailBlocked = async (email) => {
    if (!email) return false;
    try {
        const h = await emailHash(email);
        const snap = await getDoc(doc(db, "blockedEmails", h));
        return snap.exists();
    } catch {
        // If the check itself fails (e.g. Firestore not set up yet), don't block
        // a legitimate signup.
        return false;
    }
};
