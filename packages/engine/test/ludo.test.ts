import { describe, expect, it } from 'vitest'
import {
  LudoError,
  createLudo,
  ludoLegalPawns,
  ludoPlay,
  ludoRoll,
  ludoSafeCells,
  ludoStarCells,
  ludoStartCell,
  ludoTarget,
  type LudoState,
} from '../src/ludo'

const noRand = () => 0.99 // évite les cases bonus par défaut (index 5 = star… voir tests dédiés)

/** rand qui force le tirage d'un bonus précis (deck: reroll,boost,prison,shield,swap,star). */
const bonusRand = (bonusIndex: number, ...next: number[]) => {
  const queue = [bonusIndex / 6 + 0.001, ...next]
  let fallback = 0
  return () => queue.shift() ?? (fallback = (fallback + 7) % 13) / 13
}

describe('createLudo', () => {
  it('2 à 4 joueurs, 4 pions en prison chacun', () => {
    const state = createLudo(['a', 'b', 'c'])
    expect(state.players).toHaveLength(3)
    for (const p of state.players) {
      expect(p.pawns.every((pw) => pw.zone === 'base')).toBe(true)
    }
    expect(() => createLudo(['a'])).toThrowError(LudoError)
    expect(() => createLudo(['a', 'b', 'c', 'd', 'e'])).toThrowError(LudoError)
  })

  it('maxSixes configurable 2-4', () => {
    expect(createLudo(['a', 'b'], { maxSixes: 4 }).rules.maxSixes).toBe(4)
    expect(() => createLudo(['a', 'b'], { maxSixes: 5 })).toThrowError(LudoError)
  })

  it('1v1 : coins OPPOSÉS (slots 0 et 2) ; à 3-4, coins successifs', () => {
    expect(createLudo(['a', 'b']).players.map((p) => p.slot)).toEqual([0, 2])
    expect(createLudo(['a', 'b', 'c']).players.map((p) => p.slot)).toEqual([0, 1, 2])
    expect(createLudo(['a', 'b', 'c', 'd']).players.map((p) => p.slot)).toEqual([0, 1, 2, 3])
  })

  it('mode bonus : 8 cases éparpillées, jamais sur des cases sûres', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    expect(state.bonusCells).toHaveLength(8)
    expect(new Set(state.bonusCells).size).toBe(8)
    for (const cell of state.bonusCells) {
      expect(ludoSafeCells()).not.toContain(cell)
      expect(cell).toBeGreaterThanOrEqual(0)
      expect(cell).toBeLessThan(52)
    }
    expect(createLudo(['a', 'b']).bonusCells).toEqual([])
  })
})

describe('sortie et déplacements', () => {
  it('sans 6, impossible de sortir : le tour passe', () => {
    const state = createLudo(['a', 'b'])
    ludoRoll(state, 'a', 3)
    expect(state.turn).toBe(1)
    expect(state.dice).toBeNull()
  })

  it('un 6 sort de prison sur la case départ, puis on rejoue', () => {
    const state = createLudo(['a', 'b'])
    ludoRoll(state, 'a', 6)
    expect(ludoLegalPawns(state, 0)).toEqual([0, 1, 2, 3])
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: ludoStartCell(0) })
    expect(state.turn).toBe(0)
    expect(state.dice).toBeNull()
  })

  it('trop de 6 successifs : le tour saute (réglable)', () => {
    const state = createLudo(['a', 'b'], { maxSixes: 3 })
    ludoRoll(state, 'a', 6)
    ludoPlay(state, 'a', 0, noRand)
    ludoRoll(state, 'a', 6)
    ludoPlay(state, 'a', 1, noRand)
    ludoRoll(state, 'a', 6) // 3e six : le tour saute
    expect(state.turn).toBe(1)
    expect(state.dice).toBeNull()

    const large = createLudo(['a', 'b'], { maxSixes: 4 })
    ludoRoll(large, 'a', 6)
    ludoPlay(large, 'a', 0, noRand)
    ludoRoll(large, 'a', 6)
    ludoPlay(large, 'a', 1, noRand)
    ludoRoll(large, 'a', 6) // 3e six autorisé avec maxSixes 4
    expect(large.turn).toBe(0)
    expect(large.dice).toBe(6)
  })
})

function craft(state: LudoState, playerIndex: number, pawnIndex: number, pawn: LudoState['players'][number]['pawns'][number]) {
  state.players[playerIndex]!.pawns[pawnIndex] = pawn
}

