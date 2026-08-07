/**
 * PREUVE DE FORCE — on ne se contente pas d'affirmer que l'IA est plus forte.
 *
 * Deux mesures :
 *
 *  1. SUITE TACTIQUE — 22 positions dont le meilleur coup est connu et déjà
 *     vérifié par check-book.ts. On compte combien chaque moteur en trouve à
 *     temps égal.
 *  2. MATCH DIRECT — le nouveau moteur affronte l'ANCIEN (alpha-bêta nu +
 *     évaluation simple, tel qu'il était), à budget de temps identique, sur
 *     des ouvertures variées et avec alternance des couleurs. Le score donne
 *     une estimation d'écart en points ELO.
 *
 * L'ancien moteur est recopié ici tel quel : c'est la seule façon honnête de
 * comparer, plutôt que de comparer la nouvelle version à elle-même bridée.
 *
 * Lancer : npm run check:strength -w @dominos-clan/web [parties] [ms/coup]
 */
import {
  BISHOP,
  Board,
  FLAG_PROMO,
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
  onBoard,
  rankOf,
} from '../src/learn/board0x88'
import { search, clearTables } from '../src/learn/search'
import { MOTIFS } from '../src/learn/motifs'
import { OPENINGS } from '../src/learn/openings'
import { bookSize } from '../src/learn/book'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MATE = 100000

/* ─── ANCIEN MOTEUR (copie fidèle d'avant la refonte) ──────────────────── */

const OLD_VALUES: Record<number, number> = {
  [PAWN]: 100,
  [KNIGHT]: 320,
  [BISHOP]: 330,
  [ROOK]: 500,
  [QUEEN]: 900,
  [KING]: 20000,
}

const OLD_PST: Record<number, number[]> = {
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

const OLD_KING_EG: number[] = [
  -50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20,
  -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20,
  30, 30, 20, -10, -30, -30, -20, -10, 0, 0, -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50,
]

const oldPstIndex = (sq: number, side: number): number => {
  const rank = rankOf(sq)
  const file = fileOf(sq)
  return side === WHITE ? rank * 8 + file : (7 - rank) * 8 + file
}

function oldEvaluate(board: Board): number {
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
    if (type !== KING) material += OLD_VALUES[type]!
    if (type === PAWN) pawnFiles[side]!.push(fileOf(sq))
  }
  const endgame = material < 1800
  for (const { sq, type, side } of pieces) {
    const table = type === KING && endgame ? OLD_KING_EG : OLD_PST[type]!
    const value = OLD_VALUES[type]! + table[oldPstIndex(sq, side)]!
    score += side === WHITE ? value : -value
  }
  for (const side of [WHITE, -WHITE]) {
    const files = pawnFiles[side]!
    for (let file = 0; file < 8; file++) {
      const count = files.filter((f) => f === file).length
      if (count > 1) score += side === WHITE ? -18 * (count - 1) : 18 * (count - 1)
      if (count > 0 && !files.includes(file - 1) && !files.includes(file + 1)) {
        score += side === WHITE ? -14 : 14
      }
    }
    const bishops = pieces.filter((p) => p.side === side && p.type === BISHOP).length
    if (bishops >= 2) score += side === WHITE ? 30 : -30
  }
  return board.side === WHITE ? score : -score
}

function oldOrder(board: Board, moves: number[], best?: number): number[] {
  const scored = moves.map((move) => {
    let value = 0
    if (move === best) value += 1_000_000
    const captured = moveCapt(move)
    if (captured)
      value += 10_000 + OLD_VALUES[captured]! - OLD_VALUES[Math.abs(board.squares[moveFrom(move)]!)]! / 10
    if (moveFlag(move) === FLAG_PROMO) value += 8000 + OLD_VALUES[movePromo(move)]!
    return { move, value }
  })
  scored.sort((a, b) => b.value - a.value)
  return scored.map((s) => s.move)
}

