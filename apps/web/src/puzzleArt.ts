/**
 * 🎨 GÉNÉRATEUR D'IMAGES DE PUZZLE — des centaines de scènes uniques sans
 * un seul fichier à télécharger.
 *
 * Chaque image est un SVG construit à partir d'un NUMÉRO (la graine) : le
 * même numéro redonne toujours exactement la même image, sur tous les
 * appareils. On peut donc afficher « Paysage n° 137 », le rejouer, le
 * comparer entre amis — et la collection ne pèse rien.
 *
 * Six familles de styles, 60 variantes chacune → 360 puzzles générés, en
 * plus des scènes dessinées à la main de Madagascar.
 */

/** Générateur pseudo-aléatoire déterministe (xorshift32). */
function rng(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const W = 800
const H = 600

/** Teinte HSL lisible sur fond sombre comme clair. */
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`

/* ─── Familles de styles ───────────────────────────────────────────────── */

function couchant(r: () => number): string {
  const base = r() * 360
  const bandes = 5 + Math.floor(r() * 4)
  let out = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
  for (let i = 0; i <= bandes; i++) {
    out += `<stop offset="${i / bandes}" stop-color="${hsl(base + i * 14, 70 - i * 4, 22 + i * 9)}"/>`
  }
  out += `</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`
  // soleil
  const sx = 120 + r() * 560
  const sy = 140 + r() * 180
  out += `<circle cx="${sx}" cy="${sy}" r="${44 + r() * 48}" fill="${hsl(base + 60, 95, 78)}" opacity="0.95"/>`
  // montagnes en couches
  const couches = 3 + Math.floor(r() * 3)
  for (let c = 0; c < couches; c++) {
    const y = 300 + c * 60 + r() * 30
    let d = `M0 ${H} L0 ${y}`
    for (let x = 0; x <= W; x += 80) {
      d += ` L${x} ${y - (r() * 70 + 10) * (1 - c / (couches + 1))}`
    }
    d += ` L${W} ${H} Z`
    out += `<path d="${d}" fill="${hsl(base + 200 + c * 10, 30, 26 - c * 4)}"/>`
  }
  // oiseaux
  for (let i = 0; i < 3; i++) {
    const bx = 80 + r() * 620
    const by = 90 + r() * 130
    out += `<path d="M${bx} ${by} q10 -9 20 0 q10 -9 20 0" stroke="${hsl(base + 200, 30, 20)}" stroke-width="5" fill="none" stroke-linecap="round"/>`
  }
  return out
}

function mosaique(r: () => number): string {
  const base = r() * 360
  const cols = 6 + Math.floor(r() * 7)
  const rows = Math.max(4, Math.round((cols * H) / W))
  const cw = W / cols
  const ch = H / rows
  let out = `<rect width="${W}" height="${H}" fill="${hsl(base, 40, 12)}"/>`
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = hsl(base + (x + y) * 9 + r() * 24, 55 + r() * 30, 40 + r() * 35)
      const t = r()
      const px = x * cw
      const py = y * ch
      if (t < 0.34) out += `<rect x="${px + 2}" y="${py + 2}" width="${cw - 4}" height="${ch - 4}" rx="${r() * 14}" fill="${c}"/>`
      else if (t < 0.67)
        out += `<circle cx="${px + cw / 2}" cy="${py + ch / 2}" r="${Math.min(cw, ch) / 2 - 3}" fill="${c}"/>`
      else
        out += `<path d="M${px + 2} ${py + ch - 2} L${px + cw / 2} ${py + 2} L${px + cw - 2} ${py + ch - 2} Z" fill="${c}"/>`
    }
  }
  return out
}

function mandala(r: () => number): string {
  const base = r() * 360
  const branches = 8 + Math.floor(r() * 12)
  const anneaux = 4 + Math.floor(r() * 4)
  let out = `<rect width="${W}" height="${H}" fill="${hsl(base + 200, 45, 10)}"/>`
  const cx = W / 2
  const cy = H / 2
  for (let a = anneaux; a >= 1; a--) {
    const rad = (a / anneaux) * 270
    const c = hsl(base + a * 26, 70, 32 + a * 8)
    out += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${c}" stroke-width="${2 + r() * 4}" opacity="0.8"/>`
    for (let b = 0; b < branches; b++) {
      const ang = (b / branches) * Math.PI * 2 + a * 0.12
      const px = cx + Math.cos(ang) * rad
      const py = cy + Math.sin(ang) * rad
      const size = 6 + r() * 16
      out += r() < 0.5
        ? `<circle cx="${px}" cy="${py}" r="${size}" fill="${c}"/>`
        : `<rect x="${px - size}" y="${py - size}" width="${size * 2}" height="${size * 2}" rx="${size / 2}" fill="${c}" transform="rotate(${(ang * 180) / Math.PI} ${px} ${py})"/>`
    }
  }
  out += `<circle cx="${cx}" cy="${cy}" r="${28 + r() * 26}" fill="${hsl(base + 60, 90, 70)}"/>`
  return out
}

