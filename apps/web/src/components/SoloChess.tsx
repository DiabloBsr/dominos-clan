import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Board,
  BISHOP,
  KNIGHT,
  QUEEN,
  ROOK,
  WHITE,
  FLAG_PROMO,
  moveFlag,
  moveFrom,
  moveTo,
  movePromo,
} from '../learn/board0x88'
import {
  AI_LEVELS,
  aiMove,
  formatScore,
  reviewMove,
  verdictLabel,
  type AiProfile,
  type MoveReview,
} from '../learn/ai'
import { MiniBoard } from './MiniBoard'
import { playCheck, playChessCapture, playChessMove, playMate, playVictory } from '../sounds'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface PlayedMove {
  san: string
  fenBefore: string
  move: number
  bySide: number
  review?: MoveReview
}

/** Statistiques de fin de partie, calculées depuis les verdicts du coach. */
function summarize(reviews: MoveReview[]): {
  accuracy: number
  counts: Record<string, number>
} {
  const counts: Record<string, number> = {}
  let totalLoss = 0
  for (const r of reviews) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
    totalLoss += Math.min(r.loss, 600)
  }
  // Précision : 100 % si aucun centipion perdu, décroissance douce ensuite.
  const avgLoss = reviews.length ? totalLoss / reviews.length : 0
  const accuracy = Math.max(10, Math.round(100 - avgLoss / 4))
  return { accuracy, counts }
}

