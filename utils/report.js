import * as Sentry from "@sentry/react-native";

// Report an unexpected error to Sentry. Safe to call even when Sentry isn't
// initialized (no DSN) — it just no-ops. Pass `context` for extra debugging
// tags, e.g. report(e, { feature: "ai-redesign" }).
export const report = (error, context) => {
    try {
        Sentry.captureException(error, context ? { extra: context } : undefined);
    } catch {
        // never let error reporting throw
    }
};

// Leave a breadcrumb (trail of what happened before an error).
export const breadcrumb = (message, data) => {
    try {
        Sentry.addBreadcrumb({ message, data, level: "info" });
    } catch {
        // ignore
    }
};

// Firebase auth error codes that are the user's fault (bad input) — not worth
// reporting to Sentry.
const USER_AUTH_CODES = new Set([
    "auth/invalid-email",
    "auth/email-already-in-use",
    "auth/weak-password",
    "auth/invalid-credential",
    "auth/wrong-password",
    "auth/user-not-found",
    "auth/too-many-requests",
    "auth/missing-password",
]);

// Report an auth error only if it's an unexpected/technical one.
export const reportAuth = (error, context) => {
    if (USER_AUTH_CODES.has(error?.code)) return;
    report(error, context);
};
