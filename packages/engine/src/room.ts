import type { GameRules, Role } from './types'

/** 4 joueurs à table + jusqu'à 20 personnes en file d'attente. */
export const ROOM_CAPACITY = 24
export const MIN_SEATS = 2
export const MAX_SEATS = 4

export interface RoomMemberView {
  id: string
  pseudo: string
  /** Avatar emoji du profil. */
  avatar: string
  role: Role
  isHost: boolean
  connected: boolean
}

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'redeal'

export interface RoomView {
  code: string
  status: RoomStatus
  members: RoomMemberView[]
  /** Identifiants des membres assis (les joueurs de la prochaine/actuelle manche), dans l'ordre du tour. */
  seats: string[]
  /** Spectateurs dans l'ordre de la file d'attente. */
  queue: string[]
  lastWinnerId: string | null
  /** Préréglages de la table (choisis par l'hôte). */
  rules: GameRules
  /** Scores cumulés du match en cours (mode match aux points uniquement). */
  scores: Record<string, number>
  /** Vainqueur du match (a atteint la cible) ; null sinon. */
  matchWinnerId: string | null
}

/**
 * Rotation "le gagnant reste" (à la victoire) : la file prend les places des
 * perdants. S'il y a moins de remplaçants que de perdants, sortent en
 * priorité les **plus petits scores** ; à égalité, **celui qui est à gauche
 * du gagnant** (le siège précédent dans l'ordre du tour) cède sa place en
 * premier. Sans file, les mêmes joueurs rejouent (gagnant en tête).
 */
export function rotateWinnerStays(
  seats: readonly string[],
  queue: readonly string[],
  winnerId: string,
  scores: Record<string, number> = {},
): { seats: string[]; queue: string[] } {
  const winnerIndex = seats.indexOf(winnerId)
  if (winnerIndex < 0) {
    throw new Error(`Le gagnant ${winnerId} n'est pas assis`)
  }
  const n = seats.length
  const openSeats = n - 1
  const incoming = queue.slice(0, openSeats)

  // Distance « à gauche du gagnant » : 1 = siège immédiatement à sa gauche.
  const leftDistance = (id: string) => (winnerIndex - seats.indexOf(id) + n) % n
  const evictionOrder = seats
    .filter((id) => id !== winnerId)
    .sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0) || leftDistance(a) - leftDistance(b))

  const evicted = evictionOrder.slice(0, incoming.length)
  const survivors = seats.filter((id) => id !== winnerId && !evicted.includes(id))

  return {
    seats: [winnerId, ...incoming, ...survivors],
    queue: [...queue.slice(incoming.length), ...evicted],
  }
}
