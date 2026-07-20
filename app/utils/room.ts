import { customAlphabet } from 'nanoid'
import { ROOM_CODE_LENGTH } from './constants'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
const generate = customAlphabet(alphabet, ROOM_CODE_LENGTH)

export function generateRoomCode(): string {
  return generate()
}

export function generateGuestNickname(): string {
  const n = customAlphabet('0123456789', 4)()
  return `Guest_${n}`
}

export function inviteLink(code: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/join?code=${code}`
}

export function randomAvatarColor(seed: string): string {
  const colors = [
    '#F97316', '#3B82F6', '#22C55E', '#EAB308',
    '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}
