/**
 * Recherche — le cerveau de l'IA.
 *
 * L'ancienne version était un alpha-bêta nu : elle atteignait péniblement la
 * profondeur 5 en 2,5 s. Les techniques ci-dessous ne changent pas le RÉSULTAT
 * d'une recherche parfaite, elles la rendent atteignable :
 *
 *  • TABLE DE TRANSPOSITION — une position revient par des chemins différents ;
 *    on la reconnaît par son empreinte Zobrist et on réutilise le travail ;
 *  • ORDONNANCEMENT — le coup de la table, puis les prises (grosse victime par
 *    petit attaquant), puis les « tueurs » et l'historique. Bien trier, c'est
 *    couper 90 % de l'arbre ;
 *  • RECHERCHE À FENÊTRE NULLE (PVS) — on parie que le premier coup est le
 *    meilleur et on VÉRIFIE les autres à moindre coût ;
 *  • COUP NUL — si passer son tour laisse quand même l'adversaire impuissant,
 *    la branche est perdue d'avance pour lui ;
 *  • RÉDUCTIONS TARDIVES (LMR) — les coups mal classés sont explorés moins
 *    profondément, et re-explorés seulement s'ils surprennent ;
 *  • EXTENSIONS D'ÉCHEC — on ne s'arrête jamais de calculer sous échec ;
 *  • QUIESCENCE — on ne juge jamais une position au milieu d'un échange.
 *
 * Tout est vérifié par scripts/check-strength.ts : suite tactique + match
 * direct contre l'ancien moteur.
 */
import {
  Board,
  FLAG_PROMO,
  KING,
  PAWN,
  moveCapt,
  moveFlag,
  moveFrom,
  movePromo,
  moveTo,
} from './board0x88'
import { VALUES, evaluate } from './eval'

export const MATE_SCORE = 100000
/** Au-delà, le score encode un mat et non une évaluation. */
export const MATE_BOUND = MATE_SCORE - 1000

const MAX_PLY = 64

/* ─── Table de transposition ───────────────────────────────────────────── */

const TT_BITS = 20
const TT_SIZE = 1 << TT_BITS
const TT_MASK = TT_SIZE - 1

const FLAG_EXACT = 0
const FLAG_LOWER = 1
const FLAG_UPPER = 2

const ttKey = new Int32Array(TT_SIZE)
const ttMove = new Int32Array(TT_SIZE)
const ttScore = new Int32Array(TT_SIZE)
const ttDepth = new Int8Array(TT_SIZE)
const ttFlag = new Int8Array(TT_SIZE)
const ttAge = new Int8Array(TT_SIZE)
/** Vide, mais pas 0 : 0 est une empreinte possible. */
const ttUsed = new Uint8Array(TT_SIZE)
let currentAge = 0

export function clearTables(): void {
  ttUsed.fill(0)
  killers.fill(0)
  history.fill(0)
  currentAge = 0
}

/** Nouvelle partie ou nouvelle position à analyser : on vieillit les entrées. */
export function newSearchGeneration(): void {
  currentAge = (currentAge + 1) & 0x7f
}

/* ─── Heuristiques d'ordonnancement ────────────────────────────────────── */

/** Deux « coups tueurs » par profondeur : des coups tranquilles qui coupent. */
const killers = new Int32Array(MAX_PLY * 2)
/** history[camp][depart][arrivee] : ce qui a coupé souvent coupera encore. */
const history = new Int32Array(2 * 128 * 128)

const historyIndex = (side: number, from: number, to: number): number =>
  (side > 0 ? 0 : 1) * 128 * 128 + from * 128 + to

/* ─── État d'une recherche ─────────────────────────────────────────────── */

let nodes = 0
let deadline = 0
let aborted = false
/** Empreintes du chemin courant, pour détecter les répétitions. */
let pathHashes: number[] = []

const outOfTime = (): boolean => {
  // On ne lit l'horloge que toutes les 2048 positions : Date.now() coûte cher.
  if ((nodes & 2047) === 0 && Date.now() > deadline) aborted = true
  return aborted
}

/** La position s'est-elle déjà produite dans la partie ou dans le chemin ? */
function isRepetition(board: Board): boolean {
  for (let i = pathHashes.length - 2; i >= 0; i -= 2) {
    if (pathHashes[i] === board.hash) return true
  }
  return false
}