function ocean(r: () => number): string {
  const base = 180 + r() * 60
  let out = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${hsl(base - 20, 60, 78)}"/><stop offset="1" stop-color="${hsl(base, 55, 92)}"/></linearGradient></defs>
    <rect width="${W}" height="360" fill="url(#s)"/>`
  out += `<circle cx="${100 + r() * 600}" cy="${70 + r() * 90}" r="${40 + r() * 30}" fill="${hsl(45, 95, 72)}"/>`
  const vagues = 5 + Math.floor(r() * 4)
  for (let i = 0; i < vagues; i++) {
    const y = 330 + (i / vagues) * 280
    const amp = 8 + r() * 22
    let d = `M0 ${y}`
    for (let x = 0; x <= W; x += 100) d += ` q50 ${(r() * 2 - 1) * amp} 100 0`
    d += ` L${W} ${H} L0 ${H} Z`
    out += `<path d="${d}" fill="${hsl(base + i * 4, 60, 52 - i * 5)}" opacity="0.92"/>`
  }
  // voilier
  const bx = 120 + r() * 520
  out += `<path d="M${bx} 350 l70 0 l-12 26 l-46 0 z" fill="${hsl(25, 45, 28)}"/>
          <rect x="${bx + 32}" y="270" width="5" height="80" fill="${hsl(25, 45, 22)}"/>
          <path d="M${bx + 37} 274 l46 62 l-46 0 z" fill="#f7f2e7"/>`
  return out
}

function foret(r: () => number): string {
  const base = 90 + r() * 60
  let out = `<rect width="${W}" height="${H}" fill="${hsl(base, 40, 14)}"/>`
  for (let c = 0; c < 3; c++) {
    const n = 6 + Math.floor(r() * 6)
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const h = 180 + r() * 260 - c * 40
      const w = 30 + r() * 40
      const col = hsl(base + c * 12, 45 + c * 8, 20 + c * 12)
      out += `<rect x="${x - 6}" y="${H - h * 0.35}" width="12" height="${h * 0.35}" fill="${hsl(25, 35, 18 + c * 5)}"/>`
      for (let k = 0; k < 3; k++) {
        const ty = H - h + k * (h * 0.22)
        out += `<path d="M${x - w + k * 6} ${ty + h * 0.3} L${x} ${ty} L${x + w - k * 6} ${ty + h * 0.3} Z" fill="${col}"/>`
      }
    }
  }
  out += `<circle cx="${90 + r() * 620}" cy="${70 + r() * 80}" r="${30 + r() * 26}" fill="${hsl(50, 90, 80)}" opacity="0.9"/>`
  return out
}

function ville(r: () => number): string {
  const base = r() * 360
  let out = `<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${hsl(base + 250, 55, 16)}"/><stop offset="1" stop-color="${hsl(base + 20, 65, 46)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#c)"/>`
  // étoiles
  for (let i = 0; i < 40; i++) {
    out += `<circle cx="${r() * W}" cy="${r() * 260}" r="${r() * 2 + 0.6}" fill="#fff" opacity="${0.3 + r() * 0.6}"/>`
  }
  out += `<circle cx="${110 + r() * 580}" cy="${80 + r() * 90}" r="${34 + r() * 24}" fill="${hsl(50, 90, 84)}"/>`
  let x = 0
  while (x < W) {
    const w = 50 + r() * 80
    const h = 120 + r() * 320
    const col = hsl(base + 240, 30, 12 + r() * 10)
    out += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${col}"/>`
    // fenêtres
    for (let fy = H - h + 16; fy < H - 20; fy += 26) {
      for (let fx = x + 10; fx < x + w - 12; fx += 22) {
        if (r() < 0.55) out += `<rect x="${fx}" y="${fy}" width="10" height="14" fill="${hsl(48, 90, 70)}" opacity="${0.5 + r() * 0.5}"/>`
      }
    }
    x += w + 6
  }
  return out
}

const FAMILIES = [
  { key: 'couchant', label: '🌅 Couchers de soleil', draw: couchant },
  { key: 'mosaique', label: '🔷 Mosaïques', draw: mosaique },
  { key: 'mandala', label: '🌀 Mandalas', draw: mandala },
  { key: 'ocean', label: '🌊 Océan', draw: ocean },
  { key: 'foret', label: '🌲 Forêts', draw: foret },
  { key: 'ville', label: '🌃 Villes de nuit', draw: ville },
] as const

export type FamilyKey = (typeof FAMILIES)[number]['key']

/** Nombre de variantes par famille — 6 × 60 = 360 puzzles générés. */
export const PER_FAMILY = 60

export const PUZZLE_FAMILIES = FAMILIES.map((f) => ({ key: f.key, label: f.label }))

/** Image d'un puzzle généré, en data-URI (aucun fichier, aucun réseau). */
export function sceneUrl(family: FamilyKey, index: number): string {
  const def = FAMILIES.find((f) => f.key === family) ?? FAMILIES[0]
  const body = def.draw(rng(index * 7919 + family.length * 104729))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const sceneName = (family: FamilyKey, index: number): string => {
  const def = PUZZLE_FAMILIES.find((f) => f.key === family)
  return `${def?.label.replace(/^\S+\s/, '').replace(/s$/, '') ?? 'Scène'} n° ${index + 1}`
}
