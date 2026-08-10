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

  it('mode bonus : 8 cases TYPÉES éparpillées (6 types + 2 ❓), jamais sur des cases sûres', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    expect(state.bonusCells).toHaveLength(8)
    expect(new Set(state.bonusCells.map((b) => b.cell)).size).toBe(8)
    for (const { cell } of state.bonusCells) {
      expect(ludoSafeCells()).not.toContain(cell)
      expect(cell).toBeGreaterThanOrEqual(0)
      expect(cell).toBeLessThan(52)
    }
    // Un bonus de chaque type visible + 2 mystères.
    const kinds = state.bonusCells.map((b) => b.kind).sort()
    expect(kinds).toEqual(['boost', 'mystery', 'mystery', 'prison', 'reroll', 'shield', 'star', 'swap'])
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

  it('⭐ case sûre : atterrir sur un adverse n’y capture PAS (on cohabite)', () => {
    // Sur une étoile…
    const star = ludoStarCells()[1]! // case 21
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'track', cell: star - 3 })
    craft(state, 1, 0, { zone: 'track', cell: star })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: star })
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: star }) // toujours là !
    expect(state.turn).toBe(1) // pas de capture → pas de tour bonus

    // …et sur une case DÉPART, même refuge.
    const start = 13
    const onStart = createLudo(['a', 'b'])
    craft(onStart, 0, 0, { zone: 'track', cell: start - 4 })
    craft(onStart, 1, 0, { zone: 'track', cell: start })
    ludoRoll(onStart, 'a', 4)
    ludoPlay(onStart, 'a', 0, noRand)
    expect(onStart.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: start })
  })

  it('capturer fait REJOUER (le tour ne passe pas)', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'track', cell: 20 })
    craft(state, 1, 0, { zone: 'track', cell: 23 })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'base' })
    expect(state.turn).toBe(0)
    expect(state.dice).toBeNull()
  })

  it('un pion à l’objectif fait REJOUER (le tour ne passe pas)', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'home', step: 2 })
    ludoRoll(state, 'a', 3) // step 2 + 3 = 5 → done
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'done' })
    expect(state.turn).toBe(0)
    expect(state.dice).toBeNull()
  })

  it('le bouclier n’est PAS consommé quand on atterrit sur son porteur en case sûre', () => {
    // Règle 2026-08-10 : la case sûre protège TOUT LE MONDE de la prise
    // normale — le bouclier du pion visé ne doit donc pas être dépensé là.
    const star = ludoStarCells()[1]! // 21
    const shielded = createLudo(['a', 'b'])
    shielded.players[1]!.shields[0] = true
    craft(shielded, 0, 0, { zone: 'track', cell: star - 6 })
    craft(shielded, 1, 0, { zone: 'track', cell: star })
    // Un 6 : le joueur a garde la main, le tour ne revient pas à b — son
    // bouclier ne peut donc pas expirer « en fin de tour » pendant ce test.
    ludoRoll(shielded, 'a', 6)
    ludoPlay(shielded, 'a', 0, noRand)
    expect(shielded.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: star })
    expect(shielded.players[1]!.shields[0]).toBe(true) // bouclier intact
  })

  it('le bouclier annule une capture — et SEUL le pion protégé est couvert', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    state.players[1]!.shields[0] = true
    craft(state, 0, 0, { zone: 'track', cell: 20 })
    craft(state, 1, 0, { zone: 'track', cell: 22 })
    ludoRoll(state, 'a', 2)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[1]!.pawns[0]).toEqual({ zone: 'track', cell: 22 })
    expect(state.players[1]!.shields[0]).toBe(false) // consommé
  })

  it('un pion NON protégé du même joueur se fait bien capturer', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    state.players[1]!.shields[0] = true // le pion 0 est protégé, pas le 1
    craft(state, 0, 0, { zone: 'track', cell: 20 })
    craft(state, 1, 1, { zone: 'track', cell: 22 })
    ludoRoll(state, 'a', 2)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[1]!.pawns[1]).toEqual({ zone: 'base' })
    expect(state.players[1]!.shields[0]).toBe(true) // intact
  })

  it('le bouclier ne dure qu’UN TOUR : il expire quand son propriétaire rejoue', () => {
    // Sans mode bonus : aucune case ne peut redonner la main et fausser le tour.
    const state = createLudo(['a', 'b'])
    state.players[0]!.shields[2] = true
    craft(state, 0, 0, { zone: 'track', cell: 10 })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand) // fin du tour de a → au tour de b
    expect(state.players[0]!.shields[2]).toBe(true) // protégé pendant le tour de b
    craft(state, 1, 0, { zone: 'track', cell: 30 })
    ludoRoll(state, 'b', 2)
    ludoPlay(state, 'b', 0, noRand) // le tour revient à a
    expect(state.turn).toBe(0)
    expect(state.players[0]!.shields[2]).toBe(false) // expiré
  })
})

