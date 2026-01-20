import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RefreshCw, ArrowLeft } from "lucide-react";
import { calculateScore } from "../utils/cardUtils";

/**
 * Game end screen with results popup
 */
export default function GameEndScreen({
    show,
    winner,
    player1Hand,
    player2Hand,
    onPlayAgain,
    onGoHome,
    onClose,
}) {
    const p1Score = calculateScore(player1Hand);
    const p2Score = calculateScore(player2Hand);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
                >
                    {/* X Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold transition-colors"
                        title="Close to view cards"
                    >
                        ✕
                    </button>

                    <motion.div
                        initial={{ scale: 0.5, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-center"
                    >
                        <Trophy
                            className={`w-24 h-24 mx-auto mb-4 ${winner === 1 ? "text-yellow-400" : winner === 2 ? "text-gray-400" : "text-blue-400"
                                }`}
                        />
                        <h2 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                            {winner === 1 ? "YOU WIN!" : winner === 2 ? "BOT WINS!" : "IT'S A TIE!"}
                        </h2>

                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
                            <div className="flex gap-12 justify-center">
                                <div className="text-center">
                                    <p className="text-gray-300 mb-2">Your Score</p>
                                    <p className="text-4xl font-bold text-green-400">{p1Score}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-gray-300 mb-2">Bot Score</p>
                                    <p className="text-4xl font-bold text-red-400">{p2Score}</p>
                                </div>
                            </div>
                        </div>

                        <p className="text-gray-400 text-sm mb-4">Click ✕ to view the bot's cards</p>

                        <div className="flex gap-4 justify-center">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={onPlayAgain}
                                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2"
                            >
                                <RefreshCw className="w-6 h-6" /> Play Again
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={onGoHome}
                                className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2"
                            >
                                <ArrowLeft className="w-6 h-6" /> Home
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * Floating buttons shown when popup is closed
 */
export function GameEndFloatingButtons({ show, onShowResults, onPlayAgain }) {
    if (!show) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onShowResults}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
            >
                <Trophy className="w-5 h-5" /> Show Results
            </motion.button>
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onPlayAgain}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
            >
                <RefreshCw className="w-5 h-5" /> Play Again
            </motion.button>
        </div>
    );
}
