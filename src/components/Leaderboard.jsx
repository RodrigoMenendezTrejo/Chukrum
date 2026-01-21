import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, User } from "lucide-react";
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

                    // Weighted score: Win rate * log10(games + 1)
                    // This rewards more games played - 80% with 50 games > 100% with 2 games
                    const weightedScore = winRate * Math.log10(gamesPlayed + 1);

                    return {
                        id: docSnap.id,
                        name: d.username || d.email?.split("@")[0] || "Player",
                        avatar: d.avatar || "🎮",
                        winRate: `${winRate}%`,
                        winRateNum: winRate,
                        games: gamesPlayed,
                        wins,
                        losses,
                        weightedScore,
                    };
                });

                // Filter: Minimum 5 games to appear on leaderboard
                const qualified = data.filter(p => p.games >= 5);

                // Sort by weighted score descending
                qualified.sort((a, b) => b.weightedScore - a.weightedScore);

                // Assign ranks and colors
                const ranked = qualified.map((player, index) => ({
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
        <div className="w-full max-w-3xl mx-auto mt-4 space-y-8">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                {/* Header Title Bar */}
                <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10">
                    <h2 className="text-xl font-bold tracking-tight text-white/90 flex items-center gap-2 uppercase">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        Leaderboard
                    </h2>
                    <span className="text-xs text-white/40">Min. 5 games to rank</span>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-black/20 text-xs font-bold uppercase tracking-widest text-white/40 border-b border-white/5">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-6">Player</div>
                    <div className="col-span-3 text-center">Win Rate</div>
                    <div className="col-span-2 text-center">Games</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-white/5">
                    {loading ? (
                        <div className="p-8 text-center text-white/50 italic">Loading leaderboard...</div>
                    ) : players.length === 0 ? (
                        <div className="p-8 text-center text-white/50 italic">No players with 5+ games yet. Keep playing!</div>
                    ) : (
                        players.map((player, index) => (
                            <motion.div
                                key={player.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.03)" }}
                                className="grid grid-cols-12 gap-4 px-6 py-4 items-center group transition-colors"
                            >
                                {/* Rank */}
                                <div className="col-span-1 flex items-center justify-center">
                                    {player.rank === 1 ? (
                                        <span className="text-2xl">🥇</span>
                                    ) : player.rank === 2 ? (
                                        <span className="text-2xl">🥈</span>
                                    ) : player.rank === 3 ? (
                                        <span className="text-2xl">🥉</span>
                                    ) : (
                                        <span className={`font-mono font-bold ${player.color} text-lg`}>{player.rank}</span>
                                    )}
                                </div>

                                {/* Player Info */}
                                <div className="col-span-6 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-xl shadow-inner border border-white/5">
                                        {player.avatar}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white/80 group-hover:text-green-400 transition-colors text-sm">
                                            {player.name}
                                        </div>
                                        <div className="text-[10px] text-white/30 font-semibold">
                                            {player.wins}W / {player.losses}L
                                        </div>
                                    </div>
                                </div>

                                {/* Win Rate */}
                                <div className="col-span-3 flex items-center justify-center">
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${player.winRateNum >= 70 ? "bg-green-500/20 text-green-400" :
                                            player.winRateNum >= 50 ? "bg-yellow-500/20 text-yellow-400" :
                                                "bg-red-500/20 text-red-400"
                                        }`}>
                                        {player.winRate}
                                    </span>
                                </div>

                                {/* Games */}
                                <div className="col-span-2 text-center font-mono font-bold text-white/60">
                                    {player.games}
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
