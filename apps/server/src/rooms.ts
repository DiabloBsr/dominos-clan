import { randomBytes, randomInt } from 'node:crypto'
import {
  DEFAULT_RULES,
  MAX_SEATS,
  MIN_SEATS,
  ROOM_CAPACITY,
  applyMove,
  createGame,
  rotateWinnerStays,
  undoLastMove,
} from '@dominos-clan/engine'
import type { GameRules, GameState, Move, Role, RoomStatus, RoomView } from '@dominos-clan/engine'
import {
  chessCheckFlag,
  chessMove,
  chessResign,
  createChess,
  stopChess,
  type ChessGameState,
} from './chess'
import {
  createLudo,
  ludoPlay,
  ludoRoll,
  ludoTarget,
  type LudoState,
} from '@dominos-clan/engine'

export interface Member {
  id: string
  pseudo: string
  /** Identité de profil (présence/amis) ; null pour un client anonyme. */
  userId: string | null
  avatar: string
  socketId: string
  connected: boolean
  /** Jeton secret de reprise de session (rechargement de page). */
  resumeKey: string
}

export interface Room {
  code: string
  hostId: string
  members: Map<string, Member>
  seats: string[]
  queue: string[]
  game: GameState | null
  /** Partie d'échecs en cours (quand rules.gameType === 'chess'). */
  chessGame: ChessGameState | null
  /** Partie de Ludo en cours (quand rules.gameType === 'ludo'). */
  ludoGame: LudoState | null
  status: RoomStatus
  lastWinnerId: string | null
  rules: GameRules
  /** Scores cumulés du match en cours (mode match aux points). */
  scores: Map<string, number>
  matchWinnerId: string | null
  /** Nombre de manches jouées dans la rencontre (ouverture tournante). */
  roundIndex: number
  /** Index de siège de l'ouvreur de la dernière manche (rotation gauche → droite). */
  lastStarterSeatIndex: number | null
  /** Projet LiveKit du salon (pool) : collé au salon, avancé en cas d'échec. */
  voiceProjectIndex: number | null
  /** Dernière bascule de projet vocal (throttle des retries). */
  voiceAdvancedAt: number
  /** Timestamp de la dernière réaction par membre (anti-spam). */
  lastReactionAt: Map<string, number>
  /** Timestamp du dernier message chat par membre (anti-spam). */
  lastChatAt: Map<string, number>
  /** Timestamp du dernier son de soundboard par membre (anti-spam). */
  lastSoundAt: Map<string, number>
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

export interface Identity {
  userId: string | null
  avatar: string
}

export function createRoom(
  rawPseudo: unknown,
  socketId: string,
  identity: Identity,
): { room: Room; member: Member } {
  const pseudo = sanitizePseudo(rawPseudo)
  const member: Member = {
    id: randomBytes(8).toString('base64url'),
    pseudo,
    userId: identity.userId,
    avatar: identity.avatar,
    socketId,
    connected: true,
    resumeKey: randomBytes(12).toString('base64url'),
  }
  const room: Room = {
    code: generateCode(),
    hostId: member.id,
    members: new Map([[member.id, member]]),
    seats: [member.id],
    queue: [],
    game: null,
    chessGame: null,
    ludoGame: null,
    status: 'lobby',
    lastWinnerId: null,
    rules: { ...DEFAULT_RULES },
    scores: new Map(),
    matchWinnerId: null,
    roundIndex: 0,
    lastStarterSeatIndex: null,
    voiceProjectIndex: null,
    voiceAdvancedAt: 0,
    lastReactionAt: new Map(),
    lastChatAt: new Map(),
    lastSoundAt: new Map(),
  }
  rooms.set(room.code, room)
  return { room, member }
}

export function joinRoom(
  rawCode: unknown,
  rawPseudo: unknown,
  socketId: string,
  identity: Identity,
): { room: Room; member: Member } {
  if (typeof rawCode !== 'string') throw new RoomError('Code invalide')
  const room = getRoom(rawCode.trim().toUpperCase())
  if (room.members.size >= ROOM_CAPACITY) throw new RoomError(`Salon complet (${ROOM_CAPACITY} max)`)
  const pseudo = sanitizePseudo(rawPseudo)
  const member: Member = {
    id: randomBytes(8).toString('base64url'),
    pseudo,
    userId: identity.userId,
    avatar: identity.avatar,
    socketId,
    connected: true,
    resumeKey: randomBytes(12).toString('base64url'),
  }
  room.members.set(member.id, member)
  // Une partie en cours (ou un salon déjà plein en sièges) → on arrive spectateur.
  if (room.status === 'lobby' && room.seats.length < room.rules.maxSeats) {
    room.seats.push(member.id)
  } else {
    room.queue.push(member.id)
  }
  return { room, member }
}

/** Un match aux points est-il engagé (au moins une marque, pas encore de vainqueur) ? */
function matchInProgress(room: Room): boolean {
  return (
    room.rules.targetScore !== null &&
    room.matchWinnerId === null &&
    [...room.scores.values()].some((s) => s > 0)
  )
}

export function setRules(room: Room, memberId: string, raw: unknown): void {
  if (memberId !== room.hostId) throw new RoomError('Seul l’hôte peut changer les règles')
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Manche en cours, attends la fin')
  }
  const r = (raw ?? {}) as Partial<GameRules>
  const targetScore =
    r.targetScore === null || r.targetScore === undefined ? null : Number(r.targetScore)
  if (targetScore !== null && (!Number.isInteger(targetScore) || targetScore < 10 || targetScore > 1000)) {
    throw new RoomError('Cible de match invalide (10 à 1000 points)')
  }
  const openThreshold = Number(r.openThreshold ?? 0)
  if (!Number.isInteger(openThreshold) || openThreshold < 0 || openThreshold > 200) {
    throw new RoomError('Seuil de première marque invalide (0 à 200)')
  }
  const openingMaxPips =
    r.openingMaxPips === null || r.openingMaxPips === undefined ? null : Number(r.openingMaxPips)
  if (openingMaxPips !== null && (!Number.isInteger(openingMaxPips) || openingMaxPips < 0 || openingMaxPips > 12)) {
    throw new RoomError('Plafond d’ouverture invalide (0 à 12 points)')
  }
  const instantWinScore =
    r.instantWinScore === null || r.instantWinScore === undefined ? null : Number(r.instantWinScore)
  if (instantWinScore !== null && (!Number.isInteger(instantWinScore) || instantWinScore < 1 || instantWinScore > 1000)) {
    throw new RoomError('Seuil de victoire éclair invalide (1 à 1000 points)')
  }
  const gameType = r.gameType === 'chess' ? 'chess' : r.gameType === 'ludo' ? 'ludo' : 'dominos'
  // Les échecs se jouent à 2 : la table est bornée automatiquement.
  const maxSeats = gameType === 'chess' ? 2 : Number(r.maxSeats ?? 3)
  if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > MAX_SEATS) {
    throw new RoomError('Taille de table invalide (2 à 4 joueurs)')
  }
  const swapCount = Number(r.swapCount ?? 1)
  if (!Number.isInteger(swapCount) || swapCount < 1 || swapCount > 3) {
    throw new RoomError('Remplacés à la victoire : 1 à 3')
  }
  const chessMinutes = Number(r.chessMinutes ?? 10)
  if (!Number.isInteger(chessMinutes) || chessMinutes < 1 || chessMinutes > 60) {
    throw new RoomError('Pendule invalide (1 à 60 minutes)')
  }
  const chessIncrement = Number(r.chessIncrement ?? 0)
  if (!Number.isInteger(chessIncrement) || chessIncrement < 0 || chessIncrement > 30) {
    throw new RoomError('Incrément invalide (0 à 30 secondes)')
  }
  const ludoSixes = Number(r.ludoSixes ?? 3)
  if (!Number.isInteger(ludoSixes) || ludoSixes < 2 || ludoSixes > 4) {
    throw new RoomError('6 successifs : 2 à 4')
  }
  room.rules = {
    targetScore,
    openThreshold,
    freePass: Boolean(r.freePass),
    openingMaxPips,
    instantWinScore,
    maxSeats,
    swapCount,
    gameType,
    chessMinutes,
    chessIncrement,
    ludoSixes,
    ludoBonus: Boolean(r.ludoBonus),
  }
  // Table réduite : les sièges en trop repartent en tête de file.
  while (room.seats.length > maxSeats) {
    room.queue.unshift(room.seats.pop()!)
  }
  // Changer les règles relance une rencontre propre.
  room.scores = new Map()
  room.matchWinnerId = null
  room.roundIndex = 0
  room.lastStarterSeatIndex = null
}

