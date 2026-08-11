import { createServer } from 'node:http'
import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { Server, type Socket } from 'socket.io'
import { viewFor } from '@dominos-clan/engine'
import type { Move } from '@dominos-clan/engine'
import { createVoiceToken, voiceEnabled } from './voice'
import * as presence from './presence'
import {
  adminPage,
  adminStats,
  initStats,
  statMemberJoined,
  statRoomClosed,
  statRoomCreated,
  statTrackRoom,
  statUserSeen,
} from './stats'
import { armChessFlag, chessViewOf } from './chess'
import {
  RoomError,
  assertCanKick,
  canChat,
  canPlaySound,
  canReact,
  chessDrawRoom,
  chessFlagRoom,
  chessMoveRoom,
  chessResignRoom,
  createRoom,
  demoteToQueue,
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
  roomsSnapshot,
  STERILE_ROUNDS,
  sanitizeChatText,
  registerRestoredRoom,
  sanitizeTaunt,
  setRules,
  startGame,
  swapSeat,
  takeSeat,
  transferHost,
  undoMove,
  type Room,
} from './rooms'
import { decodeSnapshot, encodeSnapshot, restoreRoom } from './snapshot'

const PORT = Number(process.env.PORT ?? 4001)

// En prod (Docker/HF Space), le serveur sert aussi le client web buildé.
const staticDir =
  process.env.STATIC_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url))
const serveStatic = existsSync(staticDir)
  ? sirv(staticDir, {
      single: true,
      etag: true,
      // Hors Render : lit le disque à chaque requête, sinon sirv fige la
      // liste des fichiers AU DÉMARRAGE et un rebuild local → 404 écran noir.
      dev: !process.env.RENDER,
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

const ADMIN_KEY = process.env.ADMIN_KEY ?? 'clan-admin'

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/admin' || url.pathname === '/admin/stats.json') {
    if (url.pathname === '/admin') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(adminPage())
      return
    }
    if (url.searchParams.get('key') !== ADMIN_KEY) {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'clé admin invalide' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(adminStats(roomsSnapshot())))
    return
  }
  if (url.pathname === '/healthz' || !serveStatic) {
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
/**
 * Arme la période de grâce d'un membre déconnecté : passé GRACE_MS sans
 * reprise, il est retiré (et la manche avortée s'il y jouait). Utilisé à la
 * déconnexion ET à la RESTAURATION d'un salon — sur un serveur neuf, les
 * membres absents n'ont pas de minuteur : sans ça, une manche restaurée
 * attendrait éternellement un joueur qui ne reviendra jamais.
 */
function scheduleRemoval(code: string, memberId: string): void {
  const key = `${code}:${memberId}`
  if (pendingRemovals.has(key)) return
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
        } else {
          statRoomClosed(code)
        }
      } catch {
        // Salon déjà supprimé entre-temps.
      }
    }, GRACE_MS),
  )
}