describe('captures et cases sûres', () => {
  it('atterrir sur un adverse le renvoie en prison', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'track', cell: 20 })
    craft(state, 1, 0, { zone: 'track', cell: 23 })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: 23 })
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'base' })
  })

  it('pas de capture sur une case sûre (étoile)', () => {
    const star = ludoStarCells()[1]! // 21
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'track', cell: star - 2 })
    craft(state, 1, 0, { zone: 'track', cell: star })
    ludoRoll(state, 'a', 2)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: star })
  })

  it('le bouclier annule une capture', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    state.players[1]!.shield = true
    craft(state, 0, 0, { zone: 'track', cell: 20 })
    craft(state, 1, 0, { zone: 'track', cell: 22 })
    ludoRoll(state, 'a', 2)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: 22 })
    expect(state.players[1]!.shield).toBe(false)
  })
})

describe('couloir et arrivée exacte', () => {
  it('entre dans le couloir puis arrive exactement', () => {
    const state = createLudo(['a', 'b'])
    // rel 50 pour le joueur 0 : case 50.
    craft(state, 0, 0, { zone: 'track', cell: 50 })
    ludoRoll(state, 'a', 4)
    ludoPlay(state, 'a', 0, noRand) // rel 54 → couloir step 2
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'home', step: 2 })
    ludoRoll(state, 'b', 3) // b passe (rien à jouer)
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand) // step 2 + 3 = 5 → done
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'done' })
  })

  it('le dépassement est interdit', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'home', step: 3 })
    ludoRoll(state, 'a', 5) // 3+5=8 > 5 : aucun coup → tour passe
    expect(state.turn).toBe(1)
  })

  it('victoire : 4 pions arrivés', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'done' })
    craft(state, 0, 1, { zone: 'done' })
    craft(state, 0, 2, { zone: 'done' })
    craft(state, 0, 3, { zone: 'home', step: 4 })
    ludoRoll(state, 'a', 1)
    ludoPlay(state, 'a', 3, noRand)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('a')
  })
})

describe('bonus 🎁', () => {
  const bonusCell = 4

  function landOnBonus(state: LudoState, rand: () => number) {
    state.bonusCells = [bonusCell]
    craft(state, 0, 0, { zone: 'track', cell: bonusCell - 3 })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, rand)
  }

  it('hors mode bonus : rien ne se passe', () => {
    const state = createLudo(['a', 'b'])
    landOnBonus(state, bonusRand(0))
    expect(state.turn).toBe(1)
  })

  it('🎲 deuxième lancer', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(0, 0.5))
    expect(state.turn).toBe(0)
    expect(state.dice).toBeNull()
  })

  it('un bonus ramassé se replace ailleurs, au hasard (jamais sur une case sûre)', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(0, 0.5))
    expect(state.bonusCells).toHaveLength(1)
    expect(state.bonusCells).not.toContain(bonusCell)
    expect(ludoSafeCells()).not.toContain(state.bonusCells[0])
  })

  it('🍀 boost avance le pion du tirage', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(1, 0.5)) // boost, puis rand 0.5 → +4
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: bonusCell + 4 })
  })

  it('🚔 prison : cible adverse choisie retourne en prison', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    craft(state, 1, 2, { zone: 'track', cell: 40 })
    landOnBonus(state, bonusRand(2))
    expect(state.pendingBonus?.bonus).toBe('prison')
    ludoTarget(state, 'a', 1, 2)
    expect(state.players[1]!.pawns[2]).toEqual({ zone: 'base' })
    expect(state.pendingBonus).toBeNull()
    expect(state.turn).toBe(1)
  })

  it('🛡 bouclier s’active', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(3))
    expect(state.players[0]!.shield).toBe(true)
  })

  it('↔️ échange de positions', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    craft(state, 1, 0, { zone: 'track', cell: 45 })
    landOnBonus(state, bonusRand(4))
    expect(state.pendingBonus?.bonus).toBe('swap')
    ludoTarget(state, 'a', 1, 0)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: 45 })
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: bonusCell })
  })

  it('🌟 téléport vers la prochaine étoile', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(5))
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: 8 })
  })

  it('prison sans cible adverse : pas de blocage', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(2))
    expect(state.pendingBonus).toBeNull()
    expect(state.turn).toBe(1)
  })
})
