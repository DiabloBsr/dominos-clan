/**
 * L'IA du Clan — recherche alpha-bêta sur le moteur maison (board0x88).
 *
 * Elle sait ce qu'un joueur doit savoir : valeur des pièces, contrôle du
 * centre, développement, sécurité du roi, structure de pions, et elle voit
 * les combinaisons à plusieurs coups (fourchettes, clouages, mats courts)
 * parce qu'elle cherche vraiment — pas parce qu'on lui a listé des motifs.
 *
 * Le niveau se règle en ELO : profondeur de calcul, bruit d'évaluation et
 * taux de faute. Un adversaire à 600 laisse des pièces en prise comme un
 * débutant ; à 2000 il ne pardonne rien.
 */
import {
  BISHOP,
  Board,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  moveCapt,
  moveFlag,
  moveFrom,
  movePromo,
  moveTo,
  onBoard,
  rankOf,
  FLAG_PROMO,
} from './board0x88'

export const VALUES: Record<number, number> = {
  [PAWN]: 100,
  [KNIGHT]: 320,
  [BISHOP]: 330,
  [ROOK]: 500,
  [QUEEN]: 900,
  [KING]: 20000,
}

/** Bonus de case, du point de vue des BLANCS, rangée 1 → 8. */
const PST: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0,
    20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50,
    50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10,
    5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10,
    0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0,
    0, 0, 0, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0,
    0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0,
    0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [KING]: [
    20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20,
    -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40,
    -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50,
    -40, -40, -30,
  ],
}

/** Roi actif en finale : on inverse la logique du roi caché. */
const KING_ENDGAME: number[] = [
  -50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20,
  -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20,
  30, 30, 20, -10, -30, -30, -20, -10, 0, 0, -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50,
]

export const MATE_SCORE = 100000

const pstIndex = (sq: number, side: number): number => {
  const rank = rankOf(sq)
  const file = fileOf(sq)
  return side === WHITE ? rank * 8 + file : (7 - rank) * 8 + file
}

/** Évaluation statique en centipions, du point de vue du camp au trait. */
export function evaluate(board: Board): number {
  let score = 0
  let material = 0
  const pawnFiles: Record<number, number[]> = { 1: [], [-1]: [] }
  const pieces: Array<{ sq: number; type: number; side: number }> = []

  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7
      continue
    }
    const piece = board.squares[sq]!
    if (piece === 0) continue
    const type = Math.abs(piece)
    const side = Math.sign(piece)
    pieces.push({ sq, type, side })
    if (type !== KING) material += VALUES[type]!
    if (type === PAWN) pawnFiles[side]!.push(fileOf(sq))
  }

  // Finale : le roi doit sortir et pousser, plus se cacher.
  const endgame = material < 1800

  for (const { sq, type, side } of pieces) {
    const table = type === KING && endgame ? KING_ENDGAME : PST[type]!
    const value = VALUES[type]! + table[pstIndex(sq, side)]!
    score += side === WHITE ? value : -value
  }

  for (const side of [WHITE, -WHITE]) {
    const files = pawnFiles[side]!
    // Pions doublés : une colonne encombrée vaut moins.
    for (let file = 0; file < 8; file++) {
      const count = files.filter((f) => f === file).length
      if (count > 1) score += side === WHITE ? -18 * (count - 1) : 18 * (count - 1)
      // Pion isolé : personne pour le défendre.
      if (count > 0 && !files.includes(file - 1) && !files.includes(file + 1)) {
        score += side === WHITE ? -14 : 14
      }
    }
    // Paire de fous : un avantage durable, surtout en position ouverte.
    const bishops = pieces.filter((p) => p.side === side && p.type === BISHOP).length
    if (bishops >= 2) score += side === WHITE ? 30 : -30
  }

  return board.side === WHITE ? score : -score
}

/** Prises d'abord, la plus grosse victime par le plus petit attaquant. */
function orderMoves(board: Board, moves: number[], best?: number): number[] {
  const scored = moves.map((move) => {
    let value = 0
    if (move === best) value += 1_000_000
    const captured = moveCapt(move)
    if (captured) value += 10_000 + VALUES[captured]! - VALUES[Math.abs(board.squares[moveFrom(move)]!)]! / 10
    if (moveFlag(move) === FLAG_PROMO) value += 8000 + VALUES[movePromo(move)]!
    return { move, value }
  })
  scored.sort((a, b) => b.value - a.value)
  return scored.map((s) => s.move)
}

let nodesSearched = 0

/** Quiescence : on ne s'arrête jamais au milieu d'un échange. */
function quiesce(board: Board, alpha: number, beta: number, ply: number): number {
  nodesSearched++
  const standPat = evaluate(board)
  if (ply >= 6) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  for (const move of orderMoves(board, board.generateMoves(true))) {
    board.makeMove(move)
    const value = -quiesce(board, -beta, -alpha, ply + 1)
    board.undoMove(move)
    if (value >= beta) return beta
    if (value > alpha) alpha = value
  }
  return alpha
}