export function takeSeat(room: Room, memberId: string): void {
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Manche en cours, attends la fin')
  }
  if (matchInProgress(room)) throw new RoomError('Match en cours — la table est figée jusqu’au vainqueur')
  if (room.seats.includes(memberId)) return
  if (room.seats.length >= room.rules.maxSeats) {
    throw new RoomError(`Tous les sièges sont pris (table à ${room.rules.maxSeats})`)
  }
  room.queue = room.queue.filter((id) => id !== memberId)
  room.seats.push(memberId)
}

export function leaveSeat(room: Room, memberId: string): void {
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Manche en cours, attends la fin')
  }
  if (matchInProgress(room)) throw new RoomError('Match en cours — la table est figée jusqu’au vainqueur')
  if (!room.seats.includes(memberId)) return
  room.seats = room.seats.filter((id) => id !== memberId)
  room.queue.push(memberId)
}

/**
 * L'hôte ajoute un joueur de la file à la table (entre deux manches),
 * même en plein match — la table peut ainsi passer de 2-3 à 4 joueurs.
 */
export function promoteToSeat(room: Room, hostId: string, rawMemberId: unknown): void {
  if (hostId !== room.hostId) throw new RoomError('Seul l’hôte peut ajouter un joueur à la table')
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Attends la fin de la manche')
  }
  if (typeof rawMemberId !== 'string' || !room.members.has(rawMemberId)) {
    throw new RoomError('Membre introuvable')
  }
  if (!room.queue.includes(rawMemberId)) throw new RoomError('Ce membre n’est pas dans la file')
  if (room.seats.length >= room.rules.maxSeats) {
    throw new RoomError(`La table est pleine (table à ${room.rules.maxSeats})`)
  }
  room.queue = room.queue.filter((id) => id !== rawMemberId)
  room.seats.push(rawMemberId)
}

