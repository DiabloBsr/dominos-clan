/**
 * Accès au moteur depuis l'interface.
 *
 * On passe par un worker quand le navigateur le permet, et on retombe sur un
 * calcul direct sinon — l'IA doit fonctionner partout, même sur un vieux
 * navigateur ou dans un contexte où les workers sont bloqués.
 */
import { Board } from './board0x88'
import { aiMove, reviewMove, type AiProfile, type MoveReview } from './ai'
import type { EngineRequest, EngineResponse } from './engine.worker'

let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const pending = new Map<number, (value: EngineResponse) => void>()

function getWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const resolve = pending.get(event.data.id)
      if (resolve) {
        pending.delete(event.data.id)
        resolve(event.data)
      }
    }
    worker.onerror = () => {
      // Le worker a échoué : on bascule définitivement en calcul direct plutôt
      // que de laisser l'IA muette.
      workerBroken = true
      worker = null
      for (const resolve of pending.values()) {
        resolve({ id: 0, kind: 'move', move: 0, san: '', score: 0 })
      }
      pending.clear()
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

type Ask = { [K in EngineRequest as K['kind']]: Omit<K, 'id'> }[EngineRequest['kind']]

function ask(request: Ask): Promise<EngineResponse> | null {
  const instance = getWorker()
  if (!instance) return null
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    instance.postMessage({ ...request, id } as EngineRequest)
  })
}

export interface EngineMove {
  move: number
  san: string
  score: number
}

/** Coup de l'IA. Ne bloque jamais l'interface quand le worker est disponible. */
export async function requestMove(
  fen: string,
  profile: AiProfile,
  gameHistory: number[] = [],
): Promise<EngineMove | null> {
  const promise = ask({ kind: 'move', fen, profile, gameHistory })
  if (promise) {
    const response = await promise
    if (response.kind !== 'move' || response.move === 0) return null
    return { move: response.move, san: response.san, score: response.score }
  }
  const board = new Board()
  board.loadFen(fen)
  const choice = aiMove(board, profile, gameHistory)
  return choice ? { move: choice.move, san: choice.san, score: choice.score } : null
}

/** Note du coach sur un coup joué. */
export async function requestReview(
  fen: string,
  move: number,
  depth: number,
): Promise<MoveReview | null> {
  const promise = ask({ kind: 'review', fen, move, depth })
  if (promise) {
    const response = await promise
    return response.kind === 'review' ? response.review : null
  }
  const board = new Board()
  board.loadFen(fen)
  return reviewMove(board, move, depth)
}
