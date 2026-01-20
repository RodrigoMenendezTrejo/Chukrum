import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Trophy, Trash2, Eye, RefreshCw, Zap, Flame, Leaf } from "lucide-react";
import { auth, db } from "./firebase";
import { doc, updateDoc, increment } from "firebase/firestore";

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
  // Get target score for multi-match mode (null = single match)
  const targetScore = location.state?.targetScore || null;

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
  const [winner, setWinner] = useState(null);

  // Multi-match state
  const [cumulativeP1Score, setCumulativeP1Score] = useState(0);
  const [cumulativeP2Score, setCumulativeP2Score] = useState(0);
  const [matchNumber, setMatchNumber] = useState(1);
  const [matchHistory, setMatchHistory] = useState([]); // [{match, p1Score, p2Score}]
  const [seriesWinner, setSeriesWinner] = useState(null); // null, 1, or 2 when series ends

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
  const gameStarted = useRef(false); // Track when game has been initialized with cards dealt
  const p1Refs = useRef([]);
  const p2Refs = useRef([]);
  const drawPileRef = useRef(null);

  // Selection state for Queen/King swaps
  const [selectedOwnIndex, setSelectedOwnIndex] = useState(null);

  // Extreme mode: Tornado ability
  const [tornadoUsed, setTornadoUsed] = useState(false);
  const [showTornado, setShowTornado] = useState(false);

  // Initialize game
  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    // Reset refs before setting state to prevent race conditions
    gameStarted.current = false;
    botTurnInProgress.current = false;

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
    setTornadoUsed(false); // Reset tornado for new game
    setShowTornado(false);
    // Reset multi-match state for fresh series
    setCumulativeP1Score(0);
    setCumulativeP2Score(0);
    setMatchNumber(1);
    setMatchHistory([]);
    setSeriesWinner(null);
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    // Mark game as started after all state is set
    // Use setTimeout to ensure state updates are batched first
    // Track if bot will start for the re-trigger logic
    const botStarts = difficulty === "extreme" || (difficulty === "normal" && Math.random() < 0.5);

    setTimeout(() => {
      gameStarted.current = true;

      // For modes where bot starts, we need to re-trigger the bot turn useEffect
      // The useEffect already ran when currentPlayer was set to 2, but 
      // gameStarted.current was still false so it exited early.
      // We toggle currentPlayer to 1 then back to 2 to force useEffect to re-run.
      if (botStarts) {
        setTimeout(() => {
          setCurrentPlayer(1); // Briefly set to 1
          setTimeout(() => {
            setCurrentPlayer(2); // Set back to 2, triggering useEffect with gameStarted = true
          }, 50);
        }, 100);
      }
    }, 200);

    // Determine who starts based on difficulty
    if (botStarts) {
      setCurrentPlayer(2);
      setMessage(`Welcome to Chukrum (${diffLabel} mode)! Bot goes first...`);
    } else {
      setCurrentPlayer(1);
      setMessage(`Welcome to Chukrum (${diffLabel} mode)! Your turn — draw from the pile.`);
    }
  };

  const endGame = useCallback(() => {
    setGamePhase("ended");
    const p1Score = calculateScore(player1Hand);
    const p2Score = calculateScore(player2Hand);

    // Update cumulative scores
    const newCumulativeP1 = cumulativeP1Score + p1Score;
    const newCumulativeP2 = cumulativeP2Score + p2Score;
    setCumulativeP1Score(newCumulativeP1);
    setCumulativeP2Score(newCumulativeP2);

    // Record match in history
    setMatchHistory(prev => [...prev, { match: matchNumber, p1Score, p2Score }]);

    // Determine match winner (for display)
    if (p1Score < p2Score) {
      setWinner(1);
    } else if (p2Score < p1Score) {
      setWinner(2);
    } else {
      setWinner(0);
    }

    // Check if series is over (multi-match mode)
    if (targetScore !== null) {
      // First to reach targetScore LOSES (lower is better in Chukrum)
      if (newCumulativeP1 >= targetScore || newCumulativeP2 >= targetScore) {
        // Series over! Determine overall winner
        if (newCumulativeP1 >= targetScore && newCumulativeP2 >= targetScore) {
          // Both reached - whoever has LOWER total wins
          if (newCumulativeP1 < newCumulativeP2) {
            setSeriesWinner(1);
            setMessage(`🏆 YOU WIN THE SERIES! Final: You ${newCumulativeP1} - Bot ${newCumulativeP2}`);
          } else if (newCumulativeP2 < newCumulativeP1) {
            setSeriesWinner(2);
            setMessage(`💀 BOT WINS THE SERIES! Final: Bot ${newCumulativeP2} - You ${newCumulativeP1}`);
          } else {
            setSeriesWinner(0);
            setMessage(`🤝 SERIES TIE! Final: Both at ${newCumulativeP1}`);
          }
        } else if (newCumulativeP1 >= targetScore) {
          // Player reached target first - player LOSES
          setSeriesWinner(2);
          setMessage(`💀 BOT WINS THE SERIES! You hit ${targetScore} first. Final: Bot ${newCumulativeP2} - You ${newCumulativeP1}`);
        } else {
          // Bot reached target first - bot LOSES
          setSeriesWinner(1);
          setMessage(`🏆 YOU WIN THE SERIES! Bot hit ${targetScore} first. Final: You ${newCumulativeP1} - Bot ${newCumulativeP2}`);
        }

        // Update Firestore stats for series
        if (auth.currentUser) {
          const userRef = doc(db, "users", auth.currentUser.uid);
          const updates = { gamesPlayed: increment(1) };
          if (newCumulativeP1 < newCumulativeP2 || newCumulativeP2 >= targetScore) {
            updates.wins = increment(1);
          } else if (newCumulativeP2 < newCumulativeP1 || newCumulativeP1 >= targetScore) {
            updates.losses = increment(1);
          }
          updateDoc(userRef, updates).catch(console.error);
        }
      } else {
        // Series continues - message points to popup which has accurate scores
        setMessage(`Match ${matchNumber} complete! Check scores above.`);
      }
    } else {
      // Single match mode - original behavior
      if (auth.currentUser) {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const updates = { gamesPlayed: increment(1) };
        if (p1Score < p2Score) {
          updates.wins = increment(1);
        } else if (p1Score > p2Score) {
          updates.losses = increment(1);
        }
        updateDoc(userRef, updates).catch(console.error);
      }

      // Don't include scores in message - they're calculated fresh in UI
      if (p1Score < p2Score) {
        setMessage(`You win! 🎉`);
      } else if (p2Score < p1Score) {
        setMessage(`Bot wins! 🤖`);
      } else {
        setMessage(`It's a tie! 🤝`);
      }
    }
  }, [player1Hand, player2Hand, targetScore, cumulativeP1Score, cumulativeP2Score, matchNumber]);

  // Start next match in multi-match mode (preserves cumulative scores)
  const startNextMatch = () => {
    // Reset refs
    gameStarted.current = false;
    botTurnInProgress.current = false;

    // Create new deck and hands
    const d = createDeck();
    const hand1 = d.slice(0, 4).map((card) => ({ ...card, visible: false }));
    const hand2 = d.slice(4, 8).map((card) => ({ ...card, visible: false }));
    const remainingDeck = d.slice(8);

    // Reset match state
    setPlayer1Hand(hand1);
    setPlayer2Hand(hand2);
    setDeck(remainingDeck);
    setDiscardPile([]);
    setCurrentPlayer(1);
    setGamePhase("playing");
    setChukrumCaller(null);
    setWinner(null);
    setDrawnCard(null);
    setSpecialAction("none");
    setPeekedCard(null);
    setOpponentPeekedCard(null);
    setHasPeekedOwn(false);
    setHasPeekedOpponent(false);
    setBotMemory({
      ownCards: [],
      playerSwapHistory: [],
      discardHistory: [],
      turnCount: 0,
    });
    setSwapAnimation(null);
    setSelectedOwnIndex(null);
    setShowResultsPopup(true);
    setTornadoUsed(false);
    setShowTornado(false);

    // Increment match number
    setMatchNumber(prev => prev + 1);

    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const botStarts = difficulty === "extreme" || (difficulty === "normal" && Math.random() < 0.5);

    setTimeout(() => {
      gameStarted.current = true;
      if (botStarts) {
        setTimeout(() => {
          setCurrentPlayer(1);
          setTimeout(() => setCurrentPlayer(2), 50);
        }, 100);
      }
    }, 200);

    if (botStarts) {
      setCurrentPlayer(2);
      setMessage(`Match ${matchNumber + 1}! (${diffLabel} mode) Bot goes first...`);
    } else {
      setCurrentPlayer(1);
      setMessage(`Match ${matchNumber + 1}! (${diffLabel} mode) Your turn — draw from the pile.`);
    }
  };

  const nextPlayer = useCallback(() => {
    if (gamePhase === "finalRound" && currentPlayer !== chukrumCaller) {
      // Delay before ending to allow for any final match discards or animations
      setMessage("Final round complete! Calculating scores...");
      setTimeout(() => {
        endGame();
      }, 1500);
    } else {
      setCurrentPlayer((p) => (p === 1 ? 2 : 1));
    }
  }, [gamePhase, currentPlayer, chukrumCaller, endGame]);

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
      setMessage(`You drew a Queen! Click ANY card (yours or opponent's) to peek.`);
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
      // Bot turn triggered automatically by useEffect watching currentPlayer
    }, 'draw');
  };

  // JACK POWER: Peek at ONE of your own cards only
  const handleJackPeek = (index) => {
    if (hasPeekedOwn) return; // Already peeked, can't peek again

    setPeekedCard({ player: 1, index });
    setHasPeekedOwn(true);
    setMessage(`You see: ${player1Hand[index].rank}${player1Hand[index].suit}. Click Discard when ready.`);
    // Player must click Discard button to end their turn (like Q and K)
  };

  // QUEEN POWER: Peek at ANY card first, then optionally swap with opposite side
  // Step 1: Peek own card → can then swap with opponent
  const handleQueenPeekOwn = (index) => {
    if (hasPeekedOwn || hasPeekedOpponent) return; // Already peeked a card

    setPeekedCard({ player: 1, index });
    setSelectedOwnIndex(index); // Store which card was selected for later swap
    setHasPeekedOwn(true);
    setMessage(`Your card: ${player1Hand[index].rank}${player1Hand[index].suit}. Click an OPPONENT's card to swap with it, or Discard.`);
  };

  // Step 1 (alternate): Peek opponent's card first → can then swap with your own
  const handleQueenPeekOpponent = (index) => {
    if (hasPeekedOwn || hasPeekedOpponent) return; // Already peeked a card

    setOpponentPeekedCard({ player: 2, index });
    setHasPeekedOpponent(true);
    setMessage(`Opponent's card: ${player2Hand[index].rank}${player2Hand[index].suit}. Click ONE OF YOUR cards to swap with it, or Discard.`);
  };

  // Step 2 (when own was peeked first): Swap with opponent
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
    });
  };

  // Step 2 (when opponent was peeked first): Swap with your own card
  const handleQueenSwapWithOwn = (ownIndex) => {
    if (!hasPeekedOpponent || !opponentPeekedCard) return;

    const oppIndex = opponentPeekedCard.index;
    const myCard = player1Hand[ownIndex];
    const oppCard = player2Hand[oppIndex];

    // Animate the swap - show both cards moving
    animateSwap(1, ownIndex, 2, oppIndex, myCard, oppCard, () => {
      // Perform the swap
      const newP1Hand = [...player1Hand];
      const newP2Hand = [...player2Hand];
      newP1Hand[ownIndex] = { ...oppCard, visible: false };
      newP2Hand[oppIndex] = { ...myCard, visible: false };

      setPlayer1Hand(newP1Hand);
      setPlayer2Hand(newP2Hand);
      setOpponentPeekedCard(null);
      setHasPeekedOpponent(false);
      setDiscardPile((prev) => [...prev, drawnCard]);
      setDrawnCard(null);
      setSpecialAction("none");
      setMessage("Cards swapped! Queen discarded. Bot is thinking...");
      nextPlayer();
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
    // Explicitly set current player to bot and trigger bot turn
    nextPlayer();
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

    // Check if bot has a matching card in its memory (validate card identity)
    const validOwnCards = botMemory.ownCards.filter(m =>
      m.index < player2Hand.length &&
      m.card &&
      m.card.rank &&
      player2Hand[m.index]?.id === m.card.id // Verify card still at this position
    );

    // Find matching card, but EXCLUDE 7s - they're worth -1, too valuable to discard!
    const matchingCard = validOwnCards.find(m =>
      m.card.rank === topDiscard.rank && getCardValue(m.card.rank) !== -1
    );

    if (matchingCard) {
      const matchIndex = matchingCard.index;
      const matchCard = player2Hand[matchIndex];

      // Safety check - make sure we have the card and it actually matches
      if (!matchCard || matchCard.rank !== topDiscard.rank) return;

      // Don't match if the top discard is the same card object (bot just discarded it)
      if (matchCard === topDiscard) return;

      console.log('[REACTIVE MATCH DISCARD] Bot discarding matching card', {
        matchRank: matchCard.rank,
        matchValue: getCardValue(matchCard.rank),
        position: matchIndex
      });

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
    setMessage("CHUKRUM! Bot gets one final turn...");
    setCurrentPlayer(2);
  };

  // BOT TURN with difficulty-based AI
  const botTurn = useCallback(() => {
    // Prevent duplicate bot turns and early exit conditions
    if (gamePhase === "ended" || botTurnInProgress.current) return;
    botTurnInProgress.current = true; // Set guard immediately

    const newDeck = [...deck];
    if (newDeck.length === 0) {
      // Deck is empty - end the game
      setMessage("Deck is empty! Game ends - revealing all cards...");
      botTurnInProgress.current = false; // Reset guard before return
      setTimeout(() => endGame(), 500);
      return;
    }

    const drawn = newDeck.pop();
    setDeck(newDeck);

    // Increment turn count
    setBotMemory(prev => ({ ...prev, turnCount: prev.turnCount + 1 }));

    // === EXTREME MODE: TORNADO CHECK ===
    // Bot can shuffle player's cards when losing badly
    const shouldUseTornado = () => {
      if (difficulty !== "extreme" || tornadoUsed) return false;
      if (botMemory.turnCount < 5) return false; // At least 5 turns
      if (player1Hand.length < 3) return false; // Player needs 3+ cards

      const botScore = calculateScore(player2Hand);
      const playerScore = calculateScore(player1Hand);
      const scoreDiff = botScore - playerScore;
      console.log('[TORNADO CHECK]', { botScore, playerScore, scoreDiff, threshold: 10 });
      return scoreDiff >= 10; // Bot losing by 10+ points triggers tornado
    };

    if (shouldUseTornado()) {
      setTornadoUsed(true);
      setShowTornado(true);

      // Log original positions before shuffle
      const beforeShuffle = player1Hand.map((c, i) => ({ position: i, card: `${c.rank}${c.suit}`, id: c.id }));
      console.log('[TORNADO] Before shuffle:', beforeShuffle);

      // Fisher-Yates shuffle for true randomization
      const shuffled = [...player1Hand];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Log new positions after shuffle
      const afterShuffle = shuffled.map((c, i) => ({ position: i, card: `${c.rank}${c.suit}`, id: c.id }));
      console.log('[TORNADO] After shuffle:', afterShuffle);

      // IMPORTANT: We need to set the state and RETURN
      // This shuffles YOUR hand cards so you lose track of positions
      setPlayer1Hand(shuffled);
      setMessage("🌪️ TORNADO! Your cards have been shuffled!");

      // Bot discards its drawn card after using tornado and ends turn
      setDiscardPile(prev => [...prev, drawn]);

      // Hide tornado animation after delay, then pass to player
      setTimeout(() => {
        setShowTornado(false);
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        setMessage("Tornado complete! Your turn.");
      }, 1500);

      return; // Exit - turn ends after tornado
    }

    // Helper: Get unknown positions in bot's hand (accounts for reduced hand size)
    const getUnknownPositions = () => {
      const handSize = player2Hand.length;
      const knownIndices = botMemory.ownCards
        .filter(m => m.index < handSize && m.card && player2Hand[m.index]?.id === m.card.id) // Validate card identity
        .map(m => m.index);
      return Array.from({ length: handSize }, (_, i) => i)
        .filter(i => !knownIndices.includes(i));
    };

    // Helper: Get highest value known card in bot's hand (worst card to swap away)
    const getHighestKnownCard = () => {
      const validCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length && m.card && m.card.rank &&
        player2Hand[m.index]?.id === m.card.id // Validate card identity
      );
      if (validCards.length === 0) return null;
      return validCards.reduce((max, curr) =>
        getCardValue(curr.card.rank) > getCardValue(max.card.rank) ? curr : max
      );
    };

    // Helper: Get lowest value known card in bot's hand (best card to keep)
    const getLowestKnownCard = () => {
      const validCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length && m.card && m.card.rank &&
        player2Hand[m.index]?.id === m.card.id // Validate card identity
      );
      if (validCards.length === 0) return null;
      return validCards.reduce((min, curr) =>
        getCardValue(curr.card.rank) < getCardValue(min.card.rank) ? curr : min
      );
    };

    // Helper: Check if bot should try Match Discard (all modes)
    const tryMatchDiscard = () => {
      if (discardPile.length === 0) return false;

      const topDiscard = discardPile[discardPile.length - 1];
      // Filter valid cards before searching for match - also validate card identity
      const validOwnCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length &&
        m.card &&
        m.card.rank &&
        player2Hand[m.index]?.id === m.card.id // Verify card still at this position
      );

      // Find matching card, but EXCLUDE 7s (they're worth -1, too valuable to discard!)
      const matchingCard = validOwnCards.find(m =>
        m.card.rank === topDiscard.rank && getCardValue(m.card.rank) !== -1
      );

      if (matchingCard) {
        // Bot has a matching card! Discard it
        const matchIndex = matchingCard.index;
        const matchCard = player2Hand[matchIndex];

        // Safety check - verify actual card matches what we expect
        if (!matchCard || matchCard.rank !== topDiscard.rank) {
          console.log('[MATCH DISCARD] Memory mismatch - skipping', {
            expected: matchingCard.card.rank,
            actual: matchCard?.rank
          });
          return false;
        }

        console.log('[MATCH DISCARD] Bot discarding matching card', {
          matchRank: matchCard.rank,
          matchValue: getCardValue(matchCard.rank),
          position: matchIndex
        });

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
      } else if (topDiscard.rank === '7') {
        console.log('[MATCH DISCARD] Skipping 7 - too valuable to discard!');
      }
      return false;
    };

    // Helper: Get best position for Q/K swap
    // In Extreme mode: Bot "cheats" and knows all player cards - targets their BEST card
    // In Normal/Easy: Target positions player hasn't swapped (heuristic)
    const getBestSwapTarget = () => {
      // EXTREME MODE: Omniscient - find player's best card (lowest value)
      if (difficulty === "extreme") {
        let bestCard = null;
        let bestIndex = 0;
        player1Hand.forEach((card, index) => {
          const value = getCardValue(card.rank);
          if (!bestCard || value < getCardValue(bestCard.rank)) {
            bestCard = card;
            bestIndex = index;
          }
        });
        return bestIndex;
      }

      // NORMAL/EASY: STRATEGY: Target positions the player hasn't swapped
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
      if (sortedPositions.length > 0) {
        const leastSwappedCount = swapCounts[sortedPositions[0]] || 0;
        const bestPositions = sortedPositions.filter(p => (swapCounts[p] || 0) === leastSwappedCount);
        return bestPositions[Math.floor(Math.random() * bestPositions.length)];
      }
      // Random fallback
      return Math.floor(Math.random() * player1Hand.length);
    };

    const makeDecision = () => {
      // === MATCH DISCARD CHECK (Extreme only, before drawing action) ===
      if (tryMatchDiscard()) {
        setDiscardPile(prev => [...prev, drawn]);
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
        return;
      }

      // === JACK: Peek at own card ===
      if (drawn.rank === "J") {
        const unknownPositions = getUnknownPositions();
        if (unknownPositions.length > 0) {
          const peekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          const peekedCard = player2Hand[peekIndex];

          console.log('[JACK PEEK]', {
            peekIndex,
            peekedCard: peekedCard ? peekedCard.rank : 'undefined',
            peekedValue: peekedCard ? getCardValue(peekedCard.rank) : 'N/A'
          });

          setBotMemory(prev => ({
            ...prev,
            ownCards: [...prev.ownCards, { index: peekIndex, card: peekedCard }],
            discardHistory: [...prev.discardHistory, drawn],
          }));
          setMessage(`Bot used Jack to peek at card #${peekIndex + 1}. Your turn!`);
        } else {
          console.log('[JACK] No unknown cards to peek at');
          setMessage("Bot used Jack (already knows all cards). Your turn!");
        }
        setDiscardPile(prev => [...prev, drawn]);
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
        return;
      }

      // === QUEEN: Peek own (if unknown), peek opponent, optionally swap ===
      if (drawn.rank === "Q") {
        const unknownPositions = getUnknownPositions();

        // Step 1: Peek at own card if any are unknown
        let ownPeekIndex = null;
        let ownPeekedCard = null;

        if (unknownPositions.length > 0) {
          ownPeekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          ownPeekedCard = player2Hand[ownPeekIndex];

          if (ownPeekedCard) {
            setBotMemory(prev => ({
              ...prev,
              ownCards: [...prev.ownCards, { index: ownPeekIndex, card: ownPeekedCard }],
            }));
          }
        }

        // Step 2: Peek at opponent's card to make an informed decision
        const opponentIndex = getBestSwapTarget();
        const opponentCard = player1Hand[opponentIndex];

        // Safety check - if opponent card is undefined, just discard Queen
        if (!opponentCard) {
          setDiscardPile(prev => [...prev, drawn]);
          setMessage("Bot used Queen. Your turn!");
          botTurnInProgress.current = false;
          setCurrentPlayer(1);
          if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
          return;
        }

        const opponentValue = getCardValue(opponentCard.rank);

        // Step 3: Find the bot's worst card (highest value) that we know about
        // Start with ALL known cards from memory
        const allKnownCards = botMemory.ownCards.filter(m =>
          m.index < player2Hand.length && m.card && m.card.rank
        );

        // Add newly peeked card if not already in memory
        if (ownPeekedCard && ownPeekIndex !== null) {
          if (!allKnownCards.find(m => m.index === ownPeekIndex)) {
            allKnownCards.push({ index: ownPeekIndex, card: ownPeekedCard });
          }
        }

        // Find the worst (highest value) card in bot's hand that we know
        let worstKnownCard = null;
        if (allKnownCards.length > 0) {
          worstKnownCard = allKnownCards.reduce((worst, curr) =>
            getCardValue(curr.card.rank) > getCardValue(worst.card.rank) ? curr : worst
          );
        }

        // DEBUG: Log Queen decision info
        console.log('[QUEEN CHECK]', {
          opponentCard: opponentCard.rank,
          opponentValue,
          worstKnownCard: worstKnownCard ? worstKnownCard.card.rank : 'none',
          worstKnownValue: worstKnownCard ? getCardValue(worstKnownCard.card.rank) : 'N/A',
          allKnownCardsCount: allKnownCards.length,
          shouldSwap: worstKnownCard && opponentValue < getCardValue(worstKnownCard.card.rank)
        });

        // Decision: Swap if opponent's card is BETTER (lower value) than our worst known card
        const shouldSwap = worstKnownCard &&
          opponentValue < getCardValue(worstKnownCard.card.rank);

        if (shouldSwap && worstKnownCard) {
          const botSwapIndex = worstKnownCard.index;
          const botCard = player2Hand[botSwapIndex];

          console.log('[QUEEN SWAP]', {
            swapping: botCard.rank,
            for: opponentCard.rank
          });

          animateSwap(2, botSwapIndex, 1, opponentIndex, botCard, opponentCard, () => {
            const newP1Hand = [...player1Hand];
            const newP2Hand = [...player2Hand];
            newP2Hand[botSwapIndex] = { ...opponentCard, visible: false };
            newP1Hand[opponentIndex] = { ...botCard, visible: false };
            setPlayer1Hand(newP1Hand);
            setPlayer2Hand(newP2Hand);
            setDiscardPile(prev => [...prev, drawn]);
            setBotMemory(prev => ({
              ...prev,
              // Update memory: remove old card, add new opponent's card as known
              ownCards: prev.ownCards.filter(m => m.index !== botSwapIndex)
                .concat([{ index: botSwapIndex, card: opponentCard }]),
              discardHistory: [...prev.discardHistory, drawn],
            }));
            setMessage("Bot used Queen to swap cards! Your turn!");
            botTurnInProgress.current = false;
            setCurrentPlayer(1);
            if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
          });
          return;
        }

        // No beneficial swap found - just discard Queen
        setDiscardPile(prev => [...prev, drawn]);
        setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
        setMessage("Bot used Queen to peek. Your turn!");
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
        return;
      }

      // === KING: Peek both (own if unknown, always opponent), optionally swap ===
      if (drawn.rank === "K") {
        const unknownPositions = getUnknownPositions();

        // Step 1: Peek at own card if any are unknown
        let ownPeekIndex = null;
        let ownPeekedCard = null;

        if (unknownPositions.length > 0) {
          ownPeekIndex = unknownPositions[Math.floor(Math.random() * unknownPositions.length)];
          ownPeekedCard = player2Hand[ownPeekIndex];

          if (ownPeekedCard) {
            setBotMemory(prev => ({
              ...prev,
              ownCards: [...prev.ownCards, { index: ownPeekIndex, card: ownPeekedCard }],
            }));
          }
        }

        // Step 2: Peek at opponent's card to make an informed decision
        const opponentIndex = getBestSwapTarget();
        const opponentCard = player1Hand[opponentIndex];

        // Safety check - if opponent card is undefined, just discard King
        if (!opponentCard) {
          setDiscardPile(prev => [...prev, drawn]);
          setMessage("Bot used King. Your turn!");
          botTurnInProgress.current = false;
          setCurrentPlayer(1);
          if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
          return;
        }

        const opponentValue = getCardValue(opponentCard.rank);

        // Step 3: Find the bot's worst card (highest value) that we know about
        // Start with ALL known cards from memory
        const allKnownCards = botMemory.ownCards.filter(m =>
          m.index < player2Hand.length && m.card && m.card.rank
        );

        // Add newly peeked card if not already in memory
        if (ownPeekedCard && ownPeekIndex !== null) {
          if (!allKnownCards.find(m => m.index === ownPeekIndex)) {
            allKnownCards.push({ index: ownPeekIndex, card: ownPeekedCard });
          }
        }

        // Find the worst (highest value) card in bot's hand that we know
        let worstKnownCard = null;
        if (allKnownCards.length > 0) {
          worstKnownCard = allKnownCards.reduce((worst, curr) =>
            getCardValue(curr.card.rank) > getCardValue(worst.card.rank) ? curr : worst
          );
        }

        // DEBUG: Log King decision info
        console.log('[KING CHECK]', {
          opponentCard: opponentCard.rank,
          opponentValue,
          worstKnownCard: worstKnownCard ? worstKnownCard.card.rank : 'none',
          worstKnownValue: worstKnownCard ? getCardValue(worstKnownCard.card.rank) : 'N/A',
          allKnownCardsCount: allKnownCards.length,
          shouldSwap: worstKnownCard && opponentValue < getCardValue(worstKnownCard.card.rank)
        });

        // Decision: Swap if opponent's card is BETTER (lower value) than our worst known card
        const shouldSwap = worstKnownCard &&
          opponentValue < getCardValue(worstKnownCard.card.rank);

        if (shouldSwap && worstKnownCard) {
          const botSwapIndex = worstKnownCard.index;
          const botCard = player2Hand[botSwapIndex];

          console.log('[KING SWAP]', {
            swapping: botCard.rank,
            for: opponentCard.rank
          });

          animateSwap(2, botSwapIndex, 1, opponentIndex, botCard, opponentCard, () => {
            const newP1Hand = [...player1Hand];
            const newP2Hand = [...player2Hand];
            newP2Hand[botSwapIndex] = { ...opponentCard, visible: false };
            newP1Hand[opponentIndex] = { ...botCard, visible: false };
            setPlayer1Hand(newP1Hand);
            setPlayer2Hand(newP2Hand);
            setDiscardPile(prev => [...prev, drawn]);
            setBotMemory(prev => ({
              ...prev,
              // Update memory: remove old card, add new opponent's card as known
              ownCards: prev.ownCards.filter(m => m.index !== botSwapIndex)
                .concat([{ index: botSwapIndex, card: opponentCard }]),
              discardHistory: [...prev.discardHistory, drawn],
            }));
            setMessage("Bot used King to swap cards! Your turn!");
            botTurnInProgress.current = false;
            setCurrentPlayer(1);
            if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
          });
          return;
        }

        // No beneficial swap found - just discard King
        setDiscardPile(prev => [...prev, drawn]);
        setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
        setMessage("Bot used King to peek. Your turn!");
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 500);
        return;
      }

      // === NORMAL CARD DECISION ===
      const drawnValue = getCardValue(drawn.rank);
      let shouldSwap = false;
      let swapIndex = -1;

      // ALL MODES: Smart swap decisions
      // (Easy mode uses same logic, just never calls Chukrum)
      {
        const highestKnown = getHighestKnownCard();
        const lowestKnown = getLowestKnownCard();
        const turnCount = botMemory.turnCount || 0;
        const unknownCount = getUnknownPositions().length;

        // Early game strategy (turns 1-4): More willing to swap to learn hand
        const isEarlyGame = turnCount <= 4;

        // Calculate average known card value to judge hand quality - validate card identity
        const validCards = botMemory.ownCards.filter(m =>
          m.index < player2Hand.length && m.card && m.card.rank &&
          player2Hand[m.index]?.id === m.card.id // Validate card identity
        );
        const avgKnownValue = validCards.length > 0
          ? validCards.reduce((sum, m) => sum + getCardValue(m.card.rank), 0) / validCards.length
          : 5;

        // Helper: Find duplicate cards in bot's memory - validate card identity
        const findDuplicates = () => {
          const rankCounts = {};
          botMemory.ownCards.forEach(m => {
            if (m.card && m.card.rank && m.index < player2Hand.length &&
              player2Hand[m.index]?.id === m.card.id) { // Validate card identity
              if (!rankCounts[m.card.rank]) {
                rankCounts[m.card.rank] = [];
              }
              rankCounts[m.card.rank].push(m);
            }
          });
          // Return ranks that have 2+ cards
          return Object.entries(rankCounts)
            .filter(([rank, cards]) => cards.length >= 2)
            .map(([rank, cards]) => ({ rank, cards, value: getCardValue(rank) }));
        };

        // PRIORITY 0a: MATCH COMBO TACTIC - Swap one duplicate to trigger match discard of the other!
        // If drawn card is significantly better (3+ points) than duplicate, swap one duplicate
        // This makes the duplicate go to discard pile, allowing immediate match of the other
        const duplicates = findDuplicates();
        if (duplicates.length > 0 && !shouldSwap) {
          // Find the best duplicate to break up (highest value = most points saved)
          const sortedDuplicates = [...duplicates].sort((a, b) => b.value - a.value);

          for (const dup of sortedDuplicates) {
            const duplicateValue = dup.value;
            // Only do this if drawn card is at least 3 points better than the duplicate
            // This ensures we save significant points: 
            // e.g., Two 5s (10 pts) → drawn 2 (2 pts) + match discard the other 5 = save 8 pts
            if (drawnValue <= duplicateValue - 3) {
              // Swap one of the duplicates - we'll match the other after swap
              shouldSwap = true;
              swapIndex = dup.cards[0].index; // Take first duplicate
              // Store info for after-swap match
              window._matchComboTargetIndex = dup.cards[1].index; // Index of OTHER duplicate
              window._matchComboRank = dup.rank;
              console.log('[MATCH COMBO TACTIC]', {
                duplicateRank: dup.rank,
                duplicateValue,
                swappingIn: drawn.rank,
                drawnValue,
                pointsSaved: (duplicateValue * 2) - drawnValue, // Both duplicates removed, drawn added
                otherDuplicateIndex: dup.cards[1].index
              });
              break;
            }
          }
        }

        // PRIORITY 0b: Duplicate preserve tactic - swap non-duplicate high card to keep match potential
        if (duplicates.length > 0 && drawnValue <= 6 && !shouldSwap) {
          // Find a non-duplicate high card to swap out
          const duplicateIndices = duplicates.flatMap(d => d.cards.map(c => c.index));
          const nonDuplicateHighCard = botMemory.ownCards
            .filter(m => !duplicateIndices.includes(m.index) && m.card && m.index < player2Hand.length)
            .sort((a, b) => getCardValue(b.card.rank) - getCardValue(a.card.rank))[0];

          if (nonDuplicateHighCard && drawnValue < getCardValue(nonDuplicateHighCard.card.rank)) {
            shouldSwap = true;
            swapIndex = nonDuplicateHighCard.index;
            console.log('[DUPLICATE PRESERVE TACTIC]', {
              duplicateRanks: duplicates.map(d => d.rank),
              swappingOut: nonDuplicateHighCard.card.rank,
              swappingIn: drawn.rank
            });
          }
        }

        // PRIORITY 1: Swap excellent cards (A, 2, 3, 7) - always take these
        if (!shouldSwap && (drawnValue <= 3 || drawnValue === -1)) {
          if (unknownCount > 0) {
            // Prefer unknown positions - might replace a face card!
            shouldSwap = true;
            const unknownPositions = getUnknownPositions();
            swapIndex = unknownPositions[0];
            console.log('[SMART SWAP] Priority 1a: Excellent card into unknown position', {
              drawn: drawn.rank,
              position: swapIndex
            });
          } else if (highestKnown && drawnValue < getCardValue(highestKnown.card.rank)) {
            // All cards known - replace worst known
            shouldSwap = true;
            swapIndex = highestKnown.index;
            console.log('[SMART SWAP] Priority 1b: Excellent card replacing worst known (all known)', {
              drawn: drawn.rank,
              replacing: highestKnown.card.rank
            });
          }
          // If we know all cards and drawn isn't better than worst, don't swap
        }
        // PRIORITY 2: Swap into unknown positions first (higher upside potential)
        else if (!shouldSwap && unknownCount > 0) {
          // Unknown cards could be face cards (10-13), so swapping there has more upside
          // In early game: accept cards up to 8
          // In late game: only accept cards up to 6
          const threshold = isEarlyGame ? 8 : 6;

          if (drawnValue <= threshold) {
            shouldSwap = true;
            const unknownPositions = getUnknownPositions();
            swapIndex = unknownPositions[0];
            console.log('[SMART SWAP] Priority 2: Decent card into unknown (high upside)', {
              drawn: drawn.rank,
              threshold,
              isEarlyGame,
              position: swapIndex
            });
          }
        }
        // PRIORITY 3: Replace known high card with lower (only if all cards known)
        else if (!shouldSwap && unknownCount === 0 && highestKnown && drawnValue < getCardValue(highestKnown.card.rank)) {
          shouldSwap = true;
          swapIndex = highestKnown.index;
          console.log('[SMART SWAP] Priority 3: Replacing high card (all cards known)', {
            drawn: drawn.rank,
            drawnValue,
            replacing: highestKnown.card.rank,
            replacingValue: getCardValue(highestKnown.card.rank)
          });
        }
        // DON'T SWAP: If drawn card isn't better than our known cards
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

          // MATCH COMBO FOLLOW-UP: If this was a Match Combo, immediately match the other duplicate!
          if (window._matchComboTargetIndex !== undefined && window._matchComboRank !== undefined) {
            const matchIndex = window._matchComboTargetIndex;
            const matchRank = window._matchComboRank;
            // Adjust index if the swap was at a lower index
            const adjustedMatchIndex = matchIndex > swapIndex ? matchIndex : matchIndex;

            // The replaced card (duplicate) is now on discard pile
            // Match the OTHER duplicate against it
            setTimeout(() => {
              const currentHand = [...newBotHand];
              const matchCard = currentHand[adjustedMatchIndex];

              if (matchCard && matchCard.rank === matchRank) {
                // Remove the matched card from hand
                const finalHand = currentHand.filter((_, i) => i !== adjustedMatchIndex);
                setPlayer2Hand(finalHand);
                setDiscardPile(prev => [...prev, matchCard]);
                setBotMemory(prev => ({
                  ...prev,
                  ownCards: prev.ownCards.filter(m => m.index !== adjustedMatchIndex)
                    .map(m => ({ ...m, index: m.index > adjustedMatchIndex ? m.index - 1 : m.index })),
                  discardHistory: [...prev.discardHistory, matchCard],
                }));
                setMessage(`Bot COMBO! Matched ${matchCard.rank}${matchCard.suit}! Your turn!`);
                console.log('[MATCH COMBO COMPLETE]', { matchedRank: matchRank });
              }

              // Clean up
              delete window._matchComboTargetIndex;
              delete window._matchComboRank;
            }, 500);
          } else {
            setMessage(`Bot swapped card #${swapIndex + 1}. Your turn!`);
          }

          setCurrentPlayer(1);
          botTurnInProgress.current = false;
          if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 1500);
        }, 2000); // Increased timing for readability
      } else {
        // Show what card is being discarded with a delay
        setMessage(`Bot drew ${drawn.rank}${drawn.suit}, discarding...`);
        setTimeout(() => {
          setDiscardPile(prev => [...prev, drawn]);
          setBotMemory(prev => ({ ...prev, discardHistory: [...prev.discardHistory, drawn] }));
          setMessage("Bot discarded. Your turn!");
          botTurnInProgress.current = false;
          setCurrentPlayer(1);
          if (gamePhase === "finalRound" && chukrumCaller === 1) setTimeout(() => endGame(), 1000);
        }, 1000); // 1 second delay to show the drawn card
      }
    };

    // === CHUKRUM DECISION ===
    if (gamePhase === "playing" && chukrumCaller === null) {
      // Filter to only valid card entries - VALIDATE CARD IDENTITY to prevent stale memory
      const validKnownCards = botMemory.ownCards.filter(m =>
        m.index < player2Hand.length &&
        m.card &&
        m.card.rank &&
        player2Hand[m.index]?.id === m.card.id // Verify card still at this position
      );
      const knownScore = validKnownCards.reduce((sum, m) => sum + getCardValue(m.card.rank), 0);
      const unknownCount = player2Hand.length - validKnownCards.length;

      let shouldCallChukrum = false;

      if (difficulty === "easy") {
        // Easy: Never calls Chukrum
        shouldCallChukrum = false;
      } else {
        // Normal & Extreme: Strategic Chukrum calling - different rules for early vs late game
        const handSize = player2Hand.length;
        const turnCount = botMemory.turnCount || 0;

        // Calculate the actual total score of bot's hand
        const actualBotScore = player2Hand.reduce((sum, card) => sum + getCardValue(card.rank), 0);

        // Define early game as less than 5 bot turns
        const isEarlyGame = turnCount < 5;

        // Check for improvable duplicates (any duplicates except 7s)
        // If bot has these, it might be worth waiting for a Match Combo opportunity
        // Even Aces can be improved: Two As (2 pts) → draw 7, swap for A, match other A → just 7 (-1 pt)
        const rankCounts = {};
        validKnownCards.forEach(m => {
          if (m.card && m.card.rank) {
            rankCounts[m.card.rank] = (rankCounts[m.card.rank] || 0) + 1;
          }
        });

        // Find duplicates that could be improved (everything except 7s)
        // - Two 2s could become A + match = 1 point (save 3 pts)
        // - Two As could become 7 + match = -1 point (save 3 pts)
        const improvableDuplicates = Object.entries(rankCounts)
          .filter(([rank, count]) => {
            const value = getCardValue(rank);
            return count >= 2 && value !== -1; // Only exclude 7s (value -1), include Aces
          });

        const hasImprovableDuplicates = improvableDuplicates.length > 0;
        const deckRemaining = newDeck.length;

        // DEBUG: Log Chukrum decision info
        console.log('[CHUKRUM CHECK]', {
          handSize,
          turnCount,
          isEarlyGame,
          validKnownCards: validKnownCards.length,
          knownScore,
          unknownCount,
          actualBotScore,
          hasImprovableDuplicates,
          improvableDuplicates: improvableDuplicates.map(([rank]) => rank),
          deckRemaining
        });

        if (isEarlyGame) {
          // === EARLY GAME (< 5 bot turns): Can take calculated risks ===
          // Call if bot knows at least 3 cards (all but one) AND known cards sum to ≤ 5
          // The 1 unknown card averages ~5, so expected total ≤ 10
          if (validKnownCards.length >= handSize - 1 && unknownCount <= 1 && knownScore <= 4) {
            // BUT delay if we have improvable duplicates and deck still has cards
            if (hasImprovableDuplicates && deckRemaining > 10) {
              console.log('[CHUKRUM] Delayed: EARLY GAME - waiting for Match Combo opportunity', {
                duplicates: improvableDuplicates.map(([rank]) => rank)
              });
            } else {
              console.log('[CHUKRUM] Triggered: EARLY GAME - knows most cards with low score');
              shouldCallChukrum = true;
            }
          }
        } else {
          // === LATE GAME (≥ 5 bot turns): Must be certain ===
          // Can ONLY call if bot knows ALL cards AND actual score is ≤ 3
          if (validKnownCards.length === handSize && actualBotScore <= 3) {
            // BUT delay if we have improvable duplicates and deck still has plenty of cards
            if (hasImprovableDuplicates && deckRemaining > 15) {
              console.log('[CHUKRUM] Delayed: LATE GAME - waiting for Match Combo opportunity', {
                duplicates: improvableDuplicates.map(([rank]) => rank)
              });
            } else {
              console.log('[CHUKRUM] Triggered: LATE GAME - knows all cards with very low score');
              shouldCallChukrum = true;
            }
          }
        }
      }

      if (shouldCallChukrum) {
        console.log('[CHUKRUM] Calling Chukrum now!');
        setChukrumCaller(2);
        setGamePhase("finalRound");
        setMessage("Bot calls CHUKRUM! You get one final turn.");
        botTurnInProgress.current = false;
        setCurrentPlayer(1);
        return;
      }
    }

    setTimeout(makeDecision, 800);
  }, [deck, player1Hand, player2Hand, botMemory, gamePhase, chukrumCaller, endGame, difficulty, discardPile, animateSwap, currentPlayer]);

  // Store botTurn in ref to prevent useEffect re-running when function recreates
  const latestBotTurnRef = useRef(botTurn);
  useEffect(() => {
    latestBotTurnRef.current = botTurn;
  }, [botTurn]);

  // Auto-trigger bot turn when it's the bot's turn
  useEffect(() => {
    const isValidPhase = gamePhase === "playing" || gamePhase === "finalRound";

    // Don't trigger until game has been properly initialized
    if (!gameStarted.current) return;

    // Check all conditions including the guard
    if (currentPlayer === 2 && isValidPhase && !drawnCard && !botTurnInProgress.current) {
      const timer = setTimeout(() => {
        latestBotTurnRef.current();
      }, 1200);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [currentPlayer, gamePhase, drawnCard]); // NO botTurn dependency!

  // Check if any player's hand is empty - end game immediately
  // Only check after game has properly started (gameStarted ref is true)
  useEffect(() => {
    // Don't trigger until game has been properly initialized
    if (!gameStarted.current) return;

    if (gamePhase === "playing" && (player1Hand.length === 0 || player2Hand.length === 0)) {
      setMessage("A player has no cards left! Game ends!");
      setTimeout(() => endGame(), 500);
    }
  }, [player1Hand.length, player2Hand.length, gamePhase, endGame]);

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

        {/* Multi-match Score Display */}
        {targetScore !== null && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold shadow-lg bg-gradient-to-r from-purple-500 to-indigo-600">
            <span>Match {matchNumber}</span>
            <span className="text-white/60">|</span>
            <span className="text-green-300">You: {cumulativeP1Score}</span>
            <span className="text-white/60">-</span>
            <span className="text-red-300">Bot: {cumulativeP2Score}</span>
            <span className="text-white/60">/ {targetScore}</span>
          </div>
        )}
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
              {specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent && "Click ANY card (yours or opponent's) to peek:"}
              {specialAction === "queenAction" && hasPeekedOwn && "Click an OPPONENT's card to swap, or Discard:"}
              {specialAction === "queenAction" && hasPeekedOpponent && "Click ONE OF YOUR cards to swap, or Discard:"}
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
            {(specialAction === "queenAction") || (specialAction === "kingAction") ? (
              <div className="mt-6 bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-purple-500/30">
                <p className="text-sm text-purple-300 mb-3 font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                  Opponent's cards {specialAction === "queenAction" && hasPeekedOwn ? "(click to swap)" : specialAction === "queenAction" ? "(click to peek)" : hasPeekedOpponent ? "(peeked)" : "(click to peek)"}:
                </p>
                <div className="flex gap-3 justify-center">
                  {player2Hand.map((card, i) => {
                    const isPeeked = isCardPeeked(2, i);
                    const canClick = (specialAction === "queenAction" && hasPeekedOwn) ||
                      (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) ||
                      (specialAction === "kingAction" && !hasPeekedOpponent);
                    return (
                      <motion.button
                        key={card.id + i}
                        whileHover={canClick ? { scale: 1.05 } : {}}
                        onClick={() => {
                          if (specialAction === "queenAction" && hasPeekedOwn) handleQueenSwapWithOpponent(i);
                          else if (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) handleQueenPeekOpponent(i);
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
                Your cards {specialAction === "none" ? "(click to swap)" : (specialAction === "queenAction" && hasPeekedOpponent) ? "(click to swap)" : hasPeekedOwn ? "(peeked)" : "(click to peek)"}:
              </p>
              <div className="flex gap-3 justify-center">
                {player1Hand.map((card, i) => {
                  const isPeeked = isCardPeeked(1, i);
                  const canClick = (specialAction === "none") ||
                    (specialAction === "jackPeek" && !hasPeekedOwn) ||
                    (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) ||
                    (specialAction === "queenAction" && hasPeekedOpponent) ||
                    (specialAction === "kingAction" && !hasPeekedOwn);

                  return (
                    <motion.button
                      key={card.id + i}
                      whileHover={canClick ? { scale: 1.05 } : {}}
                      onClick={() => {
                        if (specialAction === "jackPeek" && !hasPeekedOwn) handleJackPeek(i);
                        else if (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) handleQueenPeekOwn(i);
                        else if (specialAction === "queenAction" && hasPeekedOpponent) handleQueenSwapWithOwn(i);
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

      {/* Tornado Animation Overlay (Extreme mode) */}
      <AnimatePresence>
        {showTornado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-50"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="text-9xl mb-6"
            >
              🌪️
            </motion.div>
            <motion.h2
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-4xl font-bold text-white bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
            >
              TORNADO!
            </motion.h2>
            <p className="text-xl text-gray-300 mt-4">Your cards are being shuffled...</p>
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
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 overflow-y-auto p-4"
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
              className="text-center max-w-lg"
            >
              {/* Calculate winner FRESH here to match displayed scores */}
              {(() => {
                const p1Score = calculateScore(player1Hand);
                const p2Score = calculateScore(player2Hand);
                const matchWinner = p1Score < p2Score ? 1 : p2Score < p1Score ? 2 : 0;
                const isSeriesOver = seriesWinner !== null;
                const seriesContinues = targetScore !== null && !isSeriesOver;

                return (
                  <>
                    {/* Series Winner or Match Winner */}
                    <Trophy className={`w-20 h-20 mx-auto mb-3 ${isSeriesOver
                      ? (seriesWinner === 1 ? "text-yellow-400" : seriesWinner === 2 ? "text-gray-400" : "text-blue-400")
                      : (matchWinner === 1 ? "text-yellow-400" : matchWinner === 2 ? "text-gray-400" : "text-blue-400")
                      }`} />

                    <h2 className="text-3xl sm:text-4xl font-extrabold mb-2 bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                      {isSeriesOver
                        ? (seriesWinner === 1 ? "🏆 YOU WIN THE SERIES!" : seriesWinner === 2 ? "💀 BOT WINS THE SERIES!" : "🤝 SERIES TIE!")
                        : (matchWinner === 1 ? "Match Won!" : matchWinner === 2 ? "Match Lost!" : "Match Tied!")
                      }
                    </h2>

                    {/* Multi-match info */}
                    {targetScore !== null && (
                      <p className="text-gray-400 text-sm mb-3">
                        {isSeriesOver
                          ? `Series complete after ${matchNumber} matches (First to ${targetScore} loses)`
                          : `Match ${matchNumber} of series (First to ${targetScore} loses)`
                        }
                      </p>
                    )}
                  </>
                );
              })()}

              {/* Score Display */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4">
                {/* Match Score */}
                <div className="flex gap-8 justify-center mb-3">
                  <div className="text-center">
                    <p className="text-gray-400 text-xs mb-1">Match Score</p>
                    <p className="text-2xl font-bold text-green-400">{calculateScore(player1Hand)}</p>
                    <p className="text-gray-400 text-xs">You</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-xs mb-1">Match Score</p>
                    <p className="text-2xl font-bold text-red-400">{calculateScore(player2Hand)}</p>
                    <p className="text-gray-400 text-xs">Bot</p>
                  </div>
                </div>

                {/* Cumulative Score (multi-match only) */}
                {targetScore !== null && (
                  <>
                    <div className="border-t border-white/20 my-3"></div>
                    <div className="flex gap-8 justify-center">
                      <div className="text-center">
                        <p className="text-gray-400 text-xs mb-1">Total</p>
                        <p className={`text-3xl font-bold ${cumulativeP1Score >= targetScore ? "text-red-500" : "text-green-300"}`}>
                          {cumulativeP1Score}
                        </p>
                        {cumulativeP1Score >= targetScore && <p className="text-red-400 text-xs">Target reached!</p>}
                      </div>
                      <div className="text-gray-500 text-2xl self-center">vs</div>
                      <div className="text-center">
                        <p className="text-gray-400 text-xs mb-1">Total</p>
                        <p className={`text-3xl font-bold ${cumulativeP2Score >= targetScore ? "text-red-500" : "text-red-300"}`}>
                          {cumulativeP2Score}
                        </p>
                        {cumulativeP2Score >= targetScore && <p className="text-red-400 text-xs">Target reached!</p>}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Match History (multi-match only) */}
              {targetScore !== null && matchHistory.length > 0 && (
                <div className="bg-white/5 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto">
                  <p className="text-gray-400 text-xs mb-2">Match History</p>
                  <div className="space-y-1 text-sm">
                    {matchHistory.map((m, i) => (
                      <div key={i} className="flex justify-between text-gray-300">
                        <span>Match {m.match}</span>
                        <span>
                          <span className={m.p1Score < m.p2Score ? "text-green-400" : m.p1Score > m.p2Score ? "text-red-400" : "text-gray-400"}>
                            You: {m.p1Score}
                          </span>
                          {" | "}
                          <span className={m.p2Score < m.p1Score ? "text-green-400" : m.p2Score > m.p1Score ? "text-red-400" : "text-gray-400"}>
                            Bot: {m.p2Score}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-gray-400 text-xs mb-4">Click ✕ to view the bot's cards</p>

              <div className="flex gap-3 justify-center flex-wrap">
                {/* Next Match button (only if series continues) */}
                {targetScore !== null && seriesWinner === null && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={startNextMatch}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2"
                  >
                    ▶ Next Match
                  </motion.button>
                )}

                {/* Play Again (starts fresh series or single match) */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startNewGame}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" /> {targetScore !== null && seriesWinner === null ? "Restart Series" : "Play Again"}
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/home")}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" /> Home
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