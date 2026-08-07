/**
 * Le moteur tourne dans un THREAD SÉPARÉ.
 *
 * Au niveau Grand Maître l'IA réfléchit jusqu'à 6 secondes. Sur le fil
 * principal, ça gèle tout : plus d'animation, plus de clic, l'onglet paraît
 * planté. Ici l'interface reste vivante et peut même afficher « je réfléchis »
 * en mouvement pendant que ça calcule.
 */
import { Board } from './board0x88'
import { aiMove, reviewMove, type AiProfile, type MoveReview } from './ai'

export type EngineRequest =
  | { id: number; kind: 'move'; fen: string; profile: AiProfile; gameHistory: number[] }
  | { id: number; kind: 'review'; fen: string; move: number; depth: number }

export type EngineResponse =
  /** `move: 0` signale « aucun coup » (position terminée ou worker en panne). */
  | { id: number; kind: 'move'; move: number; san: string; score: number }
  | { id: number; kind: 'review'; review: MoveReview | null }

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const request = event.data
  const board = new Board()
  board.loadFen(request.fen)

  if (request.kind === 'move') {
    const choice = aiMove(board, request.profile, request.gameHistory)
    const response: EngineResponse = {
      id: request.id,
      kind: 'move',
      move: choice?.move ?? 0,
      san: choice?.san ?? '',
      score: choice?.score ?? 0,
    }
    self.postMessage(response)
    return
  }

  const review = reviewMove(board, request.move, request.depth)
  self.postMessage({ id: request.id, kind: 'review', review } satisfies EngineResponse)
}
