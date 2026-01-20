import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Leaderboard from "./components/Leaderboard";

export default function LeaderboardPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (!u) {
                navigate("/login");
            } else {
                setUser(u);
            }
        });
        return unsubscribe;
    }, [navigate]);

    if (!user) return null;

    const isAdmin = user.email === "admin@admin.com";

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 text-white p-6 pb-20">
            {/* Header / Back Button */}
            <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
                <motion.button
                    whileHover={{ x: -5 }}
                    onClick={() => navigate("/home")}
                    className="flex items-center gap-2 text-green-300 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-semibold">Back to Home</span>
                </motion.button>

                <h1 className="text-3xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-lime-300 to-emerald-400">
                    LEADERBOARD
                </h1>

                <div className="w-24"></div> {/* Spacer for alignment */}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <Leaderboard isAdmin={isAdmin} />
            </motion.div>
        </div>
    );
}
