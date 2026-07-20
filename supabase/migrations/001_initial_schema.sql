-- ============================================================
-- Draw & Guess — Full Database Schema
-- Supabase (PostgreSQL) + RLS + Triggers + Indexes
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- HELPER: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  bio TEXT DEFAULT '',
  country TEXT DEFAULT '',
  avatar_url TEXT,
  avatar_frame TEXT DEFAULT 'default',
  favorite_color TEXT DEFAULT '#F97316',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 100,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_losses INTEGER NOT NULL DEFAULT 0,
  total_guesses INTEGER NOT NULL DEFAULT 0,
  total_draws INTEGER NOT NULL DEFAULT 0,
  correct_guesses INTEGER NOT NULL DEFAULT 0,
  title TEXT DEFAULT 'Newbie',
  is_guest BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  ban_reason TEXT,
  banned_until TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{
    "sound": true,
    "music": true,
    "sound_volume": 0.7,
    "music_volume": 0.4,
    "language": "id",
    "theme": "light",
    "cursor": "default",
    "brush": "default",
    "canvas_theme": "white",
    "ui_theme": "default"
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_nickname ON public.profiles (nickname);
CREATE INDEX idx_profiles_level ON public.profiles (level DESC);
CREATE INDEX idx_profiles_xp ON public.profiles (xp DESC);
CREATE INDEX idx_profiles_is_guest ON public.profiles (is_guest);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, avatar_url, is_guest)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', NEW.raw_user_meta_data->>'full_name', 'Player_' || substr(NEW.id::text, 1, 6)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    COALESCE((NEW.raw_user_meta_data->>'is_guest')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CATEGORIES & WORDS
-- ============================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en TEXT NOT NULL,
  name_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT 'folder',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  word_en TEXT NOT NULL,
  word_id TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT words_unique_en UNIQUE (category_id, word_en),
  CONSTRAINT words_unique_id UNIQUE (category_id, word_id)
);

CREATE INDEX idx_words_category ON public.words (category_id);
CREATE INDEX idx_words_difficulty ON public.words (difficulty);
CREATE INDEX idx_words_active ON public.words (is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_words_updated_at
  BEFORE UPDATE ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROOMS
-- ============================================================
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_players INTEGER NOT NULL DEFAULT 8 CHECK (max_players IN (2, 4, 6, 8, 10, 12)),
  total_rounds INTEGER NOT NULL DEFAULT 3 CHECK (total_rounds IN (3, 5, 7, 10)),
  language TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id', 'en')),
  draw_time INTEGER NOT NULL DEFAULT 60 CHECK (draw_time IN (30, 45, 60, 90)),
  word_difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (word_difficulty IN ('easy', 'medium', 'hard', 'mixed')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'suspended')),
  current_round INTEGER NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_rooms_code ON public.rooms (code);
