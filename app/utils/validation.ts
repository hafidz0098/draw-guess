import { z } from 'zod'
import { CHAT_MAX_LENGTH, NICKNAME_MAX, NICKNAME_MIN } from './constants'

export const nicknameSchema = z
  .string()
  .min(NICKNAME_MIN, `Minimal ${NICKNAME_MIN} karakter`)
  .max(NICKNAME_MAX, `Maksimal ${NICKNAME_MAX} karakter`)
  .regex(/^[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF ]+$/, 'Karakter tidak valid')

export const createRoomSchema = z.object({
  name: z.string().min(2).max(40),
  password: z.string().max(32).optional().or(z.literal('')),
  is_private: z.boolean(),
  max_players: z.union([
    z.literal(2), z.literal(4), z.literal(6),
    z.literal(8), z.literal(10), z.literal(12),
  ]),
  total_rounds: z.union([
    z.literal(3), z.literal(5), z.literal(7), z.literal(10),
  ]),
  language: z.enum(['id', 'en']),
  draw_time: z.union([
    z.literal(30), z.literal(45), z.literal(60), z.literal(90),
  ]),
  word_difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
})

export const joinRoomSchema = z.object({
  code: z.string().min(4).max(8).transform(s => s.toUpperCase().trim()),
  password: z.string().max(32).optional().or(z.literal('')),
})

export const chatSchema = z.object({
  message: z.string().min(1).max(CHAT_MAX_LENGTH).transform(s => s.trim()),
  room_id: z.string().uuid(),
  message_type: z.enum(['chat', 'guess', 'system', 'correct', 'emote', 'quick']).default('chat'),
})

export const guessSchema = z.object({
  round_id: z.string().uuid(),
  guess_text: z.string().min(1).max(100).transform(s => s.trim()),
})

export const profileUpdateSchema = z.object({
  nickname: nicknameSchema.optional(),
  bio: z.string().max(200).optional(),
  country: z.string().max(60).optional(),
  favorite_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  avatar_url: z.string().url().optional().nullable(),
})

export const reportSchema = z.object({
  reported_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
  reason: z.string().min(3).max(100),
  details: z.string().max(500).optional(),
})

export type CreateRoomForm = z.infer<typeof createRoomSchema>
export type JoinRoomForm = z.infer<typeof joinRoomSchema>
export type ProfileUpdateForm = z.infer<typeof profileUpdateSchema>
