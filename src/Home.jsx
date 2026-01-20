import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { motion } from "framer-motion";
import { Trophy, Users, Gamepad2, LogOut, User } from "lucide-react";
import { createPortal } from "react-dom";
export default function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState(null);
    const [showTip, setShowTip] = useState(false);
    const tooltip = showTip ? (
        <div
            style={{
                position: "fixed",
                top: "120px",      // absolute pixel value so it's always on screen
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 999999,
                backgroundColor: "#047857",
                color: "white",
                padding: "12px 18px",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: "500",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
        >
            👋 Click your avatar to edit your profile!
        </div>
    ) : null;


    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (u) => {
            if (!u) {
                navigate("/login");
            } else {
                setUser(u);
                const ref = doc(db, "users", u.uid);
                const snap = await getDoc(ref);
                setStats(snap.exists() ? snap.data() : {});
                const seen = localStorage.getItem(`chukrum_seen_tip_${u.uid}`);
                if (!seen) {
                    setShowTip(true);
                }

            }
        });
        return unsubscribe;
    }, [navigate]);

    // Auto-hide tooltip after 5 seconds
    useEffect(() => {
        if (showTip && user) {
            const timer = setTimeout(() => {
                setShowTip(false);
                localStorage.setItem(`chukrum_seen_tip_${user.uid}`, "true");
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [showTip, user]);


    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
    };

    if (!user) return null;
    return (

        <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 text-white p-6">

            {/* === Falling cards background === */}
            {/* Falling cards background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                {[...Array(25)].map((_, i) => {
                    // Create a single random card face per card
                    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
                    const suits = ["♠", "♥", "♦", "♣"];
                    const rank = ranks[Math.floor(Math.random() * ranks.length)];
                    const suit = suits[Math.floor(Math.random() * suits.length)];
                    const color = suit === "♥" || suit === "♦" ? "text-red-500" : "text-black";

                    // Random position + scale
                    const startX = Math.random() * window.innerWidth; // full width spread
                    const scale = 0.8 + Math.random() * 0.4;

                    return (
                        <motion.div
                            key={i}
                            initial={{
                                x: startX,
                                y: -200,
                                rotate: Math.random() * 360,
                                scale,
                                opacity: 0.6 + Math.random() * 0.4,
                            }}
                            animate={{
                                y: window.innerHeight + 200,
                                x: startX + (Math.random() * 100 - 50), // drift left or right a bit
                                rotate: Math.random() * 720,
                            }}
                            transition={{
                                duration: 10 + Math.random() * 10,
                                repeatType: "loop",
                                delay: Math.random() * 6,
                                ease: "linear",
                            }}
                            className="absolute w-[100px] h-[140px] bg-white rounded-xl shadow-lg border border-gray-300 overflow-hidden"
                        >
                            {/* Card background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-200" />

                            {/* Card content */}
                            <div className="absolute inset-0 flex flex-col items-center justify-between p-2 text-gray-800 font-bold text-lg">
                                <span className={`self-start ${color}`}>{rank}</span>
                                <span className={`text-5xl ${color}`}>{suit}</span>
                                <span className={`self-end rotate-180 ${color}`}>{rank}</span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>


            {/* === Tooltip === */}
            {tooltip}

            {/* === Animated Game Title === */}
            <div className="relative z-10 mb-10 flex items-center justify-center">
                {/* Floating particle layer */}
                <div className="absolute inset-0 overflow-visible pointer-events-none">
                    {[...Array(35)].map((_, i) => (
                        <motion.span
                            key={i}
                            initial={{
                                opacity: 0,
                                scale: 0,
                                x: Math.random() * 400 - 200,
                                y: Math.random() * 80 - 40,
                            }}
                            animate={{
                                opacity: [0, 1, 0],
                                scale: [0.5, 1, 0],
                                y: [Math.random() * 80, -120],
                            }}
                            transition={{
                                duration: 3 + Math.random() * 3,
                                delay: Math.random() * 2,
                                repeat: Infinity,
                                repeatType: "loop",
                                ease: "easeOut",
                            }}
                            className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-lime-300 shadow-[0_0_8px_rgba(190,255,150,0.8)]"
                        />
                    ))}
                </div>

                {/* Static title */}
                <h1 className="relative text-7xl md:text-8xl font-extrabold tracking-wider 
                     bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 
                     bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(100,255,150,0.5)]">
                    CHUKRUM
                </h1>
            </div>




            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-10 w-full max-w-3xl border border-white/10"
            >
                {/* Header */}
                <div className="text-center mb-10 relative group z-50 overflow-visible">

                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 120 }}
                        className="w-28 h-28 bg-green-700 rounded-full mx-auto flex items-center justify-center shadow-lg mb-4 text-5xl relative overflow-hidden cursor-pointer group"
                        onClick={() => navigate("/profile")}
                    >
                        <span>{stats?.avatar || "🐉"}</span>

                        {/* Hover overlay */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.25 }}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-8 h-8 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15.232 5.232a2.5 2.5 0 113.536 3.536L7.5 20H3v-4.5l12.232-10.268z"
                                />
                            </svg>
                        </motion.div>

                    </motion.div>

                    <h1 className="text-4xl font-bold text-green-100 mb-2">
                        Welcome, {stats?.username || "Adventurer"}!
                    </h1>
                    {stats?.about && (
                        <p className="text-gray-300 text-sm italic max-w-md mx-auto">
                            {stats.about}
                        </p>
                    )}


                </div>



                {/* Stats */}
                <div className="grid grid-cols-3 gap-6 mb-10">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="bg-green-100/20 p-6 rounded-2xl text-center shadow-lg border border-green-400/30"
                    >
                        <Trophy className="w-8 h-8 mx-auto text-yellow-400 mb-2" />
                        <p className="text-3xl font-bold">{stats?.wins || 0}</p>
                        <p className="text-sm text-gray-300">Wins</p>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="bg-red-100/20 p-6 rounded-2xl text-center shadow-lg border border-red-400/30"
                    >
                        <Users className="w-8 h-8 mx-auto text-red-400 mb-2" />
                        <p className="text-3xl font-bold">{stats?.losses || 0}</p>
                        <p className="text-sm text-gray-300">Losses</p>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="bg-blue-100/20 p-6 rounded-2xl text-center shadow-lg border border-blue-400/30"
                    >
                        <Gamepad2 className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                        <p className="text-3xl font-bold">{stats?.gamesPlayed || 0}</p>
                        <p className="text-sm text-gray-300">Games</p>
                    </motion.div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate("/game-setup")}
                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-xl font-semibold shadow-md w-full sm:w-auto"
                    >
                        <Gamepad2 className="w-5 h-5" /> Play Game
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate("/leaderboard")}
                        className="flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-4 rounded-xl font-semibold shadow-md w-full sm:w-auto"
                    >
                        <Trophy className="w-5 h-5" /> Leaderboard
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-xl font-semibold shadow-md w-full sm:w-auto"
                    >
                        <LogOut className="w-5 h-5" /> Log Out
                    </motion.button>


                </div>
            </motion.div>
        </div>
    );
}