CREATE INDEX idx_rooms_status ON public.rooms (status);
CREATE INDEX idx_rooms_host ON public.rooms (host_id);
CREATE INDEX idx_rooms_public ON public.rooms (is_private, status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROOM MEMBERS
-- ============================================================
CREATE TABLE public.room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player', 'spectator')),
  is_ready BOOLEAN NOT NULL DEFAULT false,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  score INTEGER NOT NULL DEFAULT 0,
  ping INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX idx_room_members_room ON public.room_members (room_id);
CREATE INDEX idx_room_members_user ON public.room_members (user_id);
CREATE INDEX idx_room_members_connected ON public.room_members (room_id, is_connected);

CREATE TRIGGER trg_room_members_updated_at
  BEFORE UPDATE ON public.room_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- GAME SESSIONS
-- ============================================================
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  winner_id UUID REFERENCES public.profiles(id),
  total_rounds INTEGER NOT NULL DEFAULT 3,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_sessions_room ON public.game_sessions (room_id);
CREATE INDEX idx_game_sessions_status ON public.game_sessions (status);

CREATE TRIGGER trg_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  drawer_id UUID NOT NULL REFERENCES public.profiles(id),
  word_id UUID REFERENCES public.words(id),
  word_text TEXT,
  word_hint TEXT,
  status TEXT NOT NULL DEFAULT 'selecting' CHECK (
    status IN ('selecting', 'drawing', 'revealing', 'scoring', 'finished')
  ),
  word_choices JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  drawing_started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  draw_time INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rounds_session ON public.rounds (session_id);
CREATE INDEX idx_rounds_room ON public.rounds (room_id);
CREATE INDEX idx_rounds_drawer ON public.rounds (drawer_id);

CREATE TRIGGER trg_rounds_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DRAWINGS & STROKES
-- ============================================================
CREATE TABLE public.drawings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  drawer_id UUID NOT NULL REFERENCES public.profiles(id),
  canvas_width INTEGER NOT NULL DEFAULT 800,
  canvas_height INTEGER NOT NULL DEFAULT 600,
  background_color TEXT DEFAULT '#FFFFFF',
  stroke_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drawings_round ON public.drawings (round_id);

CREATE TRIGGER trg_drawings_updated_at
  BEFORE UPDATE ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.drawing_strokes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drawing_id UUID NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  tool TEXT NOT NULL DEFAULT 'pen',
  color TEXT NOT NULL DEFAULT '#000000',
  size REAL NOT NULL DEFAULT 4,
  opacity REAL NOT NULL DEFAULT 1,
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  shape_data JSONB,
  is_eraser BOOLEAN NOT NULL DEFAULT false,
  timestamp_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strokes_drawing ON public.drawing_strokes (drawing_id, sequence);
CREATE INDEX idx_strokes_round ON public.drawing_strokes (round_id, sequence);

-- ============================================================
-- GUESSES
-- ============================================================
CREATE TABLE public.guesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guess_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  points INTEGER NOT NULL DEFAULT 0,
  time_taken_ms INTEGER,
  is_first BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guesses_round ON public.guesses (round_id);
CREATE INDEX idx_guesses_user ON public.guesses (user_id);
CREATE INDEX idx_guesses_correct ON public.guesses (round_id, is_correct);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat' CHECK (
    message_type IN ('chat', 'guess', 'system', 'correct', 'emote', 'quick')
  ),
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_room ON public.chat_messages (room_id, created_at DESC);
CREATE INDEX idx_chat_user ON public.chat_messages (user_id);

-- ============================================================
-- SCORES
-- ============================================================
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'guess' CHECK (
    source IN ('guess', 'draw', 'bonus_first', 'bonus_fast', 'bonus_perfect', 'bonus_streak', 'bonus_combo')
  ),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scores_session ON public.scores (session_id);
CREATE INDEX idx_scores_user ON public.scores (user_id);
CREATE INDEX idx_scores_round ON public.scores (round_id);

-- ============================================================
-- ACHIEVEMENTS
-- ============================================================
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_id TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_id TEXT NOT NULL,
  icon TEXT DEFAULT 'trophy',
  xp_reward INTEGER NOT NULL DEFAULT 50,
  coin_reward INTEGER NOT NULL DEFAULT 25,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_achievements_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON public.user_achievements (user_id);

CREATE TRIGGER trg_user_achievements_updated_at
  BEFORE UPDATE ON public.user_achievements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DAILY QUESTS
-- ============================================================
CREATE TABLE public.daily_quests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_id TEXT NOT NULL,
  description_en TEXT NOT NULL,
  description_id TEXT NOT NULL,
  target_value INTEGER NOT NULL DEFAULT 1,
  criteria_type TEXT NOT NULL CHECK (
    criteria_type IN ('play_games', 'win_games', 'guess_correct', 'draw_rounds', 'login', 'send_chat')
  ),
  xp_reward INTEGER NOT NULL DEFAULT 30,
  coin_reward INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_daily_quests_updated_at
  BEFORE UPDATE ON public.daily_quests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_daily_quests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES public.daily_quests(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, quest_id, quest_date)
);

CREATE INDEX idx_user_daily_quests_user ON public.user_daily_quests (user_id, quest_date);

CREATE TRIGGER trg_user_daily_quests_updated_at
  BEFORE UPDATE ON public.user_daily_quests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SHOP & INVENTORY
-- ============================================================
CREATE TABLE public.shop_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_id TEXT NOT NULL,
  description_en TEXT DEFAULT '',
  description_id TEXT DEFAULT '',
  item_type TEXT NOT NULL CHECK (
    item_type IN ('brush', 'pen', 'color_theme', 'sticker', 'frame', 'emote', 'title', 'trail', 'cursor', 'background')
  ),
  price_coins INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  preview_url TEXT,
  asset_data JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_limited BOOLEAN NOT NULL DEFAULT false,
  stock INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shop_items_type ON public.shop_items (item_type);
