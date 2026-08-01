import { randomBytes, randomInt } from 'node:crypto'
import {
  MAX_SEATS,
  MIN_SEATS,
  ROOM_CAPACITY,
  applyMove,
  createGame,
  rotateWinnerStays,
} from '@dominos-clan/engine'
import type { GameState, Move, Role, RoomStatus, RoomView } from '@dominos-clan/engine'

export interface Member {
  id: string
  pseudo: string
  socketId: string
  connected: boolean
}

export interface Room {
  code: string
  hostId: string
  members: Map<string, Member>
  seats: string[]
  queue: string[]
  game: GameState | null
  status: RoomStatus
  lastWinnerId: string | null
  /** Timestamp de la dernière réaction par membre (anti-spam). */
  lastReactionAt: Map<string, number>
  /** Timestamp du dernier message chat par membre (anti-spam). */
  lastChatAt: Map<string, number>
}

export class RoomError extends Error {}

const rooms = new Map<string, Room>()

/** Alphabet sans caractères ambigus (pas de O/0, I/1…). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
  throw new RoomError('Impossible de générer un code de salon')
}

function sanitizePseudo(raw: unknown): string {
  if (typeof raw !== 'string') throw new RoomError('Pseudo invalide')
  const pseudo = raw.trim().slice(0, 20)
  if (pseudo.length === 0) throw new RoomError('Pseudo vide')
  return pseudo
}

export function getRoom(code: string): Room {
  const room = rooms.get(code)
  if (!room) throw new RoomError('Salon introuvable')
  return room
}

export function createRoom(rawPseudo: unknown, socketId: string): { room: Room; member: Member } {
  const pseudo = sanitizePseudo(rawPseudo)
  const member: Member = {
    id: randomBytes(8).toString('base64url'),
    pseudo,
    socketId,
    connected: true,
  }
  const room: Room = {
    code: generateCode(),
    hostId: member.id,
    members: new Map([[member.id, member]]),
    seats: [member.id],
    queue: [],
    game: null,
    status: 'lobby',
    lastWinnerId: null,
    lastReactionAt: new Map(),
    lastChatAt: new Map(),
  }
  rooms.set(room.code, room)
  return { room, member }
}

export function joinRoom(
  rawCode: unknown,
  rawPseudo: unknown,
  socketId: string,
): { room: Room; member: Member } {
  if (typeof rawCode !== 'string') throw new RoomError('Code invalide')
  const room = getRoom(rawCode.trim().toUpperCase())
  if (room.members.size >= ROOM_CAPACITY) throw new RoomError('Salon complet (10 max)')
  const pseudo = sanitizePseudo(rawPseudo)
  const member: Member = {
    id: randomBytes(8).toString('base64url'),
    pseudo,
    socketId,
    connected: true,
  }
  room.members.set(member.id, member)
  // Une partie en cours (ou un salon déjà plein en sièges) → on arrive spectateur.
  if (room.status === 'lobby' && room.seats.length < MAX_SEATS) {
    room.seats.push(member.id)
  } else {
    room.queue.push(member.id)
  }
  return { room, member }
}

export function takeSeat(room: Room, memberId: string): void {
  if (room.status === 'playing') throw new RoomError('Manche en cours, attends la fin')
  if (room.seats.includes(memberId)) return
  if (room.seats.length >= MAX_SEATS) throw new RoomError('Tous les sièges sont pris (4 max)')
  room.queue = room.queue.filter((id) => id !== memberId)
  room.seats.push(memberId)
}

export function leaveSeat(room: Room, memberId: string): void {
  if (room.status === 'playing') throw new RoomError('Manche en cours, attends la fin')
  if (!room.seats.includes(memberId)) return
  room.seats = room.seats.filter((id) => id !== memberId)
  room.queue.push(memberId)
}

export function startGame(room: Room, memberId: string): void {
  if (memberId !== room.hostId) throw new RoomError('Seul l’hôte peut lancer la manche')
  if (room.status === 'playing') throw new RoomError('Une manche est déjà en cours')
  if (room.seats.length < MIN_SEATS) throw new RoomError('Il faut au moins 2 joueurs assis')
  room.game = createGame(room.seats, randomInt(2 ** 31))
  room.status = 'playing'
  room.lastWinnerId = null
}

export function playMove(room: Room, memberId: string, move: Move): void {
  if (room.status !== 'playing' || !room.game) throw new RoomError('Aucune manche en cours')
  room.game = applyMove(room.game, memberId, move)
  if (room.game.status === 'finished') {
    room.status = 'finished'
    const winnerId = room.game.result!.winnerId
    room.lastWinnerId = winnerId
    // Rotation immédiate : tout le monde voit la nouvelle table avant la manche suivante.
    const rotated = rotateWinnerStays(room.seats, room.queue, winnerId)
    room.seats = rotated.seats
    room.queue = rotated.queue
  }
}

/** Rôle vis-à-vis de la manche EN COURS (pas des sièges du prochain tour). */
export function gameRole(room: Room, memberId: string): Role {
  return room.game?.players.some((p) => p.id === memberId) ? 'player' : 'spectator'
}

