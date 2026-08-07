import { Chess } from 'chess.js'
import type { ChessEndReason, ChessView } from '@dominos-clan/engine'

/**
 * Échecs blitz serveur-autoritatif : chess.js fait les règles, ce module
 * gère les pendules (décompte au coup + incrément) et le drapeau (timeout
 * programmé côté serveur). Aucune information cachée aux échecs : la vue
 * complète (FEN + pendules) est diffusée à tout le salon.
 */
export interface ChessGameState {
  chess: Chess
  whiteId: string
  blackId: string
  whiteMs: number
  blackMs: number
  /** Date.now() du début du trait en cours. */
  turnStartedAt: number
  incrementMs: number
  status: 'playing' | 'finished'
  lastMove: { from: string; to: string } | null
  /** Couleur ayant proposé la nulle, en attente de réponse. */
  drawOffer: 'w' | 'b' | null
  result: { winnerId: string | null; reason: ChessEndReason } | null
  flagTimer: ReturnType<typeof setTimeout> | null
}

export function createChess(
  whiteId: string,
  blackId: string,
  minutes: number,
  incrementSeconds: number,
): ChessGameState {
  return {
    chess: new Chess(),
    whiteId,
    blackId,
    whiteMs: minutes * 60_000,
    blackMs: minutes * 60_000,
    turnStartedAt: Date.now(),
    incrementMs: incrementSeconds * 1000,
    status: 'playing',
    lastMove: null,
    drawOffer: null,
    result: null,
    flagTimer: null,
  }
}

/**
 * Ce camp peut-il encore mater, ne serait-ce qu'avec l'aide de l'adversaire
 * (FIDE : « une suite de coups légaux ») ? Roi seul, roi+fou et roi+cavalier
 * ne le peuvent pas ; deux cavaliers, si (mat non forcé mais possible).
 */
function hasMatingMaterial(g: ChessGameState, color: 'w' | 'b'): boolean {
  let bishops = 0
  let knights = 0
  for (const row of g.chess.board()) {
    for (const square of row) {
      if (!square || square.color !== color) continue
      if (square.type === 'q' || square.type === 'r' || square.type === 'p') return true
      if (square.type === 'b') bishops += 1
      if (square.type === 'n') knights += 1
    }
  }
  return bishops + knights >= 2
}

/** Détail de la nulle automatique en cours, pour l'annoncer précisément. */
function drawReason(g: ChessGameState): ChessEndReason {
  if (g.chess.isStalemate()) return 'stalemate'
  if (g.chess.isThreefoldRepetition()) return 'threefold'
  if (g.chess.isInsufficientMaterial()) return 'material'
  if (g.chess.isDrawByFiftyMoves()) return 'fifty'
  return 'draw'
}

function colorOf(g: ChessGameState, memberId: string): 'w' | 'b' | null {
  if (memberId === g.whiteId) return 'w'
  if (memberId === g.blackId) return 'b'
  return null
}

function finish(g: ChessGameState, winnerId: string | null, reason: ChessEndReason): void {
  g.status = 'finished'
  g.result = { winnerId, reason }
  stopChess(g)
}

export function stopChess(g: ChessGameState): void {
  if (g.flagTimer) {
    clearTimeout(g.flagTimer)
    g.flagTimer = null
  }
}

/**
 * Les pendules ne tournent qu'une fois le premier coup de CHAQUE joueur joué
 * (2 demi-coups) : pas de pression de temps sur les tout premiers coups.
 */
function clocksRunning(g: ChessGameState): boolean {
  return g.chess.history().length >= 2
}

/** Temps restant (ms) de la pendule active, décompte en cours inclus. */
function activeRemaining(g: ChessGameState): number {
  const elapsed = clocksRunning(g) ? Date.now() - g.turnStartedAt : 0
  const base = g.chess.turn() === 'w' ? g.whiteMs : g.blackMs
  return base - elapsed
}

/**
 * Drapeau : si la pendule active est tombée, l'adversaire gagne au temps —
 * SAUF s'il n'a pas de quoi mater (FIDE 6.9) : la partie est alors nulle.
 */
export function chessCheckFlag(g: ChessGameState): boolean {
  if (g.status !== 'playing') return false
  if (activeRemaining(g) > 0) return false
  const flagged = g.chess.turn()
  const opponent = flagged === 'w' ? 'b' : 'w'
  if (!hasMatingMaterial(g, opponent)) {
    finish(g, null, 'timeout-material')
    return true
  }
  finish(g, opponent === 'w' ? g.whiteId : g.blackId, 'timeout')
  return true
}

