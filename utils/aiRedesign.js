import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// AI Redesign: composite an item (2nd image) into a room/scene (1st image)
// using Google's Gemini image-generation model (the "Nano Banana" family) via
// the Interactions API. Returns a local file URI of the generated image.
//
// The request goes through a callable Cloud Function so the Gemini key stays
// server-side — EXPO_PUBLIC_ vars ship inside the bundle. The function also
// enforces the free-trial quota.
const MAX_DIM = 1024; // downscale inputs → faster/cheaper

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
    const [roomB64, itemB64] = await Promise.all([toBase64(roomUri), toBase64(itemUri)]);

    const call = httpsCallable(functions, "generateRedesign", { timeout: 300000 });
    let data;
    try {
        ({ data } = await call({ roomBase64: roomB64, itemBase64: itemB64, prompt: PROMPT }));
    } catch (e) {
        throw new Error(e?.message || "Image generation failed.");
    }

    const found = findImage(data?.response);
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