/** Valide un retrait de membre par le chef ; retourne l'id ciblé. */
export function assertCanKick(room: Room, hostId: string, rawTargetId: unknown): string {
  if (hostId !== room.hostId) throw new RoomError('Seul le chef peut enlever un joueur')
  if (typeof rawTargetId !== 'string' || !room.members.has(rawTargetId)) {
    throw new RoomError('Membre introuvable')
  }
  if (rawTargetId === hostId) throw new RoomError('Utilise « Quitter » pour sortir toi-même')
  return rawTargetId
}

/**
 * Le chef échange un joueur assis avec un joueur de la file (entre deux
 * manches) — pratique quand quelqu'un s'absente ou pour faire tourner.
 */
export function swapSeat(room: Room, hostId: string, rawSeatId: unknown, rawQueueId: unknown): void {
  if (hostId !== room.hostId) throw new RoomError('Seul le chef peut faire un échange')
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Attends la fin de la manche')
  }
  if (typeof rawSeatId !== 'string' || !room.seats.includes(rawSeatId)) {
    throw new RoomError('Ce joueur n’est pas à table')
  }
  if (typeof rawQueueId !== 'string' || !room.queue.includes(rawQueueId)) {
    throw new RoomError('Ce joueur n’est pas dans la file')
  }
  // Échange de places : le sortant prend la position du montant dans la file.
  room.seats = room.seats.map((id) => (id === rawSeatId ? (rawQueueId as string) : id))
  room.queue = room.queue.map((id) => (id === rawQueueId ? (rawSeatId as string) : id))
}

/** L'hôte passe la couronne à un autre membre du salon (assis ou en file). */
export function transferHost(room: Room, memberId: string, rawTargetId: unknown): void {
  if (memberId !== room.hostId) throw new RoomError('Seul le chef peut passer son rôle')
  if (typeof rawTargetId !== 'string' || !room.members.has(rawTargetId)) {
    throw new RoomError('Membre introuvable')
  }
  if (rawTargetId === memberId) throw new RoomError('Tu es déjà le chef')
  room.hostId = rawTargetId
}

/**
 * Remise à zéro par l'hôte : manche en cours annulée, scores et match
 * effacés, retour au lobby. Peut aussi asseoir au passage un joueur de la
 * file (« ajouter et tout recommencer »).
 */
export function restartRoom(room: Room, hostId: string, rawPromoteId?: unknown): void {
  if (hostId !== room.hostId) throw new RoomError('Seul l’hôte peut tout remettre à zéro')
  if (room.chessGame) stopChess(room.chessGame)
  room.chessGame = null
  room.ludoGame = null
  room.game = null
  room.status = 'lobby'
  room.lastWinnerId = null
  room.scores = new Map()
  room.matchWinnerId = null
  room.roundIndex = 0
  room.lastStarterSeatIndex = null
  if (
    typeof rawPromoteId === 'string' &&
    room.queue.includes(rawPromoteId) &&
    room.seats.length < room.rules.maxSeats
  ) {
    room.queue = room.queue.filter((id) => id !== rawPromoteId)
    room.seats.push(rawPromoteId)
  }
}

