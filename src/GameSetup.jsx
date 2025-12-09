import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, Play, X, Flame, Zap, Leaf } from "lucide-react";

export default function GameSetup() {
  const navigate = useNavigate();
  const [showRules, setShowRules] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState("normal");

  const difficulties = [
    { id: "easy", label: "Easy", icon: Leaf, color: "from-green-400 to-emerald-500", hoverColor: "hover:bg-green-600", description: "Relaxed bot, perfect for learning" },
    { id: "normal", label: "Normal", icon: Zap, color: "from-yellow-400 to-orange-500", hoverColor: "hover:bg-yellow-600", description: "Balanced challenge" },
    { id: "extreme", label: "Extreme", icon: Flame, color: "from-red-500 to-rose-600", hoverColor: "hover:bg-red-600", description: "Ruthless AI, good luck!" },
  ];

  const handlePlay = () => {
    navigate("/game", { state: { difficulty: selectedDifficulty } });
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
        Choose your game and prepare for battle.
      </p>

      {/* === Cards layout === */}
      <div className="flex flex-wrap justify-center gap-10 w-full max-w-7xl mt-10">
        {/* === CHUKRUM CARD === */}
        <motion.div
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(100, 255, 150, 0.5)",
          }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 180, damping: 12 }}
          className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[520px] w-full max-w-[380px] mx-auto transition-shadow duration-300"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/5/57/Playing_card_heart_A.svg"
              alt="Ace of Hearts"
              className="object-contain w-[95%] h-[95%] opacity-80 group-hover:opacity-90 transition-opacity duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
          </div>

          <div className="relative z-10 p-6 flex flex-col items-center justify-end mt-auto mb-4">
            <h2
              className="text-4xl font-extrabold mb-2 relative -top-8 
                         bg-gradient-to-r from-lime-200 via-emerald-300 to-green-400 
                         bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(100,255,150,0.5)]"
            >
              Chukrum
            </h2>
            <p className="text-gray-200 text-sm max-w-sm mb-4">
              Outthink your rival and finish with the lowest score.
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
            <p className="text-xs text-gray-400 mb-4">
              {difficulties.find(d => d.id === selectedDifficulty)?.description}
            </p>

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

        {/* === COMING SOON (Black Joker) === */}
        <motion.div
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(150,150,255,0.4)",
          }}
          transition={{ type: "spring", stiffness: 160, damping: 14 }}
          className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[440px] w-full max-w-[350px] mx-auto transition-shadow duration-300"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/6/6d/Cards-Joker-Black-hy.svg"
              alt="Joker card black"
              className="object-contain w-[95%] h-[95%] opacity-70 group-hover:opacity-90 transition-opacity duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
          </div>

          <div className="relative z-10 p-8 flex flex-col items-center justify-end mt-auto mb-6">
            <h2
              className="text-4xl font-extrabold mb-3 relative -top-12 
                         bg-gradient-to-r from-indigo-200 via-blue-300 to-purple-400 
                         bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(150,150,255,0.5)]"
            >
              Coming Soon
            </h2>
            <p className="text-gray-200 text-sm max-w-sm mb-4 italic">
              A mysterious new game mode awaits... prepare for chaos!
            </p>
          </div>
        </motion.div>

        {/* === COMING SOON (Red Joker) === */}
        <motion.div
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(255,100,100,0.5)",
          }}
          transition={{ type: "spring", stiffness: 160, damping: 14 }}
          className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl overflow-hidden group flex flex-col items-center justify-center text-center h-[440px] w-full max-w-[350px] mx-auto transition-shadow duration-300"
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
              A fiery twist is on the horizon. Stay tuned for battle!
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
    </div>
  );
}
