import { describe, expect, it } from 'vitest'
import {
  GameError,
  applyMove,
  createGame,
  legalMoves,
  lineEnds,
  viewFor,
  isDouble,
  tileEquals,
  tilePips,
} from '../src/index'
import type { GameState, Move, Tile } from '../src/index'

/** État construit à la main pour les scénarios déterministes. */
function craftState(partial: {
  hands: Record<string, Tile[]>
  line?: GameState['line']
  turn?: number
  consecutivePasses?: number
  lastPlayerIndex?: number | null
}): GameState {
  return {
    players: Object.entries(partial.hands).map(([id, hand]) => ({ id, hand })),
    line: partial.line ?? [],
    sleeping: [],
    turn: partial.turn ?? 0,
    consecutivePasses: partial.consecutivePasses ?? 0,
    status: 'playing',
    result: null,
    lastPlayerIndex: partial.lastPlayerIndex ?? null,
    forcedOpening: null,
  }
}

describe('createGame', () => {
  it('refuse moins de 2 ou plus de 4 joueurs, et les doublons', () => {
    expect(() => createGame(['a'], 1)).toThrowError(GameError)
    expect(() => createGame(['a', 'b', 'c', 'd', 'e'], 1)).toThrowError(GameError)
    expect(() => createGame(['a', 'a'], 1)).toThrowError(GameError)
  })

  it.each([2, 3, 4])('distribue 7 dominos à chacun des %i joueurs, le reste dort', (n) => {
    const ids = ['a', 'b', 'c', 'd'].slice(0, n)
    const state = createGame(ids, 123)
    for (const p of state.players) expect(p.hand).toHaveLength(7)
    expect(state.sleeping).toHaveLength(28 - 7 * n)
  })

  it('donne la main au détenteur du plus gros double, qui doit l’ouvrir', () => {
    for (const seed of [1, 2, 3, 50, 999]) {
      const state = createGame(['a', 'b', 'c', 'd'], seed)
      const opening = state.forcedOpening!
      const starterHand = state.players[state.turn]!.hand
      expect(starterHand.some((t) => tileEquals(t, opening))).toBe(true)

      const allTiles = state.players.flatMap((p) => p.hand)
      const doubles = allTiles.filter(isDouble)
      if (doubles.length > 0) {
        const maxDouble = Math.max(...doubles.map((t) => t.hi))
        expect(isDouble(opening)).toBe(true)
        expect(opening.hi).toBe(maxDouble)
      } else {
        const maxPips = Math.max(...allTiles.map(tilePips))
        expect(tilePips(opening)).toBe(maxPips)
      }
    }
  })

  it('impose le domino d’ouverture comme seul coup légal', () => {
    const state = createGame(['a', 'b'], 7)
    const starterId = state.players[state.turn]!.id
    const moves = legalMoves(state, starterId)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toEqual({ type: 'play', tile: state.forcedOpening, end: 'right' })

    const otherTile = state.players[state.turn]!.hand.find((t) => !tileEquals(t, state.forcedOpening!))!
    expect(() => applyMove(state, starterId, { type: 'play', tile: otherTile, end: 'right' })).toThrowError(
      GameError,
    )
  })
})