/**
 * Distribue une nouvelle donne pour la table actuelle. Si la donne tombe sur
 * 4-5 doubles, la partie passe en pause 'redeal' (l'hôte devra redistribuer).
 */
function dealNewGame(room: Room): void {
  // Ouverture tournante : 1re manche désignée par le plus petit double,
  // puis l'ouverture tourne de gauche à droite avec plafond de points.
  const opening =
    room.rules.openingMaxPips === null
      ? ({ policy: 'classic' } as const)
      : room.roundIndex === 0 || room.lastStarterSeatIndex === null
        ? ({ policy: 'smallest-double' } as const)
        : ({
            policy: 'rotate',
            starterIndex: (room.lastStarterSeatIndex + 1) % room.seats.length,
          } as const)

  room.game = createGame(room.seats, randomInt(2 ** 31), room.rules, opening)
  room.lastWinnerId = null
  if (room.game.status === 'redeal') {
    room.status = 'redeal'
    return
  }
  room.lastStarterSeatIndex = room.game.turn
  room.roundIndex += 1
  room.status = 'playing'
  // Victoire immédiate aux doubles (6-7 dans une main) : la manche naît déjà finie.
  if (room.game.status === 'finished') settleRoundEnd(room)
}

export function startGame(room: Room, memberId: string): void {
  if (memberId !== room.hostId) throw new RoomError('Seul l’hôte peut lancer la manche')
  if (room.status === 'playing' || room.status === 'redeal') {
    throw new RoomError('Une manche est déjà en cours')
  }
  if (room.seats.length < MIN_SEATS) throw new RoomError('Il faut au moins 2 joueurs assis')

  // Échecs : 2 joueurs, couleurs tirées au sort, pendules armées.
  if (room.rules.gameType === 'chess') {
    if (room.seats.length !== 2) throw new RoomError('Les échecs se jouent à 2')
    if (room.chessGame) stopChess(room.chessGame)
    const flip = randomInt(2)
    const whiteId = room.seats[flip]!
    const blackId = room.seats[1 - flip]!
    room.chessGame = createChess(whiteId, blackId, room.rules.chessMinutes, room.rules.chessIncrement)
    room.game = null
    room.ludoGame = null
    room.status = 'playing'
    room.lastWinnerId = null
    return
  }

  // Ludo : 2 à 4 joueurs, dé côté serveur (1v1 = coins opposés).
  if (room.rules.gameType === 'ludo') {
    room.ludoGame = createLudo(
      room.seats,
      { maxSixes: room.rules.ludoSixes, bonusMode: room.rules.ludoBonus },
      serverRand,
    )
    room.game = null
    room.chessGame = null
    room.status = 'playing'
    room.lastWinnerId = null
    return
  }

  // Le match précédent est terminé : on repart de zéro avec la table actuelle.
  if (room.matchWinnerId !== null) {
    room.scores = new Map()
    room.matchWinnerId = null
    room.roundIndex = 0
    room.lastStarterSeatIndex = null
  }
  room.chessGame = null
  room.ludoGame = null
  dealNewGame(room)
}

/** Fin de partie de Ludo : le gagnant reste, la file monte. */
function settleLudoEnd(room: Room): void {
  const g = room.ludoGame
  if (!g || g.status !== 'finished' || g.winnerId === null) return
  room.status = 'finished'
  room.lastWinnerId = g.winnerId
  const rotated = rotateWinnerStays(room.seats, room.queue, g.winnerId, {}, room.rules.swapCount)
  room.seats = rotated.seats
  room.queue = rotated.queue
}

const serverRand = () => randomInt(1_000_000) / 1_000_000

export function ludoRollRoom(room: Room, memberId: string): void {
  if (room.status !== 'playing' || !room.ludoGame) throw new RoomError('Aucune partie en cours')
  ludoRoll(room.ludoGame, memberId, randomInt(1, 7))
  settleLudoEnd(room)
}

