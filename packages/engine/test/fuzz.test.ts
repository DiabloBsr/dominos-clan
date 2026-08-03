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
  it.each([2, 3, 4])(
    'des parties à %i joueurs se terminent toujours proprement',
    (playerCount) => {
    const ids = ['a', 'b', 'c', 'd'].slice(0, playerCount)
    for (let seed = 1; seed <= 150; seed++) {
      const pickRandom = mulberry32(seed * 7919)
      let state = createGame(ids, seed)
      // Donne annulée (4-5 doubles) : on redistribue comme le ferait l'hôte.
      let redealTries = 0
      while (state.status === 'redeal' && redealTries < 100) {
        state = createGame(ids, seed * 100000 + ++redealTries)
      }
      expect(state.status).not.toBe('redeal')
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
      const min = Math.min(...Object.values(result.pips))
      const minHolders = Object.values(result.pips).filter((v) => v === min).length
      if (result.reason === 'domino') {
        expect(result.winnerId).not.toBeNull()
        expect(result.pips[result.winnerId!]).toBe(0)
      } else if (result.reason === 'doubles') {
        // Victoire immédiate à la donne : 6 ou 7 doubles dans la main du gagnant.
        expect(result.winnerId).not.toBeNull()
        const winner = state.players.find((p) => p.id === result.winnerId)!
        expect(winner.hand.filter((t) => t.hi === t.lo).length).toBeGreaterThanOrEqual(6)
      } else if (result.winnerId === null) {
        // Manche nulle : forcément plusieurs mains à égalité au minimum, gain nul.
        expect(minHolders).toBeGreaterThanOrEqual(2)
        expect(result.gain).toBe(0)
      } else {
        // Blocage avec gagnant : minimum unique.
        expect(result.pips[result.winnerId]).toBe(min)
        expect(minHolders).toBe(1)
      }
      if (result.winnerId !== null) {
        expect(ids).toContain(result.winnerId)
        const others = Object.entries(result.pips)
          .filter(([id]) => id !== result.winnerId)
          .reduce((s, [, v]) => s + v, 0)
        expect(result.gain).toBe(others)
      }
      // Les points annoncés correspondent aux mains réelles.
      for (const p of state.players) {
        expect(result.pips[p.id]).toBe(p.hand.reduce((s, t) => s + tilePips(t), 0))
      }
    }
    },
    30000,
  )
})