describe('applyMove', () => {
  it('pose aux deux extrémités avec la bonne orientation', () => {
    // Une tuile de lest dans chaque main pour que la manche ne se termine pas.
    const state = craftState({
      hands: {
        a: [{ hi: 5, lo: 2 }, { hi: 6, lo: 6 }],
        b: [{ hi: 4, lo: 3 }, { hi: 1, lo: 1 }],
      },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const afterLeft = applyMove(state, 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    expect(lineEnds(afterLeft)).toEqual({ left: 2, right: 4 })
    expect(afterLeft.line[0]).toEqual({ tile: { hi: 5, lo: 2 }, left: 2, right: 5 })

    const afterRight = applyMove(afterLeft, 'b', { type: 'play', tile: { hi: 4, lo: 3 }, end: 'right' })
    expect(lineEnds(afterRight)).toEqual({ left: 2, right: 3 })
    expect(afterRight.line.at(-1)).toEqual({ tile: { hi: 4, lo: 3 }, left: 4, right: 3 })
  })

  it('rejette : hors tour, domino absent de la main, extrémité incompatible', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    expect(() => applyMove(state, 'b', { type: 'play', tile: { hi: 4, lo: 3 }, end: 'right' })).toThrowError(
      /tour/,
    )
    expect(() => applyMove(state, 'a', { type: 'play', tile: { hi: 6, lo: 6 }, end: 'right' })).toThrowError(
      GameError,
    )
    expect(() => applyMove(state, 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'right' })).toThrowError(
      GameError,
    )
  })

  it('interdit de passer quand un coup est jouable', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    expect(() => applyMove(state, 'a', { type: 'pass' })).toThrowError(GameError)
  })

  it('ne mute jamais l’état d’entrée', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const snapshot = JSON.stringify(state)
    applyMove(state, 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('gagne par domino (main vide) avec les points restants des autres', () => {
    const state = craftState({
      hands: { a: [{ hi: 4, lo: 2 }], b: [{ hi: 6, lo: 6 }, { hi: 1, lo: 0 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const done = applyMove(state, 'a', { type: 'play', tile: { hi: 4, lo: 2 }, end: 'right' })
    expect(done.status).toBe('finished')
    expect(done.result).toEqual({ winnerId: 'a', reason: 'domino', pips: { a: 0, b: 13 } })
  })

  it('détecte le blocage : la main la plus légère gagne', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 0 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 6, lo: 6 }, left: 6, right: 6 }],
      turn: 0,
      lastPlayerIndex: 1,
    })
    const afterA = applyMove(state, 'a', { type: 'pass' })
    expect(afterA.status).toBe('playing')
    const blocked = applyMove(afterA, 'b', { type: 'pass' })
    expect(blocked.status).toBe('finished')
    expect(blocked.result).toEqual({ winnerId: 'a', reason: 'blocked', pips: { a: 5, b: 7 } })
  })

  it('départage une égalité de points : premier dans l’ordre du tour après le dernier poseur', () => {
    // a et b ont 5 points chacun ; le dernier poseur est a (index 0) → b gagne.
    const state = craftState({
      hands: { a: [{ hi: 3, lo: 2 }], b: [{ hi: 4, lo: 1 }] },
      line: [{ tile: { hi: 6, lo: 6 }, left: 6, right: 6 }],
      turn: 0,
      lastPlayerIndex: 0,
    })
    const blocked = applyMove(applyMove(state, 'a', { type: 'pass' }), 'b', { type: 'pass' })
    expect(blocked.result?.winnerId).toBe('b')
  })

  it('refuse tout coup une fois la manche terminée', () => {
    const state = craftState({
      hands: { a: [{ hi: 4, lo: 2 }], b: [{ hi: 1, lo: 0 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const done = applyMove(state, 'a', { type: 'play', tile: { hi: 4, lo: 2 }, end: 'right' })
    expect(() => applyMove(done, 'b', { type: 'pass' })).toThrowError(/terminée/)
  })
})

describe('viewFor (anti-triche)', () => {
  const state = createGame(['a', 'b', 'c'], 42)

  it('un joueur ne reçoit JAMAIS les mains adverses — seulement les comptes', () => {
    const view = viewFor(state, 'a', 'player')
    expect(view.you?.id).toBe('a')
    expect(view.you?.hand).toEqual(state.players.find((p) => p.id === 'a')!.hand)
    for (const p of view.players) {
      expect(p).not.toHaveProperty('hand')
      expect(p.tileCount).toBe(7)
    }
    // Ceinture + bretelles : aucune fuite dans la sérialisation complète.
    const serialized = JSON.stringify(view)
    for (const opponent of state.players.filter((p) => p.id !== 'a')) {
      for (const tile of opponent.hand) {
        const asJson = JSON.stringify(tile)
        // Le domino peut légitimement apparaître dans view.line ; ici la ligne est vide.
        expect(serialized.includes(asJson)).toBe(false)
      }
    }
  })

  it('un spectateur voit toutes les mains', () => {
    const view = viewFor(state, 'spec-1', 'spectator')
    expect(view.you).toBeNull()
    for (const p of view.players) {
      expect(p.hand).toEqual(state.players.find((sp) => sp.id === p.id)!.hand)
    }
  })

  it('les dominos dormants ne sont révélés à personne', () => {
    for (const view of [viewFor(state, 'a', 'player'), viewFor(state, 'spec-1', 'spectator')]) {
      expect(view).not.toHaveProperty('sleeping')
      expect(view.sleepingCount).toBe(state.sleeping.length)
    }
  })

  it('fournit les coups légaux au joueur courant uniquement', () => {
    const currentId = state.players[state.turn]!.id
    const others = state.players.filter((p) => p.id !== currentId)
    expect(viewFor(state, currentId, 'player').you?.legalMoves.length).toBeGreaterThan(0)
    for (const p of others) {
      expect(viewFor(state, p.id, 'player').you?.legalMoves).toEqual([])
    }
  })

  it('la vue est une copie : la modifier ne touche pas l’état moteur', () => {
    const view = viewFor(state, 'spec-1', 'spectator')
    view.players[0]!.hand!.pop()
    expect(state.players[0]!.hand).toHaveLength(7)
  })
})

describe('partie complète déterministe', () => {
  it('une partie 1v1 seedée se joue jusqu’au bout sans coup illégal', () => {
    let state = createGame(['a', 'b'], 2026)
    let guard = 0
    while (state.status === 'playing' && guard++ < 200) {
      const currentId = state.players[state.turn]!.id
      const moves: Move[] = legalMoves(state, currentId)
      expect(moves.length).toBeGreaterThan(0)
      state = applyMove(state, currentId, moves[0]!)
    }
    expect(state.status).toBe('finished')
    expect(state.result).not.toBeNull()
    expect(['a', 'b']).toContain(state.result!.winnerId)
  })
})
