import { describe, expect, it } from 'vitest'
import {
  GameError,
  applyMove,
  createGame,
  evaluateDeal,
  legalMoves,
  lineEnds,
  undoLastMove,
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
  rules?: Partial<GameState['rules']>
  openingMaxPips?: number | null
}): GameState {
  return {
    rules: {
      targetScore: null,
      openThreshold: 0,
      freePass: false,
      openingMaxPips: null,
      instantWinScore: null,
      maxSeats: 3,
      gameType: 'dominos',
      chessMinutes: 10,
      chessIncrement: 0,
      ...partial.rules,
    },
    players: Object.entries(partial.hands).map(([id, hand]) => ({ id, hand })),
    line: partial.line ?? [],
    sleeping: [],
    turn: partial.turn ?? 0,
    consecutivePasses: partial.consecutivePasses ?? 0,
    status: 'playing',
    result: null,
    lastPlayerIndex: partial.lastPlayerIndex ?? null,
    forcedOpening: null,
    openingMaxPips: partial.openingMaxPips ?? null,
    lastPlay: null,
    redeals: [],
  }
}

/** Comme le ferait l'hôte : re-tire tant que la donne tombe sur 4-5 doubles. */
function createPlayable(
  playerIds: string[],
  seed: number,
  rules: Parameters<typeof createGame>[2] = {},
  opening?: Parameters<typeof createGame>[3],
): GameState {
  for (let s = seed; s < seed + 200; s++) {
    const state = opening ? createGame(playerIds, s, rules, opening) : createGame(playerIds, s, rules)
    if (state.status !== 'redeal') return state
  }
  throw new Error('impossible de trouver une donne jouable')
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
      const state = createPlayable(['a', 'b', 'c', 'd'], seed)
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

  it('ouverture « smallest-double » : le plus petit double en main (0-0 → 6-6) désigne l’ouvreur', () => {
    for (const seed of [1, 5, 42, 77, 2026]) {
      const state = createPlayable(['a', 'b', 'c'], seed, {}, { policy: 'smallest-double' })
      const opening = state.forcedOpening!
      const allTiles = state.players.flatMap((p) => p.hand)
      const doubles = allTiles.filter(isDouble)
      if (doubles.length > 0) {
        // Ordre de recherche : 0-0 d'abord, puis 1,2,…,6.
        const best = Math.min(...doubles.map((d) => d.hi))
        expect(isDouble(opening)).toBe(true)
        expect(opening.hi).toBe(best)
      }
      expect(state.players[state.turn]!.hand.some((t) => tileEquals(t, opening))).toBe(true)
      expect(legalMoves(state, state.players[state.turn]!.id)).toEqual([
        { type: 'play', tile: opening, end: 'right' },
      ])
    }
  })

  it('ouverture « rotate » : l’ouvreur est imposé et doit poser un domino ≤ N points', () => {
    const state = createPlayable(['a', 'b'], 9, { openingMaxPips: 4 }, { policy: 'rotate', starterIndex: 1 })
    expect(state.turn).toBe(1)
    expect(state.forcedOpening).toBeNull()
    const moves = legalMoves(state, 'b')
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.type).toBe('play')
      if (m.type === 'play') expect(m.tile.hi + m.tile.lo).toBeLessThanOrEqual(4)
    }
  })

  it('ouverture « rotate » sans domino ≤ N : le plus léger de la main est imposé', () => {
    const state = craftState({
      hands: {
        a: [{ hi: 6, lo: 6 }],
        b: [{ hi: 6, lo: 5 }, { hi: 5, lo: 4 }, { hi: 6, lo: 4 }],
      },
      turn: 1,
      openingMaxPips: 2,
    })
    const moves = legalMoves(state, 'b')
    expect(moves).toEqual([{ type: 'play', tile: { hi: 5, lo: 4 }, end: 'right' }])
    const after = applyMove(state, 'b', { type: 'play', tile: { hi: 5, lo: 4 }, end: 'right' })
    expect(after.line).toHaveLength(1)
  })

  it('impose le domino d’ouverture comme seul coup légal', () => {
    const state = createPlayable(['a', 'b'], 7)
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
    expect(done.result).toEqual({ winnerId: 'a', reason: 'domino', pips: { a: 0, b: 13 }, gain: 13 })
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
    expect(blocked.result).toEqual({ winnerId: 'a', reason: 'blocked', pips: { a: 5, b: 7 }, gain: 7 })
  })

  it('blocage avec égalité au minimum = manche NULLE (le « X ») : personne ne marque', () => {
    // a et b ont 5 points chacun → nul, pas de gagnant, gain 0.
    const state = craftState({
      hands: { a: [{ hi: 3, lo: 2 }], b: [{ hi: 4, lo: 1 }] },
      line: [{ tile: { hi: 6, lo: 6 }, left: 6, right: 6 }],
      turn: 0,
      lastPlayerIndex: 0,
    })
    const blocked = applyMove(applyMove(state, 'a', { type: 'pass' }), 'b', { type: 'pass' })
    expect(blocked.result).toEqual({
      winnerId: null,
      reason: 'blocked',
      pips: { a: 5, b: 5 },
      gain: 0,
    })
  })

  it('égalité entre deux mains mais pas au minimum : le plus léger gagne quand même', () => {
    const state = craftState({
      hands: { a: [{ hi: 1, lo: 0 }], b: [{ hi: 3, lo: 2 }], c: [{ hi: 4, lo: 1 }] },
      line: [{ tile: { hi: 6, lo: 6 }, left: 6, right: 6 }],
      turn: 0,
      lastPlayerIndex: 0,
    })
    const blocked = applyMove(
      applyMove(applyMove(state, 'a', { type: 'pass' }), 'b', { type: 'pass' }),
      'c',
      { type: 'pass' },
    )
    expect(blocked.result?.winnerId).toBe('a')
    expect(blocked.result?.gain).toBe(10)
  })

  it('passe libre : passer devient légal même avec un coup jouable', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }, { hi: 1, lo: 1 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
      rules: { freePass: true },
    })
    const moves = legalMoves(state, 'a')
    expect(moves.some((m) => m.type === 'play')).toBe(true)
    expect(moves.some((m) => m.type === 'pass')).toBe(true)
    expect(applyMove(state, 'a', { type: 'pass' }).turn).toBe(1)
  })

  it('sans passe libre, passer avec un coup jouable reste interdit', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }], b: [{ hi: 4, lo: 3 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
      rules: { freePass: false },
    })
    expect(legalMoves(state, 'a').some((m) => m.type === 'pass')).toBe(false)
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
  const state = createPlayable(['a', 'b', 'c'], 42)

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