function negamax(board: Board, depth: number, alpha: number, beta: number, ply: number): number {
  nodesSearched++
  const moves = board.generateMoves()
  if (moves.length === 0) return board.inCheck() ? -MATE_SCORE + ply : 0
  if (board.halfmove >= 100 || board.insufficientMaterial()) return 0
  if (depth <= 0) return quiesce(board, alpha, beta, ply)

  let best = -Infinity
  for (const move of orderMoves(board, moves)) {
    board.makeMove(move)
    const value = -negamax(board, depth - 1, -beta, -alpha, ply + 1)
    board.undoMove(move)
    if (value > best) best = value
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export interface RankedMove {
  move: number
  san: string
  score: number
}

/**
 * Classe tous les coups légaux, du meilleur au pire.
 *
 * Approfondissement ITÉRATIF : on cherche à profondeur 1, 2, 3… en réordonnant
 * à chaque passe grâce au meilleur coup déjà trouvé. Les coupures alpha-bêta
 * deviennent bien plus efficaces, et surtout on peut s'arrêter dès que le
 * budget de temps est épuisé — indispensable pour que l'IA reste jouable.
 *
 * La NOTATION n'est calculée qu'à la demande : chaque `san()` refait une
 * génération complète pour détecter l'échec, ce qui coûtait plus cher que la
 * recherche elle-même quand on la faisait pour les 30 coups.
 */
export function rankMoves(board: Board, depth: number, budgetMs = 2500): RankedMove[] {
  nodesSearched = 0
  const deadline = Date.now() + budgetMs
  const legal = board.generateMoves()
  if (legal.length === 0) return []

  let ordered = orderMoves(board, legal)
  let results: Array<{ move: number; score: number }> = ordered.map((move) => ({ move, score: 0 }))

  for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
    const pass: Array<{ move: number; score: number }> = []
    let aborted = false
    for (const move of ordered) {
      board.makeMove(move)
      const score = -negamax(board, currentDepth - 1, -Infinity, Infinity, 1)
      board.undoMove(move)
      pass.push({ move, score })
      if (Date.now() > deadline && currentDepth > 1) {
        aborted = true
        break
      }
    }
    if (!aborted || pass.length === ordered.length) {
      results = pass.sort((a, b) => b.score - a.score)
      ordered = results.map((r) => r.move)
    }
    if (aborted) break
    // Mat trouvé : inutile de creuser davantage.
    if (results[0] && results[0].score > MATE_SCORE - 1000) break
  }

  return results.map((r) => ({ move: r.move, san: '', score: r.score }))
}

/** Notation algébrique d'un coup (calcul volontairement à la demande). */
export function sanOf(board: Board, move: number): string {
  return board.san(move)
}

/** Complète la notation des N premiers coups d'un classement. */
export function withSan(board: Board, ranked: RankedMove[], count = ranked.length): RankedMove[] {
  return ranked.map((r, i) => (i < count ? { ...r, san: sanOf(board, r.move) } : r))
}

export const lastNodeCount = (): number => nodesSearched

/* ─── Niveaux ELO ────────────────────────────────────────────────────── */

export interface AiProfile {
  elo: number
  label: string
  depth: number
  /** Probabilité de jouer autre chose que le meilleur coup. */
  blunderRate: number
  /** Bruit ajouté aux scores (centipions) : brouille le classement. */
  noise: number
  taunt: string
}

export const AI_LEVELS: AiProfile[] = [
  {
    elo: 400,
    label: '🐣 Débutant',
    depth: 1,
    blunderRate: 0.45,
    noise: 160,
    taunt: 'Je débute aussi — on apprend ensemble !',
  },
  {
    elo: 800,
    label: '🙂 Amateur',
    depth: 2,
    blunderRate: 0.25,
    noise: 90,
    taunt: 'Je vois les pièces en prise… la plupart du temps.',
  },
  {
    elo: 1200,
    label: '😎 Club',
    depth: 3,
    blunderRate: 0.1,
    noise: 45,
    taunt: 'Attention, je compte les échanges.',
  },
  {
    elo: 1600,
    label: '🔥 Costaud',
    depth: 4,
    blunderRate: 0.03,
    noise: 20,
    taunt: 'Une pièce en prise et c’est fini pour toi.',
  },
  {
    elo: 2000,
    label: '💀 Impitoyable',
    depth: 5,
    blunderRate: 0,
    noise: 0,
    taunt: 'Je ne pardonne rien. Bonne chance.',
  },
]

export const profileForElo = (elo: number): AiProfile =>
  AI_LEVELS.reduce((best, p) => (Math.abs(p.elo - elo) < Math.abs(best.elo - elo) ? p : best), AI_LEVELS[0]!)

/**
 * Coup joué par l'IA au niveau demandé. Les niveaux faibles se trompent
 * VRAIMENT (ils choisissent parfois un coup moyen), au lieu de jouer
 * parfaitement puis de bâcler — c'est ce qui rend l'entraînement réaliste.
 */
export function aiMove(board: Board, profile: AiProfile): RankedMove | null {
  const ranked = rankMoves(board, profile.depth, 2500)
  if (ranked.length === 0) return null
  const named = (m: RankedMove): RankedMove => ({ ...m, san: sanOf(board, m.move) })
  // Un mat disponible est toujours joué, même par le débutant.
  if (ranked[0]!.score > MATE_SCORE - 1000) return named(ranked[0]!)

  const noisy = ranked.map((m) => ({
    ...m,
    noisy: m.score + (Math.random() * 2 - 1) * profile.noise,
  }))
  noisy.sort((a, b) => b.noisy - a.noisy)

  if (Math.random() < profile.blunderRate && noisy.length > 1) {
    // Faute volontaire : un coup pris dans la moitié basse du classement.
    const from = Math.min(1, noisy.length - 1)
    const to = Math.max(from, Math.floor(noisy.length * 0.7))
    const pick = from + Math.floor(Math.random() * (to - from + 1))
    return named(noisy[Math.min(pick, noisy.length - 1)]!)
  }
  return named(noisy[0]!)
}

/* ─── Coach ──────────────────────────────────────────────────────────── */

export type Verdict = 'brillant' | 'excellent' | 'bon' | 'imprecision' | 'erreur' | 'gaffe'

export interface MoveReview {
  san: string
  verdict: Verdict
  /** Perte par rapport au meilleur coup, en centipions. */
  loss: number
  bestSan: string
  bestScore: number
  comment: string
}

const VERDICT_LABELS: Record<Verdict, { icon: string; text: string }> = {
  brillant: { icon: '💎', text: 'Brillant' },
  excellent: { icon: '⭐', text: 'Excellent coup' },
  bon: { icon: '✅', text: 'Bon coup' },
  imprecision: { icon: '🤔', text: 'Imprécision' },
  erreur: { icon: '⚠️', text: 'Erreur' },
  gaffe: { icon: '💥', text: 'Gaffe' },
}

export const verdictLabel = (v: Verdict): { icon: string; text: string } => VERDICT_LABELS[v]

/**
 * Juge un coup JOUÉ dans une position : compare-le au meilleur coup trouvé.
 * `board` doit être AVANT le coup ; il est laissé intact.
 */
export function reviewMove(board: Board, playedMove: number, depth = 3): MoveReview {
  const ranked = rankMoves(board, depth, 1500)
  const bestRaw = ranked[0]!
  const playedRaw = ranked.find((m) => m.move === playedMove) ?? bestRaw
  // Notation calculée seulement pour les deux coups qu'on va citer.
  const best = { ...bestRaw, san: sanOf(board, bestRaw.move) }
  const played = { ...playedRaw, san: sanOf(board, playedRaw.move) }
  const loss = best.score - played.score
  const isMate = played.score > MATE_SCORE - 1000

  let verdict: Verdict
  if (isMate) verdict = 'brillant'
  else if (loss <= 15) verdict = 'excellent'
  else if (loss <= 60) verdict = 'bon'
  else if (loss <= 150) verdict = 'imprecision'
  else if (loss <= 350) verdict = 'erreur'
  else verdict = 'gaffe'

  let comment: string
  if (isMate) comment = 'Tu vois le mat — parfait.'
  else if (verdict === 'excellent') comment = 'C’est le meilleur coup de la position.'
  else if (verdict === 'bon') comment = 'Solide : basique mais utile, tu gardes ton avantage.'
  else if (verdict === 'imprecision')
    comment = `Jouable, mais ${best.san} était plus précis (${(loss / 100).toFixed(1)} pion de mieux).`
  else if (verdict === 'erreur')
    comment = `Ça coûte ${(loss / 100).toFixed(1)} pion : ${best.san} tenait bien mieux.`
  else comment = `Coup très coûteux (${(loss / 100).toFixed(1)} pion perdu) — il fallait jouer ${best.san}.`

  return { san: played.san, verdict, loss, bestSan: best.san, bestScore: best.score, comment }
}

/** Score lisible : « +1,5 » ou « mat en 3 ». */
export function formatScore(score: number): string {
  if (Math.abs(score) > MATE_SCORE - 1000) {
    const plies = MATE_SCORE - Math.abs(score)
    return `${score > 0 ? '' : '-'}M${Math.max(1, Math.ceil(plies / 2))}`
  }
  const pawns = score / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}