function broadcast(room: Room): void {
  statTrackRoom(room)
  const view = roomView(room)
  // MÉMOIRE : chaque membre emporte un instantané chiffré du salon complet.
  // Si le serveur meurt (redéploiement, crash), le premier qui revient le
  // présente et le salon est restauré exactement où il en était.
  const snapshot = encodeSnapshot(room)
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
    socket.emit('room:snapshot', { code: room.code, blob: snapshot })
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
        statRoomCreated(room, member.pseudo)
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
        // Si on vient de reprendre la place d'un membre déconnecté, il ne faut
        // surtout pas que sa suppression différée s'exécute derrière nous.
        cancelPendingRemoval(room.code, member.id)
        socket.join(room.code)
        statMemberJoined(room, member.pseudo, member.userId)
        broadcast(room)
        return { code: room.code, selfId: member.id, resumeKey: member.resumeKey }
      }),
  )

  socket.on(
    'room:resume',
    (
      payload: { code?: unknown; memberId?: unknown; resumeKey?: unknown; snapshot?: unknown },
      ack?: Ack,
    ) =>
      handle(ack, () => {
        if (state.roomCode) throw new RoomError('Déjà dans un salon')
        if (typeof payload?.code !== 'string') throw new RoomError('Session invalide')
        const code = payload.code.trim().toUpperCase()
        let room: Room
        let restored = false
        try {
          room = getRoom(code)
        } catch (err) {
          // Salon inconnu : le serveur a redémarré. Si le client apporte un
          // INSTANTANÉ, on ressuscite le salon exactement où il en était —
          // scores, sièges, manche en cours, palmarès.
          if (payload.snapshot === undefined) throw err
          const snap = decodeSnapshot(payload.snapshot)
          if (snap.code !== code) throw new RoomError('Instantané d’un autre salon')
          room = registerRestoredRoom(restoreRoom(snap))
          restored = true
          armFlag(room) // pendule d'échecs re-armée si une partie tournait
          // Les absents ont leur grâce : s'ils ne reviennent pas, la manche
          // s'avorte et le salon continue — il ne reste jamais figé.
          for (const m of room.members.values()) {
            if (!m.connected) scheduleRemoval(room.code, m.id)
          }
          console.log(
            `[dominos-clan] salon ${room.code} RESTAURÉ depuis un instantané joueur (${room.members.size} membres, statut ${room.status})`,
          )
        }
        const member = resumeMember(room, payload.memberId, payload.resumeKey, socket.id)
        cancelPendingRemoval(room.code, member.id)
        state.roomCode = room.code
        state.memberId = member.id
        socket.join(room.code)
        broadcast(room)
        return { code: room.code, selfId: member.id, resumeKey: member.resumeKey, restored }
      }),
  )

  socket.on('presence:hello', (payload: Record<string, unknown>, ack?: Ack) =>
    handle(ack, () => {
      presence.hello(io, socket.id, payload ?? {})
      const { userId, avatar } = presence.sanitizeIdentity(payload ?? {})
      const pseudo = typeof payload?.pseudo === 'string' ? payload.pseudo.trim().slice(0, 20) : ''
      if (pseudo) statUserSeen(userId, pseudo, avatar)
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

  // Le chef retire un membre du salon (absent, AFK…). Si le retiré était
  // en pleine manche, la manche est annulée comme pour un départ volontaire.
  socket.on('room:kick', (payload: { memberId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const targetId = assertCanKick(room, memberId, payload?.memberId)
      const target = room.members.get(targetId)!
      const host = room.members.get(memberId)
      const targetSocket = io.sockets.sockets.get(target.socketId)
      cancelPendingRemoval(room.code, targetId)
      const { aborted } = removeMember(room, targetId)
      targetSocket?.emit('room:kicked', { byPseudo: host?.pseudo ?? 'le chef' })
      targetSocket?.leave(room.code)
      if (aborted) io.to(room.code).emit('game:aborted', { memberId: targetId })
      io.to(room.code).emit('room:member-kicked', { pseudo: target.pseudo })
      broadcast(room)
      presence.backToLobby(io, target.socketId)
    }),
  )

  socket.on('room:swap', (payload: { seatId?: unknown; withId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      swapSeat(room, memberId, payload?.seatId, payload?.withId)
      broadcast(room)
    }),
  )

  socket.on('room:demote', (payload: { memberId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      demoteToQueue(room, memberId, payload?.memberId)
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
      const rolled = ludoRollRoom(room, memberId)
      io.to(room.code).emit('ludo:rolled', rolled)
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

  // Nulle par accord : 'offer' → l'adversaire voit la proposition, 'accept'
  // termine la partie, 'decline' la retire.
  socket.on('chess:draw', (payload: { action?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      chessDrawRoom(room, memberId, payload?.action)
      broadcast(room)
    }),
  )

  socket.on('game:move', (payload: { move?: Move; slam?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      if (!payload?.move) throw new RoomError('Coup manquant')
      const { autoPassed, sterile } = playMove(room, memberId, payload.move)
      // Claquage : le domino rabattu de toutes ses forces — tout le salon
      // entend le CLAC (pur effet d'ambiance, validé après le coup).
      if (payload.slam === true && payload.move.type === 'play') {
        const member = room.members.get(memberId)
        if (member)
          io.to(room.code).emit('game:slam', {
            memberId,
            pseudo: member.pseudo,
            // Cri de claque personnalisé (« RENAO ! », « ANY ZANY EEE ! »…) —
            // vide = le JOYAAAA par défaut côté client.
            taunt: member.taunt,
          })
      }
      // Cri de passe affiché chez tout le monde — celui qui passe de son plein
      // gré (passe libre) comme ceux passés d'office faute de domino jouable.
      // L'index du cri est tiré par le SERVEUR : tout le salon voit le même.
      const announcePass = (id: string) => {
        const member = room.members.get(id)
        if (!member) return
        io.to(room.code).emit('game:passed', {
          memberId: id,
          pseudo: member.pseudo,
          cry: randomInt(0, 3),
        })
      }
      if (payload.move.type === 'pass') announcePass(memberId)
      for (const id of autoPassed) announcePass(id)
      // Table stérile : 3 manches sans qu'un seul joueur ouvre son compteur
      // → toute la table saute, la file prend les places.
      if (sterile) io.to(room.code).emit('game:sterile', { rounds: STERILE_ROUNDS })
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
          // Migration COLLECTIVE : les membres déjà connectés à l'ancien
          // projet doivent suivre, sinon le salon se coupe en deux groupes
          // sourds l'un à l'autre. Chaque client re-rejoint sur ce signal.
          io.to(room.code).emit('voice:moved')
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

  /**
   * DEMANDE D'AMI dans le salon : on joue avec quelqu'un, on veut le garder.
   * A propose → B reçoit une invitation nominative → s'il accepte, CHACUN
   * reçoit l'identité de l'autre et les deux carnets s'enrichissent d'un
   * coup — sans dicter de code ami.
   */
  socket.on('friend:propose', (payload: { memberId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const me = room.members.get(memberId)
      const target =
        typeof payload?.memberId === 'string' ? room.members.get(payload.memberId) : undefined
      if (!me || !target || target.id === memberId) throw new RoomError('Membre introuvable')
      if (!me.userId) throw new RoomError('Ton profil n’a pas de code ami')
      const targetSocket = io.sockets.sockets.get(target.socketId)
      if (!targetSocket) throw new RoomError('Ce joueur est déconnecté pour le moment')
      targetSocket.emit('friend:proposed', {
        fromMemberId: me.id,
        userId: me.userId,
        pseudo: me.pseudo,
        avatar: me.avatar,
      })
      return {}
    }),
  )

  socket.on('friend:respond', (payload: { toMemberId?: unknown; accept?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const me = room.members.get(memberId)
      const target =
        typeof payload?.toMemberId === 'string' ? room.members.get(payload.toMemberId) : undefined
      if (!me || !target) throw new RoomError('Membre introuvable')
      const targetSocket = io.sockets.sockets.get(target.socketId)
      if (targetSocket) {
        if (payload?.accept === true && me.userId) {
          targetSocket.emit('friend:accepted', {
            userId: me.userId,
            pseudo: me.pseudo,
            avatar: me.avatar,
          })
        } else {
          targetSocket.emit('friend:declined', { userId: me.userId, pseudo: me.pseudo })
        }
      }
      return {}
    }),
  )

  // 🤝 Demande d'ami PAR CODE (depuis l'accueil), même hors salon.
  socket.on('friend:proposeByCode', (payload: { toUserId?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      presence.proposeFriend(io, socket.id, payload?.toUserId)
      return {}
    }),
  )
  socket.on('friend:respondByCode', (payload: { toUserId?: unknown; accept?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      presence.respondFriend(io, socket.id, payload?.toUserId, payload?.accept === true)
      return {}
    }),
  )

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

  // Cri de capture personnel : modifiable n'importe quand, MÊME en pleine partie.
  socket.on('member:taunt', (payload: { taunt?: unknown }, ack?: Ack) =>
    handle(ack, () => {
      const { room, memberId } = withRoom(state)
      const member = room.members.get(memberId)
      if (!member) throw new RoomError('Membre inconnu')
      member.taunt = sanitizeTaunt(payload?.taunt)
      broadcast(room)
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
      } else {
        statRoomClosed(room.code)
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
        scheduleRemoval(code, memberId)
      } catch {
        // Salon déjà supprimé.
      }
    }
    presence.disconnect(io, socket.id)
  })
})

initStats()

httpServer.listen(PORT, () => {
  console.log(`[dominos-clan] serveur prêt sur http://localhost:${PORT}`)
  console.log(`[dominos-clan] chat vocal LiveKit : ${voiceEnabled() ? 'configuré' : 'désactivé (LIVEKIT_* manquants)'}`)
  console.log(`[dominos-clan] dashboard admin : http://localhost:${PORT}/admin`)
})