CREATE INDEX idx_shop_items_active ON public.shop_items (is_active);

CREATE TRIGGER trg_shop_items_updated_at
  BEFORE UPDATE ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.inventories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX idx_inventories_user ON public.inventories (user_id);

CREATE TRIGGER trg_inventories_updated_at
  BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_user ON public.purchases (user_id);

-- ============================================================
-- EMOTES
-- ============================================================
CREATE TABLE public.emotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  item_id UUID REFERENCES public.shop_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COSMETICS (equipped look)
-- ============================================================
CREATE TABLE public.cosmetics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  cursor_id UUID REFERENCES public.shop_items(id),
  brush_id UUID REFERENCES public.shop_items(id),
  frame_id UUID REFERENCES public.shop_items(id),
  title_id UUID REFERENCES public.shop_items(id),
  trail_id UUID REFERENCES public.shop_items(id),
  theme_id UUID REFERENCES public.shop_items(id),
  background_id UUID REFERENCES public.shop_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_cosmetics_updated_at
  BEFORE UPDATE ON public.cosmetics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships (requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships (addressee_id);
CREATE INDEX idx_friendships_status ON public.friendships (status);

CREATE TRIGGER trg_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (
    type IN ('info', 'friend', 'achievement', 'quest', 'system', 'invite', 'admin')
  ),
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, is_read, created_at DESC);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON public.reports (status);

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- REPLAYS
-- ============================================================
CREATE TABLE public.replays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  drawer_id UUID NOT NULL REFERENCES public.profiles(id),
  word_text TEXT,
  stroke_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms INTEGER,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_replays_drawer ON public.replays (drawer_id);
CREATE INDEX idx_replays_session ON public.replays (session_id);

-- ============================================================
-- LEADERBOARD (materialized stats cache)
-- ============================================================
CREATE TABLE public.leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'all_time')),
  period_start DATE NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  correct_guesses INTEGER NOT NULL DEFAULT 0,
  total_guesses INTEGER NOT NULL DEFAULT 0,
  accuracy REAL NOT NULL DEFAULT 0,
  avg_guess_time_ms INTEGER DEFAULT 0,
  avg_draw_score INTEGER DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period, period_start)
);

CREATE INDEX idx_leaderboard_period ON public.leaderboard (period, period_start, xp DESC);
CREATE INDEX idx_leaderboard_rank ON public.leaderboard (period, period_start, rank);

CREATE TRIGGER trg_leaderboard_updated_at
  BEFORE UPDATE ON public.leaderboard
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- MATCH HISTORY
-- ============================================================
CREATE TABLE public.match_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_name TEXT,
  final_score INTEGER NOT NULL DEFAULT 0,
  final_rank INTEGER,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  correct_guesses INTEGER NOT NULL DEFAULT 0,
  times_drew INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_match_history_user ON public.match_history (user_id, played_at DESC);
CREATE INDEX idx_match_history_session ON public.match_history (session_id);

-- ============================================================
-- SETTINGS (global app settings)
-- ============================================================
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_strokes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories & Words (public read)
CREATE POLICY "Categories public read"
  ON public.categories FOR SELECT USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Words public read"
  ON public.words FOR SELECT USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admin manage categories"
  ON public.categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admin manage words"
  ON public.words FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Rooms
CREATE POLICY "Public rooms readable"
  ON public.rooms FOR SELECT
  USING (
    deleted_at IS NULL AND (
      is_private = false
      OR host_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.room_members
        WHERE room_id = rooms.id AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update room"
  ON public.rooms FOR UPDATE
  USING (host_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- Room members
CREATE POLICY "Members viewable by room members"
  ON public.room_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_members.room_id AND rm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id AND r.is_private = false
    )
  );

CREATE POLICY "Users can join rooms"
  ON public.room_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own membership"
  ON public.room_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id AND r.host_id = auth.uid()
    )
  );

CREATE POLICY "Users can leave rooms"
  ON public.room_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id AND r.host_id = auth.uid()
    )
  );

