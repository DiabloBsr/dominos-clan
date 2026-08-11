/**
 * Profil et amis — stockés sur l'appareil (localStorage), aucun compte.
 * Le `id` est le « code ami » : stable, généré une fois, partagé entre potes.
 */
export interface Profile {
  id: string
  pseudo: string
  avatar: string
  /** Cri de capture personnel (Ludo) — affiché quand TU captures ; vide = cris par défaut. */
  taunt?: string
}

export interface Friend {
  id: string
  pseudo: string
  avatar: string
  /** Demande envoyée, pas encore acceptée — renvoyée dès qu'il se connecte. */
  pending?: boolean
}

export type FriendStatus = 'online' | 'room' | 'playing' | 'offline'

export const AVATARS = [
  '😎', '🤙', '😏', '🤪', '😈', '🥶', '🤠', '🥷',
  '🦁', '🐯', '🐼', '🦊', '🐺', '🦍', '🐊', '🦅',
  '🐉', '🦈', '🐍', '🦂', '🐙', '🦉', '🐸', '🐵',
  '👑', '🎩', '🧢', '👺', '🤖', '👽', '💀', '🎭',
  '🔥', '⚡', '🎯', '🃏', '🎱', '🚀', '🛸', '💎',
]

/** Libellés SANS emoji : la pastille de couleur est dessinée en CSS
 *  (::before), toujours à la même place — seul le texte change. */
export const STATUS_LABELS: Record<FriendStatus, string> = {
  online: 'actif',
  room: 'au salon',
  playing: 'en partie',
  offline: 'hors ligne',
}

const PROFILE_KEY = 'dc:profile'
const FRIENDS_KEY = 'dc:friends'
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
}

/** Nom affiché d'un ami : JAMAIS vide — pseudo nettoyé, sinon le code ami. */
export function friendLabel(f: Pick<Friend, 'id' | 'pseudo'>): string {
  return (f.pseudo ?? '').trim() || f.id
}

/** Avatar affiché : JAMAIS vide — fallback ❔ si donnée absente ou blanche. */
export function friendAvatar(f: Pick<Friend, 'avatar'>): string {
  return (f.avatar ?? '').trim() || '❔'
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Profile
      if (typeof p.id === 'string' && p.id.length >= 6) {
        // Vieux profils (avant les avatars) ou données blanches : on répare.
        if (!(p.avatar ?? '').trim()) {
          p.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]!
          localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
        }
        return p
      }
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
      if (Array.isArray(list)) {
        // Répare les entrées empoisonnées par d'anciennes versions
        // (pseudo fait d'espaces, avatar vide → ligne invisible).
        return list
          .filter((f) => typeof f.id === 'string')
          .map((f) => ({
            id: f.id,
            pseudo: (f.pseudo ?? '').trim(),
            avatar: (f.avatar ?? '').trim() || '❔',
          }))
      }
    }
  } catch {
    // liste corrompue : on repart de zéro
  }
  return []
}

export function saveFriends(friends: Friend[]): void {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
}

/** Session de salon en cours — pour revenir dans la partie après un rechargement. */
export interface RoomSession {
  code: string
  memberId: string
  resumeKey: string
}

const SESSION_KEY = 'dc:session'

export function loadSession(): RoomSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as RoomSession
    if (typeof s.code === 'string' && typeof s.memberId === 'string' && typeof s.resumeKey === 'string') {
      return s
    }
  } catch {
    // session corrompue
  }
  return null
}

export function saveSession(session: RoomSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SNAPSHOT_KEY)
}

/* ─── Instantané de salon (mémoire de reprise) ─────────────────────────
   Blob CHIFFRÉ envoyé par le serveur à chaque changement d'état : si le
   serveur redémarre (redéploiement…), on le lui représente et le salon est
   restauré exactement où il en était — scores, sièges, manche en cours. */

const SNAPSHOT_KEY = 'dc:snapshot'
const CREW_KEY = 'dc:crew'

/** La « bande » : les amis présents dans mon dernier salon — pour les
 *  re-inviter tous d'un clic depuis l'accueil. */
export function saveCrew(ids: string[]): void {
  try {
    localStorage.setItem(CREW_KEY, JSON.stringify(ids.slice(0, 24)))
  } catch {
    // stockage plein : pas grave
  }
}

export function loadCrew(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CREW_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveSnapshot(code: string, blob: string): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ code, blob }))
  } catch {
    // stockage plein : la reprise retombera sur la session simple
  }
}

export function loadSnapshot(code: string): string | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as { code?: unknown; blob?: unknown }
    if (s.code === code && typeof s.blob === 'string') return s.blob
  } catch {
    // instantané corrompu
  }
  return null
}