describe('couloir et arrivée exacte', () => {
  it('entre dans le couloir DIRECTEMENT (51 cases de piste) puis arrive exactement', () => {
    const state = createLudo(['a', 'b'])
    // rel 49 pour le joueur 0 : case 49 (l'entrée du couloir est à rel 51).
    craft(state, 0, 0, { zone: 'track', cell: 49 })
    ludoRoll(state, 'a', 4)
    ludoPlay(state, 'a', 0, noRand) // rel 53 → couloir step 2
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'home', step: 2 })
    ludoRoll(state, 'b', 3) // b passe (rien à jouer)
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand) // step 2 + 3 → rel 56 = done (et on rejoue)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'done' })
  })

  it('la dernière case de piste avant le couloir est rel 50 — jamais la case d’avant-départ', () => {
    const state = createLudo(['a', 'b'])
    craft(state, 0, 0, { zone: 'track', cell: 50 }) // rel 50 : dernière case de piste
    ludoRoll(state, 'a', 1)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'home', step: 0 })
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
    // Case ❓ mystère : le type est tiré par le PREMIER rand (comme l'ancien deck).
    state.bonusCells = [{ cell: bonusCell, kind: 'mystery' }]
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

  it('un bonus ramassé se replace ailleurs, au hasard (jamais sur une case sûre), type retiré', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(0, 0.5))
    expect(state.bonusCells).toHaveLength(1)
    expect(state.bonusCells[0]!.cell).not.toBe(bonusCell)
    expect(ludoSafeCells()).not.toContain(state.bonusCells[0]!.cell)
    expect(['reroll', 'boost', 'prison', 'shield', 'swap', 'star', 'mystery']).toContain(
      state.bonusCells[0]!.kind,
    )
  })

  it('🍀 boost avance le pion du tirage et publie lastBonus (machine à sous)', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(1, 0.5)) // boost, puis rand 0.5 → +4
    expect(state.players[0]!.pawns[0]).toEqual({ zone: 'track', cell: bonusCell + 4 })
    expect(state.lastBonus).toMatchObject({ playerIndex: 0, kind: 'boost', value: 4 })
    expect(state.lastBonus!.seq).toBeGreaterThan(0)
  })

  it('une case typée (non mystère) applique SON bonus sans tirage de type', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    state.bonusCells = [{ cell: bonusCell, kind: 'shield' }]
    craft(state, 0, 0, { zone: 'track', cell: bonusCell - 3 })
    ludoRoll(state, 'a', 3)
    ludoPlay(state, 'a', 0, noRand)
    expect(state.players[0]!.shields[0]).toBe(true)
    expect(state.lastBonus).toMatchObject({ kind: 'shield', value: null })
  })

  it('🚔 prison : cible adverse en prison ET on garde la main (règle de la table)', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    craft(state, 1, 2, { zone: 'track', cell: 40 })
    landOnBonus(state, bonusRand(2))
    expect(state.pendingBonus?.bonus).toBe('prison')
    ludoTarget(state, 'a', 1, 2)
    expect(state.players[1]!.pawns[2]).toEqual({ zone: 'base' })
    expect(state.pendingBonus).toBeNull()
    expect(state.turn).toBe(0)
    expect(state.dice).toBeNull()
  })

  it('🚔 prison : atteint aussi un pion du COULOIR coloré et une case sûre', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    craft(state, 1, 2, { zone: 'home', step: 3 }) // couloir coloré de b
    landOnBonus(state, bonusRand(2))
    expect(state.pendingBonus?.bonus).toBe('prison')
    ludoTarget(state, 'a', 1, 2)
    expect(state.players[1]!.pawns[2]).toEqual({ zone: 'base' })

    const onStar = createLudo(['a', 'b'], { bonusMode: true })
    craft(onStar, 1, 1, { zone: 'track', cell: ludoStarCells()[2]! })
    landOnBonus(onStar, bonusRand(2))
    ludoTarget(onStar, 'a', 1, 1)
    expect(onStar.players[1]!.pawns[1]).toEqual({ zone: 'base' })
  })

  it('🚔 prison : un pion ARRIVÉ à l’objectif est intouchable', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    craft(state, 1, 2, { zone: 'track', cell: 40 }) // cible valide pour armer le bonus
    craft(state, 1, 3, { zone: 'done' })
    landOnBonus(state, bonusRand(2))
    expect(state.pendingBonus?.bonus).toBe('prison')
    expect(() => ludoTarget(state, 'a', 1, 3)).toThrowError(LudoError)
    expect(state.players[1]!.pawns[3]).toEqual({ zone: 'done' })
  })

  it('🛡 bouclier s’active sur LE pion qui l’a ramassé, pas sur les autres', () => {
    const state = createLudo(['a', 'b'], { bonusMode: true })
    landOnBonus(state, bonusRand(3)) // c'est le pion 0 qui ramasse
    expect(state.players[0]!.shields[0]).toBe(true)
    expect(state.players[0]!.shields.filter(Boolean)).toHaveLength(1)
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
