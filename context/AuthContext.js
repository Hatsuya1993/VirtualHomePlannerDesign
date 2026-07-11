import { createContext, useContext, useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { auth } from "../utils/firebase";

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

    const register = (email, password) =>
        createUserWithEmailAndPassword(auth, email.trim(), password);
    const login = (email, password) =>
        signInWithEmailAndPassword(auth, email.trim(), password);
    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ user, initializing, register, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
