/**
 * Vérifie que le moteur d'analyse maison trouve les coups évidents.
 * Si ces cas passent, il est assez fiable pour dire « tu aurais dû jouer… ».
 */
import { bestMove, formatScore, rankMoves } from '../src/learn/engine'

interface Case {
  name: string
  fen: string
  expect: string[]
  depth?: number
}

const CASES: Case[] = [
  {
    name: 'mat en 1 (dernière rangée)',
    fen: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',
    expect: ['Ra8#'],
  },
  {
    name: 'mat du berger',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    expect: ['Qxf7#'],
  },
  {
    name: 'prend la dame en prise (gain matériel évident)',
    fen: '4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1',
    expect: ['Bxd5'],
  },
  {
    name: 'voit la fourchette de cavalier (roi + tour)',
    fen: '2r1k3/8/8/8/4N3/8/8/4K3 w - - 0 1',
    expect: ['Nd6+'],
  },
  {
    name: 'prend une tour non défendue',
    fen: '4k3/8/8/8/8/8/6r1/4K1R1 w - - 0 1',
    expect: ['Rxg2'],
  },
  {
    name: 'ne prend PAS un pion défendu avec sa dame',
    fen: '4k3/3p4/4p3/8/8/8/3Q4/4K3 w - - 0 1',
    // Dxe6?? perd la dame contre un pion : le moteur doit l'éviter.
    expect: [
      'Qd7+', 'Qa5', 'Qb4', 'Qc3', 'Qd3', 'Qd4', 'Qd5', 'Qd6', 'Qd8+', 'Qa2', 'Qb2', 'Qc2', 'Qe2',
      'Qf2', 'Qg2', 'Qh2', 'Qc1', 'Qd1', 'Qe3', 'Qf4', 'Qg5', 'Qh6', 'Qc4', 'Qb5', 'Qa6', 'Kf2',
      'Ke2', 'Kd1', 'Kf1', 'Ke2',
    ],
  },
  {
    name: 'sort du mat en fuyant',
    fen: '7k/6R1/8/8/8/8/8/6K1 b - - 0 1',
    expect: ['Kh8h7', 'Kxg7', 'Kh7'],
  },
]

let failed = 0
for (const c of CASES) {
  const start = Date.now()
  const ranked = rankMoves(c.fen, c.depth ?? 3)
  const best = ranked[0]
  const ms = Date.now() - start
  if (!best) {
    console.error(`❌ ${c.name} : aucun coup trouvé`)
    failed++
    continue
  }
  const ok = c.expect.includes(best.san)
  const top = ranked
    .slice(0, 3)
    .map((m) => `${m.san} (${formatScore(m.score)})`)
    .join(', ')
  if (ok) console.log(`✅ ${c.name} → ${best.san} [${ms} ms] · top 3 : ${top}`)
  else {
    console.error(`❌ ${c.name} : joue ${best.san}, attendu ${c.expect.join(' ou ')} · top 3 : ${top}`)
    failed++
  }
}

// Performance : l'analyse d'une partie enchaîne ces recherches.
const perfStart = Date.now()
rankMoves('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 3)
console.log(`\n⏱ position d'ouverture complète analysée en ${Date.now() - perfStart} ms`)

if (failed > 0) {
  console.error(`\n${failed} cas en échec sur ${CASES.length}.`)
  process.exit(1)
}
console.log(`\n🎉 moteur validé sur ${CASES.length} positions de contrôle.`)
