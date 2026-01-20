import React from "react";
import { motion } from "framer-motion";
import { getCardDisplay, isRedSuit } from "../utils/cardUtils";

/**
 * Reusable playing card component
 */
export default function PlayingCard({
    card,
    index,
    isVisible = false,
    isPeeked = false,
    onClick,
    animStyle = {},
    canClick = false,
    size = "normal", // "normal", "small", "modal"
    player = 1, // 1 for player, 2 for bot
    showIndex = true,
}) {
    const display = getCardDisplay(card, isVisible || isPeeked);

    const sizeClasses = {
        normal: "w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 text-lg sm:text-2xl md:text-4xl",
        small: "w-16 h-24 text-xl",
        modal: "w-16 h-24 text-xl",
    };

    const baseClasses = `rounded-xl shadow-lg border-2 flex flex-col items-center justify-center transition-all`;

    const visibilityClasses = isVisible || isPeeked
        ? `bg-white ${display.color}`
        : "bg-blue-900 text-white border-blue-400";

    const interactionClasses = canClick
        ? "cursor-pointer hover:ring-2 hover:ring-green-400"
        : "";

    const peekedClasses = isPeeked ? "ring-4 ring-yellow-400" : "";

    return (
        <motion.div
            style={animStyle}
            onClick={onClick}
            whileHover={canClick ? { scale: 1.05 } : {}}
            className={`${sizeClasses[size]} ${baseClasses} ${visibilityClasses} ${interactionClasses} ${peekedClasses}`}
        >
            {isVisible || isPeeked ? (
                <>
                    <span className={display.color}>{card.rank}</span>
                    <span className={display.color}>{card.suit}</span>
                </>
            ) : (
                <>
                    <span>★</span>
                    {showIndex && (
                        <span className="text-xs text-blue-300 mt-1">#{index + 1}</span>
                    )}
                </>
            )}
        </motion.div>
    );
}
