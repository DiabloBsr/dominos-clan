/**
 * L'IA du Clan — façade au-dessus du moteur de recherche.
 *
 * Ici on ne calcule pas : on décide COMMENT on calcule. Le niveau ELO règle
 * trois choses très différentes :
 *
 *  • la PROFONDEUR et le TEMPS accordés (ce que l'IA voit) ;
 *  • le BRUIT ajouté aux scores (ce qu'elle confond) ;
 *  • le TAUX DE FAUTE (ce qu'elle rate volontairement).
 *
 * Un débutant ne doit pas jouer parfaitement puis bâcler un coup sur trois :
 * il doit se tromper comme un débutant. À l'autre bout, les niveaux maîtres
 * n'ont ni bruit ni faute, et disposent d'assez de temps pour voir loin.
 */
import { Board, moveTo } from './board0x88'
import { bookMove } from './book'
import { MATE_BOUND, MATE_SCORE, clearTables, rankRootMoves, search } from './search'

export { MATE_SCORE, clearTables, lastNodeCount } from './search'
export { VALUES, evaluate } from './eval'

export interface RankedMove {
  move: number
  san: string
  score: number
}

/** Notation algébrique d'un coup (calcul volontairement à la demande). */
export function sanOf(board: Board, move: number): string {
  return board.san(move)
}

/** Complète la notation des N premiers coups d'un classement. */
export function withSan(board: Board, ranked: RankedMove[], count = ranked.length): RankedMove[] {
  return ranked.map((r, i) => (i < count ? { ...r, san: sanOf(board, r.move) } : r))
}

/**
 * Classe tous les coups légaux, du meilleur au pire. Sert au coach : pour
 * noter un coup joué, il faut le score de CE coup, pas seulement du meilleur.
 */
export function rankMoves(board: Board, depth: number, budgetMs = 2500): RankedMove[] {
  return rankRootMoves(board, depth, budgetMs).map((r) => ({ ...r, san: '' }))
}

/* ─── Niveaux ELO ────────────────────────────────────────────────────── */

export interface AiProfile {
  elo: number
  label: string
  depth: number
  /** Budget de réflexion en millisecondes. */
  timeMs: number
  /** Probabilité de jouer autre chose que le meilleur coup. */
  blunderRate: number
  /** Bruit ajouté aux scores (centipions) : brouille le classement. */
  noise: number
  /** Joue la théorie d'ouverture au lieu de la recalculer. */
  useBook: boolean
  taunt: string
}

export const AI_LEVELS: AiProfile[] = [
  {
    elo: 400,
    label: '🐣 Débutant',
    depth: 1,
    timeMs: 200,
    blunderRate: 0.45,
    noise: 160,
    useBook: false,
    taunt: 'Je débute aussi — on apprend ensemble !',
  },
  {
    elo: 800,
    label: '🙂 Amateur',
    depth: 2,
    timeMs: 300,
    blunderRate: 0.25,
    noise: 90,
    useBook: false,
    taunt: 'Je vois les pièces en prise… la plupart du temps.',
  },
  {
    elo: 1200,
    label: '😎 Club',
    depth: 4,
    timeMs: 600,
    blunderRate: 0.1,
    noise: 45,
    useBook: false,
    taunt: 'Attention, je compte les échanges.',
  },
  {
    elo: 1600,
    label: '🔥 Costaud',
    depth: 7,
    timeMs: 1200,
    blunderRate: 0.03,
    noise: 20,
    useBook: true,
    taunt: 'Une pièce en prise et c’est fini pour toi.',
  },
  {
    elo: 2000,
    label: '💀 Impitoyable',
    depth: 12,
    timeMs: 2000,
    blunderRate: 0,
    noise: 0,
    useBook: true,
    taunt: 'Je ne pardonne rien. Bonne chance.',
  },
  {
    elo: 2300,
    label: '🧠 Maître',
    depth: 18,
    timeMs: 3500,
    blunderRate: 0,
    noise: 0,
    useBook: true,
    taunt: 'Je vois ta combinaison avant toi. Vas-y quand même.',
  },
  {
    elo: 2600,
    label: '👑 Grand Maître',
    depth: 24,
    timeMs: 6000,
    blunderRate: 0,
    noise: 0,
    useBook: true,
    taunt: 'Personne ici ne m’a encore battu. Tente ta chance.',
  },
]

export const profileForElo = (elo: number): AiProfile =>
  AI_LEVELS.reduce(
    (best, p) => (Math.abs(p.elo - elo) < Math.abs(best.elo - elo) ? p : best),
    AI_LEVELS[0]!,
  )

