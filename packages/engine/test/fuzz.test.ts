import { describe, expect, it } from 'vitest'
import { applyMove, createGame, legalMoves, mulberry32, tileKey, tilePips } from '../src/index'
import type { GameState } from '../src/index'

/** Invariants structurels qui doivent tenir à chaque coup de chaque partie. */
function checkInvariants(state: GameState): void {
  // La chaîne est valide : chaque domino touche son voisin.
  for (let i = 0; i + 1 < state.line.length; i++) {
    expect(state.line[i]!.right).toBe(state.line[i + 1]!.left)
  }
  // Chaque domino posé correspond bien à ses valeurs orientées.
  for (const placed of state.line) {
    const oriented = [placed.left, placed.right].sort((a, b) => b - a)
    expect(oriented).toEqual([placed.tile.hi, placed.tile.lo])
  }
  // Conservation : mains + ligne + dormants = 28 dominos uniques.
  const all = [
    ...state.players.flatMap((p) => p.hand),
    ...state.line.map((p) => p.tile),
    ...state.sleeping,
  ]
  expect(all).toHaveLength(28)
  expect(new Set(all.map(tileKey)).size).toBe(28)
}

describe('fuzz : parties aléatoires seedées', () => {
  it.each([2, 3, 4])('des parties à %i joueurs se terminent toujours proprement', (playerCount) => {
    const ids = ['a', 'b', 'c', 'd'].slice(0, playerCount)
    for (let seed = 1; seed <= 150; seed++) {
      const pickRandom = mulberry32(seed * 7919)
      let state = createGame(ids, seed)
      let guard = 0

      while (state.status === 'playing') {
        expect(guard++).toBeLessThan(300)
        const currentId = state.players[state.turn]!.id
        const moves = legalMoves(state, currentId)
        expect(moves.length).toBeGreaterThan(0)
        const move = moves[Math.floor(pickRandom() * moves.length)]!
        state = applyMove(state, currentId, move)
        checkInvariants(state)
      }

      const result = state.result!
      expect(result).not.toBeNull()
      expect(ids).toContain(result.winnerId)
      if (result.reason === 'domino') {
        expect(result.pips[result.winnerId]).toBe(0)
      } else {
        // Blocage : le gagnant a le minimum de points.
        const min = Math.min(...Object.values(result.pips))
        expect(result.pips[result.winnerId]).toBe(min)
      }
      // Les points annoncés correspondent aux mains réelles.
      for (const p of state.players) {
        expect(result.pips[p.id]).toBe(p.hand.reduce((s, t) => s + tilePips(t), 0))
      }
    }
  })
})