export function ludoPlayRoom(room: Room, memberId: string, rawPawn: unknown): void {
  if (room.status !== 'playing' || !room.ludoGame) throw new RoomError('Aucune partie en cours')
  const pawn = Number(rawPawn)
  if (!Number.isInteger(pawn) || pawn < 0 || pawn > 3) throw new RoomError('Pion invalide')
  ludoPlay(room.ludoGame, memberId, pawn, serverRand)
  settleLudoEnd(room)
}

export function ludoTargetRoom(
  room: Room,
  memberId: string,
  rawPlayer: unknown,
  rawPawn: unknown,
): void {
  if (room.status !== 'playing' || !room.ludoGame) throw new RoomError('Aucune partie en cours')
  ludoTarget(room.ludoGame, memberId, Number(rawPlayer), Number(rawPawn))
  settleLudoEnd(room)
}

/** Fin de partie d'échecs : gagnant reste (nulle → on rejoue à l'identique). */
function settleChessEnd(room: Room): void {
  const g = room.chessGame
  if (!g || !g.result) return
  stopChess(g)
  room.status = 'finished'
  room.lastWinnerId = g.result.winnerId
  if (g.result.winnerId !== null) {
    const rotated = rotateWinnerStays(
      room.seats,
      room.queue,
      g.result.winnerId,
      {},
      room.rules.swapCount,
    )
    room.seats = rotated.seats
    room.queue = rotated.queue
  }
}

export function chessMoveRoom(
  room: Room,
  memberId: string,
  payload: { from?: unknown; to?: unknown; promotion?: unknown },
): void {
  if (room.status !== 'playing' || !room.chessGame) throw new RoomError('Aucune partie en cours')
  chessMove(room.chessGame, memberId, payload.from, payload.to, payload.promotion)
  if (room.chessGame.status === 'finished') settleChessEnd(room)
}

export function chessResignRoom(room: Room, memberId: string): void {
  if (room.status !== 'playing' || !room.chessGame) throw new RoomError('Aucune partie en cours')
  chessResign(room.chessGame, memberId)
  settleChessEnd(room)
}

/** Drapeau serveur : retourne true si la partie vient de se terminer au temps. */
export function chessFlagRoom(room: Room): boolean {
  if (room.status !== 'playing' || !room.chessGame) return false
  if (!chessCheckFlag(room.chessGame)) return false
  settleChessEnd(room)
  return true
}

/** L'hôte redistribue après une donne annulée (4-5 doubles). */
export function redealNow(room: Room, memberId: string): void {
  if (memberId !== room.hostId) throw new RoomError('Seul l’hôte peut redistribuer')
  if (room.status !== 'redeal' || !room.game) {
    throw new RoomError('Aucune redistribution en attente')
  }
  const priorRedeals = room.game.redeals
  dealNewGame(room)
  // L'historique des donnes annulées reste visible pour toute la manche.
  room.game!.redeals = [...priorRedeals, ...room.game!.redeals]
}

export function playMove(room: Room, memberId: string, move: Move): void {
  if (room.status !== 'playing' || !room.game) throw new RoomError('Aucune manche en cours')
  room.game = applyMove(room.game, memberId, move)
  if (room.game.status === 'finished') settleRoundEnd(room)
}

export function undoMove(room: Room, memberId: string): void {
  if (room.status !== 'playing' || !room.game) throw new RoomError('Aucune manche en cours')
  room.game = undoLastMove(room.game, memberId)
}

/** Fin de manche : scores, victoire éclair, vainqueur de match, rotation. */
function settleRoundEnd(room: Room): void {
  room.status = 'finished'
  const result = room.game!.result!
  room.lastWinnerId = result.winnerId

  // Manche nulle (« X ») : personne ne marque, personne ne bouge — on rejoue.
  if (result.winnerId === null) return

  if (room.rules.targetScore !== null) {
    // Match aux points : le gagnant encaisse la somme des mains adverses,
    // avec le seuil d'ouverture sur la toute première marque.
    const current = room.scores.get(result.winnerId) ?? 0
    const counted = current === 0 && result.gain < room.rules.openThreshold ? 0 : result.gain
    const total = current + counted
    room.scores.set(result.winnerId, total)

    // Victoire éclair : le gagnant cumule ≥ seuil alors que TOUS les autres
    // joueurs de la table sont encore à 0 → match gagné immédiatement.
    const othersAtZero = room.seats
      .filter((id) => id !== result.winnerId)
      .every((id) => (room.scores.get(id) ?? 0) === 0)
    const instantWin =
      room.rules.instantWinScore !== null && othersAtZero && total >= room.rules.instantWinScore

    if (instantWin || total >= room.rules.targetScore) {
      // Match remporté : la table tourne pour le match suivant —
      // plus petits scores sortants, égalité départagée à gauche du gagnant.
      room.matchWinnerId = result.winnerId
      const rotated = rotateWinnerStays(
        room.seats,
        room.queue,
        result.winnerId,
        Object.fromEntries(room.scores),
        room.rules.swapCount,
      )
      room.seats = rotated.seats
      room.queue = rotated.queue
      return
    }

    // Le match continue : la table reste FIXE jusqu'à la victoire —
    // l'échange avec la file ne se fait qu'au vainqueur du match.
    return
  }

  // Manche sèche : rotation immédiate, le gagnant reste (pas de scores :
  // à égalité complète, c'est le voisin de gauche du gagnant qui sort).
  const rotated = rotateWinnerStays(room.seats, room.queue, result.winnerId, {}, room.rules.swapCount)
  room.seats = rotated.seats
  room.queue = rotated.queue
}