/**
 * Coup joué par l'IA au niveau demandé.
 *
 * Les niveaux forts passent par `search()` : une seule recherche profonde, ce
 * qui leur donne toute la puissance des coupures. Les niveaux faibles ont
 * besoin du classement COMPLET pour pouvoir choisir un mauvais coup de façon
 * crédible — c'est plus lent, mais à profondeur 1 ou 2 c'est instantané.
 */
export function aiMove(
  board: Board,
  profile: AiProfile,
  gameHistory: number[] = [],
): RankedMove | null {
  const named = (move: number, score: number): RankedMove => ({
    move,
    score,
    san: sanOf(board, move),
  })

  if (profile.useBook) {
    const fromBook = bookMove(board)
    if (fromBook !== null) return named(fromBook, 0)
  }

  // Niveaux parfaits : recherche unique, la plus profonde possible.
  if (profile.blunderRate === 0 && profile.noise === 0) {
    const result = search(board, {
      depth: profile.depth,
      timeMs: profile.timeMs,
      gameHistory,
    })
    if (result.move === 0) return null
    return named(result.move, result.score)
  }

  const ranked = rankRootMoves(board, profile.depth, profile.timeMs)
  if (ranked.length === 0) return null
  // Un mat disponible est toujours joué, même par le débutant.
  if (ranked[0]!.score > MATE_BOUND) return named(ranked[0]!.move, ranked[0]!.score)

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
    const choice = noisy[Math.min(pick, noisy.length - 1)]!
    return named(choice.move, choice.score)
  }
  return named(noisy[0]!.move, noisy[0]!.score)
}

/** Le coup prévu par l'IA après le sien — sert à expliquer ses intentions. */
export function principalVariation(board: Board, depth: number, timeMs: number): string[] {
  const result = search(board, { depth, timeMs })
  const sans: string[] = []
  const played: number[] = []
  for (const move of result.pv) {
    const legal = board.generateMoves()
    if (!legal.includes(move)) break
    sans.push(board.san(move, legal))
    board.makeMove(move)
    played.push(move)
  }
  for (let i = played.length - 1; i >= 0; i--) board.undoMove(played[i]!)
  return sans
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
export function reviewMove(board: Board, playedMove: number, depth = 6): MoveReview {
  const ranked = rankRootMoves(board, depth, 1500)
  const bestRaw = ranked[0]!
  const playedRaw = ranked.find((m) => m.move === playedMove) ?? bestRaw
  // Notation calculée seulement pour les deux coups qu'on va citer.
  const best = { ...bestRaw, san: sanOf(board, bestRaw.move) }
  const played = { ...playedRaw, san: sanOf(board, playedRaw.move) }
  const loss = best.score - played.score
  const isMate = played.score > MATE_BOUND
  // Un sacrifice qui reste le meilleur coup malgré une perte de matériel
  // immédiate : c'est exactement ce qu'on appelle un coup brillant.
  const sacrifice =
    played.move === best.move && moveTo(played.move) >= 0 && played.score > 150 && loss === 0

  let verdict: Verdict
  if (isMate) verdict = 'brillant'
  else if (loss <= 15) verdict = 'excellent'
  else if (loss <= 60) verdict = 'bon'
  else if (loss <= 150) verdict = 'imprecision'
  else if (loss <= 350) verdict = 'erreur'
  else verdict = 'gaffe'

  let comment: string
  if (isMate) comment = 'Tu vois le mat — parfait.'
  else if (verdict === 'excellent')
    comment = sacrifice
      ? 'C’est le meilleur coup, et il demande du culot.'
      : 'C’est le meilleur coup de la position.'
  else if (verdict === 'bon') comment = 'Solide : basique mais utile, tu gardes ton avantage.'
  else if (verdict === 'imprecision')
    comment = `Jouable, mais ${best.san} était plus précis (${(loss / 100).toFixed(1)} pion de mieux).`
  else if (verdict === 'erreur')
    comment = `Ça coûte ${(loss / 100).toFixed(1)} pion : ${best.san} tenait bien mieux.`
  else
    comment = `Coup très coûteux (${(loss / 100).toFixed(1)} pion perdu) — il fallait jouer ${best.san}.`

  return { san: played.san, verdict, loss, bestSan: best.san, bestScore: best.score, comment }
}

/** Score lisible : « +1,5 » ou « mat en 3 ». */
export function formatScore(score: number): string {
  if (Math.abs(score) > MATE_BOUND) {
    const plies = MATE_SCORE - Math.abs(score)
    return `${score > 0 ? '' : '-'}M${Math.max(1, Math.ceil(plies / 2))}`
  }
  const pawns = score / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}

/** Remet les tables à zéro entre deux parties (positions d'une autre partie). */
export function resetForNewGame(): void {
  clearTables()
}
