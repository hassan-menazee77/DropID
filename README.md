# DropID 🔵
### Share files instantly with your personal ID

Every user gets a unique ID. Upload files → share your ID → anyone downloads instantly. Zero quality loss.

---

## ✨ Features

- 🆔 Unique personal ID (e.g., ALEX-7X9K)
- 📁 Upload photos, videos, documents
- 🔗 Share via ID or QR code
- ⬇️ Download all as ZIP
- 🚫 No account needed for receivers
- 💎 100% original quality
- 🌙 Premium dark UI

---

## 🚀 Quick Start

### 1. Install
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```

Fill in:
- `GEMINI_API_KEY` → [aistudio.google.com](https://aistudio.google.com/app/apikey)
- `SUPABASE_URL` → From Supabase Project Settings
- `SUPABASE_ANON_KEY` → From Supabase API Keys
- `SUPABASE_SERVICE_KEY` → From Supabase API Keys

### 3. Setup Firebase
- Create project at [console.firebase.google.com](https://console.firebase.google.com)
- Enable Authentication (Email/Password + Google)
- Enable Firestore Database
- Update `firebase-applet-config.json`

### 4. Setup Supabase Storage
- Create bucket: `dropid-files` (public)
- Add credentials to `.env`

### 5. Run
```bash
npm run dev
```

---

## 🔥 Deploy to Vercel

1. Push to GitHub
2. Import on Vercel
3. Add Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `GEMINI_API_KEY`
   - `APP_URL`
4. Deploy ✅

---

## 💰 Pricing Plans

| Plan | Price | Storage | Expiry |
|------|-------|---------|--------|
| Free | $0 | 2GB | 7 days |
| Pro | $9/month | 100GB | Never |

---

## 🛠️ Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS + Framer Motion
- **Backend:** Express.js + Node.js
- **Auth & DB:** Firebase
- **Storage:** Supabase Storage
- **Deploy:** Vercel
