import { describe, expect, it } from 'vitest'
import { makeDeck, mulberry32, shuffle, tileKey } from '../src/tiles'

describe('makeDeck', () => {
  it('produit les 28 dominos uniques du double-six', () => {
    const deck = makeDeck()
    expect(deck).toHaveLength(28)
    expect(new Set(deck.map(tileKey)).size).toBe(28)
    for (const t of deck) {
      expect(t.lo).toBeGreaterThanOrEqual(0)
      expect(t.hi).toBeLessThanOrEqual(6)
      expect(t.hi).toBeGreaterThanOrEqual(t.lo)
    }
  })
})

describe('mulberry32', () => {
  it('est déterministe pour une même seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('produit des valeurs dans [0, 1)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('retourne une permutation sans muter le tableau source', () => {
    const deck = makeDeck()
    const before = JSON.stringify(deck)
    const shuffled = shuffle(deck, mulberry32(1))
    expect(JSON.stringify(deck)).toBe(before)
    expect(shuffled).toHaveLength(28)
    expect(new Set(shuffled.map(tileKey)).size).toBe(28)
  })

  it('est déterministe pour une même seed', () => {
    expect(shuffle(makeDeck(), mulberry32(9))).toEqual(shuffle(makeDeck(), mulberry32(9)))
  })
})