/**
 * Retire un membre. Si un joueur de la manche en cours part, la manche est
 * annulée (pas de gagnant, pas de rotation). Retourne true si le salon est vide.
 */
export function removeMember(room: Room, memberId: string): { empty: boolean; aborted: boolean } {
  if (!room.members.has(memberId)) return { empty: room.members.size === 0, aborted: false }

  let aborted = false
  if (room.status === 'playing' && gameRole(room, memberId) === 'player') {
    room.game = null
    room.status = 'lobby'
    room.lastWinnerId = null
    aborted = true
  }
  room.members.delete(memberId)
  room.seats = room.seats.filter((id) => id !== memberId)
  room.queue = room.queue.filter((id) => id !== memberId)
  room.lastReactionAt.delete(memberId)
  room.lastChatAt.delete(memberId)

  if (room.members.size === 0) {
    rooms.delete(room.code)
    return { empty: true, aborted }
  }
  if (room.hostId === memberId) {
    room.hostId = [...room.members.keys()][0]!
  }
  return { empty: false, aborted }
}

export function roomView(room: Room): RoomView {
  return {
    code: room.code,
    status: room.status,
    members: [...room.members.values()].map((m) => ({
      id: m.id,
      pseudo: m.pseudo,
      role: room.seats.includes(m.id) ? 'player' : 'spectator',
      isHost: m.id === room.hostId,
      connected: m.connected,
    })),
    seats: [...room.seats],
    queue: [...room.queue],
    lastWinnerId: room.lastWinnerId,
  }
}

export const REACTION_EMOJIS = ['😂', '🔥', '👏', '😮', '😭', '😈', '🤝', '💀'] as const
const REACTION_THROTTLE_MS = 400

export function canReact(room: Room, memberId: string, emoji: string): boolean {
  if (!REACTION_EMOJIS.includes(emoji as (typeof REACTION_EMOJIS)[number])) return false
  const last = room.lastReactionAt.get(memberId) ?? 0
  const now = Date.now()
  if (now - last < REACTION_THROTTLE_MS) return false
  room.lastReactionAt.set(memberId, now)
  return true
}

const CHAT_THROTTLE_MS = 500
const CHAT_MAX_LENGTH = 300

export function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') throw new RoomError('Message invalide')
  const text = raw.trim().slice(0, CHAT_MAX_LENGTH)
  if (text.length === 0) throw new RoomError('Message vide')
  return text
}

export function canChat(room: Room, memberId: string): boolean {
  const last = room.lastChatAt.get(memberId) ?? 0
  const now = Date.now()
  if (now - last < CHAT_THROTTLE_MS) return false
  room.lastChatAt.set(memberId, now)
  return true
}
