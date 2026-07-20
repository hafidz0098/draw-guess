# Draw & Guess

Game multiplayer online **Draw & Guess** (seperti Skribbl.io / Gartic.io) — dibangun dengan **Nuxt 3/4**, **TypeScript**, **TailwindCSS**, **Pinia**, **Supabase**, dan **Konva.js**.

UI: flat design, rounded-xl, playful, warna oranye / biru / putih / abu muda. Tanpa glassmorphism atau glow effect.

## Fitur

| Area | Detail |
|------|--------|
| **Auth** | Guest login + Google OAuth (Supabase) |
| **Room** | Create / Join, password, private/public, max 2–12, rounds, draw time, difficulty, language |
| **Lobby** | Ready, host badge, kick, transfer host, invite link, chat |
| **Game** | Pilih kata → gambar → tebak → skor → next round → winner |
| **Canvas** | Konva: pen, brush, pencil, marker, highlighter, eraser, shapes, fill, spray, undo/redo, clear |
| **Realtime** | Stroke batch, chat, presence, emote, cursor, ready (Supabase Realtime) |
| **Score** | Time bonus, first guess, fast guess, drawer points, perfect round |
| **Meta** | Profile, XP/level, leaderboard, shop, inventory, daily quests, achievements, history |
| **Admin** | Words, stats, reports, shop, quests |
| **Security** | RLS, Zod validation, XSS sanitize, password hash, rate limit guess/chat |

## Tech Stack

- Nuxt 4 + Vue 3 + TypeScript
- TailwindCSS, Pinia, VueUse
- Supabase (Auth, PostgreSQL, Realtime, Storage, RLS)
- Konva.js (canvas)
- GSAP (animasi)
- Vue Sonner (toast)
- Iconify, NanoID, Zod, Vue Query, DayJS
- Deploy: Vercel + Supabase

## Struktur Proyek

```
draw-guess/
├── app/
│   ├── assets/css/main.css
│   ├── components/
│   │   ├── game/          # Canvas, Chat, HUD, Scoreboard...
│   │   ├── layout/        # Header, Settings
│   │   └── ui/            # Button, Input, Modal, Avatar, Icon
│   ├── composables/       # useSupabase, useRealtime, useSound, useGsap
│   ├── layouts/
│   ├── pages/             # Home, create, join, lobby, game, shop...
│   ├── plugins/
│   ├── stores/            # auth, room, game, ui
│   ├── types/
│   └── utils/             # scoring, stroke, validation, sanitize
├── server/api/            # Secure API routes
├── supabase/migrations/   # Schema + seed + RLS
├── nuxt.config.ts
└── vercel.json
```

## Setup Lokal

### 1. Install

```bash
cd draw-guess
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Isi:

```env
NUXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NUXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Tanpa Supabase:** app tetap jalan mode **guest + room lokal** (localStorage) untuk demo UI & gameplay single-device.

### 3. Database Supabase

1. Buat project di [supabase.com](https://supabase.com)
2. SQL Editor → jalankan berurutan:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_seed_data.sql`
3. Authentication → Providers → enable **Anonymous** (guest) dan **Google** (opsional)
4. Storage → buat bucket `avatars` (public) dan `replays` (public)
5. Database → Replication → pastikan tabel realtime ter-publish (sudah di migration)

### 4. Dev server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Deploy

### Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables di Vercel dashboard (sama seperti `.env`).

### Supabase

- Production project terpisah disarankan
- Jalankan migration yang sama
- Redirect URL OAuth: `https://your-domain.com/auth/callback`

## Alur Gameplay

```
Home → Create/Join Room → Lobby → Start
  → Pilih Drawer → Pilih Kata (15s)
  → Menggambar + Tebak (30–90s)
  → Scoreboard → Next Round → Winner → Play Again
```

## Realtime & Performa Stroke

- Stroke di-**batch** (~50ms), di-**compress** (dedupe points), di-**quantize**
- Broadcast via Supabase channel `room:{id}` event `stroke`
- Payload compact: `serializeStroke` / `deserializeStroke`
- Konva layer `batchDraw` untuk render

## Keamanan

- **RLS** di semua tabel (lihat migration)
- **Zod** di client form & server API
- Chat: sanitize HTML, anti-spam repeat
- Guess: server-side validation + rate limit
- Room password: SHA-256 (upgrade ke bcrypt di service role untuk production ketat)
- Headers: `X-Frame-Options`, `nosniff` (vercel.json)

## Scripts

| Command | Keterangan |
|---------|------------|
| `npm run dev` | Development |
| `npm run build` | Production build |
| `npm run preview` | Preview build |
| `npm run generate` | Static generate (jika perlu) |

## Skala Selanjutnya

Untuk ribuan concurrent players:

1. **Room sharding** — satu channel per room (sudah)
2. **Stroke ephemeral** — broadcast only, persist snapshot akhir ronde
3. **Edge functions** — validasi guess & timer authoritative
4. **Redis / presence** — opsional di atas Supabase
5. **CDN assets** — avatar & shop
6. **Matchmaking queue** — public quick play pool
7. **Web Worker** — replay encode/decode

## Lisensi

MIT — buat, modifikasi, dan deploy sesuka hati.
