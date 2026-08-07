/**
 * GÉNÉRATEUR de puzzles d'échecs — écrit src/learn/puzzles.generated.ts.
 *
 * Composer des puzzles à la main est peu fiable (4 des 6 premiers étaient
 * faux). Ici, on fabrique des positions au hasard (graine fixe → résultat
 * reproductible) et on ne GARDE que celles dont le moteur prouve :
 *   - la position est légale (rois séparés, adversaire pas déjà en échec) ;
 *   - il existe un mat forcé au niveau demandé (1 ou 2 coups) ;
 *   - le PREMIER coup solution est UNIQUE (sinon le joueur trouve une autre
 *     bonne réponse et l'app la refuserait).
 *
 * Lancer : npm run gen:puzzles -w @dominos-clan/web
 */
import { writeFileSync } from 'node:fs'
import { Chess, type Move } from 'chess.js'

const FILES = 'abcdefgh'
const OUT = new URL('../src/learn/puzzles.generated.ts', import.meta.url)

/** PRNG déterministe : la génération doit être reproductible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260806)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!

type Placement = { square: string; type: string; color: 'w' | 'b' }

/** Recettes de matériel : peu de pièces = positions lisibles et jolies. */
const RECIPES: Array<{ white: string[]; black: string[]; blackPawns: number }> = [
  { white: ['q'], black: [], blackPawns: 0 },
  { white: ['r', 'r'], black: [], blackPawns: 0 },
  { white: ['q', 'r'], black: [], blackPawns: 0 },
  { white: ['r'], black: [], blackPawns: 2 },
  { white: ['q'], black: [], blackPawns: 2 },
  { white: ['q', 'n'], black: [], blackPawns: 2 },
  { white: ['r', 'b'], black: [], blackPawns: 2 },
  { white: ['q', 'b'], black: ['r'], blackPawns: 2 },
  { white: ['r', 'n'], black: ['p'], blackPawns: 2 },
  { white: ['q', 'r', 'n'], black: ['r', 'b'], blackPawns: 3 },
]

const allSquares = (): string[] => {
  const out: string[] = []
  for (const f of FILES) for (let r = 1; r <= 8; r++) out.push(`${f}${r}`)
  return out
}
const SQUARES = allSquares()

const fileIndex = (sq: string) => FILES.indexOf(sq[0]!)
const rankIndex = (sq: string) => Number(sq[1]) - 1
const adjacent = (a: string, b: string) =>
  Math.abs(fileIndex(a) - fileIndex(b)) <= 1 && Math.abs(rankIndex(a) - rankIndex(b)) <= 1

function toFen(pieces: Placement[], turn: 'w' | 'b'): string {
  const board: (Placement | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (const p of pieces) board[7 - rankIndex(p.square)]![fileIndex(p.square)] = p
  const rows = board.map((row) => {
    let out = ''
    let empty = 0
    for (const cell of row) {
      if (!cell) {
        empty++
        continue
      }
      if (empty) {
        out += empty
        empty = 0
      }
      out += cell.color === 'w' ? cell.type.toUpperCase() : cell.type
    }
    if (empty) out += empty
    return out
  })
  return `${rows.join('/')} ${turn} - - 0 1`
}

/** Position légale : chargeable, et le camp qui vient de jouer n'est pas en échec. */
function legalPosition(fen: string): Chess | null {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return null
  }
  const flipped = fen.includes(' w ') ? fen.replace(' w ', ' b ') : fen.replace(' b ', ' w ')
  try {
    if (new Chess(flipped).isCheck()) return null // l'adversaire serait déjà en échec
  } catch {
    return null
  }
  if (chess.isGameOver()) return null
  return chess
}

/** Tous les coups qui matent immédiatement. */
function matesInOne(fen: string): Move[] {
  const chess = new Chess(fen)
  const out: Move[] = []
  for (const m of chess.moves({ verbose: true })) {
    const probe = new Chess(fen)
    probe.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' })
    if (probe.isCheckmate()) out.push(m)
  }
  return out
}

