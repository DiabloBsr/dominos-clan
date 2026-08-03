/**
 * Profil et amis — stockés sur l'appareil (localStorage), aucun compte.
 * Le `id` est le « code ami » : stable, généré une fois, partagé entre potes.
 */
export interface Profile {
  id: string
  pseudo: string
  avatar: string
}

export interface Friend {
  id: string
  pseudo: string
  avatar: string
}

export type FriendStatus = 'online' | 'room' | 'playing' | 'offline'

export const AVATARS = ['😎', '🤙', '🦁', '🐯', '🐼', '🦊', '👑', '🎩', '🔥', '🎯', '🃏', '🛸']

export const STATUS_LABELS: Record<FriendStatus, string> = {
  online: '🟢 actif',
  room: '🟡 au salon',
  playing: '🎲 en partie',
  offline: '⚫ hors ligne',
}

const PROFILE_KEY = 'dc:profile'
const FRIENDS_KEY = 'dc:friends'
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Profile
      if (typeof p.id === 'string' && p.id.length >= 6) return p
    }
  } catch {
    // stockage corrompu : on regénère
  }
  const fresh: Profile = {
    id: generateId(),
    pseudo: '',
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(fresh))
  return fresh
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function loadFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY)
    if (raw) {
      const list = JSON.parse(raw) as Friend[]
      if (Array.isArray(list)) return list.filter((f) => typeof f.id === 'string')
    }
  } catch {
    // liste corrompue : on repart de zéro
  }
  return []
}

export function saveFriends(friends: Friend[]): void {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
}
