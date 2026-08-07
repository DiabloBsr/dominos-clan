/**
 * Outil d'auteur : à partir d'une position et d'un premier coup, déroule la
 * ligne où l'ADVERSAIRE se défend au mieux, et dit ce que ça donne vraiment.
 *
 * C'est le seul moyen d'écrire une combinaison honnête : une ligne inventée à
 * la main suppose toujours que l'adversaire coopère.
 *
 * Lancer : npx tsx scripts/line-from-engine.ts "<FEN>" "<premier coup>"
 */
import { Board } from '../src/learn/board0x88'
import { clearTables, rankRootMoves } from '../src/learn/search'

const [fen, first] = process.argv.slice(2)
if (!fen || !first) {
  console.error('usage : line-from-engine.ts "<FEN>" "<coup>"')
  process.exit(1)
}

const board = new Board()
board.loadFen(fen)
const solver = board.side

const line: string[] = []
let material = () => {
  let own = 0
  let theirs = 0
  const VALUE: Record<number, number> = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0 }
  for (let sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) !== 0) continue
    const piece = board.squares[sq]!
    if (piece === 0) continue
    const value = VALUE[Math.abs(piece)] ?? 0
    if ((piece > 0 ? 1 : -1) === solver) own += value
    else theirs += value
  }
  return own - theirs
}
const startDelta = material()

for (let ply = 0; ply < 12; ply++) {
  if (board.generateMoves().length === 0) break
  let move: number | null
  if (ply === 0) {
    move = board.findSan(first)
    if (move === null) {
      console.error(`coup « ${first} » illégal dans cette position`)
      process.exit(1)
    }
  } else {
    clearTables()
    const ranked = rankRootMoves(board, 7, 2500)
    if (ranked.length === 0) break
    move = ranked[0]!.move
    // On s'arrête dès que le camp qui résout n'a plus rien à prouver.
    if (board.side === solver && Math.abs(ranked[0]!.score) < 50 && ply > 2) break
  }
  line.push(board.san(move))
  board.makeMove(move)
  if (board.isCheckmate()) break
}

console.log(`\nligne sous MEILLEURE défense :`)
console.log(`  ${line.join(' ')}`)
console.log(`  ['${line.join("', '")}']`)
if (board.isCheckmate()) {
  console.log(`  → MAT en ${Math.ceil(line.length / 2)} coup(s), après ${line.length} demi-coups`)
} else {
  console.log(`  → pas de mat. Gain de matériel : ${material() - startDelta} points`)
}
