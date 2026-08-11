/**
 * MÉMOIRE des salons — instantanés chiffrés portés par les joueurs.
 *
 * Le serveur (offre gratuite Render) perd toute sa mémoire à chaque
 * redéploiement ou redémarrage : les salons vivent en RAM et un match à
 * 11/12/52 points disparaissait. Plutôt qu'une base externe, chaque joueur
 * reçoit à chaque changement d'état un INSTANTANÉ COMPLET du salon, chiffré
 * côté serveur (AES-256-GCM) :
 *
 *  • personne ne peut lire les mains adverses dedans, ni le falsifier ;
 *  • quand le serveur renaît, le premier joueur qui revient PRÉSENTE son
 *    instantané — déchiffré, vérifié, le salon est restauré à l'identique :
 *    scores, sièges, manche en cours, palmarès, réglages.
 *
 * La clé vient de RESUME_SECRET (variable d'environnement). Tant qu'elle ne
 * change pas, les instantanés survivent aux redéploiements.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Chess } from 'chess.js'
import type { GameRules, GameState, LudoState, StandingView } from '@dominos-clan/engine'
import { RoomError, type Member, type Room } from './rooms'
import type { ChessGameState } from './chess'

const SNAPSHOT_VERSION = 2

/** Un salon complet, en JSON pur (les Maps et objets vivants sont aplatis). */
interface RoomSnapshot {
  v: number
  /** Date d'émission — le plus récent gagne si plusieurs sont présentés. */
  ts: number
  code: string
  hostId: string
  status: Room['status']
  members: Array<Omit<Member, 'socketId' | 'connected'>>
  seats: string[]
  queue: string[]
  rules: GameRules
  game: GameState | null
  ludoGame: LudoState | null
  /** Échecs : la partie est rejouable depuis le PGN (historique complet,
      indispensable pour la triple répétition). */
  chessGame: (Omit<ChessGameState, 'chess' | 'flagTimer'> & { pgn: string }) | null
  scores: Array<[string, number]>
  standings: Array<[string, StandingView]>
  lastWinnerId: string | null
  matchWinnerId: string | null
  roundIndex: number
  lastStarterSeatIndex: number | null
  voiceProjectIndex: number | null
}

/* ─── Chiffrement ──────────────────────────────────────────────────────── */

function key(): Buffer {
  const secret = process.env.RESUME_SECRET
  if (!secret) {
    // En local on tourne quand même — mais un secret de dev ne protège rien.
    console.warn('[dominos-clan] RESUME_SECRET absent : instantanés chiffrés avec la clé de DEV')
  }
  return createHash('sha256').update(secret ?? 'dev-resume-secret').digest()
}

/** iv (12) | tag (16) | chiffré — le tout en base64url. */
export function encodeSnapshot(room: Room): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([
    cipher.update(JSON.stringify(toSnapshot(room)), 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function decodeSnapshot(blob: unknown): RoomSnapshot {
  if (typeof blob !== 'string' || blob.length < 40 || blob.length > 300_000) {
    throw new RoomError('Instantané invalide')
  }
  try {
    const raw = Buffer.from(blob, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    const snap = JSON.parse(json) as RoomSnapshot
    if (snap.v !== SNAPSHOT_VERSION) throw new Error('version')
    return snap
  } catch {
    // Clé changée, données corrompues ou falsifiées : même réponse.
    throw new RoomError('Instantané illisible (session trop ancienne ?)')
  }
}

/* ─── Salon → instantané ───────────────────────────────────────────────── */

function toSnapshot(room: Room): RoomSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    ts: Date.now(),
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    members: [...room.members.values()].map(({ socketId: _s, connected: _c, ...keep }) => keep),
    seats: [...room.seats],
    queue: [...room.queue],
    rules: { ...room.rules },
    game: room.game,
    ludoGame: room.ludoGame,
    chessGame: room.chessGame
      ? {
          pgn: room.chessGame.chess.pgn(),
          whiteId: room.chessGame.whiteId,
          blackId: room.chessGame.blackId,
          whiteMs: room.chessGame.whiteMs,
          blackMs: room.chessGame.blackMs,
          turnStartedAt: room.chessGame.turnStartedAt,
          incrementMs: room.chessGame.incrementMs,
          status: room.chessGame.status,
          lastMove: room.chessGame.lastMove,
          drawOffer: room.chessGame.drawOffer,
          result: room.chessGame.result,
        }
      : null,
    scores: [...room.scores.entries()],
    standings: [...room.standings.entries()],
    lastWinnerId: room.lastWinnerId,
    matchWinnerId: room.matchWinnerId,
    roundIndex: room.roundIndex,
    lastStarterSeatIndex: room.lastStarterSeatIndex,
    voiceProjectIndex: room.voiceProjectIndex,
  }
}

/* ─── Instantané → salon ───────────────────────────────────────────────── */

/**
 * Reconstruit un salon VIVANT depuis un instantané. Tous les membres
 * reviennent « déconnectés » : chacun reprend sa place par room:resume.
 * Les pendules d'échecs repartent de MAINTENANT : la panne n'est pas
 * décomptée du temps des joueurs.
 */
export function restoreRoom(snap: RoomSnapshot): Room {
  let chessGame: ChessGameState | null = null
  if (snap.chessGame) {
    const chess = new Chess()
    try {
      chess.loadPgn(snap.chessGame.pgn)
    } catch {
      throw new RoomError('Partie d’échecs illisible dans l’instantané')
    }
    const { pgn: _pgn, ...rest } = snap.chessGame
    chessGame = { ...rest, chess, turnStartedAt: Date.now(), flagTimer: null }
  }

  return {
    code: snap.code,
    hostId: snap.hostId,
    status: snap.status,
    members: new Map(
      snap.members.map((m) => [m.id, { ...m, socketId: '', connected: false } as Member]),
    ),
    seats: [...snap.seats],
    queue: [...snap.queue],
    rules: { ...snap.rules },
    game: snap.game,
    ludoGame: snap.ludoGame,
    chessGame,
    scores: new Map(snap.scores),
    standings: new Map(snap.standings),
    lastWinnerId: snap.lastWinnerId,
    matchWinnerId: snap.matchWinnerId,
    roundIndex: snap.roundIndex,
    lastStarterSeatIndex: snap.lastStarterSeatIndex,
    voiceProjectIndex: snap.voiceProjectIndex,
    voiceAdvancedAt: 0,
    lastReactionAt: new Map(),
    lastChatAt: new Map(),
    lastSoundAt: new Map(),
  }
}
