import { describe, expect, it } from 'vitest'
import { renewSterileTable, rotateWinnerStays } from '../src/room'

describe('renewSterileTable', () => {
  it('file pleine : toute la table est remplacée, les sortants partent en fin de file', () => {
    const { seats, queue } = renewSterileTable(['a', 'b', 'c'], ['x', 'y', 'z', 'w'])
    expect(seats).toEqual(['x', 'y', 'z'])
    expect(queue).toEqual(['w', 'a', 'b', 'c'])
  })

  it('file trop courte : les premiers sortants gardent leur siège', () => {
    const { seats, queue } = renewSterileTable(['a', 'b', 'c'], ['x'])
    expect(seats).toEqual(['x', 'a', 'b'])
    expect(queue).toEqual(['c'])
  })

  it('file vide : personne ne bouge (la partie repart simplement à zéro)', () => {
    const { seats, queue } = renewSterileTable(['a', 'b', 'c'], [])
    expect(seats).toEqual(['a', 'b', 'c'])
    expect(queue).toEqual([])
  })

  it('aucun joueur n’est perdu ni dupliqué', () => {
    const { seats, queue } = renewSterileTable(['a', 'b', 'c'], ['x', 'y'])
    expect([...seats, ...queue].sort()).toEqual(['a', 'b', 'c', 'x', 'y'])
  })
})

describe('rotateWinnerStays', () => {
  it('les perdants partent en fin de file, la file remplit les sièges', () => {
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d', 'e'], 'b')
    expect(next.seats).toEqual(['b', 'd', 'e'])
    expect(next.queue).toEqual(['a', 'c'])
  })

  it('sans spectateurs, les mêmes joueurs rejouent (gagnant en tête)', () => {
    const next = rotateWinnerStays(['a', 'b'], [], 'a')
    expect(next.seats).toEqual(['a', 'b'])
    expect(next.queue).toEqual([])
  })

  it('file plus courte : sans scores, c’est le voisin de gauche du gagnant qui sort', () => {
    // Gagnant c (index 2) : son voisin de gauche est b → b cède sa place à e.
    const next = rotateWinnerStays(['a', 'b', 'c', 'd'], ['e'], 'c')
    expect(next.seats).toEqual(['c', 'e', 'a', 'd'])
    expect(next.queue).toEqual(['b'])
  })

  it('un seul remplaçant : le plus petit score sort en premier', () => {
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d'], 'a', { a: 45, b: 20, c: 5 })
    expect(next.seats).toEqual(['a', 'd', 'b'])
    expect(next.queue).toEqual(['c'])
  })

  it('égalité des deux perdants : celui à gauche du gagnant est remplacé', () => {
    // Gagnant b (index 1) : son voisin de gauche est a → a sort, c reste.
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d'], 'b', { a: 0, b: 45, c: 0 })
    expect(next.seats).toEqual(['b', 'd', 'c'])
    expect(next.queue).toEqual(['a'])
  })

  it('refuse un gagnant qui ne serait pas assis', () => {
    expect(() => rotateWinnerStays(['a', 'b'], ['c'], 'c')).toThrowError()
  })

  it('maxSwaps borne le nombre de remplacés même avec une grande file', () => {
    // File de 3 mais 1 seul remplacé : le plus petit score (c) sort, b reste.
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d', 'e', 'f'], 'a', { a: 40, b: 20, c: 5 }, 1)
    expect(next.seats).toEqual(['a', 'd', 'b'])
    expect(next.queue).toEqual(['e', 'f', 'c'])
  })

  it('maxSwaps 2 : les deux plus petits scores sortent dans l’ordre', () => {
    const next = rotateWinnerStays(['a', 'b', 'c', 'd'], ['e', 'f', 'g'], 'a', { a: 40, b: 9, c: 25, d: 3 }, 2)
    expect(next.seats).toEqual(['a', 'e', 'f', 'c'])
    expect(next.queue).toEqual(['g', 'd', 'b'])
  })

  it('conserve tout le monde exactement une fois', () => {
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d', 'e', 'f'], 'a')
    const everyone = [...next.seats, ...next.queue].sort()
    expect(everyone).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(next.seats).toHaveLength(3)
  })
})
