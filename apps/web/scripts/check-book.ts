/**
 * Vérifie TOUT le contenu de l'académie avec le moteur maison :
 *
 *  • ouvertures — chaque coup de chaque ligne doit être légal depuis la
 *    position initiale ;
 *  • motifs — chaque coup doit être légal depuis le FEN, et le résultat
 *    annoncé (mat, ou gain de matériel) doit être réellement atteint ;
 *  • notes — un commentaire ne doit jamais pointer un demi-coup inexistant.
 *
 * Lancer :  npm run check:book -w @dominos-clan/web
 */

import {
  Board,
  BLACK,
  BISHOP,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  onBoard,
} from '../src/learn/board0x88'
import { OPENINGS } from '../src/learn/openings'
import { MOTIFS } from '../src/learn/motifs'
import { EMPTY_STREAK, dailyMotif, dailyPuzzle, daysBetween, recordDaily } from '../src/learn/daily'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const VALUE: Record<number, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
}

let failures = 0
const fail = (what: string, why: string) => {
  failures++
  console.log(`  ❌ ${what} — ${why}`)
}

/** Matériel du camp `side`, en points. */
function material(board: Board, side: number): number {
  let total = 0
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue
    const piece = board.squares[sq]
    if (piece === 0) continue
    const pieceSide = piece > 0 ? WHITE : BLACK
    if (pieceSide !== side) continue
    total += VALUE[Math.abs(piece)] ?? 0
  }
  return total
}

/** Rejoue une ligne SAN. Renvoie l'échiquier final, ou null au premier coup illégal. */
function replay(fen: string, line: string[], label: string): Board | null {
  const board = new Board()
  board.loadFen(fen)
  for (let i = 0; i < line.length; i++) {
    const san = line[i]
    const move = board.findSan(san)
    if (move === null) {
      const legal = board
        .generateMoves()
        .map((m) => board.san(m))
        .join(' ')
      fail(label, `coup ${i + 1} « ${san} » illégal. Coups possibles : ${legal}`)
      return null
    }
    board.makeMove(move)
  }
  return board
}

/* ─── Ouvertures ───────────────────────────────────────────────────────── */

console.log(`\n📖 Ouvertures (${OPENINGS.length})`)
const seenOpening = new Set<string>()
for (const opening of OPENINGS) {
  const label = `${opening.name} (${opening.eco})`
  if (seenOpening.has(opening.id)) fail(label, `id dupliqué « ${opening.id} »`)
  seenOpening.add(opening.id)

  if (opening.moves.length < 4) fail(label, 'ligne trop courte pour être utile')
  const board = replay(START_FEN, opening.moves, label)
  if (!board) continue

  for (const key of Object.keys(opening.notes)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= opening.moves.length) {
      fail(label, `note sur le demi-coup ${key} qui n'existe pas`)
    }
  }
}
console.log(`  ${failures === 0 ? '✅' : '⚠️'} ${OPENINGS.length} lignes rejouées`)

/* ─── Motifs ───────────────────────────────────────────────────────────── */

const before = failures
console.log(`\n⚡ Motifs (${MOTIFS.length})`)
const seenMotif = new Set<string>()
for (const motif of MOTIFS) {
  const label = motif.title
  if (seenMotif.has(motif.id)) fail(label, `id dupliqué « ${motif.id} »`)
  seenMotif.add(motif.id)

  const start = new Board()
  start.loadFen(motif.fen)
  const solver = start.side

  // Une position de départ où le camp au trait est DÉJÀ en échec fausse
  // l'exercice : le joueur n'a pas le choix de son premier coup.
  if (start.inCheck(solver)) fail(label, 'le camp au trait est déjà en échec dans le FEN')
  if (start.generateMoves().length === 0) fail(label, 'aucun coup légal dans la position de départ')

  const startDelta = material(start, solver) - material(start, -solver)
  const end = replay(motif.fen, motif.line, label)
  if (!end) continue

  if (motif.expect.kind === 'mate') {
    if (!end.isCheckmate()) {
      fail(label, `la ligne devait finir par mat — position finale : ${end.fen()}`)
    }
    // Le dernier coup doit être celui du solveur.
    if (motif.line.length % 2 === 0) {
      fail(label, 'la ligne finit sur un coup adverse alors qu’elle annonce un mat')
    }
  } else {
    const endDelta = material(end, solver) - material(end, -solver)
    const gain = endDelta - startDelta
    if (gain < motif.expect.gain) {
      fail(label, `gain annoncé ${motif.expect.gain}, gain réel ${gain}`)
    }
  }

  for (const key of Object.keys(motif.notes)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= motif.line.length) {
      fail(label, `note sur le demi-coup ${key} qui n'existe pas`)
    }
  }
}
console.log(`  ${failures === before ? '✅' : '⚠️'} ${MOTIFS.length} motifs rejoués`)

/* ─── Défi du jour et séries ───────────────────────────────────────────── */

const beforeDaily = failures
console.log('\n🔥 Défi du jour')

const expect = (what: string, actual: unknown, wanted: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(what, `attendu ${JSON.stringify(wanted)}, obtenu ${JSON.stringify(actual)}`)
  }
}

// Le tirage doit être stable : même jour = même puzzle, sur tous les appareils.
expect('puzzle stable', dailyPuzzle('2026-08-07').id, dailyPuzzle('2026-08-07').id)
expect('motif stable', dailyMotif('2026-08-07').id, dailyMotif('2026-08-07').id)

// …et il doit vraiment changer d'un jour à l'autre.
const week = ['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']
const drawn = new Set(week.map((d) => dailyPuzzle(d).id))
if (drawn.size < 4) fail('variété du tirage', `${drawn.size} puzzles différents sur 5 jours`)

expect('écart de jours', daysBetween('2026-08-07', '2026-08-08'), 1)
expect('écart sur un mois', daysBetween('2026-07-31', '2026-08-01'), 1)
expect('écart négatif', daysBetween('2026-08-08', '2026-08-07'), -1)

// Première résolution : la série démarre à 1.
const day1 = recordDaily(EMPTY_STREAK, '2026-08-07')
expect('première série', [day1.current, day1.best, day1.total], [1, 1, 1])

// Le lendemain : elle grandit.
const day2 = recordDaily(day1, '2026-08-08')
expect('série continuée', [day2.current, day2.best], [2, 2])

// Deux fois le même jour : rien ne bouge (pas de triche possible).
const twice = recordDaily(day2, '2026-08-08')
expect('deux fois le même jour', [twice.current, twice.total], [2, 2])

// Un jour sauté : on repart à 1, mais le record est conservé.
const broken = recordDaily(day2, '2026-08-10')
expect('série cassée', [broken.current, broken.best, broken.total], [1, 2, 3])

// L'historique ne garde que 14 jours.
let long = EMPTY_STREAK
for (let d = 1; d <= 20; d++) long = recordDaily(long, `2026-09-${String(d).padStart(2, '0')}`)
expect('série de 20 jours', [long.current, long.history.length], [20, 14])

console.log(`  ${failures === beforeDaily ? '✅' : '⚠️'} tirage déterministe et séries vérifiés`)

/* ─── Verdict ──────────────────────────────────────────────────────────── */

if (failures > 0) {
  console.log(`\n💥 ${failures} problème(s). Le contenu N'EST PAS publiable.`)
  process.exit(1)
}
console.log('\n🎉 Académie validée : toutes les lignes sont légales et tiennent leurs promesses.')