/** Marque un membre déconnecté (période de grâce avant retrait définitif). */
export function markDisconnected(room: Room, memberId: string): void {
  const member = room.members.get(memberId)
  if (member) member.connected = false
}

/** Reprise de session après rechargement : re-lie le membre à son nouveau socket. */
export function resumeMember(
  room: Room,
  rawMemberId: unknown,
  rawKey: unknown,
  socketId: string,
): Member {
  if (typeof rawMemberId !== 'string' || typeof rawKey !== 'string') {
    throw new RoomError('Session invalide')
  }
  const member = room.members.get(rawMemberId)
  if (!member || member.resumeKey !== rawKey) throw new RoomError('Session expirée')
  member.socketId = socketId
  member.connected = true
  return member
}

/** Rôle vis-à-vis de la manche EN COURS (pas des sièges du prochain tour). */
export function gameRole(room: Room, memberId: string): Role {
  if (room.chessGame) {
    return memberId === room.chessGame.whiteId || memberId === room.chessGame.blackId
      ? 'player'
      : 'spectator'
  }
  if (room.ludoGame) {
    return room.ludoGame.players.some((p) => p.id === memberId) ? 'player' : 'spectator'
  }
  return room.game?.players.some((p) => p.id === memberId) ? 'player' : 'spectator'
}

/**
 * Retire un membre. Si un joueur de la manche en cours part, la manche est
 * annulée (pas de gagnant, pas de rotation). Retourne true si le salon est vide.
 */
export function removeMember(room: Room, memberId: string): { empty: boolean; aborted: boolean } {
  if (!room.members.has(memberId)) return { empty: room.members.size === 0, aborted: false }

  let aborted = false
  if (
    (room.status === 'playing' || room.status === 'redeal') &&
    gameRole(room, memberId) === 'player'
  ) {
    if (room.chessGame) stopChess(room.chessGame)
    room.chessGame = null
    room.ludoGame = null
    room.game = null
    room.status = 'lobby'
    room.lastWinnerId = null
    aborted = true
  }
  room.members.delete(memberId)
  room.seats = room.seats.filter((id) => id !== memberId)
  room.queue = room.queue.filter((id) => id !== memberId)
  room.scores.delete(memberId)
  if (room.matchWinnerId === memberId) room.matchWinnerId = null
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
      avatar: m.avatar,
      role: room.seats.includes(m.id) ? 'player' : 'spectator',
      isHost: m.id === room.hostId,
      connected: m.connected,
    })),
    seats: [...room.seats],
    queue: [...room.queue],
    lastWinnerId: room.lastWinnerId,
    rules: { ...room.rules },
    scores: Object.fromEntries(room.scores),
    matchWinnerId: room.matchWinnerId,
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

/** Soundboard : sons de chambrage joués chez tout le salon. */
export const BOARD_SOUNDS = ['pet', 'rire', 'colere', 'bravo', 'tromblon', 'bisou'] as const
export type BoardSound = (typeof BOARD_SOUNDS)[number]
const SOUND_THROTTLE_MS = 1500

export function canPlaySound(room: Room, memberId: string, kind: string): kind is BoardSound {
  if (!BOARD_SOUNDS.includes(kind as BoardSound)) return false
  const last = room.lastSoundAt.get(memberId) ?? 0
  const now = Date.now()
  if (now - last < SOUND_THROTTLE_MS) return false
  room.lastSoundAt.set(memberId, now)
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