function oldQuiesce(board: Board, alpha: number, beta: number, ply: number): number {
  const standPat = oldEvaluate(board)
  if (ply >= 6) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat
  for (const move of oldOrder(board, board.generateMoves(true))) {
    board.makeMove(move)
    const value = -oldQuiesce(board, -beta, -alpha, ply + 1)
    board.undoMove(move)
    if (value >= beta) return beta
    if (value > alpha) alpha = value
  }
  return alpha
}

function oldNegamax(board: Board, depth: number, alpha: number, beta: number, ply: number): number {
  const moves = board.generateMoves()
  if (moves.length === 0) return board.inCheck() ? -MATE + ply : 0
  if (board.halfmove >= 100 || board.insufficientMaterial()) return 0
  if (depth <= 0) return oldQuiesce(board, alpha, beta, ply)
  let best = -Infinity
  for (const move of oldOrder(board, moves)) {
    board.makeMove(move)
    const value = -oldNegamax(board, depth - 1, -beta, -alpha, ply + 1)
    board.undoMove(move)
    if (value > best) best = value
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/** Ancien `rankMoves` : approfondissement itératif, pas de table, pas de PVS. */
function oldSearch(board: Board, maxDepth: number, budgetMs: number): number {
  const stop = Date.now() + budgetMs
  const legal = board.generateMoves()
  if (legal.length === 0) return 0
  let ordered = oldOrder(board, legal)
  let results = ordered.map((move) => ({ move, score: 0 }))
  for (let depth = 1; depth <= maxDepth; depth++) {
    const pass: Array<{ move: number; score: number }> = []
    let stopped = false
    for (const move of ordered) {
      board.makeMove(move)
      const score = -oldNegamax(board, depth - 1, -Infinity, Infinity, 1)
      board.undoMove(move)
      pass.push({ move, score })
      if (Date.now() > stop && depth > 1) {
        stopped = true
        break
      }
    }
    if (!stopped || pass.length === ordered.length) {
      results = pass.sort((a, b) => b.score - a.score)
      ordered = results.map((r) => r.move)
    }
    if (stopped) break
    if (results[0] && results[0].score > MATE - 1000) break
  }
  return results[0]!.move
}

/* ─── 1. Suite tactique ────────────────────────────────────────────────── */

const args = process.argv.slice(2)
const GAMES = Number(args[0] ?? 12)
const MS_PER_MOVE = Number(args[1] ?? 120)

console.log(`\n📚 Livre d'ouvertures : ${bookSize()} positions connues`)

/**
 * Un moteur « trouve » une tactique s'il obtient le RÉSULTAT annoncé, pas s'il
 * écrit la même notation que moi. Deux mats en un sont deux mats en un ; un
 * coup meilleur que celui du manuel n'est pas un échec.
 */
const MATING = MOTIFS.filter((m) => m.expect.kind === 'mate')
console.log(`\n🎯 Suite tactique — ${MATING.length} mats forcés, trouvés ou non`)

function findsMate(engine: 'new' | 'old', fen: string): boolean {
  const board = new Board()
  board.loadFen(fen)
  if (engine === 'new') {
    clearTables()
    return search(board, { depth: 20, timeMs: 1500 }).score > MATE - 1000
  }
  // L'ancien moteur ne rend pas de score : on rejoue son coup et on regarde
  // si la position devient un mat forcé pour lui.
  const move = oldSearch(board, 6, 1500)
  if (!move) return false
  board.makeMove(move)
  clearTables()
  const reply = search(board, { depth: 18, timeMs: 1500 })
  // Score du point de vue de l'adversaire : un mat contre lui est très négatif.
  return reply.score < -(MATE - 1000)
}

let oldFound = 0
let newFound = 0
const missed: string[] = []
for (const motif of MATING) {
  if (findsMate('old', motif.fen)) oldFound++
  if (findsMate('new', motif.fen)) newFound++
  else missed.push(motif.title)
}
console.log(`  ancien moteur : ${oldFound}/${MATING.length} mats vus`)
console.log(`  nouveau moteur : ${newFound}/${MATING.length} mats vus`)
for (const line of missed) console.log(`    ↳ non vu : ${line}`)

/* ─── 2. Match direct ──────────────────────────────────────────────────── */

type Engine = 'new' | 'old'

/** Positions de départ variées : les 6 premiers demi-coups de vraies lignes. */
function openingPositions(count: number): string[] {
  const fens: string[] = []
  for (const opening of OPENINGS) {
    if (opening.family === 'piege') continue
    const board = new Board()
    board.loadFen(START)
    let ok = true
    for (const san of opening.moves.slice(0, 6)) {
      const move = board.findSan(san)
      if (move === null) {
        ok = false
        break
      }
      board.makeMove(move)
    }
    if (ok) fens.push(board.fen())
    if (fens.length >= count) break
  }
  return fens
}

function playGame(fen: string, whiteEngine: Engine): '1-0' | '0-1' | '1/2-1/2' {
  const board = new Board()
  board.loadFen(fen)
  const seen = new Map<number, number>()
  clearTables()

  for (let ply = 0; ply < 200; ply++) {
    const legal = board.generateMoves()
    if (legal.length === 0) {
      if (!board.inCheck()) return '1/2-1/2'
      return board.side === WHITE ? '0-1' : '1-0'
    }
    if (board.halfmove >= 100 || board.insufficientMaterial()) return '1/2-1/2'
    const repeats = (seen.get(board.hash) ?? 0) + 1
    seen.set(board.hash, repeats)
    if (repeats >= 3) return '1/2-1/2'

    const engine: Engine =
      (board.side === WHITE) === (whiteEngine === 'new') ? 'new' : 'old'
    const move =
      engine === 'new'
        ? search(board, { depth: 20, timeMs: MS_PER_MOVE }).move
        : oldSearch(board, 6, MS_PER_MOVE)
    if (!move || !legal.includes(move)) return '1/2-1/2'
    board.makeMove(move)
  }
  return '1/2-1/2'
}

const openings = openingPositions(Math.ceil(GAMES / 2))
console.log(`\n⚔️  Match : nouveau moteur contre l'ancien — ${GAMES} parties à ${MS_PER_MOVE} ms/coup`)
console.log(`   ${openings.length} ouvertures différentes, couleurs alternées`)

let newPoints = 0
let wins = 0
let draws = 0
let losses = 0
for (let i = 0; i < GAMES; i++) {
  const fen = openings[i % openings.length]!
  const newIsWhite = i % 2 === 0
  const result = playGame(fen, newIsWhite ? 'new' : 'old')
  let score: number
  if (result === '1/2-1/2') score = 0.5
  else if ((result === '1-0') === newIsWhite) score = 1
  else score = 0
  newPoints += score
  if (score === 1) wins++
  else if (score === 0.5) draws++
  else losses++
  process.stdout.write(score === 1 ? '✅' : score === 0.5 ? '➖' : '❌')
}
console.log('')

const rate = newPoints / GAMES
console.log(`\n  résultat : ${newPoints}/${GAMES}  (${wins} gagnées, ${draws} nulles, ${losses} perdues)`)
if (rate > 0 && rate < 1) {
  const elo = Math.round(-400 * Math.log10(1 / rate - 1))
  console.log(`  écart estimé : ${elo >= 0 ? '+' : ''}${elo} points ELO par rapport à l'ancien moteur`)
} else if (rate === 1) {
  console.log(`  écart estimé : au-delà de +400 ELO (aucune partie concédée)`)
}

/* ─── Verdict ──────────────────────────────────────────────────────────── */

let failed = false
if (newFound < oldFound) {
  console.log('\n💥 Le nouveau moteur trouve MOINS de tactiques que l’ancien.')
  failed = true
}
if (rate < 0.6) {
  console.log('\n💥 Le nouveau moteur ne domine pas l’ancien : la refonte ne vaut rien.')
  failed = true
}
if (failed) process.exit(1)
console.log('\n🎉 Nouveau moteur validé : plus tactique ET plus fort en partie.')
