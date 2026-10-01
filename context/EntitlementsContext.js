import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
    doc,
    getDoc,
    increment,
    onSnapshot,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import * as StoreReview from "expo-store-review";
import { db } from "../utils/firebase";
import {
    Purchases,
    configurePurchases,
    isProInfo,
    purchasesAvailable,
} from "../utils/purchases";
import { report } from "../utils/report";
import { useAuth } from "./AuthContext";

// Free users get this many AI generations before the paywall.
export const FREE_AI_TRIES = 3;

const EntitlementsContext = createContext(null);

export const EntitlementsProvider = ({ children }) => {
    const { user } = useAuth();
    // Pro comes from RevenueCat when configured; otherwise from the Firestore
    // stub flag. `aiTriesUsed` always lives in Firestore.
    const [firestorePro, setFirestorePro] = useState(false);
    const [rcPro, setRcPro] = useState(false);
    const [aiTriesUsed, setAiTriesUsed] = useState(0);
    const [loading, setLoading] = useState(true);
    const [packages, setPackages] = useState([]); // offering.availablePackages
    // Ensures the after-login paywall only auto-shows once per session.
    const promptedRef = useRef(false);

    const pro = purchasesAvailable ? rcPro : firestorePro;

    // --- Firestore: free-tries counter (+ stub pro when RevenueCat is off) ---
    useEffect(() => {
        if (!user) {
            setFirestorePro(false);
            setAiTriesUsed(0);
            setLoading(false);
            promptedRef.current = false;
            return undefined;
        }
        setLoading(true);
        const ref = doc(db, "users", user.uid);

        getDoc(ref)
            .then((snap) => {
                if (!snap.exists()) {
                    setDoc(ref, {
                        pro: false,
                        aiTriesUsed: 0,
                        createdAt: serverTimestamp(),
                    }).catch(() => {});
                }
            })
            .catch(() => {});

        const unsub = onSnapshot(
            ref,
            (snap) => {
                const d = snap.data() || {};
                setFirestorePro(!!d.pro);
                setAiTriesUsed(d.aiTriesUsed || 0);
                setLoading(false);
            },
            () => setLoading(false)
        );

        // Firestore can throw INTERNAL ASSERTION FAILED if the listener is torn
        // down in the same tick as a sign-out credential change. That throw is
        // synchronous inside React's effect cleanup, so unguarded it kills the app.
        return () => {
            try {
                unsub();
            } catch (e) {
                report(e, { feature: "firestore", op: "unsubscribe:entitlements" });
            }
        };
    }, [user]);

    // --- RevenueCat: configure + listen for entitlement changes + offerings ---
    useEffect(() => {
        if (!purchasesAvailable) return undefined;
        configurePurchases();

        const listener = (info) => setRcPro(isProInfo(info));
        Purchases.addCustomerInfoUpdateListener(listener);

        Purchases.getCustomerInfo()
            .then((info) => setRcPro(isProInfo(info)))
            .catch((e) => report(e, { feature: "revenuecat", op: "getCustomerInfo" }));

        Purchases.getOfferings()
            .then((offerings) => {
                const pkgs = offerings.current?.availablePackages ?? [];
                console.log(
                    "RevenueCat current offering:",
                    offerings.current?.identifier,
                    "packages:",
                    pkgs.map(
                        (p) => `${p.packageType}/${p.identifier}/${p.product?.identifier}`
                    ),
                    "allOfferings:",
                    Object.keys(offerings.all || {})
                );
                setPackages(pkgs);
            })
            .catch((e) => report(e, { feature: "revenuecat", op: "getOfferings" }));

        return () => Purchases.removeCustomerInfoUpdateListener(listener);
    }, []);

    // Tie the RevenueCat identity to the Firebase user so entitlements follow
    // the account across devices.
    useEffect(() => {
        if (!purchasesAvailable) return;
        if (user) {
            Purchases.logIn(user.uid)
                .then(({ customerInfo }) => setRcPro(isProInfo(customerInfo)))
                .catch((e) => report(e, { feature: "revenuecat", op: "logIn" }));
        } else {
            // Only log out a previously-identified user — RevenueCat errors if
            // logOut is called while already anonymous (e.g. on first launch).
            Purchases.isAnonymous()
                .then((anon) => (anon ? null : Purchases.logOut()))
                .catch(() => {});
            setRcPro(false);
        }
    }, [user]);

    const aiTriesLeft = pro ? Infinity : Math.max(0, FREE_AI_TRIES - aiTriesUsed);
    const canUseAi = pro || aiTriesLeft > 0;

    const recordAiUse = async () => {
        if (pro || !user) return;
        try {
            await setDoc(
                doc(db, "users", user.uid),
                { aiTriesUsed: increment(1) },
                { merge: true }
            );
        } catch {
            // best-effort
        }
    };

    const onAiSuccess = async () => {
        await recordAiUse();
        try {
            if (await StoreReview.hasAction()) {
                await StoreReview.requestReview();
            }
        } catch {
            // ignore — rating is best-effort
        }
    };

    // Purchase a RevenueCat package (weekly / monthly). Returns true if the user
    // is Pro afterward. Throws (with e.userCancelled) if the user backs out.
    const purchase = async (pkg) => {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const active = isProInfo(customerInfo);
        setRcPro(active);
        return active;
    };

    const restore = async () => {
        const info = await Purchases.restorePurchases();
        const active = isProInfo(info);
        setRcPro(active);
        return active;
    };

    // Dev-only fallback used when RevenueCat isn't configured (no SDK key).
    const activatePro = async () => {
        if (!user) return;
        await setDoc(doc(db, "users", user.uid), { pro: true }, { merge: true });
    };

    const markPrompted = () => {
        promptedRef.current = true;
    };

    return (
        <EntitlementsContext.Provider
            value={{
                pro,
                aiTriesUsed,
                aiTriesLeft,
                canUseAi,
                loading,
                packages,
                purchasesAvailable,
                purchase,
                restore,
                recordAiUse,
                onAiSuccess,
                activatePro,
                promptedRef,
                markPrompted,
            }}
        >
            {children}
        </EntitlementsContext.Provider>
    );
};

export const useEntitlements = () => useContext(EntitlementsContext);
