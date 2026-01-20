import React from "react";
import { isRedSuit } from "../utils/cardUtils";

/**
 * Discard pile component showing the top card
 */
export default function DiscardPile({ discardPile }) {
    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const isRed = topCard ? isRedSuit(topCard.suit) : false;

    return (
        <div className="flex flex-col items-center">
            <p className="text-xs sm:text-sm text-gray-300 mb-1">Discard Pile</p>
            <div className="w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 bg-white rounded-lg shadow-xl flex flex-col items-center justify-center text-2xl sm:text-3xl md:text-5xl font-bold">
                {topCard ? (
                    <>
                        <div className={isRed ? "text-red-600" : "text-gray-900"}>
                            {topCard.rank}
                        </div>
                        <div className={isRed ? "text-red-600" : "text-gray-900"}>
                            {topCard.suit}
                        </div>
                    </>
                ) : (
                    <span className="text-gray-400 text-sm">Empty</span>
                )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Click your card to match!</p>
        </div>
    );
}
