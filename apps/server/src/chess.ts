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
    result: null,
    flagTimer: null,
  }
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

/** Temps restant (ms) de la pendule active, décompte en cours inclus. */
function activeRemaining(g: ChessGameState): number {
  const elapsed = Date.now() - g.turnStartedAt
  const base = g.chess.turn() === 'w' ? g.whiteMs : g.blackMs
  return base - elapsed
}

/** Drapeau : si la pendule active est tombée, l'adversaire gagne au temps. */
export function chessCheckFlag(g: ChessGameState): boolean {
  if (g.status !== 'playing') return false
  if (activeRemaining(g) > 0) return false
  const flagged = g.chess.turn()
  finish(g, flagged === 'w' ? g.blackId : g.whiteId, 'timeout')
  return true
}

/** Programme le drapeau serveur pour la pendule active (le callback vérifie et conclut). */
export function armChessFlag(g: ChessGameState, onFlag: () => void): void {
  stopChess(g)
  if (g.status !== 'playing') return
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

  const elapsed = Date.now() - g.turnStartedAt
  try {
    g.chess.move({
      from,
      to,
      promotion: typeof promotion === 'string' ? promotion : 'q',
    })
  } catch {
    throw new Error('Coup illégal')
  }

  if (color === 'w') g.whiteMs = g.whiteMs - elapsed + g.incrementMs
  else g.blackMs = g.blackMs - elapsed + g.incrementMs
  g.lastMove = { from, to }
  g.turnStartedAt = Date.now()

  if (g.chess.isCheckmate()) {
    finish(g, memberId, 'checkmate')
  } else if (g.chess.isStalemate()) {
    finish(g, null, 'stalemate')
  } else if (g.chess.isDraw()) {
    finish(g, null, 'draw')
  }
}

export function chessResign(g: ChessGameState, memberId: string): void {
  if (g.status !== 'playing') throw new Error('La partie est terminée')
  const color = colorOf(g, memberId)
  if (!color) throw new Error('Tu n’es pas à l’échiquier')
  finish(g, color === 'w' ? g.blackId : g.whiteId, 'resign')
}

export function chessViewOf(g: ChessGameState): ChessView {
  const elapsed = g.status === 'playing' ? Date.now() - g.turnStartedAt : 0
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
    check: g.chess.inCheck(),
    lastMove: g.lastMove,
    result: g.result,
  }
}
