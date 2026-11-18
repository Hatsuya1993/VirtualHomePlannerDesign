import { auth } from "./firebase";

// Calls a Firebase callable Cloud Function directly over XMLHttpRequest,
// speaking the same callable protocol the Firebase SDK uses
// (POST {"data": ...} with the user's ID token; reply {"result": ...} or
// {"error": {"status", "message"}}).
//
// Why not httpsCallable(): in React Native it goes through the fetch polyfill,
// which on iOS gives up after the platform's 60 s idle timeout and then
// reports every failure as a bare "internal [0]". Here the timeout is ours
// (default 5 min, matching the functions' timeoutSeconds) and each failure
// says what actually happened.

const REGION = "us-central1"; // must match the functions' deployment region

// Error codes in the same form the Firebase SDK uses ("resource-exhausted"…).
const codeFor = (status) =>
    typeof status === "string" ? status.toLowerCase().replace(/_/g, "-") : "internal";

export const callFunction = async (name, data, { timeoutMs = 300000 } = {}) => {
    const user = auth.currentUser;
    if (!user) {
        const err = new Error("Please sign in to use AI features.");
        err.code = "unauthenticated";
        throw err;
    }
    const token = await user.getIdToken();
    const projectId = auth.app.options.projectId;
    const url = `https://${REGION}-${projectId}.cloudfunctions.net/${name}`;

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.timeout = timeoutMs;
        xhr.responseType = "text";
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.onload = () => {
            let body = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                // handled below
            }
            if (xhr.status >= 200 && xhr.status < 300 && body && "result" in body) {
                resolve(body.result);
                return;
            }
            const err = new Error(
                body?.error?.message ||
                    `Unexpected server response (${xhr.status}${
                        body ? "" : `, ${String(xhr.responseText || "").length} bytes`
                    }).`
            );
            err.code = codeFor(body?.error?.status);
            err.status = xhr.status;
            reject(err);
        };
        xhr.onerror = () => {
            const err = new Error("Couldn't reach the server. Check your connection and try again.");
            err.code = "unavailable";
            reject(err);
        };
        xhr.ontimeout = () => {
            const err = new Error("The request took too long. Please try again.");
            err.code = "deadline-exceeded";
            reject(err);
        };

        xhr.send(JSON.stringify({ data }));
    });
};
