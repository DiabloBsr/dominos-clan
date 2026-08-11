import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../learn/board0x88'
import { requestReview } from '../learn/engineClient'
import { verdictLabel, type MoveReview } from '../learn/ai'
import type { ChessColor } from '@dominos-clan/engine'

/**
 * 📊 Analyse d'une partie d'échecs ENTRE AMIS — le pont entre les salons et
 * l'académie : le même moteur maison qui coache le mode solo relit ici la
 * partie multijoueur, coup par coup (précision %, gaffes, meilleurs coups).
 *
 * L'historique SAN vient du serveur (view.history) : on le rejoue sur le
 * moteur pour retrouver chaque position, puis chaque coup du camp choisi
 * passe au crible dans le worker — l'écran reste fluide.
 */
export default function MatchAnalysis({
  history,
  names,
  defaultSide,
  onClose,
}: {
  /** Coups de la partie en notation SAN, dans l'ordre. */
  history: string[]
  names: { w: string; b: string }
  defaultSide: ChessColor
  onClose: () => void
}) {
  const [side, setSide] = useState<ChessColor>(defaultSide)
  const [progress, setProgress] = useState<{ done: number; total: number; reviews: MoveReview[] }>({
    done: 0,
    total: 0,
    reviews: [],
  })
  const runRef = useRef(0)

  /**
   * La partie rejouée : pour chaque demi-coup, la position AVANT et le coup.
   * Mémoïsé sur le CONTENU (pas l'identité du tableau) : chaque diffusion
   * serveur recrée `view.history` à l'identique, et sans ça l'analyse en
   * cours était annulée et relancée en boucle — elle ne finissait jamais.
   */
  const historyKey = history.join(' ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plies = useMemo(() => {
    const board = new Board()
    board.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    const out: Array<{ fenBefore: string; move: number; side: ChessColor; san: string }> = []
    for (const san of historyKey.split(' ').filter(Boolean)) {
      const move = board.findSan(san)
      if (move === null) break // historique tronqué/illisible : on s'arrête là
      out.push({ fenBefore: board.fen(), move, side: board.side === 1 ? 'w' : 'b', san })
      board.makeMove(move)
    }
    return out
  }, [historyKey])

  /**
   * Analyse du camp choisi, coup par coup dans le worker.
   *
   * INSENSIBLE AUX COURSES : les verdicts s'accumulent en LOCAL et l'état
   * final est publié d'un bloc — même si StrictMode ou un changement d'onglet
   * fait chevaucher deux chaînes, seule la chaîne à jour publie, et jamais
   * un mélange des deux (on a vu un « 2/1 coups » sinon).
   */
  useEffect(() => {
    const mine = plies.filter((p) => p.side === side)
    const run = ++runRef.current
    setProgress({ done: 0, total: mine.length, reviews: [] })
    void (async () => {
      const collected: MoveReview[] = []
      let processed = 0
      for (const ply of mine) {
        const review = await requestReview(ply.fenBefore, ply.move, 6)
        if (runRef.current !== run) return // chaîne dépassée : silence
        processed += 1
        if (review) collected.push(review)
        const doneNow = processed
        setProgress((prev) =>
          prev.total === mine.length ? { ...prev, done: Math.min(doneNow, mine.length) } : prev,
        )
      }
      if (runRef.current !== run) return
      setProgress({ done: mine.length, total: mine.length, reviews: collected })
    })()
    return () => {
      runRef.current++
    }
  }, [plies, side])

  const finished = progress.total > 0 && progress.done === progress.total
  const summary = useMemo(() => {
    if (!finished) return null
    const counts: Record<string, number> = {}
    let totalLoss = 0
    for (const r of progress.reviews) {
      counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
      totalLoss += Math.min(r.loss, 600)
    }
    const avgLoss = progress.reviews.length ? totalLoss / progress.reviews.length : 0
    return { accuracy: Math.max(10, Math.round(100 - avgLoss / 4)), counts }
  }, [finished, progress.reviews])

  return (
    <>
      <div className="panel-veil" onClick={onClose} />
      <div className="game-modal card analysis-modal">
        <div className="panel-head">
          <h2 className="card-title">📊 Analyse de la partie</h2>
          <button className="icon-btn tiny" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="learn-tabs">
          {(['w', 'b'] as const).map((c) => (
            <button
              key={c}
              className={`btn ${side === c ? '' : 'ghost'} sm`}
              onClick={() => setSide(c)}
            >
              {c === 'w' ? '♔' : '♚'} {names[c]}
            </button>
          ))}
        </div>

        {progress.total === 0 ? (
          <p className="hint">Aucun coup à analyser pour ce camp.</p>
        ) : !finished ? (
          <p className="hint">
            Analyse en cours… {progress.done}/{progress.total} coups
          </p>
        ) : (
          <div className="analysis">
            <p className="analysis-accuracy">
              Précision de {names[side]} : <b>{summary!.accuracy}%</b>
            </p>
            <div className="analysis-counts">
              {Object.entries(summary!.counts).map(([verdict, count]) => {
                const label = verdictLabel(verdict as MoveReview['verdict'])
                return (
                  <span key={verdict} className={`count-chip ${verdict}`}>
                    {label.icon} {label.text} × {count}
                  </span>
                )
              })}
            </div>
            <div className="analysis-list">
              {progress.reviews.map((review, i) => (
                <p key={i} className={`analysis-row ${review.verdict}`}>
                  <b>
                    {i + 1}. {review.san}
                  </b>{' '}
                  {verdictLabel(review.verdict).icon}
                  {review.verdict !== 'excellent' && review.verdict !== 'brillant' && (
                    <> — mieux : {review.bestSan}</>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
