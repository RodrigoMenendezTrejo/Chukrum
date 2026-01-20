import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import Home from "./Home.jsx";
import Profile from "./Profile.jsx";
import GameSetup from "./GameSetup.jsx"; // 👈 Add this import
import LeaderboardPage from "./LeaderboardPage.jsx";
import "./index.css";
import Game from "./Game.jsx";


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<App />} />
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/game-setup" element={<GameSetup />} /> {/* 👈 Add this line */}
        <Route path="/game" element={<Game />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />


      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
