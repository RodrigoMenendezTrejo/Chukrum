/**
 * Card utility functions for Chukrum game
 */

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * Get the point value of a card rank
 * @param {string} rank - Card rank (A, 2-10, J, Q, K)
 * @returns {number} Point value
 */
export const getCardValue = (rank) => {
  if (rank === "7") return -1;
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return parseInt(rank);
};

/**
 * Calculate total score for a hand
 * @param {Array} hand - Array of card objects
 * @returns {number} Total score
 */
export const calculateScore = (hand) => {
  return hand.reduce((sum, card) => sum + getCardValue(card.rank), 0);
};

/**
 * Create and shuffle a new deck
 * @returns {Array} Shuffled deck of 52 cards
 */
export const createDeck = () => {
  const deck = [];
  let counter = 0;
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      // Use counter + random suffix for truly unique ID
      const uniqueId = `${rank}${suit}_${counter++}_${Math.random().toString(36).substr(2, 5)}`;
      deck.push({ rank, suit, id: uniqueId });
    });
  });
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

/**
 * Check if a card is a special card (J, Q, K)
 * @param {string} rank - Card rank
 * @returns {boolean} True if special card
 */
export const isSpecialCard = (rank) => ["J", "Q", "K"].includes(rank);

/**
 * Get card display info (content and color)
 * @param {object} card - Card object
 * @param {boolean} isVisible - Whether card face is visible
 * @returns {object} Display info with content and color
 */
export const getCardDisplay = (card, isVisible) => {
  if (!isVisible) return { content: "★", color: "text-white" };
  const color = ["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900";
  return { content: `${card.rank}${card.suit}`, color };
};

/**
 * Check if a suit is red (hearts or diamonds)
 * @param {string} suit - Card suit
 * @returns {boolean} True if red suit
 */
export const isRedSuit = (suit) => ["♥", "♦"].includes(suit);
