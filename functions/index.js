// Server-side proxy for the two AI features.
//
// The app used to call Anthropic and Gemini directly with EXPO_PUBLIC_ keys,
// which ship inside the bundle and are trivially extracted from an APK. These
// callable functions hold the keys in Secret Manager instead, and are also the
// only place the free-trial quota is enforced — the client used to increment its
// own counter, so a modified build could ignore it.
//
// Image downscaling and base64 encoding stay on the client (cheaper to send, and
// the code already worked); these functions take base64 in and hand results back.

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// RevenueCat *secret* key (sk_...), not the public goog_/appl_ SDK key.
const REVENUECAT_SECRET_KEY = defineSecret("REVENUECAT_SECRET_KEY");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const ANTHROPIC_MODEL = "claude-sonnet-5";
const GEMINI_MODEL = "gemini-3.1-flash-image";

// Keep in sync with FREE_AI_TRIES in context/EntitlementsContext.js.
const FREE_AI_TRIES = 3;

const ENTITLEMENT_ID = "pro";

// Ask RevenueCat directly rather than trusting a Firestore flag. The app calls
// Purchases.logIn(user.uid), so the RevenueCat app_user_id is the Firebase uid.
const isPro = async (uid, secret) => {
    try {
        const res = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
            { headers: { Authorization: `Bearer ${secret}` } }
        );
        if (!res.ok) return false;
        const json = await res.json();
        const ent = json?.subscriber?.entitlements?.[ENTITLEMENT_ID];
        if (!ent) return false;
        // A null expiry means a lifetime/non-expiring entitlement.
        if (!ent.expires_date) return true;
        return new Date(ent.expires_date).getTime() > Date.now();
    } catch {
        // Treat an unreachable RevenueCat as "not Pro" rather than failing open.
        return false;
    }
};

// Throws if the caller is signed out or has spent their free generations.
// Returns a commit() the caller runs only after a successful generation, so a
// failed request doesn't burn a try.
const authorize = async (request, rcSecret) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in to use AI features.");
    }

    if (await isPro(uid, rcSecret)) {
        return { uid, commit: async () => {} };
    }

    const snap = await db.doc(`users/${uid}`).get();
    const used = snap.exists ? snap.data()?.aiTriesUsed || 0 : 0;
    if (used >= FREE_AI_TRIES) {
        throw new HttpsError(
            "resource-exhausted",
            "You've used all your free AI generations. Subscribe to continue."
        );
    }

    return {
        uid,
        commit: () =>
            db.doc(`users/${uid}`).set(
                { aiTriesUsed: FieldValue.increment(1) },
                { merge: true }
            ),
    };
};

const options = {
    region: "us-central1",
    memory: "1GiB",
    // Image generation regularly exceeds the 60s default.
    timeoutSeconds: 300,
};

// --- Floor-plan recognition (Anthropic vision) ---------------------------

export const recognizeFloorPlan = onCall(
    { ...options, secrets: [ANTHROPIC_API_KEY, REVENUECAT_SECRET_KEY] },
    async (request) => {
        const { imageBase64, prompt } = request.data || {};
        if (!imageBase64 || !prompt) {
            throw new HttpsError("invalid-argument", "Missing image or prompt.");
        }

        const { commit } = await authorize(request, REVENUECAT_SECRET_KEY.value());

        const started = Date.now();
        const res = await fetch(ANTHROPIC_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY.value(),
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 4096,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/jpeg",
                                    data: imageBase64,
                                },
                            },
                            { type: "text", text: prompt },
                        ],
                    },
                ],
            }),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            logger.warn("recognizeFloorPlan: Anthropic error", {
                status: res.status,
                ms: Date.now() - started,
                detail: detail.slice(0, 300),
            });
            throw new HttpsError(
                "internal",
                `AI request failed (${res.status}). ${detail.slice(0, 180)}`
            );
        }

        const json = await res.json();
        const text = (json.content || []).map((c) => c.text || "").join("");
        // Diagnostics only — no image or response content is logged.
        logger.info("recognizeFloorPlan: Anthropic reply", {
            status: res.status,
            ms: Date.now() - started,
            model: json.model,
            stopReason: json.stop_reason,
            outputTokens: json.usage?.output_tokens,
            textLength: text.length,
        });
        await commit();
        return { text };
    }
);

// --- AI redesign (Gemini image generation) ------------------------------

export const generateRedesign = onCall(
    { ...options, secrets: [GEMINI_API_KEY, REVENUECAT_SECRET_KEY] },
    async (request) => {
        const { roomBase64, itemBase64, prompt } = request.data || {};
        if (!roomBase64 || !itemBase64 || !prompt) {
            throw new HttpsError("invalid-argument", "Missing images or prompt.");
        }

        const { commit } = await authorize(request, REVENUECAT_SECRET_KEY.value());

        const res = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY.value(),
            },
            body: JSON.stringify({
                model: GEMINI_MODEL,
                input: [
                    { type: "text", text: prompt },
                    { type: "image", mime_type: "image/jpeg", data: roomBase64 },
                    { type: "image", mime_type: "image/jpeg", data: itemBase64 },
                ],
                response_format: { type: "image", mime_type: "image/jpeg" },
            }),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            if (res.status === 429) {
                throw new HttpsError(
                    "resource-exhausted",
                    "Image generation is temporarily over quota. Please try again later."
                );
            }
            throw new HttpsError(
                "internal",
                `Image generation failed (${res.status}). ${detail.slice(0, 200)}`
            );
        }

        const json = await res.json();
        await commit();
        // The client already knows how to walk this shape for the image payload.
        return { response: json };
    }
);
// redeploy: pin ANTHROPIC_API_KEY to v4
