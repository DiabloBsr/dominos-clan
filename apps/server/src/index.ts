import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { Server, type Socket } from 'socket.io'
import { viewFor } from '@dominos-clan/engine'
import type { Move } from '@dominos-clan/engine'
import { createVoiceToken, voiceEnabled } from './voice'
import * as presence from './presence'
import { armChessFlag, chessViewOf } from './chess'
import {
  RoomError,
  canChat,
  canPlaySound,
  canReact,
  chessFlagRoom,
  chessMoveRoom,
  chessResignRoom,
  createRoom,
  gameRole,
  getRoom,
  joinRoom,
  leaveSeat,
  ludoPlayRoom,
  ludoRollRoom,
  ludoTargetRoom,
  markDisconnected,
  resumeMember,
  playMove,
  promoteToSeat,
  redealNow,
  removeMember,
  restartRoom,
  roomView,
  sanitizeChatText,
  setRules,
  startGame,
  takeSeat,
  transferHost,
  undoMove,
  type Room,
} from './rooms'

const PORT = Number(process.env.PORT ?? 4001)

// En prod (Docker/HF Space), le serveur sert aussi le client web buildé.
const staticDir =
  process.env.STATIC_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url))
const serveStatic = existsSync(staticDir)
  ? sirv(staticDir, {
      single: true,
      etag: true,
      setHeaders: (res, pathname) => {
        // Les assets Vite sont hashés → cache immuable ; le HTML jamais,
        // sinon un navigateur peut rester bloqué sur un ancien déploiement.
        if (pathname.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    })
  : null

if (serveStatic) console.log(`[dominos-clan] client web servi depuis ${staticDir}`)

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz' || !serveStatic) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'dominos-clan-server' }))
    return
  }
  serveStatic(req, res)
})

const io = new Server(httpServer, {
  cors: { origin: '*' },
})

interface SocketState {
  roomCode?: string
  memberId?: string
}

/** Répartition round-robin des salons entre les projets LiveKit du pool. */
let voiceRoundRobin = 0

/** Grâce après déconnexion : le temps d'un rechargement de page, la place est gardée. */
const GRACE_MS = 90_000
const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>()

function cancelPendingRemoval(code: string, memberId: string): void {
  const key = `${code}:${memberId}`
  const timer = pendingRemovals.get(key)
  if (timer) {
    clearTimeout(timer)
    pendingRemovals.delete(key)
  }
}

type Ack = (response: { ok: true; [key: string]: unknown } | { ok: false; error: string }) => void

/**
 * Diffuse l'état du salon + l'état de jeu FILTRÉ PAR RÔLE à chaque membre.
 * C'est le seul endroit qui émet du state de partie : un joueur ne reçoit
 * jamais les mains adverses, un spectateur reçoit tout.
 */
function broadcast(room: Room): void {
  const view = roomView(room)
  for (const member of room.members.values()) {
    if (!member.connected) continue
    // Statut de présence pour les amis : en partie si assis dans la manche en cours.
    const playing = room.status === 'playing' && gameRole(room, member.id) === 'player'
    presence.setRoomStatus(io, member.userId, playing ? 'playing' : 'room', room.code)
    const socket = io.sockets.sockets.get(member.socketId)
    if (!socket) continue
    socket.emit('room:state', view)
    socket.emit('game:state', room.game ? viewFor(room.game, member.id, gameRole(room, member.id)) : null)
    socket.emit('chess:state', room.chessGame ? chessViewOf(room.chessGame) : null)
    socket.emit('ludo:state', room.ludoGame ?? null)
  }
}

/** Arme le drapeau serveur de la partie d'échecs en cours (s'il y en a une). */
function armFlag(room: Room): void {
  if (room.status !== 'playing' || !room.chessGame) return
  const code = room.code
  armChessFlag(room.chessGame, () => {
    try {
      const r = getRoom(code)
      if (chessFlagRoom(r)) broadcast(r)
    } catch {
      // Salon supprimé entre-temps.
    }
  })
}

function withRoom(state: SocketState): { room: Room; memberId: string } {
  if (!state.roomCode || !state.memberId) throw new RoomError('Pas de salon actif')
  return { room: getRoom(state.roomCode), memberId: state.memberId }
}

function handle(ack: Ack | undefined, fn: () => Record<string, unknown> | void): void {
  try {
    const extra = fn() ?? {}
    ack?.({ ok: true, ...extra })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    ack?.({ ok: false, error: message })
  }
}

