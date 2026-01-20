import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Swap animation overlay showing cards sliding between positions
 */
export default function SwapAnimation({ swapAnimation }) {
    if (!swapAnimation) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 pointer-events-none z-40 flex flex-col items-center justify-center"
            >
                {/* DRAW animation - card moving from deck to a player's position */}
                {swapAnimation.type === "draw" && (
                    <>
                        <motion.div
                            initial={{ y: 0, scale: 0.8, opacity: 0 }}
                            animate={{
                                y: swapAnimation.toPlayer === 2 ? -180 : 180,
                                scale: 1,
                                opacity: 1,
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.2, ease: "easeInOut" }}
                            className="w-24 h-32 bg-gradient-to-br from-blue-600 to-blue-800 border-3 border-blue-400 rounded-xl shadow-2xl flex flex-col items-center justify-center text-4xl text-white"
                        >
                            ★
                            <span className="text-xs mt-2 text-blue-200 bg-black/30 px-2 py-1 rounded">
                                → #{swapAnimation.toIndex + 1}
                            </span>
                        </motion.div>

                        {/* Draw indicator */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.4 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 px-6 py-3 rounded-xl text-white font-bold flex flex-col items-center gap-1"
                        >
                            <span className="text-xl">📥</span>
                            <span className="text-lg">
                                {swapAnimation.toPlayer === 2 ? "Bot" : "You"} → Position #
                                {swapAnimation.toIndex + 1}
                            </span>
                        </motion.div>
                    </>
                )}

                {/* SWAP animation - cards moving between players */}
                {swapAnimation.type !== "draw" && (
                    <>
                        {/* Card sliding from one player to another */}
                        <motion.div
                            initial={{ y: swapAnimation.fromPlayer === 2 ? -200 : 200, x: 0 }}
                            animate={{ y: swapAnimation.fromPlayer === 2 ? 150 : -150, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.2, ease: "easeInOut" }}
                            className="w-24 h-32 bg-gradient-to-br from-green-600 to-green-800 border-3 border-green-400 rounded-xl shadow-2xl flex flex-col items-center justify-center text-4xl text-white"
                        >
                            ★
                            <span className="text-xs mt-2 text-green-200 bg-black/30 px-2 py-1 rounded">
                                #{swapAnimation.fromIndex + 1}
                            </span>
                        </motion.div>

                        {/* Second card going opposite direction */}
                        {swapAnimation.toPlayer !== 0 && (
                            <motion.div
                                initial={{ y: swapAnimation.fromPlayer === 2 ? 200 : -200, x: 0 }}
                                animate={{ y: swapAnimation.fromPlayer === 2 ? -150 : 150, x: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.2, ease: "easeInOut" }}
                                className="absolute w-24 h-32 bg-gradient-to-br from-purple-600 to-purple-800 border-3 border-purple-400 rounded-xl shadow-2xl flex flex-col items-center justify-center text-4xl text-white"
                            >
                                ★
                                <span className="text-xs mt-2 text-purple-200 bg-black/30 px-2 py-1 rounded">
                                    #{swapAnimation.toIndex + 1}
                                </span>
                            </motion.div>
                        )}

                        {/* Swap indicator */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.4 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 px-6 py-3 rounded-xl text-white font-bold flex flex-col items-center gap-1"
                        >
                            <span className="text-2xl">⇅</span>
                            <span className="text-lg">
                                Swap #{swapAnimation.fromIndex + 1} ↔ #{swapAnimation.toIndex + 1}
                            </span>
                        </motion.div>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
