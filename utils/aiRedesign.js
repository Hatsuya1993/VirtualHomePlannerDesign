import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";

// AI Redesign: composite an item (2nd image) into a room/scene (1st image)
// using Google's Gemini image-generation model (the "Nano Banana" family) via
// the Interactions API. Returns a local file URI of the generated image.
//
// The key is read from an EXPO_PUBLIC_ env var. NOTE: EXPO_PUBLIC_ vars are
// bundled into the app, so the key ships with the build — for production, proxy
// this through a backend instead of shipping the key on-device.
const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_DIM = 1024; // downscale inputs → faster/cheaper

const getKey = () => process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const getModel = () => process.env.EXPO_PUBLIC_GEMINI_MODEL || "gemini-3.1-flash-image";

const PROMPT =
    "You are an interior-design photo editor. The FIRST image is a room/scene. " +
    "The SECOND image is a single furniture item or object. Produce a new " +
    "photorealistic image of the FIRST scene with the item from the SECOND image " +
    "naturally placed into it — matching the room's perspective, scale, lighting " +
    "and shadows so it looks real. Keep the rest of the room unchanged. Return only the edited image.";

const toBase64 = async (uri) => {
    const img = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_DIM } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!img.base64) throw new Error("Could not read one of the images.");
    return img.base64;
};

// Some responses prefix a data URI ("data:image/png;base64,<...>"); keep only
// the raw base64.
const stripPrefix = (s) =>
    s.startsWith("data:") && s.includes(",") ? s.slice(s.indexOf(",") + 1) : s;

// The Interactions API nests the generated image inside steps/content blocks;
// rather than hard-code a path that may shift, walk the whole response and
// return the first sizeable base64 payload that's tagged as an image.
const findImage = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
        for (const it of node) {
            const r = findImage(it);
            if (r) return r;
        }
        return null;
    }
    const data = typeof node.data === "string" ? node.data : null;
    const mime = node.mime_type || node.mimeType || null;
    const looksImage = node.type === "image" || (mime && String(mime).startsWith("image"));
    if (data && data.length > 200 && looksImage) {
        return {
            data: stripPrefix(data),
            mime: mime && String(mime).startsWith("image") ? mime : "image/png",
        };
    }
    for (const k of Object.keys(node)) {
        const r = findImage(node[k]);
        if (r) return r;
    }
    return null;
};

export const generateRedesign = async (roomUri, itemUri) => {
    const key = getKey();
    if (!key) {
        throw new Error(
            "No Gemini key configured. Set EXPO_PUBLIC_GEMINI_API_KEY and restart the bundler."
        );
    }

    const [roomB64, itemB64] = await Promise.all([toBase64(roomUri), toBase64(itemUri)]);

    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
            model: getModel(),
            input: [
                { type: "text", text: PROMPT },
                { type: "image", mime_type: "image/jpeg", data: roomB64 },
                { type: "image", mime_type: "image/jpeg", data: itemB64 },
            ],
            response_format: { type: "image", mime_type: "image/jpeg" },
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (res.status === 429) {
            throw new Error(
                "You've hit Gemini's quota for image generation. The image models are a paid feature with a tiny free-tier limit — enable billing on your Google Cloud project, or wait for the daily quota to reset, then try again."
            );
        }
        if (res.status === 400 && /api key|api_key|invalid/i.test(detail)) {
            throw new Error("Invalid Gemini API key. Check EXPO_PUBLIC_GEMINI_API_KEY.");
        }
        throw new Error(`Image generation failed (${res.status}). ${detail.slice(0, 200)}`);
    }

    const json = await res.json();
    const found = findImage(json);
    if (!found) {
        throw new Error("The AI didn't return an image. Try different photos.");
    }

    const ext = found.mime.includes("png") ? "png" : "jpg";
    const file = new File(Paths.cache, `redesign-${Date.now()}.${ext}`);
    if (file.exists) file.delete();
    file.create();
    file.write(found.data, { encoding: "base64" });
    return { uri: file.uri, mime: found.mime };
};