/** Proposer la nulle (une offre à la fois, remplacée si l'autre propose aussi). */
export function chessOfferDraw(g: ChessGameState, memberId: string): void {
  if (g.status !== 'playing') throw new Error('La partie est terminée')
  const color = colorOf(g, memberId)
  if (!color) throw new Error('Tu n’es pas à l’échiquier')
  if (g.drawOffer === color) throw new Error('Tu as déjà proposé la nulle')
  g.drawOffer = color
}

/** Accepter la nulle proposée par l'adversaire → partie nulle par accord. */
export function chessAcceptDraw(g: ChessGameState, memberId: string): void {
  if (g.status !== 'playing') throw new Error('La partie est terminée')
  const color = colorOf(g, memberId)
  if (!color) throw new Error('Tu n’es pas à l’échiquier')
  if (!g.drawOffer || g.drawOffer === color) throw new Error('Aucune proposition à accepter')
  g.drawOffer = null
  finish(g, null, 'agreement')
}

/** Refuser (ou retirer) la proposition de nulle en cours. */
export function chessDeclineDraw(g: ChessGameState, memberId: string): void {
  if (g.status !== 'playing') return
  if (!colorOf(g, memberId)) throw new Error('Tu n’es pas à l’échiquier')
  g.drawOffer = null
}

/** Programme le drapeau serveur pour la pendule active (le callback vérifie et conclut). */
export function armChessFlag(g: ChessGameState, onFlag: () => void): void {
  stopChess(g)
  if (g.status !== 'playing') return
  // Pendules gelées tant que chacun n'a pas joué : aucun drapeau à armer.
  if (!clocksRunning(g)) return
  g.flagTimer = setTimeout(onFlag, Math.max(0, activeRemaining(g)) + 60)
}

export function chessMove(
  g: ChessGameState,
  memberId: string,
  from: unknown,
  to: unknown,
  promotion: unknown,
): void {
  if (g.status !== 'playing') throw new Error('La partie est terminée')
  const color = colorOf(g, memberId)
  if (!color) throw new Error('Tu n’es pas à l’échiquier')
  if (g.chess.turn() !== color) throw new Error('Ce n’est pas ton trait')
  if (typeof from !== 'string' || typeof to !== 'string') throw new Error('Coup invalide')

  // Le drapeau a-t-il déjà chuté ?
  if (chessCheckFlag(g)) return

  // Premier coup du joueur (pendules gelées) : ni décompte, ni incrément.
  const running = clocksRunning(g)
  const elapsed = running ? Date.now() - g.turnStartedAt : 0
  try {
    g.chess.move({
      from,
      to,
      promotion: typeof promotion === 'string' ? promotion : 'q',
    })
  } catch {
    throw new Error('Coup illégal')
  }

  if (color === 'w') g.whiteMs = g.whiteMs - elapsed + (running ? g.incrementMs : 0)
  else g.blackMs = g.blackMs - elapsed + (running ? g.incrementMs : 0)
  g.lastMove = { from, to }
  g.turnStartedAt = Date.now()

  // Jouer un coup répond implicitement « non » à une proposition de nulle.
  g.drawOffer = null

  if (g.chess.isCheckmate()) {
    finish(g, memberId, 'checkmate')
  } else if (g.chess.isStalemate() || g.chess.isDraw()) {
    finish(g, null, drawReason(g))
  }
}

export function chessResign(g: ChessGameState, memberId: string): void {
  if (g.status !== 'playing') throw new Error('La partie est terminée')
  const color = colorOf(g, memberId)
  if (!color) throw new Error('Tu n’es pas à l’échiquier')
  finish(g, color === 'w' ? g.blackId : g.whiteId, 'resign')
}

export function chessViewOf(g: ChessGameState): ChessView {
  const running = g.status === 'playing' && clocksRunning(g)
  const elapsed = running ? Date.now() - g.turnStartedAt : 0
  const turn = g.chess.turn()
  return {
    fen: g.chess.fen(),
    whiteId: g.whiteId,
    blackId: g.blackId,
    whiteMs: Math.max(0, turn === 'w' ? g.whiteMs - elapsed : g.whiteMs),
    blackMs: Math.max(0, turn === 'b' ? g.blackMs - elapsed : g.blackMs),
    turn,
    serverNow: Date.now(),
    status: g.status,
    clockRunning: running,
    check: g.chess.inCheck(),
    lastMove: g.lastMove,
    drawOffer: g.drawOffer,
    history: g.chess.history(),
    result: g.result,
  }
}
