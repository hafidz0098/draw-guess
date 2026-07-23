// ============================================================
// Draw & Guess — Core Types
// ============================================================

export type Language = 'id' | 'en'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'suspended'
export type MemberRole = 'host' | 'player' | 'spectator'
export type RoundStatus = 'selecting' | 'drawing' | 'revealing' | 'scoring' | 'finished'
export type MessageType = 'chat' | 'guess' | 'system' | 'correct' | 'emote' | 'quick'
export type DrawTool =
  | 'pen'
  | 'brush'
  | 'pencil'
  | 'marker'
  | 'highlighter'
  | 'eraser'
  | 'bucket'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'arrow'
  | 'line'
  | 'bezier'
  | 'spray'
  | 'stamp'
  | 'text'
  | 'eyedropper'
  | 'pan'

export type ItemType =
  | 'brush'
  | 'pen'
  | 'color_theme'
  | 'sticker'
  | 'frame'
  | 'emote'
  | 'title'
  | 'trail'
  | 'cursor'
  | 'background'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time'

export interface UserSettings {
  sound: boolean
  music: boolean
  sound_volume: number
  music_volume: number
  language: Language
  theme: 'light' | 'dark' | 'system'
  cursor: string
  brush: string
  canvas_theme: string
  ui_theme: string
}

export interface Profile {
  id: string
  nickname: string
  bio: string
  country: string
  avatar_url: string | null
  avatar_frame: string
  favorite_color: string
  level: number
  xp: number
  coins: number
  total_wins: number
  total_losses: number
  total_guesses: number
  total_draws: number
  correct_guesses: number
  title: string
  is_guest: boolean
  is_admin: boolean
  is_banned: boolean
  settings: UserSettings
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  code: string
  name: string
  password_hash: string | null
  is_private: boolean
  host_id: string
  max_players: 2 | 4 | 6 | 8 | 10 | 12
  total_rounds: 3 | 5 | 7 | 10
  language: Language
  draw_time: 30 | 45 | 60 | 90
  word_difficulty: Difficulty
  word_category: string | null
  status: RoomStatus
  current_round: number
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RoomMember {
  id: string
  room_id: string
  user_id: string
  role: MemberRole
  is_ready: boolean
  is_connected: boolean
  score: number
  ping: number
  joined_at: string
  profile?: Profile
}

export interface GameSession {
  id: string
  room_id: string
  status: 'active' | 'finished' | 'cancelled'
  started_at: string
  ended_at: string | null
  winner_id: string | null
  total_rounds: number
}

export interface Round {
  id: string
  session_id: string
  room_id: string
  round_number: number
  drawer_id: string
  word_id: string | null
  word_text: string | null
  word_hint: string | null
  status: RoundStatus
  word_choices: WordChoice[]
  started_at: string | null
  drawing_started_at: string | null
  ended_at: string | null
  draw_time: number
}

export interface WordChoice {
  id: string
  text: string
  difficulty: Difficulty
}

export interface Category {
  id: string
  name_en: string
  name_id: string
  slug: string
  icon: string
}

export interface Word {
  id: string
  category_id: string
  word_en: string
  word_id: string
  difficulty: Difficulty
}

export interface StrokePoint {
  x: number
  y: number
  p?: number // pressure 0-1
}

export interface DrawingStroke {
  id?: string
  drawing_id?: string
  round_id: string
  sequence: number
  tool: DrawTool
  color: string
  size: number
  opacity: number
  points: StrokePoint[]
  shape_data?: Record<string, unknown> | null
  is_eraser: boolean
  timestamp_ms: number
}

export interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  round_id: string | null
  message: string
  message_type: MessageType
  is_hidden: boolean
  mentions: string[]
  created_at: string
  profile?: Pick<Profile, 'id' | 'nickname' | 'avatar_url' | 'level'>
}

export interface Guess {
  id: string
  round_id: string
  user_id: string
  guess_text: string
  is_correct: boolean
  points: number
  time_taken_ms: number | null
  is_first: boolean
  created_at: string
}

export interface Score {
  id: string
  session_id: string
  round_id: string | null
  user_id: string
  points: number
  source: string
  metadata: Record<string, unknown>
}

export interface Achievement {
  id: string
  slug: string
  name_en: string
  name_id: string
  description_en: string
  description_id: string
  icon: string
  xp_reward: number
  coin_reward: number
  rarity: Rarity
}

export interface DailyQuest {
  id: string
  slug: string
  name_en: string
  name_id: string
  description_en: string
  description_id: string
  target_value: number
  criteria_type: string
  xp_reward: number
  coin_reward: number
}

export interface ShopItem {
  id: string
  slug: string
  name_en: string
  name_id: string
  description_en: string
  description_id: string
  item_type: ItemType
  price_coins: number
  rarity: Rarity
  preview_url: string | null
  asset_data: Record<string, unknown>
}

export interface InventoryItem {
  id: string
  user_id: string
  item_id: string
  is_equipped: boolean
  quantity: number
  item?: ShopItem
}

export interface LeaderboardEntry {
  id: string
  user_id: string
  period: LeaderboardPeriod
  xp: number
  wins: number
  losses: number
  games_played: number
  accuracy: number
  rank: number | null
  profile?: Pick<Profile, 'id' | 'nickname' | 'avatar_url' | 'level' | 'title'>
}

export interface MatchHistory {
  id: string
  session_id: string
  user_id: string
  room_name: string | null
  final_score: number
  final_rank: number | null
  is_winner: boolean
  rounds_played: number
  correct_guesses: number
  times_drew: number
  xp_earned: number
  coins_earned: number
  played_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  type: string
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'blocked' | 'declined'
  created_at: string
  profile?: Profile
}

export interface CreateRoomInput {
  name: string
  password?: string
  is_private: boolean
  max_players: 2 | 4 | 6 | 8 | 10 | 12
  total_rounds: 3 | 5 | 7 | 10
  language: Language
  draw_time: 30 | 45 | 60 | 90
  word_difficulty: Difficulty
  word_category?: string | null
}

export interface DrawToolState {
  tool: DrawTool
  color: string
  size: number
  opacity: number
}

export interface CursorPosition {
  user_id: string
  x: number
  y: number
  color: string
  nickname: string
}

export interface EmoteEvent {
  user_id: string
  emoji: string
  nickname: string
  timestamp: number
}

export interface GamePresence {
  user_id: string
  nickname: string
  avatar_url: string | null
  is_ready: boolean
  is_typing: boolean
  cursor?: { x: number; y: number }
}

// Realtime channel event payloads
export interface StrokeBatchPayload {
  strokes: DrawingStroke[]
  round_id: string
  sequence_start: number
}

export interface TimerSyncPayload {
  round_id: string
  ends_at: number
  server_now: number
}

export interface ScoreUpdatePayload {
  user_id: string
  points: number
  total: number
  source: string
}
