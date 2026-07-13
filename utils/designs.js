import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

// Each user's saved plans live under users/{uid}/designs.
const designsCol = (uid) => collection(db, "users", uid, "designs");

// Firestore rejects `undefined` values; a JSON round-trip drops undefined keys
// while preserving the nested walls/openings structure.
const clean = (walls) => JSON.parse(JSON.stringify(walls ?? []));

export const saveDesign = async (uid, { walls, name }) => {
    const ref = await addDoc(designsCol(uid), {
        walls: clean(walls),
        name: name || "Untitled plan",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
};

export const updateDesign = (uid, id, { walls, name }) =>
    setDoc(
        doc(db, "users", uid, "designs", id),
        {
            walls: clean(walls),
            ...(name ? { name } : {}),
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );

export const renameDesign = (uid, id, name) =>
    updateDoc(doc(db, "users", uid, "designs", id), {
        name,
        updatedAt: serverTimestamp(),
    });

export const deleteDesign = (uid, id) =>
    deleteDoc(doc(db, "users", uid, "designs", id));

// Live list of the user's designs, newest first. Returns the unsubscribe fn.
export const subscribeDesigns = (uid, onData, onError) => {
    const q = query(designsCol(uid), orderBy("updatedAt", "desc"));
    return onSnapshot(
        q,
        (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        onError
    );
};
