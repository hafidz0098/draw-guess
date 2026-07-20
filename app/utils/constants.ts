export const APP_NAME = 'Draw & Guess'
export const APP_VERSION = '1.0.0'

export const MAX_PLAYERS_OPTIONS = [2, 4, 6, 8, 10, 12] as const
export const ROUND_OPTIONS = [3, 5, 7, 10] as const
export const DRAW_TIME_OPTIONS = [30, 45, 60, 90] as const
export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'mixed'] as const
export const LANGUAGE_OPTIONS = [
  { value: 'id', label: 'Indonesia' },
  { value: 'en', label: 'English' },
] as const

export const WORD_SELECT_TIME = 15 // seconds
export const DEFAULT_CANVAS_WIDTH = 960
export const DEFAULT_CANVAS_HEIGHT = 540

export const BRUSH_SIZES = [2, 4, 6, 8, 12, 16, 24, 32, 48]
export const OPACITY_PRESETS = [0.25, 0.5, 0.75, 1]

export const COLOR_PALETTE = [
  '#000000',
  '#FFFFFF',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#78716C',
  '#A3A3A3',
  '#FCA5A5',
  '#FDBA74',
  '#FDE047',
  '#86EFAC',
  '#5EEAD4',
  '#93C5FD',
  '#C4B5FD',
  '#F9A8D4',
]

export const DRAW_TOOLS = [
  { id: 'pen', icon: 'mdi:pen', label: 'Pen' },
  { id: 'brush', icon: 'mdi:brush', label: 'Brush' },
  { id: 'pencil', icon: 'mdi:pencil', label: 'Pencil' },
  { id: 'marker', icon: 'mdi:marker', label: 'Marker' },
  { id: 'highlighter', icon: 'mdi:highlighter', label: 'Highlighter' },
  { id: 'eraser', icon: 'mdi:eraser', label: 'Eraser' },
  { id: 'bucket', icon: 'mdi:format-color-fill', label: 'Fill' },
  { id: 'rectangle', icon: 'mdi:rectangle-outline', label: 'Rectangle' },
  { id: 'circle', icon: 'mdi:circle-outline', label: 'Circle' },
  { id: 'triangle', icon: 'mdi:triangle-outline', label: 'Triangle' },
  { id: 'arrow', icon: 'mdi:arrow-top-right', label: 'Arrow' },
  { id: 'line', icon: 'mdi:minus', label: 'Line' },
  { id: 'spray', icon: 'mdi:spray', label: 'Spray' },
  { id: 'text', icon: 'mdi:format-text', label: 'Text' },
  { id: 'eyedropper', icon: 'mdi:eyedropper', label: 'Eyedropper' },
  { id: 'pan', icon: 'mdi:hand-back-right', label: 'Pan' },
] as const

export const QUICK_CHAT = [
  { id: 'hi', en: 'Hi!', id_text: 'Hai!' },
  { id: 'gg', en: 'Good game!', id_text: 'GG!' },
  { id: 'nice', en: 'Nice draw!', id_text: 'Bagus banget!' },
  { id: 'close', en: 'So close!', id_text: 'Hampir!' },
  { id: 'hurry', en: 'Hurry up!', id_text: 'Cepat!' },
  { id: 'lol', en: 'LOL', id_text: 'Wkwk' },
  { id: 'what', en: 'What is that?', id_text: 'Apa itu?' },
  { id: 'easy', en: 'Too easy!', id_text: 'Gampang!' },
] as const

export const DEFAULT_EMOTES = ['😂', '👏', '🔥', '🤔', '❤️', '😭', '🎉', '👍']

export const XP_PER_LEVEL = 100
export const XP_CORRECT_GUESS = 15
export const XP_DRAW_ROUND = 20
export const XP_WIN_GAME = 50

export const SCORE = {
  BASE_GUESS: 100,
  MAX_TIME_BONUS: 100,
  FIRST_GUESS_BONUS: 50,
  FAST_GUESS_MS: 5000,
  FAST_GUESS_BONUS: 30,
  DRAWER_PER_CORRECT: 40,
  PERFECT_ROUND_BONUS: 100,
  STREAK_BONUS: 20,
}

export const CHAT_MAX_LENGTH = 200
export const CHAT_RATE_LIMIT = 20 // per minute
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 20
export const ROOM_CODE_LENGTH = 6

export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const

export const AVATAR_COLORS = [
  '#F97316', '#3B82F6', '#22C55E', '#EAB308',
  '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444',
]
