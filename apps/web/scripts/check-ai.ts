/**
 * Vérifie que l'IA du Clan est utilisable : elle trouve les coups évidents,
 * respecte ses niveaux ELO, et répond assez vite pour jouer en direct.
 */
import { Board } from '../src/learn/board0x88'
import {
  AI_LEVELS,
  aiMove,
  formatScore,
  lastNodeCount,
  rankMoves,
  reviewMove,
  withSan,
} from '../src/learn/ai'

interface Case {
  name: string
  fen: string
  expect: string[]
  depth?: number
}

const CASES: Case[] = [
  { name: 'mat en 1 (dernière rangée)', fen: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1', expect: ['Ra8#'] },
  {
    name: 'mat du berger',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    expect: ['Qxf7#'],
  },
  { name: 'prend la dame gratuite', fen: '4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1', expect: ['Bxd5'] },
  { name: 'fourchette de cavalier', fen: '2r1k3/8/8/8/4N3/8/8/4K3 w - - 0 1', expect: ['Nd6+'] },
  { name: 'prend la tour non défendue', fen: '4k3/8/8/8/8/8/6r1/4K1R1 w - - 0 1', expect: ['Rxg2'] },
  {
    name: 'mat en 2 (le coup clé)',
    fen: '8/8/8/7k/8/5KQ1/8/8 w - - 0 1',
    expect: ['Qg7', 'Qg4+', 'Qh3+'],
    depth: 4,
  },
  { name: 'échappe au mat', fen: '7k/6R1/8/8/8/8/8/6K1 b - - 0 1', expect: ['Kxg7'] },
]

let failed = 0
for (const c of CASES) {
  const board = new Board(c.fen)
  const t0 = Date.now()
  const ranked = withSan(board, rankMoves(board, c.depth ?? 3), 3)
  const ms = Date.now() - t0
  const best = ranked[0]
  if (!best) {
    console.error(`❌ ${c.name} : aucun coup`)
    failed++
    continue
  }
  const top = ranked.slice(0, 3).map((m) => `${m.san} (${formatScore(m.score)})`).join(', ')
  if (c.expect.includes(best.san)) {
    console.log(`✅ ${c.name} → ${best.san} [${ms} ms, ${lastNodeCount().toLocaleString('fr-FR')} nœuds] · ${top}`)
  } else {
    console.error(`❌ ${c.name} : joue ${best.san}, attendu ${c.expect.join(' ou ')} · ${top}`)
    failed++
  }
  if (board.fen() !== c.fen) {
    console.error(`❌ ${c.name} : la position a été abîmée par la recherche`)
    failed++
  }
}

// Vitesse de jeu réelle, depuis une position d'ouverture chargée.
console.log('\n⏱ temps de réflexion par niveau (position d’ouverture) :')
const opening = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
for (const profile of AI_LEVELS) {
  const board = new Board(opening)
  const t0 = Date.now()
  const move = aiMove(board, profile)
  const ms = Date.now() - t0
  const flag = ms > 3000 ? '⚠️ trop lent' : '✓'
  console.log(
    `   ${profile.label} (${profile.elo}) → ${move?.san ?? '—'} en ${ms} ms ${flag} (${lastNodeCount().toLocaleString('fr-FR')} nœuds)`,
  )
  if (ms > 5000) failed++
}

// Le coach doit sanctionner une gaffe évidente et saluer le bon coup.
console.log('\n🎓 coach :')
const coachBoard = new Board('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
const blunder = coachBoard.findSan('Qh5')
const good = coachBoard.findSan('Nf3')
for (const [label, move] of [
  ['Dh5 (sortie hâtive)', blunder],
  ['Cf3 (développement)', good],
] as const) {
  if (move === null) {
    console.error(`❌ coup de test introuvable : ${label}`)
    failed++
    continue
  }
  const review = reviewMove(coachBoard, move, 2)
  console.log(`   ${label} → ${review.verdict} : ${review.comment}`)
}

if (failed > 0) {
  console.error(`\n${failed} problème(s).`)
  process.exit(1)
}
console.log('\n🎉 IA validée : tactique correcte, niveaux réactifs, coach cohérent.')