/* ─── Tri des coups ────────────────────────────────────────────────────── */

const scoreMove = (board: Board, move: number, ttBest: number, ply: number): number => {
  if (move === ttBest) return 2_000_000
  const captured = moveCapt(move)
  if (captured !== 0) {
    const attacker = Math.abs(board.squares[moveFrom(move)]!)
    // MVV-LVA : la plus grosse victime par le plus petit attaquant.
    return 1_000_000 + VALUES[captured]! * 10 - VALUES[attacker]!
  }
  if (moveFlag(move) === FLAG_PROMO) return 900_000 + VALUES[movePromo(move)]!
  if (killers[ply * 2] === move) return 800_000
  if (killers[ply * 2 + 1] === move) return 790_000
  return history[historyIndex(board.side, moveFrom(move), moveTo(move))]!
}

/**
 * Tri par SÉLECTION à la demande : on ne trie pas les 30 coups d'un coup, on
 * remonte le meilleur restant à chaque tour de boucle. Comme la plupart des
 * nœuds coupent après 1 ou 2 coups, on évite l'essentiel du tri.
 */
function pickMove(moves: number[], scores: number[], start: number): void {
  let best = start
  for (let i = start + 1; i < moves.length; i++) {
    if (scores[i]! > scores[best]!) best = i
  }
  if (best !== start) {
    const m = moves[start]!
    moves[start] = moves[best]!
    moves[best] = m
    const s = scores[start]!
    scores[start] = scores[best]!
    scores[best] = s
  }
}

/* ─── Quiescence ───────────────────────────────────────────────────────── */

function quiesce(board: Board, alpha: number, beta: number, ply: number): number {
  nodes++
  if (outOfTime()) return 0
  const standPat = evaluate(board)
  if (ply >= MAX_PLY - 1) return standPat
  if (standPat >= beta) return beta
  // Élagage delta : si même en gagnant une dame on reste très en dessous
  // d'alpha, inutile de dérouler les prises.
  if (standPat + 975 < alpha) return alpha
  if (standPat > alpha) alpha = standPat

  const moves = board.generateMoves(true)
  const scores = moves.map((m) => scoreMove(board, m, 0, ply))
  for (let i = 0; i < moves.length; i++) {
    pickMove(moves, scores, i)
    const move = moves[i]!
    const captured = moveCapt(move)
    // Élagage delta par coup : cette prise peut-elle seulement rattraper ?
    if (captured !== 0 && standPat + VALUES[captured]! + 200 < alpha) continue
    board.makeMove(move)
    const value = -quiesce(board, -beta, -alpha, ply + 1)
    board.undoMove(move)
    if (aborted) return 0
    if (value >= beta) return beta
    if (value > alpha) alpha = value
  }
  return alpha
}

/* ─── Recherche principale ─────────────────────────────────────────────── */

