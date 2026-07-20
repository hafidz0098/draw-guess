# Architecture — Draw & Guess

## Overview

```
┌─────────────┐     HTTPS      ┌──────────────┐
│  Browser    │◄──────────────►│  Vercel      │
│  Nuxt SSR   │                │  Nuxt Nitro  │
└──────┬──────┘                └──────┬───────┘
       │ Realtime / REST              │ Service Role
       ▼                              ▼
┌─────────────────────────────────────────────┐
│                 Supabase                      │
│  Auth · PostgreSQL · Realtime · Storage · RLS │
└─────────────────────────────────────────────┘
```

## Client layers

1. **Pages** — routing & composition
2. **Components** — UI + game widgets (canvas, chat, HUD)
3. **Stores (Pinia)** — `auth`, `room`, `game`, `ui`
4. **Composables** — Supabase client, realtime channel, sound, GSAP
5. **Utils** — scoring, stroke compression, Zod schemas, sanitize

## Game state machine

```
idle → selecting → drawing → revealing → scoreboard → (next) selecting
                                              ↘ winner → play again → idle
```

Authoritative transitions ideally run on host (client) + server validation for guesses. For scale, move timer/word to Edge Functions.

## Realtime channels

Channel: `room:{roomId}`

| Event | Type | Payload |
|-------|------|---------|
| stroke | broadcast | serialized stroke batch |
| cursor | broadcast | x, y, user |
| emote | broadcast | emoji |
| typing | broadcast | user_id, typing |
| game | broadcast | phase sync |
| room_members | postgres_changes | join/leave/ready |
| chat_messages | postgres_changes | new messages |
| rooms | postgres_changes | status/host |

## Stroke pipeline

```
Pointer → Konva Line → compressPoints → quantize
  → batch 50ms → serialize → Realtime broadcast
  → peers deserialize → Konva redraw
```

Optional: persist strokes only at round end for replays.

## Scoring

- Guess: `100 + timeBonus(0–100) + first(50) + fast(30) + streak`
- Drawer: `40 * correctCount + perfect(100)`

## Security model

- **RLS**: members only see their room data; public leaderboard/words
- **Server routes**: guess validation, room create with service role
- **Client**: Zod forms, chat sanitize, spam heuristics
- **Roles**: host | player | spectator

## Scaling path

1. Ephemeral strokes (no DB write per point)
2. Host migration on disconnect
3. Room capacity hard-cap + spectator overflow
4. Regional Supabase / multi-project shard by region
5. Matchmaking service separate from game rooms
