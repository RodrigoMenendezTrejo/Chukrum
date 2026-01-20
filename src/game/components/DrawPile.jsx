import React from "react";
import { motion } from "framer-motion";
import { Shuffle } from "lucide-react";

/**
 * Draw pile component with stacked card effect
 */
export default function DrawPile({
    deckLength,
    onDraw,
    canDraw = false,
}) {
    const stackCount = Math.min(8, Math.ceil(deckLength / 8));

    return (
        <div className="flex flex-col items-center justify-end translate-y-[1px]">
            <p className="text-xs sm:text-sm text-gray-300 mb-1 translate-y-[7px]">Draw Pile</p>
            <div
                className="relative w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 mb-2 cursor-pointer select-none translate-y-[6px]"
                onClick={canDraw ? onDraw : undefined}
            >
                {/* Stacked cards background */}
                {[...Array(stackCount)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-lg bg-blue-700 border border-blue-500 shadow-md"
                        style={{
                            top: `${i * 2}px`,
                            left: `${i * 2}px`,
                            right: `${-i * 2}px`,
                            bottom: `${-i * 2}px`,
                            zIndex: i,
                            filter: `brightness(${1 - i * 0.04})`,
                        }}
                    />
                ))}
                {/* Top card */}
                <motion.div
                    className="absolute flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 border border-blue-400 shadow-2xl"
                    style={{ top: "12px", left: "13px", right: "-13px", bottom: "-12px", zIndex: 99 }}
                >
                    <Shuffle className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white/90" />
                </motion.div>
            </div>
            <p className="text-sm text-gray-400 mt-1 translate-y-[7px]">({deckLength})</p>
        </div>
    );
}
