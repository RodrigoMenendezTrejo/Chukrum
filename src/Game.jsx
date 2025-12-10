import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Trophy, Trash2, Eye, RefreshCw, Zap, Flame, Leaf } from "lucide-react";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Card value calculation
const getCardValue = (rank) => {
  if (rank === "7") return -1;
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return parseInt(rank);
};

// Calculate total score for a hand
const calculateScore = (hand) => {
  return hand.reduce((sum, card) => sum + getCardValue(card.rank), 0);
};

// Create and shuffle deck
const createDeck = () => {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Check if card is a special card
const isSpecialCard = (rank) => ["J", "Q", "K"].includes(rank);

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get difficulty from navigation state, default to "normal"
  const difficulty = location.state?.difficulty || "normal";

  // Core game state
  const [deck, setDeck] = useState([]);
  const [discardPile, setDiscardPile] = useState([]);
  const [player1Hand, setPlayer1Hand] = useState([]);
  const [player2Hand, setPlayer2Hand] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [message, setMessage] = useState("Welcome to Chukrum! Your turn — draw from the pile.");
  const [drawnCard, setDrawnCard] = useState(null);

  // Game phase management
  const [gamePhase, setGamePhase] = useState("playing");
  const [chukrumCaller, setChukrumCaller] = useState(null);
  const [finalRoundTurnsLeft, setFinalRoundTurnsLeft] = useState(0); // Tracks remaining turns in final round
  const [winner, setWinner] = useState(null);

  // Special power states
  const [specialAction, setSpecialAction] = useState("none");
  const [peekedCard, setPeekedCard] = useState(null);
  const [opponentPeekedCard, setOpponentPeekedCard] = useState(null);
  const [hasPeekedOwn, setHasPeekedOwn] = useState(false);
  const [hasPeekedOpponent, setHasPeekedOpponent] = useState(false);

  // Enhanced Bot memory structure
  const [botMemory, setBotMemory] = useState({
    ownCards: [],           // Cards bot knows in its hand: [{index, card}]
    playerSwapHistory: [],  // Positions player has swapped: [{position, turnNumber}]
    discardHistory: [],     // All discarded cards for tracking
    turnCount: 0,           // Current turn number
  });

  // Animation states
  const [swapAnimation, setSwapAnimation] = useState(null);
  const [showResultsPopup, setShowResultsPopup] = useState(true); // Toggle results overlay
  const lastBotMatchRef = useRef(null); // Track last bot match to prevent infinite loops
  const botTurnInProgress = useRef(false); // Prevent duplicate bot turns
  const p1Refs = useRef([]);
  const p2Refs = useRef([]);
  const drawPileRef = useRef(null);

  // Selection state for Queen/King swaps
  const [selectedOwnIndex, setSelectedOwnIndex] = useState(null);

  // Initialize game
  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    const d = createDeck();
    const hand1 = d.slice(0, 4).map((card) => ({ ...card, visible: false }));
    const hand2 = d.slice(4, 8).map((card) => ({ ...card, visible: false }));
    const remainingDeck = d.slice(8);
    setPlayer1Hand(hand1);
    setPlayer2Hand(hand2);
    setDeck(remainingDeck);
    setDiscardPile([]);
    setCurrentPlayer(1);
    setGamePhase("playing");
    setChukrumCaller(null);
    setFinalRoundTurnsLeft(0);
    setWinner(null);
    setDrawnCard(null);
    setSpecialAction("none");
    setPeekedCard(null);
    setOpponentPeekedCard(null);
    setHasPeekedOwn(false);
    setHasPeekedOpponent(false);
    // Reset enhanced bot memory
    setBotMemory({
      ownCards: [],
      playerSwapHistory: [],
      discardHistory: [],
      turnCount: 0,
    });
    setSwapAnimation(null);
    setSelectedOwnIndex(null);
    setShowResultsPopup(true); // Reset for new game
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    // In Extreme mode, bot goes first
    if (difficulty === "extreme") {
      setCurrentPlayer(2);
      setMessage(`Welcome to Chukrum (${diffLabel} mode)! Bot goes first...`);
      // Bot turn will be triggered by useEffect watching currentPlayer
    } else {
      setCurrentPlayer(1);
      setMessage(`Welcome to Chukrum (${diffLabel} mode)! Your turn — draw from the pile.`);
    }
  };

  const endGame = useCallback(() => {
    setGamePhase("ended");
    const p1Score = calculateScore(player1Hand);
    const p2Score = calculateScore(player2Hand);

    if (p1Score < p2Score) {
      setWinner(1);
      setMessage(`You win! Your score: ${p1Score} vs Bot: ${p2Score}`);
    } else if (p2Score < p1Score) {
      setWinner(2);
      setMessage(`Bot wins! Bot: ${p2Score} vs You: ${p1Score}`);
    } else {
      setWinner(0);
      setMessage(`It's a tie! Both scored ${p1Score}`);
    }
  }, [player1Hand, player2Hand]);

  const nextPlayer = useCallback(() => {
    if (gamePhase === "finalRound") {
      const turnsLeft = finalRoundTurnsLeft - 1;
      setFinalRoundTurnsLeft(turnsLeft);
      if (turnsLeft <= 0) {
        endGame();
        return;
      }
    }
    setCurrentPlayer((p) => (p === 1 ? 2 : 1));
  }, [gamePhase, finalRoundTurnsLeft, endGame]);

  // Handle drawing a card
  const handleDrawCard = () => {
    if (gamePhase === "ended") return;

    // If deck is empty, end the game
    if (deck.length === 0) {
      setMessage("Deck is empty! Game ends - revealing all cards...");
      setTimeout(() => endGame(), 500);
      return;
    }

    if (drawnCard) return; // Already holding a card

    const newDeck = [...deck];
    const drawn = newDeck.pop();
    setDeck(newDeck);
    setDrawnCard(drawn);

    // Reset peek states
    setPeekedCard(null);
    setOpponentPeekedCard(null);
    setHasPeekedOwn(false);
    setHasPeekedOpponent(false);

    if (drawn.rank === "J") {
      setSpecialAction("jackPeek");
      setMessage(`You drew a Jack! Choose ONE of your cards to peek at.`);
    } else if (drawn.rank === "Q") {
      setSpecialAction("queenAction");
      setMessage(`You drew a Queen! First, peek at ONE of your cards.`);
    } else if (drawn.rank === "K") {
      setSpecialAction("kingAction");
      setMessage(`You drew a King! Peek at one of yours AND one of opponent's, then decide.`);
    } else {
      setSpecialAction("none");
      setMessage(`You drew ${drawn.rank}${drawn.suit}. Swap with one of your cards or discard.`);
    }
  };

  // Animate card swap with sliding effect - shows both cards moving
  // type: 'swap' (between players) or 'draw' (from deck to position)
  const animateSwap = (fromPlayer, fromIndex, toPlayer, toIndex, fromCard, toCard, onComplete, type = 'swap') => {
    setSwapAnimation({ fromPlayer, fromIndex, toPlayer, toIndex, fromCard, toCard, type });
    setTimeout(() => {
      setSwapAnimation(null);
      onComplete && onComplete();
    }, 1500); // Increased to 1.5 seconds for better visibility
  };

  // Handle discarding drawn card
  const handleDiscard = () => {
    if (!drawnCard) return;
    setDiscardPile([...discardPile, drawnCard]);
    setDrawnCard(null);
    setSpecialAction("none");
    setPeekedCard(null);
    setOpponentPeekedCard(null);
    setHasPeekedOwn(false);
    setHasPeekedOpponent(false);
    setMessage("You discarded your card. Bot is thinking...");
    nextPlayer();
    // Bot turn is triggered automatically by useEffect when currentPlayer becomes 2
  };

  // Handle swapping drawn card with player's card (normal swap)
  const handleSwap = (index) => {
    if (!drawnCard || specialAction !== "none") return;

    const replaced = player1Hand[index];

    // Show animation from deck to player's position
    animateSwap('deck', 0, 1, index, null, replaced, () => {
      const newHand = [...player1Hand];
      newHand[index] = { ...drawnCard, visible: false };
      setPlayer1Hand(newHand);
      setDiscardPile((prev) => [...prev, replaced]);
      setDrawnCard(null);
      // Track player swap for Extreme bot
      setBotMemory(prev => ({
        ...prev,
        playerSwapHistory: [...prev.playerSwapHistory, { position: index, turnNumber: prev.turnCount }],
        discardHistory: [...prev.discardHistory, replaced],
      }));
      setMessage("You swapped a card. Bot is thinking...");
      nextPlayer();
      // Bot turn is triggered automatically by useEffect when currentPlayer becomes 2
    }, 'draw');
  };

  // JACK POWER: Peek at ONE of your own cards only
  const handleJackPeek = (index) => {
    if (hasPeekedOwn) return; // Already peeked, can't peek again

    setPeekedCard({ player: 1, index });
    setHasPeekedOwn(true);
    setMessage(`You see: ${player1Hand[index].rank}${player1Hand[index].suit}. Jack will be discarded in 2 seconds...`);

    setTimeout(() => {
      setPeekedCard(null);
      setDiscardPile((prev) => [...prev, drawnCard]);
      setDrawnCard(null);
      setSpecialAction("none");
      setHasPeekedOwn(false);
      setMessage("Jack discarded. Bot is thinking...");
      nextPlayer();
      // Bot turn is triggered automatically by useEffect
    }, 2000);
  };

  // QUEEN POWER: Peek at your card first, then optionally swap with opponent
  const handleQueenPeekOwn = (index) => {
    if (hasPeekedOwn) return; // Already peeked own card

    setPeekedCard({ player: 1, index });
    setSelectedOwnIndex(index); // Store which card was selected for later swap
    setHasPeekedOwn(true);
    setMessage(`Your card: ${player1Hand[index].rank}${player1Hand[index].suit}. Now click an OPPONENT's card to swap with it, or Discard.`);
  };

  const handleQueenSwapWithOpponent = (opponentIndex) => {
    if (!hasPeekedOwn || selectedOwnIndex === null) return;

    const myIndex = selectedOwnIndex;
    const myCard = player1Hand[myIndex];
    const oppCard = player2Hand[opponentIndex];

    // Animate the swap - show both cards moving
    animateSwap(1, myIndex, 2, opponentIndex, myCard, oppCard, () => {
      // Perform the swap
      const newP1Hand = [...player1Hand];
      const newP2Hand = [...player2Hand];
      newP1Hand[myIndex] = { ...oppCard, visible: false };
      newP2Hand[opponentIndex] = { ...myCard, visible: false };

      setPlayer1Hand(newP1Hand);
      setPlayer2Hand(newP2Hand);
      setPeekedCard(null);
      setSelectedOwnIndex(null);
      setHasPeekedOwn(false);
      setDiscardPile((prev) => [...prev, drawnCard]);
      setDrawnCard(null);
      setSpecialAction("none");
      setMessage("Cards swapped! Queen discarded. Bot is thinking...");
      nextPlayer();
      // Bot turn is triggered automatically by useEffect
    });
  };

  // KING POWER: Peek at one of yours AND one of opponent's, then optionally swap
  const handleKingPeekOwn = (index) => {
    if (hasPeekedOwn) return; // Already peeked own

    setPeekedCard({ player: 1, index });
    setSelectedOwnIndex(index); // Store for later swap
    setHasPeekedOwn(true);

    if (hasPeekedOpponent && opponentPeekedCard) {
      setMessage(`Your: ${player1Hand[index].rank}${player1Hand[index].suit}, Opponent: ${player2Hand[opponentPeekedCard.index].rank}${player2Hand[opponentPeekedCard.index].suit}. SWAP them or Discard.`);
    } else {
      setMessage(`Your card: ${player1Hand[index].rank}${player1Hand[index].suit}. Now peek at opponent's card.`);
    }
  };

  const handleKingPeekOpponent = (index) => {
    if (hasPeekedOpponent) return; // Already peeked opponent

    setOpponentPeekedCard({ player: 2, index });
    setHasPeekedOpponent(true);

    if (hasPeekedOwn && peekedCard) {
      setMessage(`Your: ${player1Hand[peekedCard.index].rank}${player1Hand[peekedCard.index].suit}, Opponent: ${player2Hand[index].rank}${player2Hand[index].suit}. SWAP them or Discard.`);
    } else {
      setMessage(`Opponent's card: ${player2Hand[index].rank}${player2Hand[index].suit}. Now peek at your own card.`);
    }
  };

  const handleKingSwap = () => {
    if (!hasPeekedOwn || !hasPeekedOpponent || selectedOwnIndex === null || !opponentPeekedCard) return;

    const myIndex = selectedOwnIndex;
    const oppIndex = opponentPeekedCard.index;
    const myCard = player1Hand[myIndex];
    const oppCard = player2Hand[oppIndex];

    // Animate the swap - show both cards moving
    animateSwap(1, myIndex, 2, oppIndex, myCard, oppCard, () => {
      const newP1Hand = [...player1Hand];
      const newP2Hand = [...player2Hand];
      newP1Hand[myIndex] = { ...oppCard, visible: false };
      newP2Hand[oppIndex] = { ...myCard, visible: false };

      setPlayer1Hand(newP1Hand);
      setPlayer2Hand(newP2Hand);
      setSelectedOwnIndex(null);
      completeKingAction("Cards swapped! King discarded. Bot is thinking...");
    });
  };

  const completeKingAction = (msg = "King discarded. Bot is thinking...") => {
    setPeekedCard(null);
    setOpponentPeekedCard(null);
    setSelectedOwnIndex(null);
    setHasPeekedOwn(false);
    setHasPeekedOpponent(false);
    setDiscardPile((prev) => [...prev, drawnCard]);
    setDrawnCard(null);
    setSpecialAction("none");
    setMessage(msg);
    nextPlayer();
    // Bot turn is triggered automatically by useEffect
  };

  // MATCH DISCARD
  const handleMatchDiscard = (index) => {
    if (discardPile.length === 0 || gamePhase === "ended" || drawnCard) return;

    const topDiscard = discardPile[discardPile.length - 1];
    const playerCard = player1Hand[index];

    if (playerCard.rank === topDiscard.rank) {
      const newHand = player1Hand.filter((_, i) => i !== index);
      setPlayer1Hand(newHand);
      setDiscardPile((prev) => [...prev, playerCard]);
      setMessage(`Match! You discarded your ${playerCard.rank}.`);
      // No cooldown needed - player can throw multiple matching cards
    } else {
      if (deck.length > 0) {
        const newDeck = [...deck];
        const penaltyCard = newDeck.pop();
        setDeck(newDeck);
        setPlayer1Hand([...player1Hand, { ...penaltyCard, visible: false }]);
        setMessage(`Wrong! That was a ${playerCard.rank}, not a ${topDiscard.rank}. Drew penalty card.`);
      } else {
        setMessage(`Wrong match! No cards to draw as penalty.`);
      }
    }
  };

  // BOT REACTIVE MATCH DISCARD (Extreme only)
  // Checks if bot can match the top discard card after any card is discarded
  const botReactiveMatchDiscard = useCallback(() => {
    // Only in Extreme mode, during playing phase, when there's a discard pile
    if (difficulty !== "extreme" || gamePhase !== "playing" || discardPile.length === 0) return;

    // Prevent infinite loops - don't match within 2 seconds of last match
    const now = Date.now();
    if (lastBotMatchRef.current && now - lastBotMatchRef.current < 2000) return;

    // Get top discard card
    const topDiscard = discardPile[discardPile.length - 1];

    // Check if bot has a matching card in its memory
    const validOwnCards = botMemory.ownCards.filter(m =>
      m.index < player2Hand.length && m.card && m.card.rank
    );

    const matchingCard = validOwnCards.find(m => m.card.rank === topDiscard.rank);

    if (matchingCard) {
      const matchIndex = matchingCard.index;
      const matchCard = player2Hand[matchIndex];

      // Safety check - make sure we have the card and it actually matches
      if (!matchCard || matchCard.rank !== topDiscard.rank) return;

      // Don't match if the top discard is the same card object (bot just discarded it)
      if (matchCard === topDiscard) return;

      // Mark that bot is matching to prevent loops
      lastBotMatchRef.current = now;

      // Bot found a match! Discard it after a short delay to feel natural
      setTimeout(() => {
        const newHand = player2Hand.filter((_, i) => i !== matchIndex);
        setPlayer2Hand(newHand);
        setDiscardPile(prev => [...prev, matchCard]);
        setBotMemory(prev => ({
          ...prev,
          ownCards: prev.ownCards.filter(m => m.index !== matchIndex)
            .map(m => ({ ...m, index: m.index > matchIndex ? m.index - 1 : m.index })),
          discardHistory: [...prev.discardHistory, matchCard],
        }));
        setMessage(`Bot matched with ${matchCard.rank}${matchCard.suit}! 🎯`);
      }, 800);
    }
  }, [difficulty, gamePhase, discardPile, botMemory, player2Hand]);

  // Watch for discard pile changes to trigger bot reactive match
  useEffect(() => {
    if (difficulty === "extreme" && discardPile.length > 0 && gamePhase === "playing") {
      // Small delay before bot checks for matches
      const timer = setTimeout(() => {
        botReactiveMatchDiscard();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [discardPile, botReactiveMatchDiscard, difficulty, gamePhase]);

  // CHUKRUM CALL
  const handleChukrumCall = () => {
    if (currentPlayer !== 1 || gamePhase !== "playing" || drawnCard) return;

    setChukrumCaller(1);
    setGamePhase("finalRound");
    setFinalRoundTurnsLeft(2); // Opponent gets 1 turn, then caller gets 1 final turn
    setMessage("CHUKRUM! Bot gets one final turn, then you get one more...");
    setCurrentPlayer(2);
    // Bot turn is triggered automatically by useEffect
  };

  // BOT TURN with difficulty-based AI
  const botTurn = useCallback(() => {
    if (gamePhase === "ended") return;

    const newDeck = [...deck];
    if (newDeck.length === 0) {
      // Deck is empty - end the game
      setMessage("Deck is empty! Game ends - revealing all cards...");
      setTimeout(() => endGame(), 500);
      return;
    }

    const drawn = newDeck.pop();
    setDeck(newDeck);

    // Increment turn count
    setBotMemory(prev => ({ ...prev, turnCount: prev.turnCount + 1 }));

    // Helper: Get unknown positions in bot's hand (accounts for reduced hand size)
    const getUnknownPositions = () => {
      const handSize = player2Hand.length;
      const knownIndices = botMemory.ownCards
        .filter(m => m.index < handSize && m.card) // Filter out stale indices
        .map(m => m.index);
      return Array.from({ length: handSize }, (_, i) => i)
        .filter(i => !knownIndices.includes(i));
    };

    // Helper: Get highest value known card in bot's hand
    const getHighestKnownCard = () => {
      const validCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length && m.card && m.card.rank
      );
      if (validCards.length === 0) return null;
      return validCards.reduce((max, curr) =>
        getCardValue(curr.card.rank) > getCardValue(max.card.rank) ? curr : max
      );
    };

    // Helper: Check if bot should try Match Discard (Extreme only)
    const tryMatchDiscard = () => {
      if (difficulty !== "extreme" || discardPile.length === 0) return false;

      const topDiscard = discardPile[discardPile.length - 1];
      // Filter valid cards before searching for match
      const validOwnCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length && m.card && m.card.rank
      );
      const matchingCard = validOwnCards.find(m =>
        m.card.rank === topDiscard.rank
      );

      if (matchingCard) {
        // Bot has a matching card! Discard it
        const matchIndex = matchingCard.index;
        const matchCard = player2Hand[matchIndex];

        // Safety check
        if (!matchCard) return false;

        const newHand = player2Hand.filter((_, i) => i !== matchIndex);
        setPlayer2Hand(newHand);
        setDiscardPile(prev => [...prev, matchCard]);
        setBotMemory(prev => ({
          ...prev,
          ownCards: prev.ownCards.filter(m => m.index !== matchIndex)
            .map(m => ({ ...m, index: m.index > matchIndex ? m.index - 1 : m.index })),
          discardHistory: [...prev.discardHistory, matchCard],
        }));
        setMessage(`Bot matched discard with ${matchCard.rank}! Your turn!`);
        return true;
      }
      return false;
    };

    // Helper: Get best position for Q/K swap (Extreme targets player's "valued" positions)
    const getBestSwapTarget = () => {
      if (difficulty === "extreme") {
        // STRATEGY: Target positions the player hasn't swapped (likely keeping good cards there)
        const allPositions = [0, 1, 2, 3].filter(i => i < player1Hand.length);

        // Count how many times each position was swapped
        const swapCounts = {};
        botMemory.playerSwapHistory.forEach(h => {
          swapCounts[h.position] = (swapCounts[h.position] || 0) + 1;
        });

        // Sort positions by swap count (ascending) - less swapped = more valuable
        const sortedPositions = allPositions.sort((a, b) => {
          const countA = swapCounts[a] || 0;
          const countB = swapCounts[b] || 0;
          return countA - countB;
        });

        // Pick the position that was swapped the least (or never)
        // This is likely where player keeps good cards
        if (sortedPositions.length > 0) {
          const leastSwappedCount = swapCounts[sortedPositions[0]] || 0;
          // Get all positions with this minimum count
          const bestPositions = sortedPositions.filter(p => (swapCounts[p] || 0) === leastSwappedCount);
          return bestPositions[Math.floor(Math.random() * bestPositions.length)];
        }
      }
      // Random fallback
      return Math.floor(Math.random() * player1Hand.length);
    };

    const makeDecision = () => {
      // === MATCH DISCARD CHECK (Extreme only, before drawing action) ===
      if (tryMatchDiscard()) {
        setDiscardPile(prev => [...prev, drawn]);
        nextPlayer();
        return;
      }

      // === JACK: Peek at own card ===
      if (drawn.rank === "J") {
        const unknownPositions = getUnknownPositions();
        if (unknownPositions.length > 0) {
          const peekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          setBotMemory(prev => ({
            ...prev,
            ownCards: [...prev.ownCards, { index: peekIndex, card: player2Hand[peekIndex] }],
            discardHistory: [...prev.discardHistory, drawn],
          }));
        }
        setDiscardPile(prev => [...prev, drawn]);
        setMessage("Bot used Jack to peek at a card. Your turn!");
        nextPlayer();
        return;
      }

      // === QUEEN: Peek own, optionally swap with player ===
      if (drawn.rank === "Q") {
        const unknownPositions = getUnknownPositions();
        if (unknownPositions.length > 0) {
          const peekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          const peekedCard = player2Hand[peekIndex];

          // Safety check - if card is undefined, just discard Queen
          if (!peekedCard) {
            setDiscardPile(prev => [...prev, drawn]);
            setMessage("Bot used Queen. Your turn!");
            nextPlayer();
            return;
          }

          setBotMemory(prev => ({
            ...prev,
            ownCards: [...prev.ownCards, { index: peekIndex, card: peekedCard }],
          }));

          // Swap threshold based on difficulty - Extreme is very aggressive
          const swapThreshold = difficulty === "easy" ? 15 : (difficulty === "normal" ? 9 : 5);

          if (getCardValue(peekedCard.rank) > swapThreshold) {
            const swapIndex = getBestSwapTarget();
            const botCard = player2Hand[peekIndex];
            const playerCard = player1Hand[swapIndex];

            animateSwap(2, peekIndex, 1, swapIndex, botCard, playerCard, () => {
              const newP1Hand = [...player1Hand];
              const newP2Hand = [...player2Hand];
              newP2Hand[peekIndex] = { ...playerCard, visible: false };
              newP1Hand[swapIndex] = { ...botCard, visible: false };
              setPlayer1Hand(newP1Hand);
              setPlayer2Hand(newP2Hand);
              setDiscardPile(prev => [...prev, drawn]);
              setBotMemory(prev => ({
                ...prev,
                ownCards: prev.ownCards.filter(m => m.index !== peekIndex),
                discardHistory: [...prev.discardHistory, drawn],
              }));
              setMessage("Bot used Queen to swap cards! Your turn!");
              nextPlayer();
            });
            return;
          }
        }
        setDiscardPile(prev => [...prev, drawn]);
        setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
        setMessage("Bot used Queen to peek. Your turn!");
        nextPlayer();
        return;
      }

      // === KING: Peek both, optionally swap ===
      if (drawn.rank === "K") {
        const unknownPositions = getUnknownPositions();
        if (unknownPositions.length > 0) {
          const peekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          const peekedCard = player2Hand[peekIndex];

          // Safety check - if card is undefined, just discard King
          if (!peekedCard) {
            setDiscardPile(prev => [...prev, drawn]);
            setMessage("Bot used King. Your turn!");
            nextPlayer();
            return;
          }

          setBotMemory(prev => ({
            ...prev,
            ownCards: [...prev.ownCards, { index: peekIndex, card: peekedCard }],
          }));

          // King is even more aggressive - lower threshold in Extreme
          const swapThreshold = difficulty === "easy" ? 15 : (difficulty === "normal" ? 9 : 5);

          if (getCardValue(peekedCard.rank) > swapThreshold) {
            const swapIndex = getBestSwapTarget();
            const botCard = player2Hand[peekIndex];
            const playerCard = player1Hand[swapIndex];

            animateSwap(2, peekIndex, 1, swapIndex, botCard, playerCard, () => {
              const newP1Hand = [...player1Hand];
              const newP2Hand = [...player2Hand];
              newP2Hand[peekIndex] = { ...playerCard, visible: false };
              newP1Hand[swapIndex] = { ...botCard, visible: false };
              setPlayer1Hand(newP1Hand);
              setPlayer2Hand(newP2Hand);
              setDiscardPile(prev => [...prev, drawn]);
              setBotMemory(prev => ({
                ...prev,
                ownCards: prev.ownCards.filter(m => m.index !== peekIndex),
                discardHistory: [...prev.discardHistory, drawn],
              }));
              setMessage("Bot used King to swap cards! Your turn!");
              nextPlayer();
            });
            return;
          }
        }
        setDiscardPile(prev => [...prev, drawn]);
        setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
        setMessage("Bot used King to peek. Your turn!");
        nextPlayer();
        return;
      }

      // === NORMAL CARD DECISION ===
      const drawnValue = getCardValue(drawn.rank);
      let shouldSwap = false;
      let swapIndex = -1;

      if (difficulty === "easy") {
        // EASY: Random swaps for low cards
        if (drawnValue <= 4 && Math.random() < 0.3) {
          shouldSwap = true;
          swapIndex = Math.floor(Math.random() * player2Hand.length);
        }
      } else if (difficulty === "normal") {
        // NORMAL: Compare with known cards
        const highestKnown = getHighestKnownCard();
        if (highestKnown && drawnValue < getCardValue(highestKnown.card.rank)) {
          shouldSwap = true;
          swapIndex = highestKnown.index;
        } else if (drawnValue <= 4 && Math.random() < 0.5) {
          shouldSwap = true;
          const unknownPositions = getUnknownPositions();
          swapIndex = unknownPositions.length > 0
            ? unknownPositions[Math.floor(Math.random() * unknownPositions.length)]
            : Math.floor(Math.random() * player2Hand.length);
        }
      } else {
        // EXTREME: Optimal decisions with early-game aggression
        const highestKnown = getHighestKnownCard();
        const turnCount = botMemory.turnCount || 0;
        const unknownCount = getUnknownPositions().length;

        // Early game strategy (turns 1-4): Aggressively swap to learn hand
        const isEarlyGame = turnCount <= 4;

        // Always swap for very low cards (A, 2, 3, 7)
        if (drawnValue <= 3 || drawnValue === -1) {
          shouldSwap = true;
          if (highestKnown) {
            swapIndex = highestKnown.index;
          } else {
            const unknownPositions = getUnknownPositions();
            swapIndex = unknownPositions.length > 0
              ? unknownPositions[0]
              : Math.floor(Math.random() * player2Hand.length);
          }
        } else if (highestKnown && drawnValue < getCardValue(highestKnown.card.rank)) {
          // Replace known high card with lower one
          shouldSwap = true;
          swapIndex = highestKnown.index;
        } else if (isEarlyGame && drawnValue <= 8 && unknownCount > 0) {
          // EARLY GAME: Swap cards up to 6 into unknown positions to gain information
          // This is key for good play - knowing your hand is crucial!
          shouldSwap = true;
          const unknownPositions = getUnknownPositions();
          swapIndex = unknownPositions[0];
        } else if (!isEarlyGame && drawnValue <= 5 && unknownCount > 0) {
          // LATE GAME: Be more selective, only swap 5 or less
          shouldSwap = true;
          const unknownPositions = getUnknownPositions();
          swapIndex = unknownPositions[0];
        }
      }

      if (shouldSwap && swapIndex >= 0 && swapIndex < player2Hand.length) {
        const replacedCard = player2Hand[swapIndex];
        setSwapAnimation({ fromPlayer: 'deck', fromIndex: 0, toPlayer: 2, toIndex: swapIndex, fromCard: null, toCard: replacedCard, type: 'draw' });
        setTimeout(() => {
          setSwapAnimation(null);
          const newBotHand = [...player2Hand];
          newBotHand[swapIndex] = { ...drawn, visible: false };
          setPlayer2Hand(newBotHand);
          setDiscardPile(prev => [...prev, replacedCard]);
          setBotMemory(prev => ({
            ...prev,
            ownCards: prev.ownCards.filter(m => m.index !== swapIndex).concat([{ index: swapIndex, card: drawn }]),
            discardHistory: [...prev.discardHistory, replacedCard],
          }));
          setMessage(`Bot swapped card #${swapIndex + 1}. Your turn!`);
          nextPlayer();
          botTurnInProgress.current = false;
        }, 2000); // Increased timing for readability
      } else {
        setDiscardPile(prev => [...prev, drawn]);
        setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
        setMessage("Bot discarded. Your turn!");
        nextPlayer();
        botTurnInProgress.current = false;
      }
    };

    // === CHUKRUM DECISION ===
    if (gamePhase === "playing" && chukrumCaller === null) {
      // Filter to only valid card entries
      const validKnownCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length && m.card && m.card.rank
      );
      const knownScore = validKnownCards.reduce((sum, m) => sum + getCardValue(m.card.rank), 0);
      const unknownCount = player2Hand.length - validKnownCards.length;

      let shouldCallChukrum = false;

      if (difficulty === "easy") {
        // Easy: Never calls Chukrum
        shouldCallChukrum = false;
      } else if (difficulty === "normal") {
        // Normal: Very conservative - needs all 4 known and score <= 6
        shouldCallChukrum = validKnownCards.length === 4 && knownScore <= 6 && Math.random() < 0.3;
      } else {
        // Extreme: Strategic but careful - only calls when confident of winning
        const deckRemaining = newDeck.length;
        const playerActivelyImproving = botMemory.playerSwapHistory.length >= 4;
        const turnCount = botMemory.turnCount || 0;

        // Calculate worst-case score (assuming unknown cards are face cards)
        const worstCaseUnknown = unknownCount * 10;
        const worstCaseTotal = knownScore + worstCaseUnknown;

        // Calculate optimistic score (assuming unknown cards average 4)
        const optimisticUnknown = unknownCount * 4;
        const optimisticTotal = knownScore + optimisticUnknown;

        // STRICT CONDITIONS for calling CHUKRUM:
        // 1. Must know at least 3 cards
        // 2. Known score must be very low
        // 3. Don't call if player is actively improving (they might have lower score)

        if (validKnownCards.length === 4 && knownScore <= 5) {
          // Know all cards and score is excellent - definitely call
          shouldCallChukrum = true;
        } else if (validKnownCards.length === 4 && knownScore <= 8 && !playerActivelyImproving) {
          // Know all cards, good score, player not improving much - call
          shouldCallChukrum = true;
        } else if (validKnownCards.length >= 3 && knownScore <= 3 && unknownCount === 1 && turnCount >= 6) {
          // Know 3 cards with very low score, one unknown, played enough turns
          // Only if optimistic total is still low
          if (optimisticTotal <= 7) {
            shouldCallChukrum = true;
          }
        }

        // Late game pressure: If deck is almost empty, take a calculated risk
        if (deckRemaining < 8 && validKnownCards.length >= 3 && knownScore <= 6 && !playerActivelyImproving) {
          shouldCallChukrum = true;
        }
      }

      if (shouldCallChukrum) {
        setChukrumCaller(2);
        setGamePhase("finalRound");
        setFinalRoundTurnsLeft(2); // Player gets 1 turn, then bot gets 1 final turn
        setMessage("Bot calls CHUKRUM! You get one final turn, then bot gets one more...");
        setCurrentPlayer(1);
        return;
      }
    }

    setTimeout(makeDecision, 800);
  }, [deck, player1Hand, player2Hand, botMemory, gamePhase, chukrumCaller, endGame, difficulty, discardPile, animateSwap, nextPlayer]);

  // Auto-trigger bot turn when it's the bot's turn
  useEffect(() => {
    const canTrigger = currentPlayer === 2 &&
      (gamePhase === "playing" || gamePhase === "finalRound") &&
      !drawnCard &&
      !botTurnInProgress.current;
    if (canTrigger) {
      botTurnInProgress.current = true;
      const timer = setTimeout(() => {
        botTurn();
      }, 1200);
      return () => {
        clearTimeout(timer);
        botTurnInProgress.current = false;
      };
    }
  }, [currentPlayer, gamePhase, drawnCard, botTurn]);

  // Check if any player's hand is empty - end game immediately
  // Only check after game has properly started (deck dealt and a turn has been played)
  useEffect(() => {
    // Require: deck exists, deck has been drawn from (< 44), a hand is empty
    if (gamePhase === "playing" && deck.length > 0 && deck.length < 44 && (player1Hand.length === 0 || player2Hand.length === 0)) {
      setMessage("A player has no cards left! Game ends!");
      setTimeout(() => endGame(), 500);
    }
  }, [player1Hand.length, player2Hand.length, gamePhase, deck.length, endGame]);

  // Check if a card is being peeked
  const isCardPeeked = (player, index) => {
    if (peekedCard && peekedCard.player === player && peekedCard.index === index) return true;
    if (opponentPeekedCard && opponentPeekedCard.player === player && opponentPeekedCard.index === index) return true;
    return false;
  };

  // Get card display
  const getCardDisplay = (card, isVisible) => {
    if (!isVisible) return { content: "★", color: "text-white" };
    const color = ["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900";
    return { content: `${card.rank}${card.suit}`, color };
  };

  // Check if swap animation affects this card
  const getSwapAnimationStyle = (player, index) => {
    if (!swapAnimation) return {};

    if (swapAnimation.fromPlayer === player && swapAnimation.fromIndex === index) {
      // This card is being swapped away - slide up/down
      const direction = player === 1 ? -100 : 100;
      return {
        transform: `translateY(${direction}px)`,
        transition: 'transform 0.5s ease-in-out',
        zIndex: 50,
      };
    }
    return {};
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-between bg-gradient-to-br from-green-950 via-green-800 to-emerald-900 text-white overflow-hidden p-2 sm:p-4 md:p-6">
      <button onClick={() => navigate("/game-setup")} className="absolute top-4 left-4 bg-black/40 hover:bg-black/60 rounded-full px-3 py-2 flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-4 mt-4 mb-2">
        <h1 className="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-widest bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
          CHUKRUM
        </h1>
        {/* Difficulty Badge */}
        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold shadow-lg
          ${difficulty === "easy" ? "bg-gradient-to-r from-green-400 to-emerald-500" : ""}
          ${difficulty === "normal" ? "bg-gradient-to-r from-yellow-400 to-orange-500" : ""}
          ${difficulty === "extreme" ? "bg-gradient-to-r from-red-500 to-rose-600" : ""}
        `}>
          {difficulty === "easy" && <Leaf className="w-4 h-4" />}
          {difficulty === "normal" && <Zap className="w-4 h-4" />}
          {difficulty === "extreme" && <Flame className="w-4 h-4" />}
          {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
        </div>
      </div>

      <div className="bg-black/40 backdrop-blur-sm px-3 sm:px-6 py-2 sm:py-3 rounded-xl text-xs sm:text-sm md:text-lg font-medium mb-2 sm:mb-4 shadow-lg max-w-2xl text-center">{message}</div>

      {/* Player 2 (Bot) Hand */}
      <div className={`flex flex-col items-center ${currentPlayer === 2 ? "scale-105 text-yellow-300" : "opacity-70"}`}>
        <p className="mb-2">{currentPlayer === 2 ? "▶ Bot" : "Bot"} {gamePhase === "ended" ? `(Score: ${calculateScore(player2Hand)})` : ""}</p>
        <div className="flex gap-1 sm:gap-2 md:gap-4">
          {player2Hand.map((card, i) => {
            // Only show cards at game end - peeked cards are only visible in the modal
            const showCard = gamePhase === "ended";
            const display = getCardDisplay(card, showCard);
            const animStyle = getSwapAnimationStyle(2, i);

            // Highlight the card position that was peeked (but don't reveal it)
            const isPeekedPosition = isCardPeeked(2, i);

            // Can click opponent cards only during Queen (after peeking own) or King
            const canClick = (specialAction === "queenAction" && hasPeekedOwn) ||
              (specialAction === "kingAction" && !hasPeekedOpponent);

            return (
              <motion.div
                key={card.id + i}
                ref={(el) => (p2Refs.current[i] = el)}
                onClick={() => {
                  if (specialAction === "queenAction" && hasPeekedOwn && !isPeekedPosition) {
                    handleQueenSwapWithOpponent(i);
                  } else if (specialAction === "kingAction" && !hasPeekedOpponent) {
                    handleKingPeekOpponent(i);
                  }
                }}
                style={animStyle}
                className={`w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 rounded-xl shadow-lg border-2 flex flex-col items-center justify-center text-lg sm:text-2xl md:text-4xl transition-all
                  ${showCard ? "bg-white " + display.color : "bg-blue-900 text-white border-blue-400"}
                  ${isPeekedPosition && !showCard ? "ring-4 ring-yellow-400/50" : ""}
                  ${canClick ? "cursor-pointer hover:ring-2 hover:ring-purple-400" : ""}
                `}
              >
                {showCard ? (
                  <>
                    <span className={display.color}>{card.rank}</span>
                    <span className={display.color}>{card.suit}</span>
                  </>
                ) : (
                  <>
                    <span>★</span>
                    <span className="text-xs text-blue-300 mt-1">#{i + 1}</span>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Center Area */}
      <div className="flex items-center justify-center gap-4 sm:gap-8 md:gap-12 my-4 sm:my-6 md:my-10">
        {/* Draw Pile */}
        <div className="flex flex-col items-center justify-end translate-y-[1px]">
          <p className="text-xs sm:text-sm text-gray-300 mb-1 translate-y-[7px]">Draw Pile</p>
          <div
            className="relative w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 mb-2 cursor-pointer select-none translate-y-[6px]"
            onClick={currentPlayer === 1 && !drawnCard && gamePhase !== "ended" ? handleDrawCard : undefined}
          >
            {[...Array(Math.min(8, Math.ceil(deck.length / 8)))].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-lg bg-blue-700 border border-blue-500 shadow-md"
                style={{ top: `${i * 2}px`, left: `${i * 2}px`, right: `${-i * 2}px`, bottom: `${-i * 2}px`, zIndex: i, filter: `brightness(${1 - i * 0.04})` }}
              />
            ))}
            <motion.div
              ref={drawPileRef}
              className="absolute flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 border border-blue-400 shadow-2xl"
              style={{ top: "12px", left: "13px", right: "-13px", bottom: "-12px", zIndex: 99 }}
            >
              <Shuffle className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white/90" />
            </motion.div>
          </div>
          <p className="text-sm text-gray-400 mt-1 translate-y-[7px]">({deck.length})</p>
        </div>

        {/* Discard pile */}
        <div className="flex flex-col items-center">
          <p className="text-xs sm:text-sm text-gray-300 mb-1">Discard Pile</p>
          <div className="w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 bg-white rounded-lg shadow-xl flex flex-col items-center justify-center text-2xl sm:text-3xl md:text-5xl font-bold">
            {discardPile.length > 0 ? (
              <>
                <div className={`${["♥", "♦"].includes(discardPile[discardPile.length - 1].suit) ? "text-red-600" : "text-gray-900"}`}>
                  {discardPile[discardPile.length - 1].rank}
                </div>
                <div className={`${["♥", "♦"].includes(discardPile[discardPile.length - 1].suit) ? "text-red-600" : "text-gray-900"}`}>
                  {discardPile[discardPile.length - 1].suit}
                </div>
              </>
            ) : (
              <span className="text-gray-400 text-sm">Empty</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Click your card to match!</p>
        </div>

        {/* CHUKRUM Button */}
        {currentPlayer === 1 && gamePhase === "playing" && !drawnCard && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleChukrumCall}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white px-6 py-4 rounded-xl font-bold text-xl shadow-lg flex items-center gap-2"
          >
            <Zap className="w-6 h-6" /> CHUKRUM!
          </motion.button>
        )}
      </div>

      {/* Drawn card modal */}
      <AnimatePresence>
        {drawnCard && currentPlayer === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-48 h-64 bg-white text-black rounded-2xl shadow-2xl flex flex-col items-center justify-center text-6xl font-bold"
            >
              {drawnCard.rank}
              <span className={`${drawnCard.suit === "♥" || drawnCard.suit === "♦" ? "text-red-600" : "text-gray-800"}`}>{drawnCard.suit}</span>
            </motion.div>

            {/* Special card indicator */}
            {isSpecialCard(drawnCard.rank) && (
              <div className="bg-purple-600 px-4 py-2 rounded-lg mt-4 text-white font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5" />
                {drawnCard.rank === "J" && "Jack: Peek at ONE of your cards"}
                {drawnCard.rank === "Q" && "Queen: Peek your card, then swap with opponent"}
                {drawnCard.rank === "K" && "King: Peek one of each, then optionally swap"}
              </div>
            )}

            {/* Instructions based on state */}
            <p className="text-gray-300 mt-4 mb-2 text-center max-w-md">
              {specialAction === "jackPeek" && !hasPeekedOwn && "Click ONE of your cards below to peek:"}
              {specialAction === "jackPeek" && hasPeekedOwn && "Peeking... Jack will be discarded automatically."}
              {specialAction === "queenAction" && !hasPeekedOwn && "First, click ONE of your cards to peek:"}
              {specialAction === "queenAction" && hasPeekedOwn && "Now click an OPPONENT's card above to swap, or Discard:"}
              {specialAction === "kingAction" && !hasPeekedOwn && !hasPeekedOpponent && "Click one of YOUR cards AND one OPPONENT card to peek both:"}
              {specialAction === "kingAction" && hasPeekedOwn && !hasPeekedOpponent && "Now click an OPPONENT's card above to peek:"}
              {specialAction === "kingAction" && !hasPeekedOwn && hasPeekedOpponent && "Now click one of YOUR cards below to peek:"}
              {specialAction === "kingAction" && hasPeekedOwn && hasPeekedOpponent && "You've seen both cards. Click SWAP or Discard:"}
              {specialAction === "none" && "Choose one of your cards to replace, or discard:"}
            </p>

            <div className="flex gap-4 mt-4">
              <button onClick={handleDiscard} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl text-lg font-semibold flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Discard
              </button>

              {specialAction === "kingAction" && hasPeekedOwn && hasPeekedOpponent && (
                <button onClick={handleKingSwap} className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl text-lg font-semibold flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" /> Swap Cards
                </button>
              )}
            </div>

            {/* Opponent cards for Queen/King actions - styled box like player cards */}
            {(specialAction === "queenAction" && hasPeekedOwn) || (specialAction === "kingAction") ? (
              <div className="mt-6 bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-purple-500/30">
                <p className="text-sm text-purple-300 mb-3 font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                  Opponent's cards {specialAction === "queenAction" ? "(click to swap)" : hasPeekedOpponent ? "(peeked)" : "(click to peek)"}:
                </p>
                <div className="flex gap-3 justify-center">
                  {player2Hand.map((card, i) => {
                    const isPeeked = isCardPeeked(2, i);
                    const canClick = (specialAction === "queenAction" && hasPeekedOwn) ||
                      (specialAction === "kingAction" && !hasPeekedOpponent);
                    return (
                      <motion.button
                        key={card.id + i}
                        whileHover={canClick ? { scale: 1.05 } : {}}
                        onClick={() => {
                          if (specialAction === "queenAction" && hasPeekedOwn) handleQueenSwapWithOpponent(i);
                          else if (specialAction === "kingAction" && !hasPeekedOpponent) handleKingPeekOpponent(i);
                        }}
                        disabled={!canClick && !isPeeked}
                        className={`w-16 h-24 rounded-lg text-xl transition-all flex flex-col items-center justify-center relative
                          ${isPeeked ? "bg-white text-black ring-4 ring-yellow-400" : "bg-gradient-to-br from-purple-900 to-purple-700 border border-purple-400 text-white"}
                          ${canClick && !isPeeked ? "hover:ring-2 hover:ring-purple-400 cursor-pointer" : ""}
                          ${!canClick && !isPeeked ? "opacity-60" : ""}
                        `}
                      >
                        {isPeeked ? (
                          <>
                            <span className={["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900"}>{card.rank}</span>
                            <span className={["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900"}>{card.suit}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl">★</span>
                            <span className="text-xs text-purple-300 mt-1">#{i + 1}</span>
                          </>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Player's cards for selection - styled box matching opponent's */}
            <div className="mt-6 bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-green-500/30">
              <p className="text-sm text-green-300 mb-3 font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                Your cards {specialAction === "none" ? "(click to swap)" : hasPeekedOwn ? "(peeked)" : "(click to peek)"}:
              </p>
              <div className="flex gap-3 justify-center">
                {player1Hand.map((card, i) => {
                  const isPeeked = isCardPeeked(1, i);
                  const canClick = (specialAction === "none") ||
                    (specialAction === "jackPeek" && !hasPeekedOwn) ||
                    (specialAction === "queenAction" && !hasPeekedOwn) ||
                    (specialAction === "kingAction" && !hasPeekedOwn);

                  return (
                    <motion.button
                      key={card.id + i}
                      whileHover={canClick ? { scale: 1.05 } : {}}
                      onClick={() => {
                        if (specialAction === "jackPeek" && !hasPeekedOwn) handleJackPeek(i);
                        else if (specialAction === "queenAction" && !hasPeekedOwn) handleQueenPeekOwn(i);
                        else if (specialAction === "kingAction" && !hasPeekedOwn) handleKingPeekOwn(i);
                        else if (specialAction === "none") handleSwap(i);
                      }}
                      disabled={!canClick}
                      className={`w-16 h-24 rounded-lg text-xl transition-all flex flex-col items-center justify-center
                        ${isPeeked ? "bg-white text-black ring-4 ring-yellow-400" : "bg-gradient-to-br from-green-900 to-green-700 border border-green-400 text-white"}
                        ${canClick && !isPeeked ? "hover:ring-2 hover:ring-green-400 cursor-pointer" : ""}
                        ${!canClick ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                    >
                      {isPeeked ? (
                        <>
                          <span className={["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900"}>{card.rank}</span>
                          <span className={["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900"}>{card.suit}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl">★</span>
                          <span className="text-xs text-green-300 mt-1">#{i + 1}</span>
                        </>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player 1 (You) Hand */}
      <div className={`flex flex-col items-center mb-8 ${currentPlayer === 1 ? "scale-105 text-yellow-300" : "opacity-70"}`}>
        <p className="mb-2">{currentPlayer === 1 ? "▶ You" : "You"} {gamePhase === "ended" ? `(Score: ${calculateScore(player1Hand)})` : ""}</p>
        <div className="flex gap-1 sm:gap-2 md:gap-4">
          {player1Hand.map((card, i) => {
            const showCard = gamePhase === "ended";
            const display = getCardDisplay(card, showCard);
            const animStyle = getSwapAnimationStyle(1, i);

            return (
              <motion.div
                key={card.id + i}
                ref={(el) => (p1Refs.current[i] = el)}
                whileHover={!drawnCard && discardPile.length > 0 ? { scale: 1.05 } : {}}
                onClick={() => {
                  if (!drawnCard && discardPile.length > 0 && gamePhase !== "ended") {
                    handleMatchDiscard(i);
                  }
                }}
                style={animStyle}
                className={`w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 rounded-xl shadow-lg border-2 flex flex-col items-center justify-center text-lg sm:text-2xl md:text-4xl cursor-pointer transition-all
                  ${showCard ? "bg-white " + display.color : "bg-blue-900 text-white border-blue-400"}
                  ${discardPile.length > 0 && !drawnCard && gamePhase !== "ended" ? "hover:ring-2 hover:ring-green-400" : ""}
                `}
              >
                {showCard ? (
                  <>
                    <span className={display.color}>{card.rank}</span>
                    <span className={display.color}>{card.suit}</span>
                  </>
                ) : (
                  <>
                    <span>★</span>
                    <span className="text-xs text-blue-300 mt-1">#{i + 1}</span>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
        {discardPile.length > 0 && !drawnCard && gamePhase !== "ended" && (
          <p className="text-xs text-green-300 mt-2">💡 Click a card to try matching the {discardPile[discardPile.length - 1].rank}!</p>
        )}
      </div>

      {/* Swap Animation Overlay - Shows cards sliding between positions (face-down) */}
      <AnimatePresence>
        {swapAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-40 flex flex-col items-center justify-center"
          >
            {/* DRAW animation - card moving from deck to a player's position */}
            {swapAnimation.type === 'draw' && (
              <>
                <motion.div
                  initial={{ y: 0, scale: 0.8, opacity: 0 }}
                  animate={{
                    y: swapAnimation.toPlayer === 2 ? -180 : 180,
                    scale: 1,
                    opacity: 1
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
                  <span className="text-lg">{swapAnimation.toPlayer === 2 ? "Bot" : "You"} → Position #{swapAnimation.toIndex + 1}</span>
                </motion.div>
              </>
            )}

            {/* SWAP animation - cards moving between players */}
            {swapAnimation.type !== 'draw' && (
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
                  <span className="text-lg">Swap #{swapAnimation.fromIndex + 1} ↔ #{swapAnimation.toIndex + 1}</span>
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game End Screen */}
      <AnimatePresence>
        {gamePhase === "ended" && showResultsPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
          >
            {/* X Close Button */}
            <button
              onClick={() => setShowResultsPopup(false)}
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
              <Trophy className={`w-24 h-24 mx-auto mb-4 ${winner === 1 ? "text-yellow-400" : winner === 2 ? "text-gray-400" : "text-blue-400"}`} />
              <h2 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                {winner === 1 ? "YOU WIN!" : winner === 2 ? "BOT WINS!" : "IT'S A TIE!"}
              </h2>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
                <div className="flex gap-12 justify-center">
                  <div className="text-center">
                    <p className="text-gray-300 mb-2">Your Score</p>
                    <p className="text-4xl font-bold text-green-400">{calculateScore(player1Hand)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-300 mb-2">Bot Score</p>
                    <p className="text-4xl font-bold text-red-400">{calculateScore(player2Hand)}</p>
                  </div>
                </div>
              </div>

              <p className="text-gray-400 text-sm mb-4">Click ✕ to view the bot's cards</p>

              <div className="flex gap-4 justify-center">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startNewGame}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2"
                >
                  <RefreshCw className="w-6 h-6" /> Play Again
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/home")}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2"
                >
                  <ArrowLeft className="w-6 h-6" /> Home
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button to reopen results when popup is closed */}
      {gamePhase === "ended" && !showResultsPopup && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowResultsPopup(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
          >
            <Trophy className="w-5 h-5" /> Show Results
          </motion.button>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={startNewGame}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
          >
            <RefreshCw className="w-5 h-5" /> Play Again
          </motion.button>
        </div>
      )}

      <div className="text-gray-400 text-sm mb-4 flex items-center gap-1">
        <Trophy className="w-4 h-4" /> Lowest score wins! | 7 = -1 point
      </div>
    </div>
  );
}