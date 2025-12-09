// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ⚠️ Replace the values below with YOUR Firebase project's config
const firebaseConfig = {
  apiKey: "AIzaSyCU-5-SKvM7Usa3HIgt9-F7tdyXbUoCnbM",
  authDomain: "chukrum-pwa.firebaseapp.com",
  projectId: "chukrum-pwa",
  storageBucket: "chukrum-pwa.firebasestorage.app",
  messagingSenderId: "787205980025",
  appId: "1:787205980025:web:bfd46ca7a71cd9e35d39a8",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the two main services we use
export const db = getFirestore(app);
export const auth = getAuth(app);
