import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save } from "lucide-react";

const AVATARS = [
  "🐉", "🦊", "🐧", "🦁", "🐼", "🐸", "🦉", "🐺"
];

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: "", about: "", avatar: "🐉" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (!u) navigate("/login");
      else {
        setUser(u);
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            username: data.username || "",
            about: data.about || "",
            avatar: data.avatar || "🐉",
          });
        }
      }
    });
    return unsubscribe;
  }, [navigate]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, {
  ...profile,
  about: profile.about.slice(0, 100)
});
    setSaving(false);
    navigate("/home");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 text-white p-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-10 w-full max-w-2xl border border-white/10"
      >
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/home")}
            className="text-white/70 hover:text-white flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <h2 className="text-3xl font-bold text-green-200">Edit Profile</h2>
          <div className="w-8" />
        </div>

        <form onSubmit={saveProfile} className="space-y-6">
          {/* Avatar selection */}
          <div>
            <h3 className="text-lg mb-2 font-semibold">Choose your avatar</h3>
            <div className="flex flex-wrap gap-3 justify-center">
              {AVATARS.map((icon) => (
                <motion.button
                  key={icon}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setProfile((p) => ({ ...p, avatar: icon }))}
                  className={`text-4xl p-3 rounded-full transition ${
                    profile.avatar === icon
                      ? "bg-green-600 ring-4 ring-green-300"
                      : "bg-white/20 hover:bg-white/30"
                  }`}
                >
                  {icon}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block mb-2 text-lg font-medium">Username</label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) =>
                setProfile((p) => ({ ...p, username: e.target.value }))
              }
              className="w-full p-3 rounded-lg text-gray-800 border border-gray-300 focus:ring-2 focus:ring-green-500 outline-none"
              placeholder="Enter your Chukrum name"
              maxLength={20}
              required
            />
          </div>

          {/* About */}
          <div>
            <label className="block mb-2 text-lg font-medium">About Me</label>
            <textarea
  value={profile.about}
  onChange={(e) =>
    setProfile((p) => ({ ...p, about: e.target.value }))
  }
  className="w-full p-3 rounded-lg text-gray-800 border border-gray-300 focus:ring-2 focus:ring-green-500 outline-none h-28 resize-none"
  placeholder="Tell something about yourself..."
  maxLength={100}
/>
<p className="text-right text-sm text-black-500 mt-1">
  {profile.about.length}/100
</p>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" /> {saving ? "Saving..." : "Save Changes"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