function negamax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  canNull: boolean,
): number {
  nodes++
  if (outOfTime()) return 0

  const inCheck = board.inCheck()
  // Sous échec on ne s'arrête jamais : la position est trop instable.
  if (inCheck && depth < MAX_PLY - ply) depth++

  if (ply > 0) {
    if (board.halfmove >= 100 || board.insufficientMaterial() || isRepetition(board)) return 0
    // Élagage par distance de mat : si un mat plus court est déjà acquis,
    // inutile d'explorer des mats plus longs.
    const mateAlpha = Math.max(alpha, -MATE_SCORE + ply)
    const mateBeta = Math.min(beta, MATE_SCORE - ply - 1)
    if (mateAlpha >= mateBeta) return mateAlpha
    alpha = mateAlpha
    beta = mateBeta
  }

  const index = board.hash & TT_MASK
  let ttBest = 0
  if (ttUsed[index] === 1 && ttKey[index] === board.hash) {
    ttBest = ttMove[index]!
    if (ply > 0 && ttDepth[index]! >= depth) {
      let score = ttScore[index]!
      // Un score de mat est relatif à la profondeur où il a été trouvé.
      if (score > MATE_BOUND) score -= ply
      else if (score < -MATE_BOUND) score += ply
      const flag = ttFlag[index]
      if (flag === FLAG_EXACT) return score
      if (flag === FLAG_LOWER && score >= beta) return score
      if (flag === FLAG_UPPER && score <= alpha) return score
    }
  }

  if (depth <= 0) return quiesce(board, alpha, beta, ply)

  const isPv = beta - alpha > 1
  const staticEval = inCheck ? 0 : evaluate(board)

  // Élagage « futilité inverse » : si on est déjà très au-dessus de bêta avec
  // une marge confortable, l'adversaire ne rattrapera pas en si peu de coups.
  if (!isPv && !inCheck && depth <= 3 && staticEval - 120 * depth >= beta && beta < MATE_BOUND) {
    return staticEval
  }

  // COUP NUL : on passe la main. Interdit sous échec (illégal) et en finale de
  // pions (le zugzwang rendrait la conclusion fausse).
  if (canNull && !isPv && !inCheck && depth >= 3 && staticEval >= beta && hasPieces(board)) {
    const reduction = depth > 6 ? 3 : 2
    const saved = board.makeNullMove()
    pathHashes.push(board.hash)
    const value = -negamax(board, depth - 1 - reduction, -beta, -beta + 1, ply + 1, false)
    pathHashes.pop()
    board.undoNullMove(saved)
    if (aborted) return 0
    if (value >= beta) return beta
  }

  const moves = board.generateMoves()
  if (moves.length === 0) return inCheck ? -MATE_SCORE + ply : 0

  const scores = moves.map((m) => scoreMove(board, m, ttBest, ply))
  let best = -Infinity
  let bestMove = 0
  let flag = FLAG_UPPER
  let searched = 0

  for (let i = 0; i < moves.length; i++) {
    pickMove(moves, scores, i)
    const move = moves[i]!
    const quiet = moveCapt(move) === 0 && moveFlag(move) !== FLAG_PROMO

    board.makeMove(move)
    pathHashes.push(board.hash)

    let value: number
    if (searched === 0) {
      // Premier coup : fenêtre complète, c'est notre meilleur candidat.
      value = -negamax(board, depth - 1, -beta, -alpha, ply + 1, true)
    } else {
      // RÉDUCTIONS TARDIVES : les coups tranquilles mal classés sont explorés
      // moins profondément. S'ils remontent quand même, on refait sérieusement.
      let reduction = 0
      if (depth >= 3 && quiet && !inCheck && searched >= 3) {
        reduction = searched >= 6 ? 2 : 1
        if (isPv) reduction = Math.max(0, reduction - 1)
      }
      value = -negamax(board, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true)
      if (value > alpha && reduction > 0) {
        value = -negamax(board, depth - 1, -alpha - 1, -alpha, ply + 1, true)
      }
      if (value > alpha && value < beta) {
        value = -negamax(board, depth - 1, -beta, -alpha, ply + 1, true)
      }
    }

    pathHashes.pop()
    board.undoMove(move)
    if (aborted) return 0
    searched++

    if (value > best) {
      best = value
      bestMove = move
      if (value > alpha) {
        alpha = value
        flag = FLAG_EXACT
        if (alpha >= beta) {
          // Coupure : ce coup tranquille mérite d'être essayé plus tôt ailleurs.
          if (quiet) {
            const slot = ply * 2
            if (killers[slot] !== move) {
              killers[slot + 1] = killers[slot]!
              killers[slot] = move
            }
            const slotIndex = historyIndex(board.side, moveFrom(move), moveTo(move))
            history[slotIndex] = Math.min(700_000, history[slotIndex]! + depth * depth)
          }
          flag = FLAG_LOWER
          break
        }
      }
    }
  }

  // Rangement dans la table, avec le score de mat rendu absolu.
  let stored = best
  if (stored > MATE_BOUND) stored += ply
  else if (stored < -MATE_BOUND) stored -= ply
  const slot = board.hash & TT_MASK
  const replace =
    ttUsed[slot] === 0 || ttAge[slot] !== currentAge || ttDepth[slot]! <= depth
  if (replace) {
    ttUsed[slot] = 1
    ttKey[slot] = board.hash
    ttMove[slot] = bestMove
    ttScore[slot] = stored
    ttDepth[slot] = depth
    ttFlag[slot] = flag
    ttAge[slot] = currentAge
  }
  return best
}

/** Le camp au trait a-t-il autre chose que des pions ? (garde anti-zugzwang) */
function hasPieces(board: Board): boolean {
  const side = board.side
  for (let sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) !== 0) {
      sq += 7
      continue
    }
    const piece = board.squares[sq]!
    if (piece === 0) continue
    if ((piece > 0 ? 1 : -1) !== side) continue
    const type = Math.abs(piece)
    if (type !== PAWN && type !== KING) return true
  }
  return false
}

