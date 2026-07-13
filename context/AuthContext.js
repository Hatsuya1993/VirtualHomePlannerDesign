import { createContext, useContext, useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "../utils/firebase";
import { blockEmail, isEmailBlocked } from "../utils/accountBlocklist";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        // Fires once with the persisted user (or null) on launch, then on every
        // sign-in / sign-out — this is what drives the navigator's auth gate.
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setInitializing(false);
        });
        return unsub;
    }, []);

    const register = async (email, password) => {
        if (await isEmailBlocked(email)) {
            const err = new Error(
                "This email can no longer be used to create an account."
            );
            err.code = "app/email-blocked";
            throw err;
        }
        return createUserWithEmailAndPassword(auth, email.trim(), password);
    };
    const login = (email, password) =>
        signInWithEmailAndPassword(auth, email.trim(), password);
    const logout = () => signOut(auth);
    const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

    // Permanently delete the account, reserving its email against reuse. Firebase
    // requires a recent login to delete — for password users we can re-auth with
    // the supplied password; otherwise the caller is told to re-login.
    const deleteAccount = async ({ password } = {}) => {
        const u = auth.currentUser;
        if (!u) throw new Error("You're not signed in.");
        const email = u.email;
        const providerId = u.providerData?.[0]?.providerId;

        if (providerId === "password" && password) {
            await reauthenticateWithCredential(
                u,
                EmailAuthProvider.credential(email, password)
            );
        }

        // Reserve the email first (best-effort — never block the delete on it).
        try {
            if (email) await blockEmail(email);
        } catch {
            // ignore — deletion still proceeds
        }

        try {
            await deleteUser(u);
        } catch (e) {
            if (e.code === "auth/requires-recent-login") {
                const err = new Error(
                    providerId === "password"
                        ? "Please enter your password to confirm."
                        : "Please log out and log back in, then delete your account."
                );
                err.code =
                    providerId === "password"
                        ? "app/needs-password"
                        : "auth/requires-recent-login";
                throw err;
            }
            throw e;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                initializing,
                register,
                login,
                logout,
                resetPassword,
                deleteAccount,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
