/**
 * Livre d'ouvertures — l'IA joue la théorie au lieu de la recalculer.
 *
 * Les 38 ouvertures de l'académie servent de répertoire : c'est le même
 * contenu que celui qu'on enseigne, donc l'IA joue ce que le joueur vient
 * d'apprendre. Deux bénéfices : elle ne perd pas 3 secondes à retrouver 1.e4,
 * et surtout elle VARIE, au lieu de rejouer éternellement la même partie.
 *
 * Les positions sont indexées par leur empreinte Zobrist : les transpositions
 * (arriver à la même position par un autre ordre de coups) sont donc reconnues
 * gratuitement.
 */
import { Board } from './board0x88'
import { OPENINGS } from './openings'

/** hash de position → coups joués par la théorie, avec leur fréquence. */
const BOOK = new Map<number, Map<number, number>>()

let built = false

function build(): void {
  if (built) return
  built = true
  const board = new Board()
  for (const opening of OPENINGS) {
    // Les pièges se jouent en ESPÉRANT une faute adverse : hors du livre, sinon
    // l'IA se saborderait volontairement (1.f3 e5 2.g4 ??).
    if (opening.family === 'piege') continue
    board.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    for (const san of opening.moves) {
      const move = board.findSan(san)
      if (move === null) break
      let entry = BOOK.get(board.hash)
      if (!entry) {
        entry = new Map()
        BOOK.set(board.hash, entry)
      }
      entry.set(move, (entry.get(move) ?? 0) + 1)
      board.makeMove(move)
    }
  }
}

/**
 * Coup de livre pour la position, ou null si on est sorti de la théorie.
 * Le tirage est pondéré par la fréquence : les lignes principales sortent plus
 * souvent, mais pas toujours.
 */
export function bookMove(board: Board): number | null {
  build()
  const entry = BOOK.get(board.hash)
  if (!entry || entry.size === 0) return null

  const legal = board.generateMoves()
  const candidates = [...entry.entries()].filter(([move]) => legal.includes(move))
  if (candidates.length === 0) return null

  const total = candidates.reduce((sum, [, weight]) => sum + weight, 0)
  let pick = Math.random() * total
  for (const [move, weight] of candidates) {
    pick -= weight
    if (pick <= 0) return move
  }
  return candidates[0]![0]
}

/** Nombre de positions connues — vérifié par le script de contrôle. */
export function bookSize(): number {
  build()
  return BOOK.size
}
