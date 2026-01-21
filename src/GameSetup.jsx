import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, Play, X, Flame, Zap, Leaf, Users, UserPlus, Copy, Check, Mail, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { auth, db } from "./firebase";
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, getDoc, addDoc, deleteDoc } from "firebase/firestore";
import toast from "react-hot-toast";

export default function GameSetup() {
  const navigate = useNavigate();
  const [showRules, setShowRules] = useState(false);

  // existing state
  const [selectedDifficulty, setSelectedDifficulty] = useState("normal");
  const [targetScore, setTargetScore] = useState(null);
  const [customScore, setCustomScore] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Friend System State
  const [friendHubOpen, setFriendHubOpen] = useState(false);
  const [myFriendCode, setMyFriendCode] = useState("...");
  const [friends, setFriends] = useState([]); // Base list
  const [friendsStatus, setFriendsStatus] = useState({}); // Map: uid -> { lastActive }
  const [friendRequests, setFriendRequests] = useState([]);
  const [addFriendCode, setAddFriendCode] = useState("");
  const [loadingFriend, setLoadingFriend] = useState(false);
  const [copied, setCopied] = useState(false);

  // Invite System State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedFriendForInvite, setSelectedFriendForInvite] = useState(null);
  const [inviteTargetScore, setInviteTargetScore] = useState(null); // null = single match
  const [pendingInvites, setPendingInvites] = useState([]);

  // 1. Listen to Authentication & My User Doc (Friend List)
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // User Doc Listener
        const userRef = doc(db, "users", user.uid);
        const unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setMyFriendCode(data.friendCode || "N/A");
            setFriends(data.friends || []);
            // console.log("Updated Friends List:", data.friends);
          }
        });

        // Friend Requests Listener
        const qRequests = query(collection(db, "friend_requests"), where("toUid", "==", user.uid));
        const unsubRequests = onSnapshot(qRequests, (snap) => {
          setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Game Invites Listener (incoming)
        const qInvites = query(collection(db, "game_invites"), where("toUid", "==", user.uid), where("status", "==", "pending"));
        const unsubInvites = onSnapshot(qInvites, (snap) => {
          setPendingInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Listener for MY sent invites that get accepted (so I can join as host)
        const qMyInvites = query(collection(db, "game_invites"), where("fromUid", "==", user.uid), where("status", "==", "accepted"));
        const unsubMyInvites = onSnapshot(qMyInvites, (snap) => {
          snap.docs.forEach(async (docSnap) => {
            const inviteData = docSnap.data();
            if (inviteData.gameId) {
              // Delete the invite (cleanup)
              await deleteDoc(doc(db, "game_invites", docSnap.id));
              // Navigate to game as host
              navigate("/multiplayer-game", {
                state: {
                  gameId: inviteData.gameId,
                  isHost: true,
                  targetScore: inviteData.targetScore
                }
              });
            }
          });
        });

        return () => { unsubUser(); unsubRequests(); unsubInvites(); unsubMyInvites(); };
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. Listen to Friends' Presence
  useEffect(() => {
    if (friends.length === 0) {
      setFriendsStatus({});
      return;
    }
    const uids = friends.map(f => f.uid).slice(0, 10);
    if (uids.length === 0) return;

    const qFriends = query(collection(db, "users"), where("__name__", "in", uids));
    const unsubPresence = onSnapshot(qFriends, (snap) => {
      const statusMap = {};
      snap.forEach(d => { statusMap[d.id] = d.data(); });
      setFriendsStatus(statusMap);
    }, (err) => console.error("Presence Error:", err));

    return () => unsubPresence();
  }, [friends]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(myFriendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Friend code copied!");
  };

  const handleSendRequest = async () => {
    if (!addFriendCode) return;
    if (addFriendCode === myFriendCode) {
      toast.error("You cannot add yourself!");
      return;
    }

    // Check if already friend (by uid, not code)
    if (friends.some(f => f.uid === addFriendCode)) {
      toast.error("User is already your friend.");
      return;
    }

    setLoadingFriend(true);
    try {
      const q = query(collection(db, "users"), where("friendCode", "==", addFriendCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast.error("Friend code not found.");
      } else {
        const targetUser = querySnapshot.docs[0];

        // Check if request already sent? (Optional optimization)

        await addDoc(collection(db, "friend_requests"), {
          fromUid: auth.currentUser.uid,
          fromEmail: auth.currentUser.email,
          toUid: targetUser.id,
          status: "pending",
          createdAt: new Date().toISOString()
        });

        toast.success("Friend request sent!");
        setAddFriendCode("");
      }
    } catch (error) {
      console.error("Error sending request:", error);
      toast.error("Failed to send request.");
    }
    setLoadingFriend(false);
  };

  const handleAcceptRequest = async (req) => {
    try {
      // 1. Add to my friends
      const myRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(myRef, {
        friends: arrayUnion({ uid: req.fromUid, email: req.fromEmail })
      });

      // 2. Add me to their friends 
      // Note: Assume client write permissions allow this for now.
      const theirRef = doc(db, "users", req.fromUid);
      await updateDoc(theirRef, {
        friends: arrayUnion({ uid: auth.currentUser.uid, email: auth.currentUser.email })
      });

      // 3. Delete request
      await deleteDoc(doc(db, "friend_requests", req.id));
      toast.success("Friend added!");
    } catch (error) {
      console.error("Error accepting friend:", error);
      toast.error("Failed to accept friend.");
    }
  };

  const handleDeclineRequest = async (reqId) => {
    try {
      await deleteDoc(doc(db, "friend_requests", reqId));
      toast.success("Request declined.");
    } catch (error) {
      console.error("Error declining:", error);
    }
  };

  const handleRemoveFriend = async (friendUid, friendEmail) => {
    try {
      // 1. Remove from ME (Read-Modify-Write)
      const myRef = doc(db, "users", auth.currentUser.uid);
      const myDocSnap = await getDoc(myRef);
      if (myDocSnap.exists()) {
        const myData = myDocSnap.data();
        const updatedFriends = (myData.friends || []).filter(f => f.uid !== friendUid);
        await updateDoc(myRef, { friends: updatedFriends });
      }

      // 2. Remove ME from THEM (Mutual deletion)
      const theirRef = doc(db, "users", friendUid);
      const theirDocSnap = await getDoc(theirRef);
      if (theirDocSnap.exists()) {
        const theirData = theirDocSnap.data();
        const updatedTheirFriends = (theirData.friends || []).filter(f => f.uid !== auth.currentUser.uid);
        await updateDoc(theirRef, { friends: updatedTheirFriends });
      }

      console.log(`Removed friend: ${friendEmail}`);
    } catch (error) {
      console.error("Error removing friend:", error);
      toast.error("Failed to remove friend.");
    }
  };

  // ============ INVITE HANDLERS ============
  const handleOpenInviteModal = (friend) => {
    setSelectedFriendForInvite(friend);
    setInviteTargetScore(null); // Reset to single match
    setInviteModalOpen(true);
  };

  const handleSendInvite = async () => {
    if (!selectedFriendForInvite) return;

    try {
      await addDoc(collection(db, "game_invites"), {
        fromUid: auth.currentUser.uid,
        fromEmail: auth.currentUser.email,
        toUid: selectedFriendForInvite.uid,
        toEmail: selectedFriendForInvite.email,
        targetScore: inviteTargetScore, // null = single match
        status: "pending",
        createdAt: new Date().toISOString()
      });

      toast.success(`Invite sent to ${selectedFriendForInvite.email}!`);
      setInviteModalOpen(false);
      setSelectedFriendForInvite(null);
    } catch (error) {
      console.error("Error sending invite:", error);
      toast.error("Failed to send invite.");
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      // 1. Create a game document
      const gameDoc = await addDoc(collection(db, "games"), {
        hostUid: invite.fromUid,
        hostEmail: invite.fromEmail,
        guestUid: auth.currentUser.uid,
        guestEmail: auth.currentUser.email,
        targetScore: invite.targetScore,
        status: "active",
        currentTurn: invite.fromUid, // Host starts
        createdAt: new Date().toISOString()
      });

      // 2. Update invite status
      await updateDoc(doc(db, "game_invites", invite.id), {
        status: "accepted",
        gameId: gameDoc.id
      });

      toast.success("Game starting!");
      // Navigate to multiplayer game
      navigate("/multiplayer-game", {
        state: {
          gameId: gameDoc.id,
          isHost: false, // Guest
          targetScore: invite.targetScore
        }
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      toast.error("Failed to accept invite.");
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await deleteDoc(doc(db, "game_invites", inviteId));
      toast.success("Invite declined.");
    } catch (error) {
      console.error("Error declining invite:", error);
    }
  };

  const difficulties = [
    { id: "easy", label: "Easy", icon: Leaf, color: "from-green-400 to-emerald-500", hoverColor: "hover:bg-green-600", description: "Relaxed bot, perfect for learning" },
    { id: "normal", label: "Normal", icon: Zap, color: "from-yellow-400 to-orange-500", hoverColor: "hover:bg-yellow-600", description: "Balanced challenge" },
    { id: "extreme", label: "Extreme", icon: Flame, color: "from-red-500 to-rose-600", hoverColor: "hover:bg-red-600", description: "Ruthless AI, good luck!" },
  ];

  const targetScoreOptions = [
    { value: null, label: "Single Match" },
    { value: 20, label: "First to 20" },
    { value: 30, label: "First to 30" },
    { value: 50, label: "First to 50" },
    { value: "custom", label: "Custom" },
  ];

  const handlePlay = () => {
    // Determine final target score
    let finalTarget = targetScore;
    if (targetScore === "custom" && customScore) {
      finalTarget = parseInt(customScore, 10);
      if (isNaN(finalTarget) || finalTarget < 10) finalTarget = 20; // Minimum 10
    }
    navigate("/game", { state: { difficulty: selectedDifficulty, targetScore: finalTarget } });
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-950 via-green-800 to-emerald-900 text-white px-6 py-10 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(100,255,150,0.08)_0%,transparent_70%)]" />

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-6xl md:text-7xl font-extrabold mb-4 text-center bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(100,255,150,0.3)]"
      >
        Game Modes
      </motion.h1>

      <p className="text-gray-300 text-lg mb-12 text-center max-w-3xl">
        Choose your game and prepare your strategy.
      </p>

      {/* === Cards layout === */}
      <div className="flex flex-wrap justify-center gap-10 w-full max-w-7xl mt-10">
        {/* === CHUKRUM CARD === */}
        <motion.div
          whileHover={{
            scale: 1.03,
            boxShadow: "0 0 40px rgba(100, 255, 150, 0.4)",
          }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="relative bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[520px] w-full max-w-[380px] mx-auto shadow-2xl shadow-emerald-900/20"
        >
          {/* Card background with subtle glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-emerald-500/10" />

          {/* Playing card image */}
          <div className="absolute inset-4 flex items-center justify-center">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/5/57/Playing_card_heart_A.svg"
              alt="Ace of Hearts"
              className="object-contain w-full h-full opacity-15 group-hover:opacity-25 transition-opacity duration-500 drop-shadow-2xl"
            />
          </div>

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

          <div className="relative z-10 p-6 flex flex-col items-center justify-end mt-auto mb-4">
            <h2
              className="text-5xl font-extrabold mb-3 
                         bg-gradient-to-r from-lime-300 via-emerald-400 to-green-500 
                         bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(100,255,150,0.6)]"
            >
              Vs AI
            </h2>
            <p className="text-gray-300 text-sm max-w-sm mb-5">
              Outthink the AI, if you can, and finish with the lowest score to secure the win.
            </p>

            {/* Difficulty Selector */}
            <div className="flex gap-2 mb-4">
              {difficulties.map((diff) => {
                const Icon = diff.icon;
                const isSelected = selectedDifficulty === diff.id;
                return (
                  <motion.button
                    key={diff.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedDifficulty(diff.id)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl font-semibold text-sm transition-all
                      ${isSelected
                        ? `bg-gradient-to-r ${diff.color} text-white shadow-lg`
                        : "bg-white/10 text-gray-300 hover:bg-white/20"}`}
                  >
                    <Icon className="w-4 h-4" />
                    {diff.label}
                  </motion.button>
                );
              })}
            </div>

            {/* Selected difficulty description */}
            <p className="text-xs text-gray-400 mb-3">
              {difficulties.find(d => d.id === selectedDifficulty)?.description}
            </p>

            {/* Target Score Selector */}
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-2">Game Length</p>
              <div className="flex flex-wrap justify-center gap-2">
                {targetScoreOptions.map((opt) => {
                  const isSelected = targetScore === opt.value;
                  return (
                    <motion.button
                      key={opt.value ?? "single"}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setTargetScore(opt.value);
                        setShowCustomInput(opt.value === "custom");
                      }}
                      className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all
                        ${isSelected
                          ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg"
                          : "bg-white/10 text-gray-300 hover:bg-white/20"}`}
                    >
                      {opt.label}
                    </motion.button>
                  );
                })}
              </div>
              {showCustomInput && (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={customScore}
                    onChange={(e) => setCustomScore(e.target.value)}
                    placeholder="Enter points (10-200)"
                    className="w-32 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handlePlay}
                className={`bg-gradient-to-r ${difficulties.find(d => d.id === selectedDifficulty)?.color} text-white px-6 py-3 rounded-xl font-semibold shadow-lg flex items-center gap-2`}
              >
                <Play className="w-5 h-5" />
                Play {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowRules(true)}
                className="flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl font-semibold shadow-md"
              >
                <BookOpen className="w-4 h-4" /> Rules
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* === PLAY WITH FRIEND CARD === */}
        <motion.div
          whileHover={{
            scale: 1.03,
            boxShadow: "0 0 40px rgba(100, 150, 255, 0.4)",
          }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          onClick={() => setFriendHubOpen(true)}
          className="relative bg-gradient-to-br from-gray-900/95 via-slate-800/95 to-gray-900/95 backdrop-blur-xl border border-blue-500/30 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[520px] w-full max-w-[380px] mx-auto shadow-2xl shadow-blue-900/20 cursor-pointer"
        >
          {/* Card background with subtle glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-indigo-500/10" />

          {/* Background Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Users className="w-48 h-48 text-blue-500/15 group-hover:text-blue-400/25 transition-all duration-500 transform group-hover:scale-110" />
          </div>

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

          <div className="relative z-10 p-6 flex flex-col items-center justify-end mt-auto mb-4">
            <h2
              className="text-5xl font-extrabold mb-3 
                         bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-400 
                         bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(100,150,255,0.6)]"
            >
              Multiplayer
            </h2>
            <p className="text-gray-300 text-sm max-w-sm mb-5">
              Challenge a friend to a duel using your Friend Codes and Game Invites.
            </p>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all"
            >
              <Users className="w-5 h-5" /> Open Hub
            </motion.button>
          </div>
        </motion.div>

        {/* === COMING SOON (Red Joker) === */}
        <motion.div
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(255,100,100,0.5)",
          }}
          transition={{ type: "spring", stiffness: 160, damping: 14 }}
          className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[520px] w-full max-w-[380px] mx-auto transition-shadow duration-300"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/d/dc/Cards-Joker-Red.svg"
              alt="Joker card red"
              className="object-contain w-[95%] h-[95%] opacity-70 group-hover:opacity-90 transition-opacity duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
          </div>

          <div className="relative z-10 p-8 flex flex-col items-center justify-end mt-auto mb-6">
            <h2
              className="text-4xl font-extrabold mb-3 relative -top-12 
                         bg-gradient-to-r from-rose-200 via-orange-300 to-red-400 
                         bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,100,100,0.5)]"
            >
              Coming Soon
            </h2>
            <p className="text-gray-200 text-sm max-w-sm mb-4 italic">
              Bla Bla Bla Bla Coming Soon Bla Bla Bla Bla
            </p>
          </div>
        </motion.div>
      </div>

      {/* === Back button === */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate("/home")}
        className="mt-14 flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-800 text-white font-semibold shadow-md z-20"
      >
        <ArrowLeft className="w-5 h-5" /> Back
      </motion.button>

      {/* === RULES MODAL === */}
      <AnimatePresence>
        {showRules && (
          <>
            {/* Overlay */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRules(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white/10 border border-white/20 backdrop-blur-md rounded-3xl shadow-2xl 
                         p-4 sm:p-8 w-full max-w-lg text-center max-h-[90vh] overflow-y-auto relative">
                <button
                  onClick={() => setShowRules(false)}
                  className="absolute top-4 right-4 text-white hover:text-red-400"
                >
                  <X className="w-6 h-6" />
                </button>

                <h2 className="text-3xl font-extrabold mb-6 bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 bg-clip-text text-transparent">
                  Chukrum Rules
                </h2>

                <div className="text-gray-100 space-y-4 text-center leading-relaxed">
                  <p>
                    🃏 <span className="text-emerald-300 font-semibold">Two players</span> start with four cards each.
                    Take turns drawing from the pile and decide whether to{" "}
                    <span className="text-yellow-300">swap</span> or{" "}
                    <span className="text-red-400">discard</span>.
                  </p>

                  <p>
                    💡 The goal is simple:{" "}
                    <span className="text-lime-300 font-semibold">
                      finish with the lowest score
                    </span>
                    .
                  </p>

                  <p>
                    ♠️ <span className="text-gray-200">A = 1</span>, 2–10 = face
                    value, J = 11, Q = 12, K = 13, but{" "}
                    <span className="text-blue-300">7 = −1</span>.
                  </p>

                  <p>
                    ⭐️ Some cards (J, Q, K) have{" "}
                    <span className="text-pink-300">special abilities</span> that
                    let you peek or swap cards strategically.
                  </p>

                  <p>
                    🔔 When you think your score is lowest, shout{" "}
                    <span className="text-yellow-400 font-bold">“CHUKRUM!”</span>{" "}
                    to trigger the final round!
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* === FRIEND HUB MODAL === */}
      <AnimatePresence>
        {friendHubOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFriendHubOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="bg-gray-900 border border-white/10 rounded-3xl shadow-2xl p-6 w-full max-w-md pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-400" /> Social Hub
                  </h2>
                  <button onClick={() => setFriendHubOpen(false)} className="text-gray-400 hover:text-white transition">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* MY CODE SECTION */}
                <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                  <p className="text-gray-400 text-xs uppercase font-bold mb-2">Your Friend Code</p>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-mono text-blue-300 tracking-widest">{myFriendCode}</span>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/40 transition"
                    >
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* FRIEND REQUESTS SECTION */}
                {friendRequests.length > 0 && (
                  <div className="mb-6">
                    <p className="text-gray-400 text-xs uppercase font-bold mb-2 text-yellow-500 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Incoming Requests
                    </p>
                    <div className="space-y-2">
                      {friendRequests.map(req => (
                        <div key={req.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-sm text-yellow-100">{req.fromEmail}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleAcceptRequest(req)} className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/40">
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleDeclineRequest(req.id)} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/40">
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GAME INVITES SECTION */}
                {pendingInvites.length > 0 && (
                  <div className="mb-6">
                    <p className="text-gray-400 text-xs uppercase font-bold mb-2 text-green-500 flex items-center gap-1">
                      <Play className="w-3 h-3" /> Game Invites
                    </p>
                    <div className="space-y-2">
                      {pendingInvites.map(inv => (
                        <div key={inv.id} className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-sm text-green-100">{inv.fromEmail}</span>
                            <p className="text-[10px] text-gray-400">
                              {inv.targetScore ? `First to ${inv.targetScore}` : "Single Match"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleAcceptInvite(inv)} className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/40">
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleDeclineInvite(inv.id)} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/40">
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ADD FRIEND */}
                <div className="mb-6">
                  <p className="text-gray-400 text-xs uppercase font-bold mb-2">Add Friend</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter 6-char code"
                      maxLength={6}
                      value={addFriendCode}
                      onChange={(e) => setAddFriendCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-black/30 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      onClick={handleSendRequest}
                      disabled={loadingFriend || addFriendCode.length !== 6}
                      className="bg-blue-600 text-white px-4 rounded-xl font-bold disabled:opacity-50 hover:bg-blue-500 transition flex items-center gap-2"
                    >
                      {loadingFriend ? "..." : <UserPlus className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* FRIENDS LIST */}
                <div>
                  <p className="text-gray-400 text-xs uppercase font-bold mb-2">Friends ({friends.length})</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {friends.length === 0 ? (
                      <p className="text-gray-500 text-sm italic text-center py-4">No friends yet. Share your code!</p>
                    ) : (
                      friends.map((friend, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
                              {friend.email?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white max-w-[140px] truncate">{friend.email}</p>
                              {/* Online Status */}
                              <div className="flex items-center gap-1">
                                {(() => {
                                  const status = friendsStatus[friend.uid];
                                  const lastActive = status?.lastActive;
                                  const isOnline = lastActive && (Date.now() - lastActive < 2 * 60 * 1000);
                                  return (
                                    <>
                                      <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]" : "bg-gray-500"}`}></span>
                                      <span className={`text-[10px] ${isOnline ? "text-green-400 font-bold" : "text-gray-400"}`}>
                                        {isOnline ? "Online" : "Offline"}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Actions: Invite & Remove */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenInviteModal(friend)}
                              className="text-xs bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 rounded-lg text-blue-300 transition"
                            >
                              Invite
                            </button>
                            <button
                              onClick={() => handleRemoveFriend(friend.uid, friend.email)}
                              className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                              title="Remove Friend"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* === INVITE CONFIG MODAL === */}
      <AnimatePresence>
        {inviteModalOpen && selectedFriendForInvite && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInviteModalOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="bg-gray-900 border border-white/10 rounded-3xl shadow-2xl p-6 w-full max-w-sm pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">
                    Invite {selectedFriendForInvite.email?.split('@')[0]}
                  </h2>
                  <button onClick={() => setInviteModalOpen(false)} className="text-gray-400 hover:text-white transition">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Game Mode Selector */}
                <div className="mb-6">
                  <p className="text-gray-400 text-xs uppercase font-bold mb-3">Game Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: null, label: "Single Match" },
                      { value: 20, label: "First to 20" },
                      { value: 30, label: "First to 30" },
                      { value: 50, label: "First to 50" },
                    ].map((opt) => (
                      <button
                        key={opt.value ?? "single"}
                        onClick={() => setInviteTargetScore(opt.value)}
                        className={`px-3 py-2 rounded-xl font-medium text-sm transition-all
                          ${inviteTargetScore === opt.value
                            ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg"
                            : "bg-white/10 text-gray-300 hover:bg-white/20"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Send Button */}
                <button
                  onClick={handleSendInvite}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:from-blue-600 hover:to-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" /> Send Invite
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
