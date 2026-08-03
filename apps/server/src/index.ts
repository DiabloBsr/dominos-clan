import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { Server, type Socket } from 'socket.io'
import { viewFor } from '@dominos-clan/engine'
import type { Move } from '@dominos-clan/engine'
import { createVoiceToken, voiceEnabled } from './voice'
import * as presence from './presence'
import {
  RoomError,
  canChat,
  canReact,
  createRoom,
  gameRole,
  getRoom,
  joinRoom,
  leaveSeat,
  playMove,
  promoteToSeat,
  removeMember,
  restartRoom,
  roomView,
  sanitizeChatText,
  setRules,
  startGame,
  takeSeat,
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
  }
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
        return { code: room.code, selfId: member.id }
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
        return { code: room.code, selfId: member.id }
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

  socket.on('game:start', (_payload: unknown, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      startGame(room, memberId)
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
  socket.on('voice:token', (_payload: unknown, ack?: Ack) => {
    void (async () => {
      try {
        const { room, memberId } = withRoom(state)
        const member = room.members.get(memberId)
        if (!member) throw new RoomError('Membre inconnu')
        const { url, token } = await createVoiceToken(room.code, memberId, member.pseudo)
        ack?.({ ok: true, url, token })
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

  const leave = (): void => {
    if (!state.roomCode || !state.memberId) return
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
    leave()
    presence.disconnect(io, socket.id)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[dominos-clan] serveur prêt sur http://localhost:${PORT}`)
  console.log(`[dominos-clan] chat vocal LiveKit : ${voiceEnabled() ? 'configuré' : 'désactivé (LIVEKIT_* manquants)'}`)
})