io.on('connection', (socket: Socket) => {
  const state: SocketState = {}

  socket.on(
    'room:create',
    (payload: { pseudo?: unknown; userId?: unknown; avatar?: unknown }, ack?: Ack) =>
      handle(ack, () => {
        if (state.roomCode) throw new RoomError('Déjà dans un salon')
        const identity = presence.sanitizeIdentity(payload ?? {})
        const { room, member } = createRoom(payload?.pseudo, socket.id, identity)
        state.roomCode = room.code
        state.memberId = member.id
        socket.join(room.code)
        broadcast(room)
        return { code: room.code, selfId: member.id, resumeKey: member.resumeKey }
      }),
  )

  socket.on(
    'room:join',
    (payload: { code?: unknown; pseudo?: unknown; userId?: unknown; avatar?: unknown }, ack?: Ack) =>
      handle(ack, () => {
        if (state.roomCode) throw new RoomError('Déjà dans un salon')
        const identity = presence.sanitizeIdentity(payload ?? {})
        const { room, member } = joinRoom(payload?.code, payload?.pseudo, socket.id, identity)
        state.roomCode = room.code
        state.memberId = member.id
        socket.join(room.code)
        broadcast(room)
        return { code: room.code, selfId: member.id, resumeKey: member.resumeKey }
      }),
  )

  socket.on(
    'room:resume',
    (payload: { code?: unknown; memberId?: unknown; resumeKey?: unknown }, ack?: Ack) =>
      handle(ack, () => {
        if (state.roomCode) throw new RoomError('Déjà dans un salon')
        if (typeof payload?.code !== 'string') throw new RoomError('Session invalide')
        const room = getRoom(payload.code.trim().toUpperCase())
        const member = resumeMember(room, payload.memberId, payload.resumeKey, socket.id)
        cancelPendingRemoval(room.code, member.id)
        state.roomCode = room.code
        state.memberId = member.id
        socket.join(room.code)
        broadcast(room)
        return { code: room.code, selfId: member.id, resumeKey: member.resumeKey }
      }),
  )

  socket.on('presence:hello', (payload: Record<string, unknown>, ack?: Ack) =>
    handle(ack, () => {
      presence.hello(io, socket.id, payload ?? {})
    }),
  )

  socket.on('presence:watch', (payload: { ids?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const friends = presence.watch(io, socket.id, payload?.ids)
      return { friends }
    }),
  )

  socket.on('friend:invite', (payload: { toUserId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room } = withRoom(state)
      presence.invite(io, socket.id, payload?.toUserId, room.code)
    }),
  )

  socket.on('friend:knock', (payload: { toUserId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      presence.knock(io, socket.id, payload?.toUserId)
    }),
  )

  socket.on('room:restart', (payload: { promoteId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      restartRoom(room, memberId, payload?.promoteId)
      const host = room.members.get(memberId)
      io.to(room.code).emit('room:restarted', { byPseudo: host?.pseudo ?? 'l’hôte' })
      broadcast(room)
    }),
  )

  socket.on('seat:take', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      takeSeat(room, memberId)
      broadcast(room)
    }),
  )

  socket.on('seat:leave', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      leaveSeat(room, memberId)
      broadcast(room)
    }),
  )

  socket.on('seat:promote', (payload: { memberId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      promoteToSeat(room, memberId, payload?.memberId)
      broadcast(room)
    }),
  )

  socket.on('room:rules', (payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      setRules(room, memberId, payload)
      broadcast(room)
    }),
  )

  // Le chef refait les réglages SANS quitter : partie en cours annulée,
  // scores effacés, nouvelles règles appliquées — on repart de zéro.
  socket.on('room:reconfigure', (payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      restartRoom(room, memberId)
      setRules(room, memberId, payload)
      const host = room.members.get(memberId)
      io.to(room.code).emit('room:restarted', {
        byPseudo: host?.pseudo ?? 'l’hôte',
        reconfigured: true,
      })
      broadcast(room)
    }),
  )

  socket.on('room:transfer-host', (payload: { toId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      transferHost(room, memberId, payload?.toId)
      const newHost = room.members.get(room.hostId)
      io.to(room.code).emit('room:host-changed', { pseudo: newHost?.pseudo ?? 'quelqu’un' })
      broadcast(room)
    }),
  )

  socket.on('game:start', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      startGame(room, memberId)
      broadcast(room)
      armFlag(room)
    }),
  )

  socket.on(
    'chess:move',
    (payload: { from?: unknown; to?: unknown; promotion?: unknown }, ack?: Ack) =>
      handle(ack, () => {
        const { room, memberId } = withRoom(state)
        chessMoveRoom(room, memberId, payload ?? {})
        broadcast(room)
        armFlag(room)
      }),
  )

  socket.on('ludo:roll', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      ludoRollRoom(room, memberId)
      broadcast(room)
    }),
  )

  socket.on('ludo:play', (payload: { pawn?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      ludoPlayRoom(room, memberId, payload?.pawn)
      broadcast(room)
    }),
  )

  socket.on('ludo:target', (payload: { player?: unknown; pawn?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      ludoTargetRoom(room, memberId, payload?.player, payload?.pawn)
      broadcast(room)
    }),
  )

  socket.on('chess:resign', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      chessResignRoom(room, memberId)
      broadcast(room)
    }),
  )

  socket.on('game:move', (payload: { move?: Move; slam?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      if (!payload?.move) throw new RoomError('Coup manquant')
      playMove(room, memberId, payload.move)
      // Claquage : le domino rabattu de toutes ses forces — tout le salon
      // entend le CLAC (pur effet d'ambiance, validé après le coup).
      if (payload.slam === true && payload.move.type === 'play') {
        const member = room.members.get(memberId)
        if (member) io.to(room.code).emit('game:slam', { memberId, pseudo: member.pseudo })
      }
      // « JE PASSE 😭 » affiché chez tout le monde quand quelqu'un passe.
      if (payload.move.type === 'pass') {
        const member = room.members.get(memberId)
        if (member) io.to(room.code).emit('game:passed', { memberId, pseudo: member.pseudo })
      }
      broadcast(room)
    }),
  )

  socket.on('game:redeal', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      redealNow(room, memberId)
      broadcast(room)
    }),
  )

  socket.on('game:undo', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      undoMove(room, memberId)
      broadcast(room)
    }),
  )

  // Token vocal : délivré uniquement à un membre effectif d'un salon,
  // pour la room LiveKit de CE salon. L'audio ne transite pas par ici.
  // Pool : projet assigné au salon en round-robin ; `retry` (échec de
  // connexion côté client) fait basculer le salon au projet suivant.
  socket.on('voice:token', (payload: { retry?: unknown }, ack?: Ack) => {
    void (async () => {
      try {
        const { room, memberId } = withRoom(state)
        const member = room.members.get(memberId)
        if (!member) throw new RoomError('Membre inconnu')
        if (room.voiceProjectIndex === null) {
          room.voiceProjectIndex = voiceRoundRobin++
        } else if (payload?.retry === true && Date.now() - room.voiceAdvancedAt > 10_000) {
          room.voiceProjectIndex += 1
          room.voiceAdvancedAt = Date.now()
          console.log(`[dominos-clan] salon ${room.code} : bascule vers le projet vocal suivant`)
        }
        const { url, token, project } = await createVoiceToken(
          room.code,
          memberId,
          member.pseudo,
          room.voiceProjectIndex,
        )
        ack?.({ ok: true, url, token, project })
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue' })
      }
    })()
  })

  socket.on('reaction', (payload: { emoji?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const member = room.members.get(memberId)
      if (!member || typeof payload?.emoji !== 'string') throw new RoomError('Réaction invalide')
      if (!canReact(room, memberId, payload.emoji)) return
      io.to(room.code).emit('reaction', {
        memberId,
        pseudo: member.pseudo,
        emoji: payload.emoji,
      })
    }),
  )

  socket.on('chat:send', (payload: { text?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const member = room.members.get(memberId)
      if (!member) throw new RoomError('Membre inconnu')
      const text = sanitizeChatText(payload?.text)
      if (!canChat(room, memberId)) return
      io.to(room.code).emit('chat:message', { memberId, pseudo: member.pseudo, text })
    }),
  )

  socket.on('sound:send', (payload: { kind?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const member = room.members.get(memberId)
      if (!member || typeof payload?.kind !== 'string') throw new RoomError('Son invalide')
      if (!canPlaySound(room, memberId, payload.kind)) return
      io.to(room.code).emit('sound:played', {
        memberId,
        pseudo: member.pseudo,
        kind: payload.kind,
      })
    }),
  )

  const leave = (): void => {
    if (!state.roomCode || !state.memberId) return
    cancelPendingRemoval(state.roomCode, state.memberId)
    try {
      const room = getRoom(state.roomCode)
      const { empty, aborted } = removeMember(room, state.memberId)
      if (!empty) {
        if (aborted) io.to(room.code).emit('game:aborted', { memberId: state.memberId })
        broadcast(room)
      }
    } catch {
      // Salon déjà supprimé : rien à faire.
    }
    socket.leave(state.roomCode)
    state.roomCode = undefined
    state.memberId = undefined
    presence.backToLobby(io, socket.id)
  }

  socket.on('room:leave', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      leave()
    }),
  )

  socket.on('disconnect', () => {
    // Déconnexion (rechargement, réseau…) : on GARDE la place pendant la
    // période de grâce — la reprise de session (room:resume) la récupère.
    if (state.roomCode && state.memberId) {
      const code = state.roomCode
      const memberId = state.memberId
      state.roomCode = undefined
      state.memberId = undefined
      try {
        const room = getRoom(code)
        markDisconnected(room, memberId)
        broadcast(room)
        const key = `${code}:${memberId}`
        pendingRemovals.set(
          key,
          setTimeout(() => {
            pendingRemovals.delete(key)
            try {
              const r = getRoom(code)
              const member = r.members.get(memberId)
              if (!member || member.connected) return
              const { empty, aborted } = removeMember(r, memberId)
              if (!empty) {
                if (aborted) io.to(code).emit('game:aborted', { memberId })
                broadcast(r)
              }
            } catch {
              // Salon déjà supprimé entre-temps.
            }
          }, GRACE_MS),
        )
      } catch {
        // Salon déjà supprimé.
      }
    }
    presence.disconnect(io, socket.id)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[dominos-clan] serveur prêt sur http://localhost:${PORT}`)
  console.log(`[dominos-clan] chat vocal LiveKit : ${voiceEnabled() ? 'configuré' : 'désactivé (LIVEKIT_* manquants)'}`)
})
