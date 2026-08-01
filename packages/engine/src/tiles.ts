import type { Tile } from './types'

/** Les 28 dominos du jeu double-six. */
export function makeDeck(): Tile[] {
  const deck: Tile[] = []
  for (let hi = 0; hi <= 6; hi++) {
    for (let lo = 0; lo <= hi; lo++) {
      deck.push({ hi, lo })
    }
  }
  return deck
}

/** PRNG déterministe (mulberry32) : même seed = même partie, indispensable pour tests et replays. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates, sans muter l'entrée. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

export function tileEquals(a: Tile, b: Tile): boolean {
  return a.hi === b.hi && a.lo === b.lo
}

export function tilePips(t: Tile): number {
  return t.hi + t.lo
}

export function isDouble(t: Tile): boolean {
  return t.hi === t.lo
}

export function tileKey(t: Tile): string {
  return `${t.hi}-${t.lo}`
}
