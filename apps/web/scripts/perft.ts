/**
 * PERFT — la preuve que le moteur maison génère EXACTEMENT les bons coups.
 *
 * On compte les feuilles de l'arbre des coups légaux à profondeur N et on
 * compare aux valeurs de référence de la communauté échiquéenne. Le moindre
 * écart révèle un bug (roque, prise en passant, promotion, clouage…).
 * Sans ce test, une IA bâtie dessus jouerait des coups illégaux.
 *
 * Lancer : npm run perft -w @dominos-clan/web
 */
import { Board } from '../src/learn/board0x88'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface Suite {
  name: string
  fen: string
  /** Valeurs officielles (chessprogramming.org / Kiwipete & co). */
  expected: number[]
}

const SUITES: Suite[] = [
  { name: 'position initiale', fen: START, expected: [20, 400, 8902, 197281] },
  {
    name: 'Kiwipete (roques, clouages, prises multiples)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    expected: [48, 2039, 97862],
  },
  {
    name: 'position 3 (prise en passant, promotions)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    expected: [14, 191, 2812, 43238],
  },
  {
    name: 'position 4 (promotions et échecs)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    expected: [6, 264, 9467],
  },
  {
    name: 'position 5 (roques perdus, sous-promotions)',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    expected: [44, 1486, 62379],
  },
]

function perft(board: Board, depth: number): number {
  if (depth === 0) return 1
  const moves = board.generateMoves()
  if (depth === 1) return moves.length
  let nodes = 0
  for (const move of moves) {
    board.makeMove(move)
    nodes += perft(board, depth - 1)
    board.undoMove(move)
  }
  return nodes
}

let failed = 0
let totalNodes = 0
const started = Date.now()

for (const suite of SUITES) {
  for (let depth = 1; depth <= suite.expected.length; depth++) {
    const board = new Board(suite.fen)
    const t0 = Date.now()
    const nodes = perft(board, depth)
    const ms = Date.now() - t0
    totalNodes += nodes
    const want = suite.expected[depth - 1]!
    if (nodes === want) {
      console.log(
        `✅ ${suite.name} · perft(${depth}) = ${nodes.toLocaleString('fr-FR')} [${ms} ms]`,
      )
    } else {
      console.error(
        `❌ ${suite.name} · perft(${depth}) = ${nodes.toLocaleString('fr-FR')}, attendu ${want.toLocaleString('fr-FR')} (écart ${nodes - want})`,
      )
      failed++
    }
    // Le FEN doit être IDENTIQUE après make/undo de tout l'arbre.
    if (board.fen() !== suite.fen) {
      console.error(`❌ ${suite.name} : l'annulation des coups ne restaure pas la position !`)
      console.error(`   attendu : ${suite.fen}`)
      console.error(`   obtenu  : ${board.fen()}`)
      failed++
    }
  }
}

const seconds = (Date.now() - started) / 1000
console.log(
  `\n⚡ ${totalNodes.toLocaleString('fr-FR')} positions en ${seconds.toFixed(1)} s — ${Math.round(
    totalNodes / seconds,
  ).toLocaleString('fr-FR')} coups/seconde`,
)

if (failed > 0) {
  console.error(`\n${failed} test(s) perft en échec : le générateur est FAUX, ne pas s’en servir.`)
  process.exit(1)
}
console.log('\n🎉 Générateur de coups prouvé exact sur les 5 positions de référence.')
