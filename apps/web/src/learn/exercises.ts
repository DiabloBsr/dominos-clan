/**
 * Exercices SUR PLATEAU — le quiz ne pose plus de questions à choix multiples :
 * on montre une position, et il faut TROUVER puis JOUER le bon coup.
 *
 * Aucune position n'est inventée ici : elles viennent des motifs et des puzzles
 * déjà vérifiés par scripts/check-book.ts et check-puzzles.ts. Le coup solution
 * est extrait du moteur lui-même, donc il ne peut pas diverger du contenu.
 */

import { Board, moveFrom, moveTo, squareName } from './board0x88'
import { MOTIFS } from './motifs'
import { PUZZLES } from './content'

export interface Exercise {
  id: string
  fen: string
  /** Camp au trait. */
  side: 'w' | 'b'
  /** Case de départ du coup solution. */
  from: string
  /** Case d'arrivée. */
  to: string
  promotion?: string
  /** Le thème, affiché comme consigne : « Fourchette », « Mat en 1 »… */
  theme: string
  question: string
  hint: string
  explanation: string
}

/** Retrouve les cases du premier coup d'une ligne SAN. */
function firstMoveSquares(fen: string, san: string): { from: string; to: string } | null {
  const board = new Board()
  board.loadFen(fen)
  const move = board.findSan(san)
  if (move === null) return null
  return { from: squareName(moveFrom(move)), to: squareName(moveTo(move)) }
}

/** Un exercice par motif : trouver le coup qui déclenche la combinaison. */
const FROM_MOTIFS: Exercise[] = MOTIFS.flatMap((motif) => {
  const squares = firstMoveSquares(motif.fen, motif.line[0]!)
  if (!squares) return []
  const side = motif.fen.split(' ')[1] === 'b' ? 'b' : 'w'
  return [
    {
      id: `ex-${motif.id}`,
      fen: motif.fen,
      side: side as 'w' | 'b',
      from: squares.from,
      to: squares.to,
      theme: motif.keyword,
      question:
        motif.expect.kind === 'mate'
          ? 'Trouve le coup qui mène au mat.'
          : 'Trouve le coup qui gagne du matériel.',
      hint: motif.spot,
      explanation: motif.notes[0] ?? motif.idea,
    },
  ]
})

/** Un exercice par puzzle de mat : jouer le coup clé. */
const FROM_PUZZLES: Exercise[] = PUZZLES.map((puzzle) => ({
  id: `ex-${puzzle.id}`,
  fen: puzzle.fen,
  side: puzzle.side,
  from: puzzle.from,
  to: puzzle.to,
  promotion: puzzle.promotion,
  theme: puzzle.level === 1 ? 'Mat en 1' : 'Mat en 2',
  question: puzzle.level === 1 ? 'Mate en un coup.' : 'Trouve le coup qui force le mat en deux.',
  hint: puzzle.hint,
  explanation: `La solution était ${puzzle.solutionSan}.`,
}))

export const EXERCISES: Exercise[] = [...FROM_MOTIFS, ...FROM_PUZZLES]

/** Tous les thèmes présents, pour filtrer. */
export const THEMES: string[] = [...new Set(EXERCISES.map((e) => e.theme))].sort()

/**
 * Tire une série d'exercices variés.
 * Mélange déterministe à partir d'une graine : deux joueurs avec la même
 * graine ont la même série, et on peut la rejouer à l'identique.
 */
export function quizSet(count: number, seed: number): Exercise[] {
  const pool = [...EXERCISES]
  let state = seed >>> 0 || 1
  const next = () => {
    // xorshift32 : court, rapide, et suffisant pour mélanger une liste.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  // On évite d'enchaîner deux fois le même thème quand c'est possible.
  const picked: Exercise[] = []
  const rest = [...pool]
  while (picked.length < count && rest.length > 0) {
    const last = picked[picked.length - 1]?.theme
    const idx = rest.findIndex((e) => e.theme !== last)
    picked.push(rest.splice(idx >= 0 ? idx : 0, 1)[0]!)
  }
  return picked
}
