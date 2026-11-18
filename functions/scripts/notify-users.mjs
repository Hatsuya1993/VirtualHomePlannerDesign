// One-off service notice to all registered users.
//
// This is a TRANSACTIONAL message — an outage notice and apology for a feature
// that is currently broken. Keep it that way: no promotion, no upsell, no
// "while you're here". The moment promotional content is added it becomes
// marketing and legally requires consent and an unsubscribe link.
//
// Emails live in Firebase Auth, not Firestore, so we page through listUsers().
//
// Lives under functions/ because that is where firebase-admin is installed, so
// it must be run from there.
//
// Usage:
//   cd functions
//
//   GOOGLE_APPLICATION_CREDENTIALS=../service-account.json \
//   node scripts/notify-users.mjs            # dry run — prints who would be mailed
//
//   GOOGLE_APPLICATION_CREDENTIALS=../service-account.json \
//   RESEND_API_KEY=re_xxx \
//   FROM="Room Planner <support@yourdomain.com>" \
//   node scripts/notify-users.mjs --send     # actually sends

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const SEND = process.argv.includes("--send");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.FROM;
const BATCH_PAUSE_MS = 600; // stay well under provider rate limits

const SUBJECT = "Plan from a Photo is temporarily unavailable";

const TEXT = `Hi,

We're writing to let you know that "Plan from a Photo" in Room Planner is
currently not working. If you tried it recently and saw an error, that was
our fault, not anything you did.

Our team is actively working on it, and we'll have it back as soon as
we can.

Every other part of the app — drawing floor plans, the 3D walkthrough,
measurements and saved designs — is unaffected and working normally.

If you used one of your free AI generations on a failed attempt, it was not
counted against your allowance.

We're sorry for the disruption and the wasted time.

The Room Planner team
`;

const HTML = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;line-height:1.6">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:19px">Plan from a Photo is temporarily unavailable</h1>
    <p style="margin:0 0 14px">Hi,</p>
    <p style="margin:0 0 14px">We're writing to let you know that <strong>Plan from a Photo</strong> in Room Planner is currently not working. If you tried it recently and saw an error, that was our fault, not anything you did.</p>
    <p style="margin:0 0 14px">Our team is actively working on it, and we&rsquo;ll have it back as soon as we can.</p>
    <p style="margin:0 0 14px">Every other part of the app &mdash; drawing floor plans, the 3D walkthrough, measurements and saved designs &mdash; is unaffected and working normally.</p>
    <p style="margin:0 0 14px">If you used one of your free AI generations on a failed attempt, it was not counted against your allowance.</p>
    <p style="margin:0 0 20px">We're sorry for the disruption and the wasted time.</p>
    <p style="margin:0;color:#64748B">The Room Planner team</p>
  </div>
</body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sendOne = async (to) => {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            authorization: `Bearer ${RESEND_API_KEY}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to, subject: SUBJECT, text: TEXT, html: HTML }),
    });
    if (!res.ok) {
        throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    }
};

const main = async () => {
    if (SEND && (!RESEND_API_KEY || !FROM)) {
        console.error("RESEND_API_KEY and FROM are required with --send");
        process.exit(1);
    }

    initializeApp({ credential: applicationDefault() });
    const auth = getAuth();

    // Collect every deliverable address first, so a send never starts against a
    // partially-read list.
    const recipients = [];
    const skipped = { noEmail: 0, disabled: 0, unverified: 0 };
    let pageToken;

    do {
        const page = await auth.listUsers(1000, pageToken);
        for (const u of page.users) {
            if (!u.email) { skipped.noEmail++; continue; }
            if (u.disabled) { skipped.disabled++; continue; }
            // Social sign-ins arrive verified; unverified password accounts may
            // never have been real addresses.
            if (!u.emailVerified) { skipped.unverified++; continue; }
            recipients.push(u.email);
        }
        pageToken = page.pageToken;
    } while (pageToken);

    const unique = [...new Set(recipients.map((e) => e.toLowerCase()))];

    console.log(`deliverable: ${unique.length}`);
    console.log(`skipped:     no email ${skipped.noEmail}, disabled ${skipped.disabled}, unverified ${skipped.unverified}`);

    if (!SEND) {
        console.log("\nDRY RUN — nothing sent. Sample:");
        unique.slice(0, 10).forEach((e) => console.log("  " + e));
        if (unique.length > 10) console.log(`  ...and ${unique.length - 10} more`);
        console.log("\nRe-run with --send to actually send.");
        return;
    }

    let sent = 0;
    const failed = [];
    for (const email of unique) {
        try {
            await sendOne(email);
            sent++;
            if (sent % 25 === 0) console.log(`  sent ${sent}/${unique.length}`);
        } catch (e) {
            failed.push({ email, error: e.message });
        }
        await sleep(BATCH_PAUSE_MS);
    }

    console.log(`\ndone: ${sent} sent, ${failed.length} failed`);
    failed.forEach((f) => console.log(`  FAIL ${f.email}: ${f.error}`));
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