export function SoloChess({
  profile,
  playerSide,
  coached,
  onQuit,
}: {
  profile: AiProfile
  playerSide: number
  /** Mode entraînement : chaque coup du joueur est commenté immédiatement. */
  coached: boolean
  onQuit: () => void
}) {
  const boardRef = useRef(new Board(START))
  const [, forceRender] = useState(0)
  const repaint = useCallback(() => forceRender((n) => n + 1), [])

  const [selected, setSelected] = useState<number | null>(null)
  const [legalForSquare, setLegalForSquare] = useState<number[]>([])
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)
  const [history, setHistory] = useState<PlayedMove[]>([])
  const [thinking, setThinking] = useState(false)
  const [coachNote, setCoachNote] = useState<MoveReview | null>(null)
  const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null)
  const [gameOver, setGameOver] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{ done: number; total: number; reviews: MoveReview[] } | null>(
    null,
  )

  const board = boardRef.current
  const myTurn = !gameOver && board.side === playerSide && !thinking

  /** Applique un coup, joue le son et met à jour l'historique. */
  const applyMove = useCallback(
    (move: number, review?: MoveReview) => {
      const b = boardRef.current
      const fenBefore = b.fen()
      const san = b.san(move)
      const bySide = b.side
      b.makeMove(move)
      setLastMove({ from: moveFrom(move), to: moveTo(move) })
      setHistory((h) => [...h, { san, fenBefore, move, bySide, review }])
      if (san.includes('#')) playMate()
      else if (san.includes('+')) playCheck()
      else if (san.includes('x')) playChessCapture()
      else playChessMove()
      repaint()
    },
    [repaint],
  )

  /** Fin de partie : mat, pat, matériel insuffisant, règle des 50 coups. */
  const checkEnd = useCallback((): string | null => {
    const b = boardRef.current
    if (b.generateMoves().length === 0) {
      if (b.inCheck()) {
        const winner = b.side === playerSide ? 'L’IA' : 'Tu'
        return b.side === playerSide
          ? `💀 Échec et mat — ${winner} as perdu.`
          : '🏆 Échec et mat — tu as gagné !'
      }
      return '🤝 Pat — partie nulle.'
    }
    if (b.insufficientMaterial()) return '🤝 Matériel insuffisant — partie nulle.'
    if (b.halfmove >= 100) return '🤝 Règle des 50 coups — partie nulle.'
    return null
  }, [playerSide])

  /**
   * Tour de l'IA : on laisse l'écran se repeindre (« réfléchit… ») avant de
   * lancer la recherche, qui est synchrone.
   *
   * Le garde est une RÉFÉRENCE, pas l'état `thinking` : mettre l'état dans
   * les dépendances relançait l'effet, dont le nettoyage annulait aussitôt le
   * minuteur — l'IA ne jouait jamais.
   */
  const aiBusy = useRef(false)
  useEffect(() => {
    if (gameOver || aiBusy.current) return
    if (boardRef.current.side === playerSide) return
    aiBusy.current = true
    setThinking(true)
    const timer = setTimeout(() => {
      const choice = aiMove(boardRef.current, profile)
      if (choice) applyMove(choice.move)
      aiBusy.current = false
      setThinking(false)
      const end = checkEnd()
      if (end) {
        setGameOver(end)
        if (end.startsWith('🏆')) playVictory()
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [history, gameOver, playerSide, profile, applyMove, checkEnd])

  const playerMove = (move: number) => {
    const b = boardRef.current
    // Le coach juge AVANT que le coup soit joué (il compare aux alternatives).
    const review = coached ? reviewMove(b, move, 2) : undefined
    if (review) setCoachNote(review)
    applyMove(move, review)
    setSelected(null)
    setLegalForSquare([])
    const end = checkEnd()
    if (end) {
      setGameOver(end)
      if (end.startsWith('🏆')) playVictory()
    }
  }

  const clickSquare = (sq: number) => {
    if (!myTurn) return
    const b = boardRef.current
    if (selected !== null) {
      const candidates = legalForSquare.filter((m) => moveTo(m) === sq)
      if (candidates.length > 0) {
        // Promotion : on demande la pièce plutôt que d'imposer la dame.
        if (candidates.some((m) => moveFlag(m) === FLAG_PROMO)) {
          setPromotion({ from: selected, to: sq })
          return
        }
        playerMove(candidates[0]!)
        return
      }
    }
    const piece = b.squares[sq]!
    if (piece !== 0 && Math.sign(piece) === b.side) {
      setSelected(sq)
      setLegalForSquare(b.generateMoves().filter((m) => moveFrom(m) === sq))
    } else {
      setSelected(null)
      setLegalForSquare([])
    }
  }

  const choosePromotion = (type: number) => {
    if (!promotion) return
    const move = boardRef.current.findMove(promotion.from, promotion.to, type)
    setPromotion(null)
    if (move !== null) playerMove(move)
  }

  /** Reprendre son coup (mode entraînement) : on annule le coup de l'IA + le sien. */
  const takeBack = () => {
    const b = boardRef.current
    const toUndo = history.slice(-2)
    if (toUndo.length === 0) return
    for (const played of [...toUndo].reverse()) b.undoMove(played.move)
    setHistory((h) => h.slice(0, h.length - toUndo.length))
    setLastMove(null)
    setSelected(null)
    setLegalForSquare([])
    setCoachNote(null)
    setGameOver(null)
    repaint()
  }

  /** Analyse complète de la partie, par tranches pour ne pas figer l'écran. */
  const runAnalysis = () => {
    const mine = history.filter((h) => h.bySide === playerSide)
    if (mine.length === 0) return
    setAnalysis({ done: 0, total: mine.length, reviews: [] })
    let index = 0
    const step = () => {
      const played = mine[index]
      if (!played) return
      const probe = new Board(played.fenBefore)
      const review = reviewMove(probe, played.move, 3)
      setAnalysis((a) =>
        a ? { ...a, done: index + 1, reviews: [...a.reviews, review] } : a,
      )
      index += 1
      if (index < mine.length) setTimeout(step, 16)
    }
    setTimeout(step, 16)
  }

  const summary = analysis && analysis.done === analysis.total ? summarize(analysis.reviews) : null

  return (
    <div className="solo-chess">
      <div className="solo-head">
        <button className="btn ghost sm" onClick={onQuit}>
          ← Quitter
        </button>
        <span className="solo-title">
          {coached ? '🎓 Entraînement coaché' : '🤖 Partie contre l’IA'} · {profile.label}
        </span>
      </div>

      <MiniBoard
        board={board}
        flipped={playerSide !== WHITE}
        selected={selected}
        legalMoves={legalForSquare}
        lastMove={lastMove}
        onSquare={clickSquare}
        disabled={!myTurn}
      />

      {promotion && (
        <div className="promo-picker">
          <span>Promotion :</span>
          {[
            [QUEEN, '♛ Dame'],
            [ROOK, '♜ Tour'],
            [BISHOP, '♝ Fou'],
            [KNIGHT, '♞ Cavalier'],
          ].map(([type, label]) => (
            <button key={label as string} className="btn sm" onClick={() => choosePromotion(type as number)}>
              {label as string}
            </button>
          ))}
        </div>
      )}

      <p className={`turn-hint ${myTurn ? 'live' : ''}`}>
        {gameOver
          ? gameOver
          : thinking
            ? '🤖 L’IA réfléchit…'
            : myTurn
              ? board.inCheck()
                ? 'À toi — tu es en échec !'
                : 'À toi de jouer'
              : '…'}
      </p>

      {coached && coachNote && !gameOver && (
        <div className={`coach-note ${coachNote.verdict}`}>
          <b>
            {verdictLabel(coachNote.verdict).icon} {verdictLabel(coachNote.verdict).text} —{' '}
            {coachNote.san}
          </b>
          <span>{coachNote.comment}</span>
        </div>
      )}

      <div className="learn-actions">
        {coached && history.length > 0 && !gameOver && (
          <button className="btn ghost sm" onClick={takeBack}>
            ↩ Reprendre mon coup
          </button>
        )}
        {gameOver && !analysis && (
          <button className="btn sm" onClick={runAnalysis}>
            🔍 Analyser la partie
          </button>
        )}
      </div>

      {analysis && (
        <div className="analysis">
          {analysis.done < analysis.total ? (
            <p className="hint">
              Analyse en cours… {analysis.done}/{analysis.total} coups
            </p>
          ) : (
            summary && (
              <>
                <h3>🔍 Analyse de ta partie</h3>
                <p className="analysis-accuracy">
                  Précision : <b>{summary.accuracy} %</b>
                </p>
                <div className="analysis-counts">
                  {(['brillant', 'excellent', 'bon', 'imprecision', 'erreur', 'gaffe'] as const).map(
                    (v) =>
                      summary.counts[v] ? (
                        <span key={v} className={`count-chip ${v}`}>
                          {verdictLabel(v).icon} {summary.counts[v]} {verdictLabel(v).text.toLowerCase()}
                        </span>
                      ) : null,
                  )}
                </div>
                <div className="analysis-list">
                  {analysis.reviews.map((r, i) => (
                    <p key={i} className={`analysis-row ${r.verdict}`}>
                      <b>
                        {i + 1}. {r.san}
                      </b>{' '}
                      {verdictLabel(r.verdict).icon} {r.comment}
                    </p>
                  ))}
                </div>
              </>
            )
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="move-list">
          {history.map((h, i) => (
            <span key={i} className={`move-chip ${h.review ? h.review.verdict : ''}`}>
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''} {h.san}
              {h.review ? ` ${verdictLabel(h.review.verdict).icon}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Écran de choix : niveau, couleur et mode. */
export function SoloSetup({
  coached,
  onStart,
  onBack,
}: {
  coached: boolean
  onStart: (profile: AiProfile, side: number) => void
  onBack: () => void
}) {
  const [elo, setElo] = useState(800)
  const [side, setSide] = useState(WHITE)
  const profile = AI_LEVELS.find((p) => p.elo === elo) ?? AI_LEVELS[1]!

  return (
    <div className="solo-setup">
      <div className="solo-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← Retour
        </button>
        <span className="solo-title">{coached ? '🎓 Entraînement coaché' : '🤖 Contre l’IA'}</span>
      </div>

      <p className="hint">
        {coached
          ? 'Chaque coup que tu joues est noté et commenté immédiatement — et tu peux le reprendre.'
          : 'Partie normale contre l’IA. L’analyse complète arrive à la fin.'}
      </p>

      <h3 className="setup-label">Niveau de l’adversaire</h3>
      <div className="level-grid">
        {AI_LEVELS.map((p) => (
          <button
            key={p.elo}
            className={`btn ${elo === p.elo ? '' : 'ghost'} sm`}
            onClick={() => setElo(p.elo)}
          >
            {p.label}
            <small> {p.elo}</small>
          </button>
        ))}
      </div>
      <p className="level-taunt">« {profile.taunt} »</p>

      <h3 className="setup-label">Ta couleur</h3>
      <div className="level-grid">
        <button className={`btn ${side === WHITE ? '' : 'ghost'} sm`} onClick={() => setSide(WHITE)}>
          ♔ Blancs (tu commences)
        </button>
        <button className={`btn ${side !== WHITE ? '' : 'ghost'} sm`} onClick={() => setSide(-WHITE)}>
          ♚ Noirs
        </button>
      </div>

      <button className="btn" onClick={() => onStart(profile, side)}>
        Commencer la partie →
      </button>
    </div>
  )
}

export { formatScore }
