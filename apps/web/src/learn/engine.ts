/**
 * Petit moteur d'échecs maison — sert d'entraîneur, pas de champion.
 *
 * Négamax + élagage alpha-bêta, évaluation « matériel + tables de position »
 * (les valeurs classiques du chessprogramming wiki). À profondeur 3 il voit
 * les prises en deux temps et les mats courts : largement de quoi repérer une
 * gaffe et proposer un meilleur coup, ce qui est le but de l'académie.
 *
 * Tout est synchrone et sans dépendance : l'analyse d'une partie est découpée
 * coup par coup côté UI pour ne jamais figer l'écran.
 */
import { Chess, type Move, type PieceSymbol } from 'chess.js'

/** Valeur des pièces en centipions (1 pion = 100). */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

/**
 * Bonus de case, vus DES BLANCS et lus rangée 8 → 1 (comme chess.js board()).
 * Ils encodent les principes qu'on enseigne : occuper le centre, développer,
 * roquer, pousser les pions passés.
 */
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
}

const MATE = 100000

/** Évaluation statique, en centipions, DU POINT DE VUE DU TRAIT. */
export function evaluate(chess: Chess): number {
  let score = 0
  const board = chess.board()
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row]![col]
      if (!cell) continue
      const index = row * 8 + col
      const positional = cell.color === 'w' ? PST[cell.type]![index]! : PST[cell.type]![63 - index]!
      const value = PIECE_VALUES[cell.type] + positional
      score += cell.color === 'w' ? value : -value
    }
  }
  return chess.turn() === 'w' ? score : -score
}

/** Prises d'abord, et les grosses prises par de petites pièces en premier. */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => score(b) - score(a))
  function score(m: Move): number {
    if (!m.captured) return m.promotion ? 800 : 0
    return PIECE_VALUES[m.captured] - PIECE_VALUES[m.piece] / 10 + 1000
  }
}

/**
 * Recherche de QUIESCENCE : à la profondeur limite, on continue tant qu'il
 * reste des prises. Sans elle, le moteur s'arrête au milieu d'un échange et
 * croit avoir gagné une pièce qu'il va rendre au coup suivant (« effet
 * d'horizon ») — il préférait un échec inutile à une prise saine.
 */
function quiesce(chess: Chess, alpha: number, beta: number, ply: number): number {
  if (chess.isCheckmate()) return -MATE + ply
  const standPat = evaluate(chess)
  if (ply >= 4) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  for (const move of orderMoves(chess.moves({ verbose: true }).filter((m) => m.captured || m.promotion))) {
    chess.move(move)
    const value = -quiesce(chess, -beta, -alpha, ply + 1)
    chess.undo()
    if (value >= beta) return beta
    if (value > alpha) alpha = value
  }
  return alpha
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, ply = 0): number {
  if (chess.isCheckmate()) return -MATE + ply // mater vite vaut mieux que mater tard
  if (chess.isDraw() || chess.isStalemate()) return 0
  if (depth === 0) return quiesce(chess, alpha, beta, ply)

  let best = -Infinity
  for (const move of orderMoves(chess.moves({ verbose: true }))) {
    chess.move(move)
    const value = -negamax(chess, depth - 1, -beta, -alpha, ply + 1)
    chess.undo()
    if (value > best) best = value
    if (best > alpha) alpha = best
    if (alpha >= beta) break // coupure : l'adversaire ne jouera jamais ça
  }
  return best
}

export interface MoveScore {
  san: string
  from: string
  to: string
  promotion?: string
  /** Score en centipions du point de vue du joueur qui a le trait. */
  score: number
}

/**
 * Classe TOUS les coups légaux, du meilleur au pire.
 *
 * Profondeur 1 + quiescence par défaut. chess.js recalcule la notation de
 * CHAQUE coup à chaque génération (make/unmake caché) : la profondeur 2
 * demandait déjà 30 à 60 s par position, inutilisable pour analyser une
 * partie entière. À profondeur 1 la quiescence résout quand même tous les
 * échanges — c'est ce qui attrape les vraies fautes de débutant (pièce en
 * prise, mauvais échange, mat en 1 manqué).
 */
export function rankMoves(fen: string, depth = 1): MoveScore[] {
  const chess = new Chess(fen)
  const scored: MoveScore[] = []
  for (const move of orderMoves(chess.moves({ verbose: true }))) {
    chess.move(move)
    const score = -negamax(chess, depth - 1, -Infinity, Infinity, 1)
    chess.undo()
    scored.push({
      san: move.san,
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      score,
    })
  }
  return scored.sort((a, b) => b.score - a.score)
}

/** Meilleur coup trouvé (null si la partie est déjà finie). */
export function bestMove(fen: string, depth = 2): MoveScore | null {
  return rankMoves(fen, depth)[0] ?? null
}

/** Score lisible : « +1,5 » ou « mat en 2 ». */
export function formatScore(score: number): string {
  if (Math.abs(score) > MATE - 100) {
    const plies = MATE + 100 - Math.abs(score)
    return `${score > 0 ? '' : '-'}mat en ${Math.max(1, Math.ceil(plies / 2))}`
  }
  const pawns = score / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}