/**
 * Coups qui forcent le mat au coup suivant, QUELLE QUE SOIT la défense.
 * (Recherche exhaustive : positions à peu de pièces, c'est instantané.)
 */
function matesInTwo(fen: string): Move[] {
  const chess = new Chess(fen)
  const out: Move[] = []
  for (const m of chess.moves({ verbose: true })) {
    const afterWhite = new Chess(fen)
    afterWhite.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' })
    if (afterWhite.isCheckmate()) continue // c'est un mat en 1, pas en 2
    if (afterWhite.isStalemate() || afterWhite.isDraw()) continue
    const replies = afterWhite.moves({ verbose: true })
    if (replies.length === 0) continue
    const allAnswered = replies.every((reply) => {
      const afterBlack = new Chess(afterWhite.fen())
      afterBlack.move({ from: reply.from, to: reply.to, promotion: reply.promotion ?? 'q' })
      return matesInOne(afterBlack.fen()).length > 0
    })
    if (allAnswered) out.push(m)
  }
  return out
}

/** Thème lisible, déduit de la position finale. */
function themeOf(fen: string, move: Move): { title: string; hint: string } {
  const after = new Chess(fen)
  after.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
  const board = after.board()
  let kingSquare = ''
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === after.turn()) kingSquare = cell.square
    }
  }
  // Cases voisines du roi maté occupées par SES propres pièces → étouffé.
  let ownNeighbours = 0
  for (const sq of SQUARES) {
    if (!adjacent(sq, kingSquare) || sq === kingSquare) continue
    const p = after.get(sq as never)
    if (p && p.color === after.turn()) ownNeighbours++
  }
  const lastRank = kingSquare.endsWith('8') || kingSquare.endsWith('1')

  if (move.piece === 'n' && ownNeighbours >= 3) {
    return {
      title: 'Le mat étouffé',
      hint: 'Le roi est enterré sous ses propres pièces — une seule figure saute par-dessus tout.',
    }
  }
  if (lastRank && (move.piece === 'r' || move.piece === 'q') && ownNeighbours >= 2) {
    return {
      title: 'La dernière rangée',
      hint: 'Ses propres pièces lui bouchent la fuite : attaque la rangée du fond.',
    }
  }
  const byPiece: Record<string, { title: string; hint: string }> = {
    q: { title: 'La dame conclut', hint: 'Cherche une case d’où la dame attaque le roi sans pouvoir être prise.' },
    r: { title: 'La tour conclut', hint: 'Une colonne ou une rangée ouverte suffit à enfermer le roi.' },
    b: { title: 'Le fou conclut', hint: 'La grande diagonale est souvent la clé.' },
    n: { title: 'Le cavalier conclut', hint: 'Le cavalier attaque des cases qu’aucune autre pièce ne défend.' },
    p: { title: 'Le pion conclut', hint: 'Même un pion peut donner le coup de grâce.' },
    k: { title: 'Le roi participe', hint: 'Ton roi contrôle les cases de fuite : amène la pièce qui mate.' },
  }
  return byPiece[move.piece] ?? byPiece.q!
}

interface Generated {
  id: string
  fen: string
  side: 'w' | 'b'
  level: 1 | 2
  solutionSan: string
  from: string
  to: string
  promotion?: string
  title: string
  hint: string
}

