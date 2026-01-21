import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import Home from "./Home.jsx";
import Profile from "./Profile.jsx";
import GameSetup from "./GameSetup.jsx";
import LeaderboardPage from "./LeaderboardPage.jsx";
import Game from "./Game.jsx";
import MultiplayerGame from "./MultiplayerGame.jsx";
import PresenceProvider from "./PresenceProvider.jsx";
import "./index.css";


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PresenceProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<App />} />
          <Route path="/home" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/game-setup" element={<GameSetup />} />
          <Route path="/game" element={<Game />} />
          <Route path="/multiplayer-game" element={<MultiplayerGame />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
        </Routes>
      </PresenceProvider>
    </BrowserRouter>
  </React.StrictMode>
);
