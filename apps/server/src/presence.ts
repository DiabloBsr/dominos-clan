import type { Server } from 'socket.io'
import { RoomError } from './rooms'

/**
 * Présence en temps réel — AUCUNE persistance : l'identité (userId) est générée
 * et conservée côté appareil, les amitiés vivent dans le localStorage des
 * clients. Le serveur ne fait que relier « qui est en ligne, dans quel état »
 * et relayer les invitations de salon entre utilisateurs connectés.
 */
export type PresenceStatus = 'online' | 'room' | 'playing' | 'offline'

interface PresenceEntry {
  userId: string
  pseudo: string
  avatar: string
  socketId: string
  status: PresenceStatus
  roomCode: string | null
}

const users = new Map<string, PresenceEntry>()
/** watchedUserId → sockets qui suivent ce user. */
const watchers = new Map<string, Set<string>>()
/** socketId → userIds suivis (pour le nettoyage). */
const socketWatches = new Map<string, Set<string>>()
const socketUser = new Map<string, string>()
const lastInviteAt = new Map<string, number>()

const USER_ID_RE = /^[A-Za-z0-9_-]{6,24}$/
const INVITE_THROTTLE_MS = 10_000

function publicView(u: PresenceEntry) {
  return { userId: u.userId, pseudo: u.pseudo, avatar: u.avatar, status: u.status }
}

function notify(io: Server, userId: string): void {
  const u = users.get(userId)
  if (!u) return
  for (const socketId of watchers.get(userId) ?? []) {
    io.to(socketId).emit('presence:update', publicView(u))
  }
}

export function sanitizeIdentity(raw: { userId?: unknown; pseudo?: unknown; avatar?: unknown }): {
  userId: string | null
  avatar: string
} {
  const userId =
    typeof raw.userId === 'string' && USER_ID_RE.test(raw.userId) ? raw.userId : null
  const avatar =
    typeof raw.avatar === 'string' && raw.avatar.length > 0 && raw.avatar.length <= 8
      ? raw.avatar
      : '🁫'
  return { userId, avatar }
}

export function hello(
  io: Server,
  socketId: string,
  raw: { userId?: unknown; pseudo?: unknown; avatar?: unknown },
): void {
  const { userId, avatar } = sanitizeIdentity(raw)
  if (!userId) throw new RoomError('Identifiant de profil invalide')
  const pseudo = typeof raw.pseudo === 'string' ? raw.pseudo.trim().slice(0, 20) : ''
  const previous = users.get(userId)
  users.set(userId, {
    userId,
    pseudo: pseudo || previous?.pseudo || 'joueur',
    avatar,
    socketId,
    status: previous && previous.socketId === socketId ? previous.status : 'online',
    roomCode: previous && previous.socketId === socketId ? previous.roomCode : null,
  })
  socketUser.set(socketId, userId)
  notify(io, userId)
}

/** Suivre une liste d'amis ; retourne l'état actuel de chacun. */
export function watch(
  io: Server,
  socketId: string,
  rawIds: unknown,
): Array<ReturnType<typeof publicView>> {
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((v): v is string => typeof v === 'string' && USER_ID_RE.test(v)).slice(0, 100)
    : []

  // On remplace l'abonnement précédent de ce socket.
  for (const watched of socketWatches.get(socketId) ?? []) {
    watchers.get(watched)?.delete(socketId)
  }
  socketWatches.set(socketId, new Set(ids))
  for (const id of ids) {
    if (!watchers.has(id)) watchers.set(id, new Set())
    watchers.get(id)!.add(socketId)
  }

  return ids.map((id) => {
    const u = users.get(id)
    return u ? publicView(u) : { userId: id, pseudo: '', avatar: '❔', status: 'offline' as const }
  })
}

/** Statut lié au salon (appelé à chaque broadcast de salon). */
export function setRoomStatus(
  io: Server,
  userId: string | null,
  status: Exclude<PresenceStatus, 'offline'>,
  roomCode: string | null,
): void {
  if (!userId) return
  const u = users.get(userId)
  if (!u) return
  if (u.status === status && u.roomCode === roomCode) return
  u.status = status
  u.roomCode = roomCode
  notify(io, userId)
}

export function backToLobby(io: Server, socketId: string): void {
  const userId = socketUser.get(socketId)
  if (userId) setRoomStatus(io, userId, 'online', null)
}

export function invite(io: Server, fromSocketId: string, rawToUserId: unknown, code: string): void {
  const fromUserId = socketUser.get(fromSocketId)
  const from = fromUserId ? users.get(fromUserId) : undefined
  if (!from) throw new RoomError('Crée ton profil avant d’inviter')
  if (typeof rawToUserId !== 'string' || !USER_ID_RE.test(rawToUserId)) {
    throw new RoomError('Code ami invalide')
  }
  const target = users.get(rawToUserId)
  if (!target || target.status === 'offline') throw new RoomError('Cet ami n’est pas en ligne')

  const throttleKey = `${fromUserId}>${rawToUserId}`
  const now = Date.now()
  if (now - (lastInviteAt.get(throttleKey) ?? 0) < INVITE_THROTTLE_MS) {
    throw new RoomError('Invitation déjà envoyée, laisse-lui quelques secondes')
  }
  lastInviteAt.set(throttleKey, now)

  io.to(target.socketId).emit('friend:invited', {
    fromPseudo: from.pseudo,
    fromAvatar: from.avatar,
    code,
  })
}

export function disconnect(io: Server, socketId: string): void {
  for (const watched of socketWatches.get(socketId) ?? []) {
    watchers.get(watched)?.delete(socketId)
  }
  socketWatches.delete(socketId)

  const userId = socketUser.get(socketId)
  socketUser.delete(socketId)
  if (!userId) return
  const u = users.get(userId)
  // Un autre socket a peut-être repris cette identité (autre onglet) : ne rien casser.
  if (!u || u.socketId !== socketId) return
  u.status = 'offline'
  u.roomCode = null
  notify(io, userId)
}