function generate(level: 1 | 2, target: number, maxTries: number): Generated[] {
  const found: Generated[] = []
  const seen = new Set<string>()
  for (let tries = 0; tries < maxTries && found.length < target; tries++) {
    const recipe = pick(RECIPES)
    const side: 'w' | 'b' = rand() < 0.25 ? 'b' : 'w'
    const used = new Set<string>()
    const takeSquare = (filter?: (sq: string) => boolean): string | null => {
      for (let i = 0; i < 60; i++) {
        const sq = pick(SQUARES)
        if (used.has(sq)) continue
        if (filter && !filter(sq)) continue
        used.add(sq)
        return sq
      }
      return null
    }

    const pieces: Placement[] = []
    // Rois : jamais adjacents, roi adverse plutôt vers le bord (mats naturels).
    const myKing = takeSquare()
    const theirKing = takeSquare(
      (sq) =>
        !adjacent(sq, myKing ?? 'a1') &&
        (rankIndex(sq) <= 1 || rankIndex(sq) >= 6 || fileIndex(sq) <= 1 || fileIndex(sq) >= 6),
    )
    if (!myKing || !theirKing) continue
    const me: 'w' | 'b' = side
    const foe: 'w' | 'b' = side === 'w' ? 'b' : 'w'
    pieces.push({ square: myKing, type: 'k', color: me })
    pieces.push({ square: theirKing, type: 'k', color: foe })

    let ok = true
    for (const type of recipe.white) {
      const sq = takeSquare((s) => !(type === 'p' && (s.endsWith('1') || s.endsWith('8'))))
      if (!sq) {
        ok = false
        break
      }
      pieces.push({ square: sq, type, color: me })
    }
    for (const type of recipe.black) {
      const sq = takeSquare((s) => !(type === 'p' && (s.endsWith('1') || s.endsWith('8'))))
      if (!sq) {
        ok = false
        break
      }
      pieces.push({ square: sq, type, color: foe })
    }
    // Pions adverses collés à leur roi : c'est ce qui crée les mats du couloir.
    for (let i = 0; i < recipe.blackPawns; i++) {
      const sq = takeSquare(
        (s) => adjacent(s, theirKing) && !s.endsWith('1') && !s.endsWith('8'),
      )
      if (sq) pieces.push({ square: sq, type: 'p', color: foe })
    }
    if (!ok) continue

    const fen = toFen(pieces, side)
    if (seen.has(fen)) continue
    seen.add(fen)
    const chess = legalPosition(fen)
    if (!chess) continue

    const solutions = level === 1 ? matesInOne(fen) : matesInTwo(fen)
    if (solutions.length !== 1) continue // solution AMBIGUË ou inexistante
    if (level === 2 && matesInOne(fen).length > 0) continue // un mat en 1 existe : trop facile

    const move = solutions[0]!
    const played = new Chess(fen)
    const san = played.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }).san
    const theme = themeOf(fen, move)
    found.push({
      id: `g${level}-${found.length + 1}`,
      fen,
      side,
      level,
      solutionSan: san,
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      title: theme.title,
      hint: theme.hint,
    })
  }
  return found
}

const mate1 = generate(1, 18, 400000)
const mate2 = generate(2, 10, 120000)
console.log(`mat en 1 : ${mate1.length} · mat en 2 : ${mate2.length}`)

const body = [...mate1, ...mate2]
  .map(
    (p) =>
      `  {\n    id: '${p.id}',\n    fen: '${p.fen}',\n    side: '${p.side}',\n    level: ${p.level},\n    solutionSan: '${p.solutionSan}',\n    from: '${p.from}',\n    to: '${p.to}',\n${p.promotion ? `    promotion: '${p.promotion}',\n` : ''}    title: '${p.title.replace(/'/g, "\\'")}',\n    hint: '${p.hint.replace(/'/g, "\\'")}',\n  },`,
  )
  .join('\n')

writeFileSync(
  OUT,
  `/**
 * FICHIER GÉNÉRÉ — ne pas éditer à la main.
 * Produit par scripts/gen-puzzles.ts (graine fixe, résultat reproductible).
 * Chaque position a été prouvée par chess.js : mat forcé au niveau annoncé
 * et PREMIER coup unique. Revalidation : npm run check:puzzles.
 */
import type { Puzzle } from './content'

export const GENERATED_PUZZLES: Puzzle[] = [
${body}
]
`,
  'utf8',
)
console.log(`écrit : ${OUT.pathname}`)
