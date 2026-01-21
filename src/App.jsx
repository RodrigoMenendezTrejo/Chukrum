import React, { useState } from "react";
import { useNavigate } from "react-router-dom";    // 👈
import { motion } from "framer-motion";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import toast, { Toaster } from "react-hot-toast";

export default function App() {
  const navigate = useNavigate();                 // 👈
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegistering) {
        // Register new user
        const userCred = await createUserWithEmailAndPassword(auth, email, password);

        // Generate random 6-char friend code
        const friendCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const userRef = doc(db, "users", userCred.user.uid);
        await setDoc(userRef, {
          email,
          createdAt: new Date(),
          wins: 0,
          losses: 0,
          gamesPlayed: 0,
          friendCode,
          friends: [] // Initialize empty friends list
        });
        toast.success("Account created! You can now log in.");
        setIsRegistering(false);
      } else {
        // Login existing user
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Welcome back!");
        // TODO: navigate to Home page later
        navigate("/home");
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 p-4">
      <Toaster />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/95 rounded-xl shadow-2xl p-8 w-full max-w-md text-center"
      >
        <h1 className="text-3xl font-bold text-green-700 mb-4">
          {isRegistering ? "Create Account" : "Welcome to Chukrum"}
        </h1>
        <p className="text-gray-600 mb-6">
          {isRegistering
            ? "Register to start playing!"
            : "Login to continue your adventure."}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-800 placeholder-gray-400 bg-white"

          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-gray-800 placeholder-gray-400 bg-white"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : isRegistering
                ? "Register"
                : "Login"}
          </button>
        </form>

        <div className="mt-6 text-gray-600">
          {isRegistering ? "Already have an account?" : "New here?"}{" "}
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-green-600 font-semibold hover:underline"
          >
            {isRegistering ? "Login" : "Create one"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
