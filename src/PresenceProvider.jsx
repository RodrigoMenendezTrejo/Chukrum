import React, { useEffect } from "react";
import { auth, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { Toaster } from "react-hot-toast";

/**
 * PresenceProvider - Wraps the app to provide:
 * 1. Global Toaster for notifications
 * 2. Heartbeat that updates `lastActive` every 30s for Online status
 */
export default function PresenceProvider({ children }) {
    useEffect(() => {
        let interval = null;

        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                const userRef = doc(db, "users", user.uid);

                // Update immediately on auth
                setDoc(userRef, { lastActive: Date.now() }, { merge: true })
                    .catch(e => console.warn("Heartbeat init failed:", e));

                // Update every 30 seconds
                interval = setInterval(() => {
                    setDoc(userRef, { lastActive: Date.now() }, { merge: true })
                        .catch(e => console.warn("Heartbeat failed:", e));
                }, 30000);
            } else {
                // User logged out, clear interval
                if (interval) clearInterval(interval);
            }
        });

        return () => {
            unsubscribe();
            if (interval) clearInterval(interval);
        };
    }, []);

    return (
        <>
            <Toaster position="top-center" />
            {children}
        </>
    );
}
