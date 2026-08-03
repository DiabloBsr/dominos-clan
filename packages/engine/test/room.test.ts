import { describe, expect, it } from 'vitest'
import { rotateWinnerStays } from '../src/room'

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