export interface SearchResult {
  move: number
  score: number
  depth: number
  nodes: number
  /** Variante principale, telle que l'IA la prévoit. */
  pv: number[]
}

/** Reconstitue la variante principale depuis la table de transposition. */
function extractPv(board: Board, limit: number): number[] {
  const pv: number[] = []
  const played: number[] = []
  for (let i = 0; i < limit; i++) {
    const index = board.hash & TT_MASK
    if (ttUsed[index] !== 1 || ttKey[index] !== board.hash) break
    const move = ttMove[index]!
    if (move === 0) break
    const legal = board.generateMoves()
    if (!legal.includes(move)) break
    pv.push(move)
    board.makeMove(move)
    played.push(move)
  }
  for (let i = played.length - 1; i >= 0; i--) board.undoMove(played[i]!)
  return pv
}

/**
 * Recherche du meilleur coup, avec approfondissement itératif et FENÊTRES
 * D'ASPIRATION : on repart du score précédent en supposant qu'il bougera peu,
 * ce qui resserre la fenêtre alpha-bêta et coupe beaucoup plus tôt. Si le
 * score sort de la fenêtre, on rouvre.
 */
export function search(
  board: Board,
  options: { depth: number; timeMs: number; gameHistory?: number[] },
): SearchResult {
  nodes = 0
  aborted = false
  deadline = Date.now() + options.timeMs
  pathHashes = [...(options.gameHistory ?? []), board.hash]
  newSearchGeneration()

  const legal = board.generateMoves()
  if (legal.length === 0) return { move: 0, score: 0, depth: 0, nodes: 0, pv: [] }

  let bestMove = legal[0]!
  let bestScore = 0
  let reachedDepth = 0

  for (let depth = 1; depth <= options.depth; depth++) {
    let alpha = -Infinity
    let beta = Infinity
    if (depth >= 4) {
      alpha = bestScore - 40
      beta = bestScore + 40
    }

    let score = 0
    for (;;) {
      score = negamax(board, depth, alpha, beta, 0, true)
      if (aborted) break
      if (score <= alpha) {
        // Échec bas : la vraie valeur est plus mauvaise, on rouvre vers le bas.
        alpha = score - 200
        if (alpha < -MATE_SCORE) alpha = -Infinity
        continue
      }
      if (score >= beta) {
        beta = score + 200
        if (beta > MATE_SCORE) beta = Infinity
        continue
      }
      break
    }
    if (aborted) break

    const index = board.hash & TT_MASK
    if (ttUsed[index] === 1 && ttKey[index] === board.hash && ttMove[index] !== 0) {
      const candidate = ttMove[index]!
      if (legal.includes(candidate)) bestMove = candidate
    }
    bestScore = score
    reachedDepth = depth
    // Mat trouvé : creuser davantage ne changera rien.
    if (Math.abs(score) > MATE_BOUND) break
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: reachedDepth,
    nodes,
    pv: extractPv(board, 8),
  }
}

/**
 * Classe TOUS les coups légaux — c'est ce dont le coach a besoin pour noter le
 * coup joué. Chaque coup est évalué à fenêtre complète, sinon les scores ne
 * seraient pas comparables entre eux.
 */
export function rankRootMoves(
  board: Board,
  depth: number,
  timeMs: number,
): Array<{ move: number; score: number }> {
  nodes = 0
  aborted = false
  deadline = Date.now() + timeMs
  pathHashes = [board.hash]
  newSearchGeneration()

  const legal = board.generateMoves()
  if (legal.length === 0) return []

  let results = legal.map((move) => ({ move, score: 0 }))
  for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
    const pass: Array<{ move: number; score: number }> = []
    for (const { move } of results) {
      board.makeMove(move)
      pathHashes.push(board.hash)
      const score = -negamax(board, currentDepth - 1, -Infinity, Infinity, 1, true)
      pathHashes.pop()
      board.undoMove(move)
      if (aborted) break
      pass.push({ move, score })
    }
    if (pass.length < results.length) break
    pass.sort((a, b) => b.score - a.score)
    results = pass
    if (Math.abs(results[0]!.score) > MATE_BOUND) break
  }
  return results
}

export const lastNodeCount = (): number => nodes