-- Game sessions
CREATE POLICY "Session readable by members"
  ON public.game_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = game_sessions.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Host can manage sessions"
  ON public.game_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms
      WHERE id = game_sessions.room_id AND host_id = auth.uid()
    )
  );

-- Rounds
CREATE POLICY "Rounds readable by members"
  ON public.rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = rounds.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Host/drawer manage rounds"
  ON public.rounds FOR ALL
  USING (
    drawer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rooms
      WHERE id = rounds.room_id AND host_id = auth.uid()
    )
  );

-- Drawings
CREATE POLICY "Drawings readable by members"
  ON public.drawings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      JOIN public.room_members rm ON rm.room_id = r.room_id
      WHERE r.id = drawings.round_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Drawer can manage drawings"
  ON public.drawings FOR ALL
  USING (drawer_id = auth.uid());

-- Strokes
CREATE POLICY "Strokes readable by members"
  ON public.drawing_strokes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      JOIN public.room_members rm ON rm.room_id = r.room_id
      WHERE r.id = drawing_strokes.round_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Drawer insert strokes"
  ON public.drawing_strokes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rounds
      WHERE id = drawing_strokes.round_id AND drawer_id = auth.uid()
    )
  );

-- Guesses
CREATE POLICY "Guesses readable by members"
  ON public.guesses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      JOIN public.room_members rm ON rm.room_id = r.room_id
      WHERE r.id = guesses.round_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can guess"
  ON public.guesses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Chat
CREATE POLICY "Chat readable by members"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members can chat"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = chat_messages.room_id AND user_id = auth.uid() AND is_connected = true
    )
  );

-- Scores
CREATE POLICY "Scores readable by members"
  ON public.scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      JOIN public.room_members rm ON rm.room_id = gs.room_id
      WHERE gs.id = scores.session_id AND rm.user_id = auth.uid()
    )
  );

-- Achievements (public read)
CREATE POLICY "Achievements public"
  ON public.achievements FOR SELECT USING (is_active = true);

CREATE POLICY "User achievements own"
  ON public.user_achievements FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "User achievements insert own"
  ON public.user_achievements FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "User achievements update own"
  ON public.user_achievements FOR UPDATE USING (user_id = auth.uid());

-- Daily quests
CREATE POLICY "Daily quests public"
  ON public.daily_quests FOR SELECT USING (is_active = true);

CREATE POLICY "User daily quests own"
  ON public.user_daily_quests FOR ALL USING (user_id = auth.uid());

-- Shop
CREATE POLICY "Shop items public"
  ON public.shop_items FOR SELECT USING (is_active = true);

CREATE POLICY "Inventory own"
  ON public.inventories FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Purchases own"
  ON public.purchases FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Purchases insert own"
  ON public.purchases FOR INSERT WITH CHECK (user_id = auth.uid());

-- Emotes
CREATE POLICY "Emotes public"
  ON public.emotes FOR SELECT USING (true);

-- Cosmetics
CREATE POLICY "Cosmetics own"
  ON public.cosmetics FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Cosmetics public read"
  ON public.cosmetics FOR SELECT USING (true);

-- Friendships
CREATE POLICY "Friendships involved"
  ON public.friendships FOR ALL
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Notifications
CREATE POLICY "Notifications own"
  ON public.notifications FOR ALL USING (user_id = auth.uid());

-- Reports
CREATE POLICY "Reports insert"
  ON public.reports FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reports own read"
  ON public.reports FOR SELECT
  USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admin manage reports"
  ON public.reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Replays
CREATE POLICY "Replays public"
  ON public.replays FOR SELECT USING (true);

CREATE POLICY "Replays insert drawer"
  ON public.replays FOR INSERT WITH CHECK (drawer_id = auth.uid());

-- Leaderboard
CREATE POLICY "Leaderboard public"
  ON public.leaderboard FOR SELECT USING (true);

-- Match history
CREATE POLICY "Match history own"
  ON public.match_history FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Match history insert"
  ON public.match_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- App settings
CREATE POLICY "App settings public read"
  ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Admin manage settings"
  ON public.app_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Audit logs (admin only)
CREATE POLICY "Admin read audit"
  ON public.audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drawing_strokes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guesses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or API)
-- avatars: public read, auth write
-- replays: public read, auth write
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('replays', 'replays', true);
