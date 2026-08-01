import type { PlacedTile } from '@dominos-clan/engine'

/**
 * Disposition en serpentin de la chaîne sur la table.
 *
 * Unités : 1 unité = un demi-domino. Un domino horizontal = 2×1, vertical = 1×2.
 * La chaîne se lit dans l'ordre du tableau `line` : rangée 0 vers la droite,
 * puis coin (domino vertical à cheval entre deux rangées), rangée suivante
 * vers la gauche, etc. Les doubles se posent en travers du sens de lecture.
 * Le composant met ensuite tout à l'échelle pour tenir dans le feutre.
 */
export interface BoardItem {
  key: number
  a: number
  b: number
  vertical: boolean
  x: number
  y: number
}

export interface BoardZone {
  x: number
  y: number
  w: number
  h: number
}

export interface BoardLayout {
  tiles: BoardItem[]
  /** Zone de pose du bout gauche (début de chaîne). */
  zoneLeft: BoardZone
  /** Zone de pose du bout droit (fin de chaîne). */
  zoneRight: BoardZone
  minX: number
  minY: number
  width: number
  height: number
}

/** Espace entre rangées = 2 unités (les doubles et les coins débordent dans l'interstice). */
const LANE_PITCH = 2

export function layoutBoard(line: PlacedTile[], columns: number): BoardLayout {
  const C = Math.max(6, columns)
  const tiles: BoardItem[] = []
  let dir: 1 | -1 = 1
  let row = 0
  // Frontière du chemin : pour dir=+1 le prochain domino occupe [x, x+len],
  // pour dir=-1 il occupe [x-len, x]. On réserve 2 unités pour la zone gauche.
  let x = 2

  const laneY = () => row * LANE_PITCH

  for (let i = 0; i < line.length; i++) {
    const p = line[i]!
    const isDouble = p.left === p.right
    const len = isDouble ? 1 : 2
    const remaining = dir === 1 ? C - x : x

    // Plus la place de poser ce domino + amorcer le prochain : ce domino devient le coin.
    if (remaining < len + 1) {
      const cornerX = dir === 1 ? x : x - 1
      tiles.push({ key: i, a: p.left, b: p.right, vertical: true, x: cornerX, y: laneY() + 0.5 })
      row += 1
      dir = (dir * -1) as 1 | -1
      x = dir === 1 ? cornerX + 1 : cornerX
      continue
    }

    if (isDouble) {
      tiles.push({
        key: i,
        a: p.left,
        b: p.right,
        vertical: true,
        x: dir === 1 ? x : x - 1,
        y: laneY() - 0.5,
      })
    } else {
      tiles.push({
        key: i,
        a: dir === 1 ? p.left : p.right,
        b: dir === 1 ? p.right : p.left,
        vertical: false,
        x: dir === 1 ? x : x - 2,
        y: laneY(),
      })
    }
    x += dir * len
  }

  // Zone du bout droit : à la frontière du chemin, ou en coin si la rangée est pleine.
  const remaining = dir === 1 ? C - x : x
  let zoneRight: BoardZone
  if (remaining >= 2) {
    zoneRight = { x: dir === 1 ? x : x - 2, y: laneY(), w: 2, h: 1 }
  } else {
    const cornerX = dir === 1 ? Math.min(x, C - 1) : Math.max(x - 1, 0)
    zoneRight = { x: cornerX, y: laneY() + 0.5, w: 1, h: 2 }
  }
  const zoneLeft: BoardZone = { x: 0, y: 0, w: 2, h: 1 }

  const rects = [
    ...tiles.map((t) => ({ x: t.x, y: t.y, w: t.vertical ? 1 : 2, h: t.vertical ? 2 : 1 })),
    zoneLeft,
    zoneRight,
  ]
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))

  return { tiles, zoneLeft, zoneRight, minX, minY, width: maxX - minX, height: maxY - minY }
}