describe('evaluateDeal (règle des doubles à la donne)', () => {
  const doubles = (values: number[]): Tile[] => values.map((v) => ({ hi: v, lo: v }))
  const filler = (n: number): Tile[] =>
    Array.from({ length: n }, (_, i) => ({ hi: 6, lo: i % 6 }))

  it('main normale (≤ 3 doubles) : donne valide', () => {
    expect(evaluateDeal([[...doubles([0, 1, 2]), ...filler(4)], filler(7)])).toEqual({ type: 'ok' })
  })

  it('4 ou 5 doubles dans une main : on redistribue (fautif identifié)', () => {
    expect(evaluateDeal([[...doubles([0, 1, 2, 3]), ...filler(3)], filler(7)])).toEqual({
      type: 'redeal',
      culpritIndex: 0,
      doublesCount: 4,
    })
    expect(evaluateDeal([filler(7), [...doubles([0, 1, 2, 3, 4]), ...filler(2)]])).toEqual({
      type: 'redeal',
      culpritIndex: 1,
      doublesCount: 5,
    })
  })

  it('6 ou 7 doubles dans une main : victoire immédiate', () => {
    expect(evaluateDeal([[...doubles([0, 1, 2, 3, 4, 5]), ...filler(1)], filler(7)])).toEqual({
      type: 'instant-win',
      winnerIndex: 0,
    })
    expect(evaluateDeal([filler(7), doubles([0, 1, 2, 3, 4, 5, 6])])).toEqual({
      type: 'instant-win',
      winnerIndex: 1,
    })
  })

  it('aucune donne jouable ne contient 4 doubles ou plus', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(['a', 'b'], seed)
      if (state.status !== 'playing') continue
      for (const p of state.players) {
        expect(p.hand.filter(isDouble).length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('les donnes annulées sont publiées : coupable, compte de doubles, toutes les mains', () => {
    let seen = 0
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame(['a', 'b'], seed)
      for (const redeal of state.redeals) {
        seen++
        expect(redeal.doublesCount === 4 || redeal.doublesCount === 5).toBe(true)
        expect(redeal.hands).toHaveLength(2)
        for (const h of redeal.hands) expect(h.hand).toHaveLength(7)
        const culpritHand = redeal.hands.find((h) => h.id === redeal.culpritId)!
        expect(culpritHand.hand.filter(isDouble).length).toBe(redeal.doublesCount)
        // Et la vue les expose à tout le monde, joueur comme spectateur.
        expect(viewFor(state, 'a', 'player').redeals).toEqual(state.redeals)
        expect(viewFor(state, 'x', 'spectator').redeals).toEqual(state.redeals)
      }
    }
    // Sur 300 seeds à 2 joueurs, la règle doit s'être déclenchée au moins une fois.
    expect(seen).toBeGreaterThan(0)
  })
})

describe('undoLastMove (reprendre son domino)', () => {
  const base = () =>
    craftState({
      hands: { a: [{ hi: 5, lo: 2 }, { hi: 3, lo: 3 }], b: [{ hi: 4, lo: 3 }, { hi: 2, lo: 1 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })

  it('reprend le domino tant que le suivant n’a pas agi', () => {
    const played = applyMove(base(), 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    expect(viewFor(played, 'a', 'player').canUndo).toBe(true)
    const undone = undoLastMove(played, 'a')
    expect(undone.line).toEqual(base().line)
    expect(undone.turn).toBe(0)
    expect(undone.players[0]!.hand.some((t) => tileEquals(t, { hi: 5, lo: 2 }))).toBe(true)
    // Et on peut rejouer autre chose.
    expect(legalMoves(undone, 'a').length).toBeGreaterThan(0)
  })

  it('trop tard si le joueur suivant a posé', () => {
    const played = applyMove(base(), 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    const next = applyMove(played, 'b', { type: 'play', tile: { hi: 4, lo: 3 }, end: 'right' })
    expect(() => undoLastMove(next, 'a')).toThrowError(GameError)
    expect(viewFor(next, 'a', 'player').canUndo).toBe(false)
  })

  it('trop tard si le joueur suivant a passé', () => {
    const state = craftState({
      hands: { a: [{ hi: 5, lo: 2 }, { hi: 3, lo: 3 }], b: [{ hi: 1, lo: 0 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const played = applyMove(state, 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    const passed = applyMove(played, 'b', { type: 'pass' })
    expect(() => undoLastMove(passed, 'a')).toThrowError(GameError)
  })

  it('pas de double reprise ni de reprise par un autre joueur', () => {
    const played = applyMove(base(), 'a', { type: 'play', tile: { hi: 5, lo: 2 }, end: 'left' })
    expect(() => undoLastMove(played, 'b')).toThrowError(GameError)
    const undone = undoLastMove(played, 'a')
    expect(() => undoLastMove(undone, 'a')).toThrowError(GameError)
  })
})

describe('révélation des mains en fin de manche', () => {
  it('manche finie : tout le monde voit toutes les mains', () => {
    const state = craftState({
      hands: { a: [{ hi: 4, lo: 2 }], b: [{ hi: 6, lo: 6 }, { hi: 1, lo: 0 }] },
      line: [{ tile: { hi: 5, lo: 4 }, left: 5, right: 4 }],
      turn: 0,
    })
    const done = applyMove(state, 'a', { type: 'play', tile: { hi: 4, lo: 2 }, end: 'right' })
    const view = viewFor(done, 'b', 'player')
    for (const p of view.players) {
      expect(p.hand).toEqual(done.players.find((sp) => sp.id === p.id)!.hand)
    }
  })

  it('manche en cours : les mains adverses restent cachées', () => {
    const view = viewFor(createPlayable(['a', 'b'], 3), 'a', 'player')
    for (const p of view.players) {
      expect(p).not.toHaveProperty('hand')
    }
  })
})

describe('partie complète déterministe', () => {
  it('une partie 1v1 seedée se joue jusqu’au bout sans coup illégal', () => {
    let state = createPlayable(['a', 'b'], 2026)
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
