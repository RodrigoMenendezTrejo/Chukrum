# 📱 Chukrum PWA Publishing Guide

## Quick Overview

To install on your iPhone for FREE, you need to:
1. **Make it a proper PWA** (add manifest + service worker)
2. **Deploy to a free hosting service** (Vercel, Netlify, or GitHub Pages)
3. **Open in Safari on iPhone and "Add to Home Screen"**

---

## Step 1: Make it a Proper PWA

### 1.1 Create the Web App Manifest

Create file: `public/manifest.json`

```json
{
  "name": "Chukrum Card Game",
  "short_name": "Chukrum",
  "description": "A strategic card game - lowest score wins!",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#16213e",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 1.2 Add Icons

Create two PNG icons in `public/` folder:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

You can use any image editor or online tool like https://favicon.io/

### 1.3 Update index.html

Add these lines inside `<head>` in `index.html`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#16213e" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

### 1.4 Add Service Worker (optional but recommended)

Create file: `public/sw.js`

```javascript
const CACHE_NAME = 'chukrum-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

Register it in your main.jsx:
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## Step 2: Deploy for FREE

### Option A: Vercel (Recommended - Easiest)

1. **Sign up** at https://vercel.com (free with GitHub account)

2. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

3. **Build your app**:
   ```bash
   npm run build
   ```

4. **Deploy**:
   ```bash
   vercel
   ```

5. Follow the prompts. You'll get a URL like: `https://chukrum-pwa.vercel.app`

### Option B: Netlify (Also Easy)

1. **Sign up** at https://netlify.com

2. **Build your app**:
   ```bash
   npm run build
   ```

3. **Drag & drop** the `dist` folder to Netlify dashboard

4. You'll get a URL like: `https://chukrum.netlify.app`

### Option C: GitHub Pages (Fully Free)

1. **Create a GitHub repository** for your project

2. **Install gh-pages**:
   ```bash
   npm install gh-pages --save-dev
   ```

3. **Add to package.json scripts**:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

4. **Update vite.config.js**:
   ```javascript
   export default defineConfig({
     base: '/your-repo-name/',
     // ... rest of config
   })
   ```

5. **Deploy**:
   ```bash
   npm run deploy
   ```

6. Enable GitHub Pages in repo settings → Pages → Source: gh-pages branch

---

## Step 3: Install on iPhone

1. **Open Safari** on your iPhone (must be Safari, not Chrome!)

2. **Go to your deployed URL** (e.g., `https://chukrum-pwa.vercel.app`)

3. **Tap the Share button** (box with arrow pointing up)

4. **Scroll down and tap "Add to Home Screen"**

5. **Tap "Add"** in the top right

6. **Done!** The app icon appears on your home screen

---

## 🚀 Quick Deploy Commands (Vercel)

```bash
# First time setup
npm install -g vercel

# Build and deploy
npm run build
vercel --prod

# That's it! You get a free URL
```

---

## ✅ Checklist

- [ ] Created `public/manifest.json`
- [ ] Added app icons (192x192 and 512x512)
- [ ] Updated `index.html` with PWA meta tags
- [ ] Built the app with `npm run build`
- [ ] Deployed to Vercel/Netlify/GitHub Pages
- [ ] Opened URL in Safari on iPhone
- [ ] Added to Home Screen

---

## Troubleshooting

**"Add to Home Screen" not appearing?**
- Make sure you're using Safari (not Chrome)
- The manifest.json must be valid
- Site must be served over HTTPS (all hosting options above provide this)

**App opens in browser instead of standalone?**
- Check that `display: "standalone"` is in manifest.json
- Clear Safari cache and re-add to home screen

**Icons not showing?**
- Make sure icon paths are correct in manifest.json
- Icons must be PNG format
- Try using absolute paths: `/icon-192.png`

---

## Free Hosting Comparison

| Service | Free Tier | Custom Domain | Easy? |
|---------|-----------|---------------|-------|
| Vercel | ✅ Unlimited* | ✅ Yes | ⭐⭐⭐ Easiest |
| Netlify | ✅ 100GB/month | ✅ Yes | ⭐⭐⭐ Easy |
| GitHub Pages | ✅ Unlimited | ✅ Yes | ⭐⭐ Medium |

*Vercel has bandwidth limits but very generous for personal projects

---

Good luck with your Chukrum game! 🎮
