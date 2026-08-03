import { describe, expect, it } from 'vitest'
import { rotateWinnerStays, swapLowestScores } from '../src/room'

describe('swapLowestScores (remplacés/manche en match)', () => {
  const scores = { a: 40, b: 10, c: 25 }

  it('count 1 : le plus petit score sort, la file entre à sa place', () => {
    const next = swapLowestScores(['a', 'b', 'c'], ['d', 'e'], scores, 'a', 1)
    expect(next.seats).toEqual(['a', 'd', 'c'])
    expect(next.queue).toEqual(['e', 'b'])
  })

  it('count 2 à 3 joueurs : seul le gagnant reste', () => {
    const next = swapLowestScores(['a', 'b', 'c'], ['d', 'e'], scores, 'a', 2)
    expect(next.seats).toEqual(['a', 'd', 'e'])
    expect(next.queue).toEqual(['b', 'c'])
  })

  it('le gagnant n’est jamais évincé, même avec le plus petit score', () => {
    const next = swapLowestScores(['a', 'b'], ['d'], { a: 0, b: 50 }, 'a', 2)
    expect(next.seats).toEqual(['a', 'd'])
    expect(next.queue).toEqual(['b'])
  })

  it('borné par la taille de la file', () => {
    const next = swapLowestScores(['a', 'b', 'c'], ['d'], scores, 'a', 2)
    expect(next.seats).toEqual(['a', 'd', 'c'])
    expect(next.queue).toEqual(['b'])
  })

  it('count 0 ou file vide : rien ne bouge', () => {
    expect(swapLowestScores(['a', 'b'], ['d'], scores, 'a', 0).seats).toEqual(['a', 'b'])
    expect(swapLowestScores(['a', 'b'], [], scores, 'a', 2).seats).toEqual(['a', 'b'])
  })

  it('égalité de scores : départage par l’ordre des sièges', () => {
    const next = swapLowestScores(['a', 'b', 'c'], ['d'], { a: 5, b: 0, c: 0 }, 'a', 1)
    expect(next.seats).toEqual(['a', 'd', 'c'])
    expect(next.queue).toEqual(['b'])
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

  it('file plus courte que les sièges libérés : on complète avec les perdants', () => {
    const next = rotateWinnerStays(['a', 'b', 'c', 'd'], ['e'], 'c')
    expect(next.seats).toEqual(['c', 'e', 'a', 'b'])
    expect(next.queue).toEqual(['d'])
  })

  it('refuse un gagnant qui ne serait pas assis', () => {
    expect(() => rotateWinnerStays(['a', 'b'], ['c'], 'c')).toThrowError()
  })

  it('conserve tout le monde exactement une fois', () => {
    const next = rotateWinnerStays(['a', 'b', 'c'], ['d', 'e', 'f'], 'a')
    const everyone = [...next.seats, ...next.queue].sort()
    expect(everyone).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(next.seats).toHaveLength(3)
  })
})
