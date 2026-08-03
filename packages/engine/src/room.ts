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

export type RoomStatus = 'lobby' | 'playing' | 'finished'

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
 * Rotation "le gagnant reste" : les perdants partent en fin de file,
 * les premiers de la file prennent les sièges libérés. Sans spectateurs
 * en attente, les mêmes joueurs rejouent (gagnant en tête).
 */
/**
 * Bascule de file en cours de match : les `count` plus petits scores cumulés
 * (JAMAIS le gagnant de la manche ; égalité départagée par l'ordre des sièges)
 * cèdent leur place aux premiers de la file et repartent en fin de file.
 * Borné par la taille de la file : personne n'entre s'il n'y a personne.
 */
export function swapLowestScores(
  seats: readonly string[],
  queue: readonly string[],
  scores: Record<string, number>,
  winnerId: string,
  count: number,
): { seats: string[]; queue: string[] } {
  const nextSeats = [...seats]
  const nextQueue = [...queue]
  const candidates = nextSeats
    .filter((id) => id !== winnerId)
    .sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0))
  const n = Math.min(Math.max(0, count), queue.length, candidates.length)
  for (let i = 0; i < n; i++) {
    const evicted = candidates[i]!
    const incoming = nextQueue.shift()!
    nextSeats[nextSeats.indexOf(evicted)] = incoming
    nextQueue.push(evicted)
  }
  return { seats: nextSeats, queue: nextQueue }
}

export function rotateWinnerStays(
  seats: readonly string[],
  queue: readonly string[],
  winnerId: string,
): { seats: string[]; queue: string[] } {
  if (!seats.includes(winnerId)) {
    throw new Error(`Le gagnant ${winnerId} n'est pas assis`)
  }
  const losers = seats.filter((id) => id !== winnerId)
  const candidates = [...queue, ...losers]
  const openSeats = seats.length - 1
  return {
    seats: [winnerId, ...candidates.slice(0, openSeats)],
    queue: candidates.slice(openSeats),
  }
}
