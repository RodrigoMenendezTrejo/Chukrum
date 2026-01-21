import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shuffle, Trophy, Trash2, Eye, RefreshCw, Zap, Users, MessageCircle, Send, X } from "lucide-react";
import { auth, db } from "./firebase";
import { doc, onSnapshot, updateDoc, deleteDoc, increment, addDoc, collection } from "firebase/firestore";
import toast from "react-hot-toast";

// ============ CARD HELPERS (identical to Game.jsx) ============
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const getCardValue = (rank) => {
    if (rank === "7") return -1;
    if (rank === "A") return 1;
    if (rank === "J") return 11;
    if (rank === "Q") return 12;
    if (rank === "K") return 13;
    return parseInt(rank);
};

const calculateScore = (hand) => {
    if (!hand || !Array.isArray(hand)) return 0;
    return hand.reduce((sum, card) => sum + getCardValue(card.rank), 0);
};

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

const isSpecialCard = (rank) => ["J", "Q", "K"].includes(rank);

// ============ MAIN COMPONENT ============
export default function MultiplayerGame() {
    const navigate = useNavigate();
    const location = useLocation();

    // Get game info from navigation state
    const gameId = location.state?.gameId;
    const isHost = location.state?.isHost ?? false;
    const targetScore = location.state?.targetScore || null;

    // Game state from Firestore
    const [gameData, setGameData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Local UI state (not synced)
    const [drawnCard, setDrawnCard] = useState(null);
    const [message, setMessage] = useState("Loading game...");
    const [specialAction, setSpecialAction] = useState("none");
    const [peekedCard, setPeekedCard] = useState(null);
    const [opponentPeekedCard, setOpponentPeekedCard] = useState(null);
    const [hasPeekedOwn, setHasPeekedOwn] = useState(false);
    const [hasPeekedOpponent, setHasPeekedOpponent] = useState(false);
    const [selectedOwnIndex, setSelectedOwnIndex] = useState(null);
    const [showResultsPopup, setShowResultsPopup] = useState(false); // Delay before showing
    const [cardsRevealed, setCardsRevealed] = useState(false); // Delay before flipping cards
    const [swapAnimation, setSwapAnimation] = useState(null);
    const [statsUpdated, setStatsUpdated] = useState(false); // Prevent duplicate stat updates
    const [rematchPending, setRematchPending] = useState(false); // Waiting for opponent to accept rematch
    const [chatOpen, setChatOpen] = useState(false); // Chat panel visibility
    const [chatMessages, setChatMessages] = useState([]); // Chat messages array
    const [chatInput, setChatInput] = useState(""); // Current chat input
    const [opponentDisconnected, setOpponentDisconnected] = useState(false); // Disconnect detection
    const [unreadMessages, setUnreadMessages] = useState(0); // Unread chat count
    const [nextRoundPending, setNextRoundPending] = useState(false); // Track if we're waiting for next round button

    // ============ RESET STATE ON GAME ID CHANGE (for rematches) ============
    useEffect(() => {
        // Reset all game-session-specific state when navigating to a new game
        setLoading(true);
        setError(null);
        setGameData(null);
        setDrawnCard(null);
        setMessage("Loading game...");
        setSpecialAction("none");
        setPeekedCard(null);
        setOpponentPeekedCard(null);
        setHasPeekedOwn(false);
        setHasPeekedOpponent(false);
        setSelectedOwnIndex(null);
        setShowResultsPopup(false);
        setCardsRevealed(false);
        setSwapAnimation(null);
        setStatsUpdated(false);
        setRematchPending(false);
        setChatOpen(false);
        setChatMessages([]);
        setChatInput("");
        setOpponentDisconnected(false);
        setUnreadMessages(0);
        setNextRoundPending(false);
        // Reset refs when switching games
        lastSeenMatchNumber.current = 1;
    }, [gameId]);

    // Refs for card positions (for animations)
    const p1Refs = useRef([]);
    const p2Refs = useRef([]);
    const drawPileRef = useRef(null);
    const matchNumberRef = useRef(1); // Track current match number to guard stale callbacks
    const gameIdRef = useRef(gameId); // Track current gameId to guard stale callbacks after rematch
    const lastSeenMatchNumber = useRef(1); // Track for detecting new round starts

    // Keep gameIdRef in sync
    useEffect(() => {
        gameIdRef.current = gameId;
    }, [gameId]);

    // Derived state
    const myUid = auth.currentUser?.uid;
    const amIHost = gameData?.hostUid === myUid;
    const myHand = amIHost ? (gameData?.hostHand || []) : (gameData?.guestHand || []);
    const opponentHand = amIHost ? (gameData?.guestHand || []) : (gameData?.hostHand || []);
    const isMyTurn = gameData?.currentTurn === myUid;
    const opponentEmail = amIHost ? gameData?.guestEmail : gameData?.hostEmail;
    const myEmail = amIHost ? gameData?.hostEmail : gameData?.guestEmail;
    const deck = gameData?.deck || [];
    const discardPile = gameData?.discardPile || [];
    const gamePhase = gameData?.status || "loading";

    // ============ SUBSCRIBE TO GAME ============
    useEffect(() => {
        if (!gameId) {
            setError("No game ID provided");
            setLoading(false);
            return;
        }

        const gameRef = doc(db, "games", gameId);
        const unsubscribe = onSnapshot(gameRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setGameData(data);
                setLoading(false);

                // Update message based on game state
                if (data.status === "active" || data.status === "finalRound") {
                    // Update match number ref to invalidate any pending setTimeout callbacks
                    matchNumberRef.current = data.matchNumber || 1;

                    // Reset round-specific UI state when a new round starts
                    // This handles new rounds in target score mode and rematches
                    // Use match number change detection for reliability (fixes timing issues)
                    const currentMatchNumber = data.matchNumber || 1;
                    const isNewRound = currentMatchNumber !== lastSeenMatchNumber.current;

                    if (isNewRound || cardsRevealed) {
                        lastSeenMatchNumber.current = currentMatchNumber;
                        setCardsRevealed(false);
                        setShowResultsPopup(false);
                        setNextRoundPending(false);
                        setDrawnCard(null);
                        setSpecialAction("none");
                        setPeekedCard(null);
                        setOpponentPeekedCard(null);
                        setHasPeekedOwn(false);
                        setHasPeekedOpponent(false);
                        setSelectedOwnIndex(null);
                        setStatsUpdated(false);
                    }

                    if (data.currentTurn === myUid) {
                        if (!drawnCard) {
                            // Show what opponent did, then prompt for action
                            const lastAction = data.lastAction;
                            if (lastAction && lastAction.by !== myUid) {
                                setMessage(`${lastAction.text} — Your turn! Draw a card.`);
                            } else {
                                setMessage("Your turn! Draw a card from the deck.");
                            }
                        }
                    } else {
                        setMessage(`Waiting for ${opponentEmail?.split('@')[0] || 'opponent'} to play...`);
                    }
                } else if (data.status === "ended") {
                    // Capture current game identifiers to detect if game changes before timeout
                    const capturedGameId = gameId;
                    const currentMatch = data.matchNumber || 1;
                    matchNumberRef.current = currentMatch;

                    // Delay message to allow any last-second match discards to be visible
                    setTimeout(() => {
                        // Only update if still on same game AND same match
                        if (gameIdRef.current === capturedGameId && matchNumberRef.current === currentMatch) {
                            setMessage("Round Over! Calculating scores...");
                        }
                    }, 100);

                    // Show final result after 2 seconds
                    setTimeout(async () => {
                        const hostScore = calculateScore(data.hostHand);
                        const guestScore = calculateScore(data.guestHand);
                        const iAmHost = data.hostUid === myUid;
                        const myRoundScore = iAmHost ? hostScore : guestScore;
                        const theirRoundScore = iAmHost ? guestScore : hostScore;

                        // For target score mode: track cumulative points
                        if (targetScore) {
                            const newHostCumulative = (data.hostCumulativeScore || 0) + hostScore;
                            const newGuestCumulative = (data.guestCumulativeScore || 0) + guestScore;

                            // Update cumulative scores in Firestore (host does this)
                            if (iAmHost && !data.cumulativeUpdated) {
                                const gameRef = doc(db, "games", gameId);
                                await updateDoc(gameRef, {
                                    hostCumulativeScore: newHostCumulative,
                                    guestCumulativeScore: newGuestCumulative,
                                    cumulativeUpdated: true
                                });
                            }

                            const myCumulative = iAmHost ? newHostCumulative : newGuestCumulative;
                            const theirCumulative = iAmHost ? newGuestCumulative : newHostCumulative;

                            // Check if series is over (first to reach target LOSES)
                            if (newHostCumulative >= targetScore || newGuestCumulative >= targetScore) {
                                // Series over!
                                if (myCumulative >= targetScore && theirCumulative >= targetScore) {
                                    // Both reached - lower wins
                                    if (myCumulative < theirCumulative) {
                                        setMessage(`🏆 YOU WIN THE SERIES! (${myCumulative} vs ${theirCumulative})`);
                                    } else if (theirCumulative < myCumulative) {
                                        setMessage(`💀 YOU LOST THE SERIES! (${myCumulative} vs ${theirCumulative})`);
                                    } else {
                                        setMessage(`🤝 SERIES TIE! (Both: ${myCumulative})`);
                                    }
                                } else if (myCumulative >= targetScore) {
                                    setMessage(`💀 YOU LOST THE SERIES! You hit ${targetScore} first. (${myCumulative} vs ${theirCumulative})`);
                                } else {
                                    setMessage(`🏆 YOU WIN THE SERIES! Opponent hit ${targetScore} first. (${myCumulative} vs ${theirCumulative})`);
                                }
                            } else {
                                // Series continues - show next round button
                                const roundWinner = myRoundScore < theirRoundScore ? "🏆 You won this round!" :
                                    theirRoundScore < myRoundScore ? "💀 You lost this round!" :
                                        "🤝 Round tied!";
                                setMessage(`${roundWinner} Click Next Round to continue! (Total: ${myCumulative} vs ${theirCumulative})`);
                                setNextRoundPending(true);
                            }
                        } else {
                            // No target score - simple single game result
                            if (myRoundScore < theirRoundScore) {
                                setMessage(`🏆 You win! (${myRoundScore} vs ${theirRoundScore})`);
                            } else if (theirRoundScore < myRoundScore) {
                                setMessage(`💀 You lost! (${myRoundScore} vs ${theirRoundScore})`);
                            } else {
                                setMessage(`🤝 It's a tie! (Both: ${myRoundScore})`);
                            }
                        }

                        // Reveal cards and show results popup (only if still on same game AND match)
                        if (gameIdRef.current === capturedGameId && matchNumberRef.current === currentMatch) {
                            setCardsRevealed(true);
                            setShowResultsPopup(true);
                        }
                    }, 2000);
                }
            } else {
                setError("Game not found or was deleted");
                setLoading(false);
            }
        }, (err) => {
            console.error("Game listener error:", err);
            setError("Failed to load game");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [gameId, myUid, drawnCard]);

    // ============ INITIALIZE GAME (Host only, once) ============
    useEffect(() => {
        if (!gameData || !amIHost || gameData.deck) return;

        const initializeGame = async () => {
            const newDeck = createDeck();
            const hostHand = newDeck.slice(0, 4).map(c => ({ ...c, visible: false }));
            const guestHand = newDeck.slice(4, 8).map(c => ({ ...c, visible: false }));
            const remainingDeck = newDeck.slice(8);

            // Determine who starts: use iStartFirst from location state (rematch) or default to host
            const iStartFirst = location.state?.iStartFirst;
            const firstPlayer = iStartFirst !== undefined
                ? (iStartFirst ? gameData.hostUid : gameData.guestUid)
                : gameData.hostUid;

            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, {
                hostHand,
                guestHand,
                deck: remainingDeck,
                discardPile: [],
                status: "active",
                currentTurn: firstPlayer,
                firstTurn: firstPlayer, // Track who started for rematch alternation
            });
        };

        initializeGame().catch(console.error);
    }, [gameData, gameId, amIHost, location.state?.iStartFirst]);

    // ============ HELPER: Get my hand key ============
    const getMyHandKey = () => amIHost ? "hostHand" : "guestHand";
    const getOpponentHandKey = () => amIHost ? "guestHand" : "hostHand";
    const getOpponentUid = () => amIHost ? gameData?.guestUid : gameData?.hostUid;

    // ============ DRAW CARD ============
    const handleDrawCard = async () => {
        if (!isMyTurn || drawnCard || deck.length === 0) return;
        if (gamePhase !== "active" && gamePhase !== "finalRound") return;

        const newDeck = [...deck];
        const drawn = newDeck.pop();

        // Update Firestore deck immediately
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, { deck: newDeck });

        // Set local drawn card state
        setDrawnCard(drawn);
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

    // ============ DISCARD ============
    const handleDiscard = async () => {
        if (!drawnCard) return;

        const newDiscard = [...discardPile, drawnCard];
        const gameRef = doc(db, "games", gameId);
        const actionText = specialAction === "jackPeek"
            ? `👁️ Used Jack to peek`
            : `🗑️ Discarded ${drawnCard.rank}${drawnCard.suit}`;

        await updateDoc(gameRef, {
            discardPile: newDiscard,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: actionText },
        });

        setDrawnCard(null);
        setSpecialAction("none");
        setPeekedCard(null);
        setOpponentPeekedCard(null);
        setHasPeekedOwn(false);
        setHasPeekedOpponent(false);
        setMessage(`Waiting for opponent...`);
    };

    // ============ SWAP WITH OWN CARD ============
    const handleSwap = async (index) => {
        if (!drawnCard || specialAction !== "none") return;

        const replaced = myHand[index];
        const newHand = [...myHand];
        newHand[index] = { ...drawnCard, visible: false };

        const newDiscard = [...discardPile, replaced];
        const gameRef = doc(db, "games", gameId);

        await updateDoc(gameRef, {
            [getMyHandKey()]: newHand,
            discardPile: newDiscard,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: `🔄 Swapped card #${index + 1}` },
        });

        setDrawnCard(null);
        setMessage(`Waiting for opponent...`);
    };

    // ============ JACK POWER: Peek at ONE of your own cards ============
    const handleJackPeek = (index) => {
        if (hasPeekedOwn) return;
        setPeekedCard({ player: amIHost ? 1 : 2, index });
        setHasPeekedOwn(true);
        setMessage(`You see: ${myHand[index].rank}${myHand[index].suit}. Click Discard when ready.`);
    };

    // ============ QUEEN POWER: Peek any card, then swap ============
    const handleQueenPeekOwn = (index) => {
        if (hasPeekedOwn || hasPeekedOpponent) return;
        setPeekedCard({ player: amIHost ? 1 : 2, index });
        setSelectedOwnIndex(index);
        setHasPeekedOwn(true);
        setMessage(`Your card: ${myHand[index].rank}${myHand[index].suit}. Click an OPPONENT's card to swap with it, or Discard.`);
    };

    const handleQueenPeekOpponent = (index) => {
        if (hasPeekedOwn || hasPeekedOpponent) return;
        setOpponentPeekedCard({ player: amIHost ? 2 : 1, index });
        setHasPeekedOpponent(true);
        setMessage(`Opponent's card: ${opponentHand[index].rank}${opponentHand[index].suit}. Click ONE OF YOUR cards to swap with it, or Discard.`);
    };

    const handleQueenSwapWithOpponent = async (opponentIndex) => {
        if (!hasPeekedOwn || selectedOwnIndex === null) return;

        const myIndex = selectedOwnIndex;
        const myCard = myHand[myIndex];
        const oppCard = opponentHand[opponentIndex];

        const newMyHand = [...myHand];
        const newOppHand = [...opponentHand];
        newMyHand[myIndex] = { ...oppCard, visible: false };
        newOppHand[opponentIndex] = { ...myCard, visible: false };

        const newDiscard = [...discardPile, drawnCard];
        const gameRef = doc(db, "games", gameId);

        await updateDoc(gameRef, {
            [getMyHandKey()]: newMyHand,
            [getOpponentHandKey()]: newOppHand,
            discardPile: newDiscard,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: `👸 Queen: Swapped my #${myIndex + 1} ↔ your #${opponentIndex + 1}` },
        });

        setDrawnCard(null);
        setSpecialAction("none");
        setPeekedCard(null);
        setSelectedOwnIndex(null);
        setHasPeekedOwn(false);
        setMessage(`Cards swapped! Waiting for opponent...`);
    };

    const handleQueenSwapWithOwn = async (ownIndex) => {
        if (!hasPeekedOpponent || !opponentPeekedCard) return;

        const oppIndex = opponentPeekedCard.index;
        const myCard = myHand[ownIndex];
        const oppCard = opponentHand[oppIndex];

        const newMyHand = [...myHand];
        const newOppHand = [...opponentHand];
        newMyHand[ownIndex] = { ...oppCard, visible: false };
        newOppHand[oppIndex] = { ...myCard, visible: false };

        const newDiscard = [...discardPile, drawnCard];
        const gameRef = doc(db, "games", gameId);

        await updateDoc(gameRef, {
            [getMyHandKey()]: newMyHand,
            [getOpponentHandKey()]: newOppHand,
            discardPile: newDiscard,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: `👸 Queen: Swapped my #${ownIndex + 1} ↔ your #${oppIndex + 1}` },
        });

        setDrawnCard(null);
        setSpecialAction("none");
        setOpponentPeekedCard(null);
        setHasPeekedOpponent(false);
        setMessage(`Cards swapped! Waiting for opponent...`);
    };

    // ============ KING POWER: Peek one of each, then optionally swap ============
    const handleKingPeekOwn = (index) => {
        if (hasPeekedOwn) return;
        setPeekedCard({ player: amIHost ? 1 : 2, index });
        setSelectedOwnIndex(index);
        setHasPeekedOwn(true);

        if (hasPeekedOpponent && opponentPeekedCard) {
            setMessage(`Your: ${myHand[index].rank}${myHand[index].suit}, Opponent: ${opponentHand[opponentPeekedCard.index].rank}${opponentHand[opponentPeekedCard.index].suit}. SWAP them or Discard.`);
        } else {
            setMessage(`Your card: ${myHand[index].rank}${myHand[index].suit}. Now peek at opponent's card.`);
        }
    };

    const handleKingPeekOpponent = (index) => {
        if (hasPeekedOpponent) return;
        setOpponentPeekedCard({ player: amIHost ? 2 : 1, index });
        setHasPeekedOpponent(true);

        if (hasPeekedOwn && peekedCard) {
            setMessage(`Your: ${myHand[peekedCard.index].rank}${myHand[peekedCard.index].suit}, Opponent: ${opponentHand[index].rank}${opponentHand[index].suit}. SWAP them or Discard.`);
        } else {
            setMessage(`Opponent's card: ${opponentHand[index].rank}${opponentHand[index].suit}. Now peek at your own card.`);
        }
    };

    const handleKingSwap = async () => {
        if (!hasPeekedOwn || !hasPeekedOpponent || selectedOwnIndex === null || !opponentPeekedCard) return;

        const myIndex = selectedOwnIndex;
        const oppIndex = opponentPeekedCard.index;
        const myCard = myHand[myIndex];
        const oppCard = opponentHand[oppIndex];

        const newMyHand = [...myHand];
        const newOppHand = [...opponentHand];
        newMyHand[myIndex] = { ...oppCard, visible: false };
        newOppHand[oppIndex] = { ...myCard, visible: false };

        const newDiscard = [...discardPile, drawnCard];
        const gameRef = doc(db, "games", gameId);

        await updateDoc(gameRef, {
            [getMyHandKey()]: newMyHand,
            [getOpponentHandKey()]: newOppHand,
            discardPile: newDiscard,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: `👑 King: Peeked #${myIndex + 1} & your #${oppIndex + 1}, then swapped!` },
        });

        setDrawnCard(null);
        setSpecialAction("none");
        setPeekedCard(null);
        setOpponentPeekedCard(null);
        setSelectedOwnIndex(null);
        setHasPeekedOwn(false);
        setHasPeekedOpponent(false);
        setMessage(`Cards swapped! Waiting for opponent...`);
    };

    // ============ MATCH DISCARD ============
    const handleMatchDiscard = async (index) => {
        if (discardPile.length === 0 || drawnCard) return;
        // Allow during active, finalRound, OR during the 2-second reveal window (ended but not yet revealed)
        const canDiscard = gamePhase === "active" || gamePhase === "finalRound" || (gamePhase === "ended" && !cardsRevealed);
        if (!canDiscard) return;

        const topDiscard = discardPile[discardPile.length - 1];
        const myCard = myHand[index];

        if (myCard.rank === topDiscard.rank) {
            const newHand = myHand.filter((_, i) => i !== index);
            const newDiscard = [...discardPile, myCard];
            const gameRef = doc(db, "games", gameId);

            await updateDoc(gameRef, {
                [getMyHandKey()]: newHand,
                discardPile: newDiscard,
            });
            toast.success(`Match! Discarded your ${myCard.rank}.`);
        } else {
            // Wrong match - draw penalty card
            if (deck.length > 0) {
                const newDeck = [...deck];
                const penaltyCard = newDeck.pop();
                const newHand = [...myHand, { ...penaltyCard, visible: false }];
                const gameRef = doc(db, "games", gameId);

                await updateDoc(gameRef, {
                    [getMyHandKey()]: newHand,
                    deck: newDeck,
                });
                toast.error(`Wrong! That was a ${myCard.rank}, not a ${topDiscard.rank}. Drew penalty card.`);
            } else {
                toast.error(`Wrong match! No cards to draw as penalty.`);
            }
        }
    };

    // ============ CHUKRUM CALL ============
    const handleChukrumCall = async () => {
        if (!isMyTurn || gamePhase !== "active" || drawnCard) return;

        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            status: "finalRound",
            chukrumCaller: myUid,
            currentTurn: getOpponentUid(),
            lastAction: { by: myUid, text: `⚡ Called CHUKRUM! Final round.` },
        });
        setMessage("CHUKRUM! Opponent gets one final turn...");
    };

    // ============ END GAME CHECK ============
    useEffect(() => {
        if (!gameData) return;

        // Check for final round completion
        if (gameData.status === "finalRound" && gameData.currentTurn === gameData.chukrumCaller) {
            // Final round complete, end the game
            const gameRef = doc(db, "games", gameId);
            updateDoc(gameRef, { status: "ended" }).catch(console.error);
        }

        // Check if deck is empty
        if (gameData.status === "active" && gameData.deck?.length === 0) {
            const gameRef = doc(db, "games", gameId);
            updateDoc(gameRef, { status: "ended" }).catch(console.error);
        }

        // Check if any player has no cards
        if (gameData.status === "active" &&
            ((gameData.hostHand?.length === 0) || (gameData.guestHand?.length === 0))) {
            const gameRef = doc(db, "games", gameId);
            updateDoc(gameRef, { status: "ended" }).catch(console.error);
        }
    }, [gameData, gameId]);

    // ============ UPDATE STATS ON GAME END ============
    useEffect(() => {
        if (!gameData || gameData.status !== "ended" || statsUpdated) return;

        const updateStats = async () => {
            const hostScore = calculateScore(gameData.hostHand);
            const guestScore = calculateScore(gameData.guestHand);
            const myScore = amIHost ? hostScore : guestScore;
            const theirScore = amIHost ? guestScore : hostScore;

            const myRef = doc(db, "users", myUid);
            const updates = { gamesPlayed: increment(1) };

            if (myScore < theirScore) {
                updates.wins = increment(1);
            } else if (myScore > theirScore) {
                updates.losses = increment(1);
            }
            // Tie: just increment gamesPlayed

            await updateDoc(myRef, updates);
            setStatsUpdated(true);
        };

        updateStats().catch(console.error);
    }, [gameData, statsUpdated, myUid, amIHost]);

    // ============ REMATCH LISTENER ============
    useEffect(() => {
        if (!gameData) return;

        // If opponent requested rematch, show in UI
        if (gameData.rematchRequestedBy && gameData.rematchRequestedBy !== myUid && !gameData.rematchGameId) {
            setRematchPending(true);
        }

        // If rematch game was created, navigate to it
        if (gameData.rematchGameId && gameData.rematchAccepted) {
            const wasIStarter = gameData.firstTurn === myUid;
            navigate("/multiplayer-game", {
                state: {
                    gameId: gameData.rematchGameId,
                    isHost: amIHost, // Keep same host/guest roles
                    targetScore: targetScore,
                    iStartFirst: !wasIStarter, // Alternate who starts
                }
            });
        }
    }, [gameData, myUid, navigate, amIHost, targetScore]);

    // ============ START NEXT ROUND (Target Score Mode - Host only) ============
    const handleStartNextRound = async () => {
        if (!amIHost || !targetScore) return;

        // Update the same game document with new cards for next round
        const newDeck = createDeck();
        const hostHand = newDeck.slice(0, 4).map(c => ({ ...c, visible: false }));
        const guestHand = newDeck.slice(4, 8).map(c => ({ ...c, visible: false }));
        const remainingDeck = newDeck.slice(8);

        // Alternate who starts
        const wasHostFirst = gameData.firstTurn === gameData.hostUid;
        const newFirstTurn = wasHostFirst ? gameData.guestUid : gameData.hostUid;

        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            hostHand,
            guestHand,
            deck: remainingDeck,
            discardPile: [],
            status: "active",
            currentTurn: newFirstTurn,
            firstTurn: newFirstTurn,
            matchNumber: (gameData.matchNumber || 1) + 1,
            cumulativeUpdated: false, // Reset so cumulative can be updated next round
            // Clear round-specific fields
            rematchRequestedBy: null,
            rematchGameId: null,
            rematchAccepted: null,
        });

        // Reset local state for new round
        setCardsRevealed(false);
        setShowResultsPopup(false);
        setStatsUpdated(false);
        setNextRoundPending(false);
        toast.success("Next round started!");
    };

    // ============ REMATCH HANDLERS (No-Target Mode only) ============
    const handleRequestRematch = async () => {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, { rematchRequestedBy: myUid });
        toast.success("Rematch requested! Waiting for opponent...");
    };

    const handleAcceptRematch = async () => {
        // Create new game with swapped starting player
        const wasHostFirst = gameData.firstTurn === gameData.hostUid;
        const newFirstTurn = wasHostFirst ? gameData.guestUid : gameData.hostUid;

        const newGameDoc = await addDoc(collection(db, "games"), {
            hostUid: gameData.hostUid,
            hostEmail: gameData.hostEmail,
            guestUid: gameData.guestUid,
            guestEmail: gameData.guestEmail,
            targetScore: null, // No target for simple rematch
            status: "active",
            currentTurn: newFirstTurn,
            firstTurn: newFirstTurn,
            createdAt: new Date().toISOString()
        });

        // Update old game to point to new one
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            rematchGameId: newGameDoc.id,
            rematchAccepted: true
        });

        toast.success("Rematch accepted!");
    };

    // ============ HEARTBEAT (every 5 seconds) ============
    useEffect(() => {
        if (!gameId || !myUid || !gameData || gameData.status === "ended") return;

        const heartbeatKey = amIHost ? "hostHeartbeat" : "guestHeartbeat";
        const gameRef = doc(db, "games", gameId);

        // Send heartbeat immediately
        updateDoc(gameRef, { [heartbeatKey]: Date.now() }).catch(console.error);

        // Send heartbeat every 5 seconds
        const interval = setInterval(() => {
            updateDoc(gameRef, { [heartbeatKey]: Date.now() }).catch(console.error);
        }, 5000);

        return () => clearInterval(interval);
    }, [gameId, myUid, amIHost, gameData?.status]);

    // ============ DISCONNECT DETECTION ============
    useEffect(() => {
        if (!gameData || gameData.status === "ended") return;

        const opponentHeartbeatKey = amIHost ? "guestHeartbeat" : "hostHeartbeat";
        const opponentLastHeartbeat = gameData[opponentHeartbeatKey];

        if (opponentLastHeartbeat) {
            const timeSinceHeartbeat = Date.now() - opponentLastHeartbeat;
            // If no heartbeat for 15 seconds, consider disconnected
            setOpponentDisconnected(timeSinceHeartbeat > 15000);
        }
    }, [gameData, amIHost]);

    // ============ NEXT ROUND HANDLER (Called by button click) ============
    // Note: The handleStartNextRound function is already defined above (line 666)
    // It will be called when either player clicks the Next Round button

    // ============ CHAT HANDLERS ============
    const handleSendMessage = async () => {
        if (!chatInput.trim()) return;

        const newMessage = {
            sender: myUid,
            senderName: amIHost ? (gameData?.hostEmail?.split('@')[0] || 'Host') : (gameData?.guestEmail?.split('@')[0] || 'Guest'),
            text: chatInput.trim(),
            timestamp: Date.now()
        };

        const currentMessages = gameData?.chatMessages || [];
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            chatMessages: [...currentMessages, newMessage]
        });

        setChatInput("");
    };

    // ============ WATCH FOR NEW MESSAGES ============
    useEffect(() => {
        if (!gameData?.chatMessages) return;

        const messages = gameData.chatMessages;
        setChatMessages(messages);

        // Count unread (messages from opponent when chat is closed)
        if (!chatOpen) {
            const newFromOpponent = messages.filter(m => m.sender !== myUid).length;
            const previousCount = chatMessages.filter(m => m.sender !== myUid).length;
            if (newFromOpponent > previousCount) {
                setUnreadMessages(prev => prev + (newFromOpponent - previousCount));
            }
        }
    }, [gameData?.chatMessages, chatOpen, myUid]);

    // Clear unread when opening chat
    useEffect(() => {
        if (chatOpen) {
            setUnreadMessages(0);
        }
    }, [chatOpen]);

    // ============ LEAVE GAME ============
    const handleLeaveGame = async () => {
        if (gameData && gameData.status === "active") {
            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, { status: "abandoned", abandonedBy: myUid });
        }
        navigate("/game-setup");
    };

    // ============ HELPER FUNCTIONS ============
    const isCardPeeked = (player, index) => {
        const myPlayerNum = amIHost ? 1 : 2;
        const oppPlayerNum = amIHost ? 2 : 1;

        if (peekedCard && peekedCard.player === myPlayerNum && peekedCard.index === index && player === myPlayerNum) return true;
        if (opponentPeekedCard && opponentPeekedCard.player === oppPlayerNum && opponentPeekedCard.index === index && player === oppPlayerNum) return true;
        return false;
    };

    const getCardDisplay = (card, isVisible) => {
        if (!isVisible) return { content: "★", color: "text-white" };
        const color = ["♥", "♦"].includes(card.suit) ? "text-red-600" : "text-gray-900";
        return { content: `${card.rank}${card.suit}`, color };
    };

    // ============ LOADING / ERROR STATES ============
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 via-green-800 to-emerald-900 text-white">
                <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
                    <p className="text-lg">Loading game...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 via-green-800 to-emerald-900 text-white">
                <div className="text-center">
                    <p className="text-xl text-red-400 mb-4">{error}</p>
                    <button onClick={() => navigate("/game-setup")} className="bg-blue-600 px-6 py-2 rounded-xl">
                        Back to Lobby
                    </button>
                </div>
            </div>
        );
    }

    // ============ MAIN RENDER ============
    return (
        <div className="relative min-h-screen flex flex-col items-center justify-between bg-gradient-to-br from-green-950 via-green-800 to-emerald-900 text-white overflow-hidden p-2 sm:p-4 md:p-6">
            <button onClick={handleLeaveGame} className="absolute top-4 left-4 bg-black/40 hover:bg-black/60 rounded-full px-3 py-2 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Leave
            </button>

            <div className="flex items-center gap-4 mt-4 mb-2">
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-extrabold tracking-widest bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                    CHUKRUM
                </h1>
                <div className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold shadow-lg bg-gradient-to-r from-blue-400 to-indigo-500">
                    <Users className="w-4 h-4" /> Multiplayer
                </div>
            </div>

            {/* Multi-match Score Display - similar to VS AI mode */}
            {targetScore !== null && (
                <div className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold shadow-lg bg-gradient-to-r from-purple-500 to-indigo-600 mb-2">
                    <span>Match {gameData?.matchNumber || 1}</span>
                    <span className="text-white/60">|</span>
                    <span className="text-green-300">You: {amIHost ? (gameData?.hostCumulativeScore || 0) : (gameData?.guestCumulativeScore || 0)}</span>
                    <span className="text-white/60">-</span>
                    <span className="text-red-300">{opponentEmail?.split('@')[0] || 'Opponent'}: {amIHost ? (gameData?.guestCumulativeScore || 0) : (gameData?.hostCumulativeScore || 0)}</span>
                    <span className="text-white/60">/ {targetScore}</span>
                </div>
            )}

            {/* Opponent info */}
            <p className="text-xs text-gray-400 mb-2">vs {opponentEmail?.split('@')[0] || 'Opponent'}</p>

            {/* Message */}
            <div className="bg-black/40 backdrop-blur-sm px-3 sm:px-6 py-2 sm:py-3 rounded-xl text-xs sm:text-sm md:text-lg font-medium mb-2 sm:mb-4 shadow-lg max-w-2xl text-center">{message}</div>

            {/* Opponent Hand */}
            <div className={`flex flex-col items-center ${!isMyTurn ? "scale-105 text-yellow-300" : "opacity-70"}`}>
                <p className="mb-2">{!isMyTurn ? "▶ " : ""}{opponentEmail?.split('@')[0] || 'Opponent'} {cardsRevealed ? `(Score: ${calculateScore(opponentHand)})` : ""}</p>
                <div className="flex gap-1 sm:gap-2 md:gap-4">
                    {opponentHand.map((card, i) => {
                        const showCard = cardsRevealed;
                        const display = getCardDisplay(card, showCard);
                        const isPeekedPosition = isCardPeeked(amIHost ? 2 : 1, i);
                        const canClick = (specialAction === "queenAction" && hasPeekedOwn) ||
                            (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) ||
                            (specialAction === "kingAction" && !hasPeekedOpponent);

                        return (
                            <motion.div
                                key={card.id + i}
                                ref={(el) => (p2Refs.current[i] = el)}
                                onClick={() => {
                                    if (specialAction === "queenAction" && hasPeekedOwn) handleQueenSwapWithOpponent(i);
                                    else if (specialAction === "queenAction" && !hasPeekedOwn && !hasPeekedOpponent) handleQueenPeekOpponent(i);
                                    else if (specialAction === "kingAction" && !hasPeekedOpponent) handleKingPeekOpponent(i);
                                }}
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
                        onClick={isMyTurn && !drawnCard && (gamePhase === "active" || gamePhase === "finalRound") ? handleDrawCard : undefined}
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

                {/* Discard Pile */}
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
                {isMyTurn && gamePhase === "active" && !drawnCard && (
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

            {/* Drawn Card Modal */}
            <AnimatePresence>
                {drawnCard && isMyTurn && (
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

                        {isSpecialCard(drawnCard.rank) && (
                            <div className="bg-purple-600 px-4 py-2 rounded-lg mt-4 text-white font-semibold flex items-center gap-2">
                                <Eye className="w-5 h-5" />
                                {drawnCard.rank === "J" && "Jack: Peek at ONE of your cards"}
                                {drawnCard.rank === "Q" && "Queen: Peek your card, then swap with opponent"}
                                {drawnCard.rank === "K" && "King: Peek one of each, then optionally swap"}
                            </div>
                        )}

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

                        {/* Opponent cards for Queen/King actions */}
                        {(specialAction === "queenAction" || specialAction === "kingAction") && (
                            <div className="mt-6 bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-purple-500/30">
                                <p className="text-sm text-purple-300 mb-3 font-semibold flex items-center gap-2">
                                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                                    Opponent's cards {specialAction === "queenAction" && hasPeekedOwn ? "(click to swap)" : specialAction === "queenAction" ? "(click to peek)" : hasPeekedOpponent ? "(peeked)" : "(click to peek)"}:
                                </p>
                                <div className="flex gap-3 justify-center">
                                    {opponentHand.map((card, i) => {
                                        const isPeeked = isCardPeeked(amIHost ? 2 : 1, i);
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
                        )}

                        {/* Player's cards for selection */}
                        <div className="mt-6 bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-green-500/30">
                            <p className="text-sm text-green-300 mb-3 font-semibold flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                Your cards {specialAction === "none" ? "(click to swap)" : (specialAction === "queenAction" && hasPeekedOpponent) ? "(click to swap)" : hasPeekedOwn ? "(peeked)" : "(click to peek)"}:
                            </p>
                            <div className="flex gap-3 justify-center">
                                {myHand.map((card, i) => {
                                    const isPeeked = isCardPeeked(amIHost ? 1 : 2, i);
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
            <div className={`flex flex-col items-center mb-8 ${isMyTurn ? "scale-105 text-yellow-300" : "opacity-70"}`}>
                <p className="mb-2">{isMyTurn ? "▶ You" : "You"} {cardsRevealed ? `(Score: ${calculateScore(myHand)})` : ""}</p>
                <div className="flex gap-1 sm:gap-2 md:gap-4">
                    {myHand.map((card, i) => {
                        const showCard = cardsRevealed;
                        const display = getCardDisplay(card, showCard);

                        return (
                            <motion.div
                                key={card.id + i}
                                ref={(el) => (p1Refs.current[i] = el)}
                                whileHover={!drawnCard && discardPile.length > 0 && !cardsRevealed ? { scale: 1.05 } : {}}
                                onClick={() => {
                                    const canDiscard = gamePhase === "active" || gamePhase === "finalRound" || (gamePhase === "ended" && !cardsRevealed);
                                    if (!drawnCard && discardPile.length > 0 && canDiscard) {
                                        handleMatchDiscard(i);
                                    }
                                }}
                                className={`w-14 h-20 sm:w-20 sm:h-28 md:w-28 md:h-40 rounded-xl shadow-lg border-2 flex flex-col items-center justify-center text-lg sm:text-2xl md:text-4xl cursor-pointer transition-all
                  ${showCard ? "bg-white " + display.color : "bg-blue-900 text-white border-blue-400"}
                  ${discardPile.length > 0 && !drawnCard && !cardsRevealed ? "hover:ring-2 hover:ring-green-400" : ""}
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
                {discardPile.length > 0 && !drawnCard && gamePhase === "active" && (
                    <p className="text-xs text-green-300 mt-2">💡 Click a card to try matching the {discardPile[discardPile.length - 1].rank}!</p>
                )}
            </div>

            {/* Game End Screen */}
            <AnimatePresence>
                {gamePhase === "ended" && showResultsPopup && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 overflow-y-auto p-4"
                    >
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
                            {(() => {
                                const myScore = calculateScore(myHand);
                                const oppScore = calculateScore(opponentHand);
                                const winner = myScore < oppScore ? "you" : oppScore < myScore ? "opponent" : "tie";

                                return (
                                    <>
                                        <Trophy className={`w-20 h-20 mx-auto mb-3 ${winner === "you" ? "text-yellow-400" : winner === "opponent" ? "text-gray-400" : "text-blue-400"}`} />
                                        <h2 className="text-3xl sm:text-4xl font-extrabold mb-2 bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                                            {targetScore
                                                ? (winner === "you" ? "🏆 Round Won!" : winner === "opponent" ? "💀 Round Lost!" : "🤝 Round Tied!")
                                                : (winner === "you" ? "🏆 You Win!" : winner === "opponent" ? "💀 You Lost!" : "🤝 It's a Tie!")}
                                        </h2>
                                    </>
                                );
                            })()}

                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-4">
                                {/* This Round Scores */}
                                <p className="text-gray-400 text-xs mb-2">{targetScore ? "This Round" : "Final Score"}</p>
                                <div className="flex gap-8 justify-center mb-3">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-green-400">{calculateScore(myHand)}</p>
                                        <p className="text-gray-400 text-xs">You</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-red-400">{calculateScore(opponentHand)}</p>
                                        <p className="text-gray-400 text-xs">{opponentEmail?.split('@')[0] || 'Opponent'}</p>
                                    </div>
                                </div>

                                {/* Target Score Mode: Cumulative Points */}
                                {targetScore && (() => {
                                    const myRoundScore = calculateScore(myHand);
                                    const oppRoundScore = calculateScore(opponentHand);
                                    const hostPrevScore = gameData?.hostCumulativeScore || 0;
                                    const guestPrevScore = gameData?.guestCumulativeScore || 0;
                                    const hostRoundScore = calculateScore(gameData?.hostHand || []);
                                    const guestRoundScore = calculateScore(gameData?.guestHand || []);
                                    // If cumulativeUpdated, use stored values; otherwise add this round
                                    const hostTotal = gameData?.cumulativeUpdated
                                        ? (gameData?.hostCumulativeScore || 0)
                                        : hostPrevScore + hostRoundScore;
                                    const guestTotal = gameData?.cumulativeUpdated
                                        ? (gameData?.guestCumulativeScore || 0)
                                        : guestPrevScore + guestRoundScore;
                                    const myTotal = amIHost ? hostTotal : guestTotal;
                                    const theirTotal = amIHost ? guestTotal : hostTotal;
                                    const seriesOver = hostTotal >= targetScore || guestTotal >= targetScore;

                                    return (
                                        <div className="border-t border-white/20 pt-3 mt-3">
                                            <p className="text-gray-400 text-xs mb-2">
                                                Cumulative Score (First to {targetScore} loses)
                                            </p>
                                            <div className="flex gap-4 justify-center mb-2">
                                                <div className="text-center">
                                                    <p className={`text-2xl font-bold ${myTotal >= targetScore ? "text-red-500" : "text-green-400"}`}>
                                                        {myTotal}
                                                    </p>
                                                    <p className="text-gray-500 text-xs">You</p>
                                                </div>
                                                <div className="text-gray-500 text-2xl">vs</div>
                                                <div className="text-center">
                                                    <p className={`text-2xl font-bold ${theirTotal >= targetScore ? "text-red-500" : "text-red-400"}`}>
                                                        {theirTotal}
                                                    </p>
                                                    <p className="text-gray-500 text-xs">{opponentEmail?.split('@')[0] || 'Opponent'}</p>
                                                </div>
                                            </div>
                                            <p className="text-gray-500 text-xs">
                                                Round {gameData?.matchNumber || 1}
                                                {seriesOver && " (Series Over)"}
                                            </p>

                                            {/* Next Round Button */}
                                            {nextRoundPending && (
                                                <div className="mt-4">
                                                    {amIHost ? (
                                                        <motion.button
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={handleStartNextRound}
                                                            className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2 shadow-lg"
                                                        >
                                                            <RefreshCw className="w-5 h-5" /> Next Round
                                                        </motion.button>
                                                    ) : (
                                                        <div className="bg-yellow-600/50 text-yellow-200 px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2">
                                                            <RefreshCw className="w-5 h-5 animate-spin" /> Waiting for host...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <p className="text-gray-400 text-xs mb-4">Click ✕ to view the cards</p>

                            <div className="flex gap-3 justify-center flex-wrap">
                                {/* Only show rematch buttons for non-target mode */}
                                {!targetScore && (
                                    <>
                                        {/* Rematch Button */}
                                        {!gameData?.rematchRequestedBy && !rematchPending && (
                                            <motion.button
                                                whileTap={{ scale: 0.95 }}
                                                onClick={handleRequestRematch}
                                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2"
                                            >
                                                <RefreshCw className="w-5 h-5" /> Rematch
                                            </motion.button>
                                        )}

                                        {/* Waiting for opponent to accept */}
                                        {gameData?.rematchRequestedBy === myUid && !gameData?.rematchAccepted && (
                                            <div className="bg-yellow-600/50 text-yellow-200 px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2">
                                                <RefreshCw className="w-5 h-5 animate-spin" /> Waiting for opponent...
                                            </div>
                                        )}

                                        {/* Opponent requested rematch - show Accept button */}
                                        {rematchPending && !gameData?.rematchAccepted && (
                                            <motion.button
                                                whileTap={{ scale: 0.95 }}
                                                onClick={handleAcceptRematch}
                                                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2 animate-pulse"
                                            >
                                                <RefreshCw className="w-5 h-5" /> Accept Rematch!
                                            </motion.button>
                                        )}
                                    </>
                                )}

                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => navigate("/game-setup")}
                                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2"
                                >
                                    <ArrowLeft className="w-5 h-5" /> Back to Lobby
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating button to reopen results */}
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
                </div>
            )}

            <div className="text-gray-400 text-sm mb-4 flex items-center gap-1">
                <Trophy className="w-4 h-4" /> Lowest score wins! | 7 = -1 point
            </div>

            {/* Disconnect Warning */}
            {opponentDisconnected && gamePhase !== "ended" && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed top-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 flex items-center gap-2"
                >
                    <span className="animate-pulse">⚠️</span>
                    Opponent may have disconnected...
                </motion.div>
            )}

            {/* Floating Chat Button */}
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setChatOpen(true)}
                className={`fixed bottom-4 left-4 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center ${chatOpen ? "hidden" : "bg-gradient-to-br from-blue-500 to-indigo-600"
                    }`}
            >
                <MessageCircle className="w-6 h-6 text-white" />
                {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                        {unreadMessages}
                    </span>
                )}
            </motion.button>

            {/* Chat Panel (Mobile-Friendly) */}
            <AnimatePresence>
                {chatOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        className="fixed bottom-0 left-0 right-0 sm:left-4 sm:bottom-4 sm:right-auto sm:w-80 z-50 bg-gray-900 border border-white/20 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[60vh] sm:max-h-96"
                    >
                        {/* Chat Header */}
                        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-5 h-5 text-blue-400" />
                                <span className="font-bold text-white">Chat</span>
                            </div>
                            <button onClick={() => setChatOpen(false)} className="p-1 hover:bg-white/10 rounded-lg">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[150px]">
                            {chatMessages.length === 0 ? (
                                <p className="text-gray-500 text-center text-sm italic">No messages yet...</p>
                            ) : (
                                chatMessages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.sender === myUid ? "justify-end" : "justify-start"}`}>
                                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${msg.sender === myUid
                                            ? "bg-blue-600 text-white rounded-br-none"
                                            : "bg-white/10 text-gray-200 rounded-bl-none"
                                            }`}>
                                            {msg.sender !== myUid && (
                                                <p className="text-xs text-gray-400 mb-1">{msg.senderName}</p>
                                            )}
                                            {msg.text}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t border-white/10 flex gap-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                                placeholder="Type a message..."
                                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSendMessage}
                                className="bg-blue-600 hover:bg-blue-700 p-2 rounded-xl"
                            >
                                <Send className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
