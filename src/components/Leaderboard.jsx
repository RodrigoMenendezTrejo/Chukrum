import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, User, Edit2, Trash2, GripVertical, PlusCircle } from "lucide-react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Leaderboard({ isAdmin = false }) {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const usersRef = collection(db, "users");
                const snapshot = await getDocs(usersRef);
                const data = snapshot.docs.map(docSnap => {
                    const d = docSnap.data();
                    const gamesPlayed = d.gamesPlayed || 0;
                    const wins = d.wins || 0;
                    const losses = d.losses || 0;
                    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
                    return {
                        id: docSnap.id,
                        name: d.username || d.email?.split("@")[0] || "Player",
                        avatar: d.avatar || "🎮",
                        winRate: `${winRate}%`,
                        winRateNum: winRate,
                        games: gamesPlayed,
                        wins,
                        losses,
                    };
                });
                // Sort by win rate descending, then by total wins
                data.sort((a, b) => b.winRateNum - a.winRateNum || b.wins - a.wins);
                // Assign ranks and colors
                const ranked = data.map((player, index) => ({
                    ...player,
                    rank: index + 1,
                    color: index === 0 ? "text-yellow-400" : index === 1 ? "text-gray-300" : index === 2 ? "text-orange-600" : "text-blue-400",
                }));
                setPlayers(ranked);
            } catch (error) {
                console.error("Error fetching leaderboard:", error);
            }
            setLoading(false);
        };
        fetchLeaderboard();
    }, []);
    return (
        <div className="w-full max-w-4xl mx-auto mt-4 space-y-8">
            <div className="bg-black/40 backdrop-blur-xl rounded-t-2xl border-x border-t border-white/10 overflow-hidden shadow-2xl">
                {/* Header Title Bar */}
                <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10">
                    <h2 className="text-xl font-bold tracking-tight text-white/90 flex items-center gap-2 uppercase">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        Player Achievements
                    </h2>
                    {isAdmin && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-lg"
                        >
                            New <PlusCircle className="w-4 h-4 fill-white text-rose-600" />
                        </motion.button>
                    )}
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-black/20 text-xs font-bold uppercase tracking-widest text-white/40 border-b border-white/5">
                    <div className="col-span-1 text-center">Rank</div>
                    <div className="col-span-4">Player</div>
                    <div className="col-span-2 text-center">Win Rate</div>
                    <div className="col-span-2 text-center">Games</div>
                    <div className="col-span-1 text-center">Luck</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-white/5">
                    {loading ? (
                        <div className="p-8 text-center text-white/50 italic">Loading leaderboard...</div>
                    ) : players.length === 0 ? (
                        <div className="p-8 text-center text-white/50 italic">No players found. Play a game to appear here!</div>
                    ) : (
                        players.map((player, index) => (
                            <motion.div
                                key={player.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.03)" }}
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center group transition-colors"
                            >
                                {/* Drag handle style rank */}
                                <div className="col-span-1 flex items-center justify-center gap-2">
                                    <GripVertical className="w-4 h-4 text-white/10 group-hover:text-white/30 cursor-grab" />
                                    <span className={`font-mono font-bold ${player.color} text-lg`}>{player.rank}</span>
                                </div>

                                {/* Player Info */}
                                <div className="col-span-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-xl shadow-inner border border-white/5">
                                        {player.avatar}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white/80 group-hover:text-rose-400 transition-colors uppercase text-sm tracking-wide">
                                            {player.name}
                                        </div>
                                        <div className="text-[10px] text-white/30 uppercase font-semibold">
                                            {player.wins}W / {player.losses}L
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="col-span-2 flex items-center justify-center">
                                    <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs font-mono text-white/60 flex items-center gap-1.5">
                                        <Trophy className="w-3 h-3 text-yellow-400" /> {player.winRate}
                                    </span>
                                </div>

                                <div className="col-span-2 text-center font-mono font-bold text-white/60">
                                    {player.games}
                                </div>

                                <div className="col-span-1 flex justify-center">
                                    <span className="text-xs text-white/30">—</span>
                                </div>

                                {/* Actions */}
                                <div className="col-span-2 flex items-center justify-end gap-2 outline-none">
                                    {isAdmin ? (
                                        <>
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                className="p-2 bg-rose-600/20 text-rose-400 rounded-lg hover:bg-rose-600 hover:text-white transition-all border border-rose-600/30"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                className="p-2 bg-rose-900/40 text-rose-500 rounded-lg hover:bg-rose-600 hover:text-white transition-all border border-rose-900/60"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </motion.button>
                                        </>
                                    ) : (
                                        <div className="text-[10px] text-white/10 italic">View Only</div>
                                    )}
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            {/* Empty State Mockup for next section */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl opacity-60">
                <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10">
                    <h2 className="text-xl font-bold tracking-tight text-white/90 uppercase">Level Categories</h2>
                    {isAdmin && (
                        <div className="flex items-center gap-2 bg-rose-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-lg cursor-pointer">
                            New <PlusCircle className="w-4 h-4 fill-white text-rose-600" />
                        </div>
                    )}
                </div>
                <div className="p-12 text-center text-white/40 italic font-medium">
                    No level categories found
                </div>
            </div>
        </div>
    );
}
