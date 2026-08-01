/**
 * Sanity-check du layout serpentin : simule des parties complètes et vérifie
 * à chaque coup qu'aucun domino ne chevauche un autre, que tout reste dans
 * les bornes annoncées et que les zones de pose sont posables.
 * Usage : npx tsx apps/web/scripts/sanity-board.ts
 */
import { applyMove, createGame, legalMoves, mulberry32 } from '../../../packages/engine/src/index'
import { layoutBoard } from '../src/boardLayout'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function overlap(a: Rect, b: Rect): boolean {
  const eps = 1e-6
  return a.x + a.w > b.x + eps && b.x + b.w > a.x + eps && a.y + a.h > b.y + eps && b.y + b.h > a.y + eps
}

let checks = 0
for (const columns of [8, 10, 13, 18]) {
  for (const playerCount of [2, 3, 4]) {
    for (let seed = 1; seed <= 60; seed++) {
      const ids = ['a', 'b', 'c', 'd'].slice(0, playerCount)
      const rand = mulberry32(seed * 31 + columns)
      let state = createGame(ids, seed)
      let guard = 0
      while (state.status === 'playing' && guard++ < 300) {
        const currentId = state.players[state.turn]!.id
        const moves = legalMoves(state, currentId)
        state = applyMove(state, currentId, moves[Math.floor(rand() * moves.length)]!)

        const layout = layoutBoard(state.line, columns)
        const rects: Rect[] = layout.tiles.map((t) => ({
          x: t.x,
          y: t.y,
          w: t.vertical ? 1 : 2,
          h: t.vertical ? 2 : 1,
        }))
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            if (overlap(rects[i]!, rects[j]!)) {
              console.error(
                `CHEVAUCHEMENT seed=${seed} n=${playerCount} C=${columns} tuiles ${i}/${j}`,
                rects[i],
                rects[j],
                state.line.length,
              )
              process.exit(1)
            }
          }
        }
        for (const r of [...rects, layout.zoneLeft, layout.zoneRight]) {
          if (
            r.x < layout.minX - 1e-6 ||
            r.y < layout.minY - 1e-6 ||
            r.x + r.w > layout.minX + layout.width + 1e-6 ||
            r.y + r.h > layout.minY + layout.height + 1e-6
          ) {
            console.error(`HORS BORNES seed=${seed} C=${columns}`, r, layout)
            process.exit(1)
          }
        }
        checks++
      }
    }
  }
}
console.log(`SANITY BOARD OK ✔ — ${checks} plateaux vérifiés sans chevauchement ni débordement`)
