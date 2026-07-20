import { SCORE } from './constants'

/**
 * Points for a correct guess: base + time bonus + optional first/fast bonuses.
 * timeRemainingRatio: 0..1 (1 = guessed immediately)
 */
export function calculateGuessPoints(opts: {
  timeRemainingRatio: number
  isFirst: boolean
  timeTakenMs: number
  streak?: number
}): { points: number; bonuses: string[] } {
  const bonuses: string[] = []
  let points = SCORE.BASE_GUESS

  const timeBonus = Math.round(SCORE.MAX_TIME_BONUS * Math.max(0, Math.min(1, opts.timeRemainingRatio)))
  points += timeBonus

  if (opts.isFirst) {
    points += SCORE.FIRST_GUESS_BONUS
    bonuses.push('first')
  }

  if (opts.timeTakenMs <= SCORE.FAST_GUESS_MS) {
    points += SCORE.FAST_GUESS_BONUS
    bonuses.push('fast')
  }

  if (opts.streak && opts.streak >= 2) {
    points += SCORE.STREAK_BONUS * Math.min(opts.streak - 1, 5)
    bonuses.push('streak')
  }

  return { points, bonuses }
}

export function calculateDrawerPoints(correctGuessCount: number, totalGuessers: number): {
  points: number
  perfect: boolean
} {
  let points = correctGuessCount * SCORE.DRAWER_PER_CORRECT
  const perfect = totalGuessers > 0 && correctGuessCount === totalGuessers
  if (perfect) {
    points += SCORE.PERFECT_ROUND_BONUS
  }
  return { points, perfect }
}

export function levelFromXp(xp: number): number {
  // Simple linear: every 100 XP = 1 level, starting at 1
  return Math.max(1, Math.floor(xp / 100) + 1)
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; ratio: number } {
  const level = levelFromXp(xp)
  const baseXp = (level - 1) * 100
  const current = xp - baseXp
  const needed = 100
  return { level, current, needed, ratio: current / needed }
}

/** Normalize guess for comparison */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

export function isCorrectGuess(guess: string, word: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(word)
}

/** Build progressive hint like M _ _ _ _ → Mo _ _ _ */
export interface HintState {
  display: string[]
  revealed: number
}

export function buildWordHint(word: string, revealCount: number): string[] {
  const chars = word.split('')
  const letters = chars.filter(c => c !== ' ')
  const toReveal = Math.min(revealCount, Math.max(0, letters.length - 1))

  let revealed = 0
  return chars.map((c) => {
    if (c === ' ') return ' '
    if (revealed < toReveal) {
      revealed++
      return c
    }
    return '_'
  })
}

export function letterCountMask(word: string): string {
  return word
    .split('')
    .map(c => (c === ' ' ? '  ' : '_'))
    .join(' ')
}
