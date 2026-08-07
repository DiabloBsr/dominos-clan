import { useMemo, useState } from 'react'
import { Board, moveFrom, moveTo, nameToSquare, squareName } from '../learn/board0x88'
import {
  FAMILY_LABELS,
  OPENINGS,
  frSan,
  type Opening,
  type OpeningFamily,
} from '../learn/openings'
import { MOTIFS, MOTIF_FAMILY_LABELS, type Motif, type MotifFamily } from '../learn/motifs'
import {
  dailyMotif,
  dailyPuzzle,
  doneToday,
  loadStreak,
  recordDaily,
  saveStreak,
  streakMessage,
  todayKey,
} from '../learn/daily'
import { LineViewer } from './LineViewer'
import { MiniBoard } from './MiniBoard'
import { playCheck, playChessCapture, playChessMove, playMate, playVictory } from '../sounds'

/* ─── Ouvertures ───────────────────────────────────────────────────────── */

const FAMILY_ORDER: OpeningFamily[] = [
  'ouverte',
  'semi-ouverte',
  'fermee',
  'indienne',
  'flanc',
  'piege',
]

export function OpeningsTab() {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = OPENINGS.find((o) => o.id === openId) ?? null

  if (open) return <OpeningDetail opening={open} onBack={() => setOpenId(null)} />

  return (
    <div className="academy-list">
      <p className="academy-intro">
        Une ouverture, ce n’est pas 20 coups à retenir : c’est une IDÉE. Choisis-en une qui te
        ressemble, joue-la 50 fois, et tu la connaîtras mieux que la théorie.
      </p>
      {FAMILY_ORDER.map((family) => {
        const list = OPENINGS.filter((o) => o.family === family)
        if (list.length === 0) return null
        return (
          <section key={family} className="academy-family">
            <h3 className="academy-family-title">{FAMILY_LABELS[family]}</h3>
            <div className="academy-cards">
              {list.map((o) => (
                <button key={o.id} className="academy-card" onClick={() => setOpenId(o.id)}>
                  <span className="ac-name">{o.name}</span>
                  <span className="ac-eco">{o.eco}</span>
                  <span className="ac-idea">{o.idea}</span>
                  <span className="ac-moves">
                    {o.moves.slice(0, 6).map(frSan).join(' ')}
                    {o.moves.length > 6 ? '…' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function OpeningDetail({ opening, onBack }: { opening: Opening; onBack: () => void }) {
  return (
    <div className="academy-detail">
      <button className="btn ghost sm" onClick={onBack}>
        ← Toutes les ouvertures
      </button>
      <h3 className="academy-title">
        {opening.name} <span className="ac-eco">{opening.eco}</span>
      </h3>
      <p className="academy-idea">🎯 {opening.idea}</p>
      <p className="academy-style">👤 {opening.style}</p>
      <LineViewer
        line={opening.moves}
        notes={opening.notes}
        endLabel="Fin de la variante principale — à toi de continuer avec tes propres idées."
      />
    </div>
  )
}

/* ─── Combinaisons et mats ─────────────────────────────────────────────── */

const MOTIF_ORDER: MotifFamily[] = ['tactique', 'mat', 'technique']

export function MotifsTab() {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = MOTIFS.find((m) => m.id === openId) ?? null

  if (open) return <MotifDetail motif={open} onBack={() => setOpenId(null)} />

  return (
    <div className="academy-list">
      <p className="academy-intro">
        99 % des parties entre amis se décident sur un de ces motifs. Apprends-les une fois, tu les
        verras pour toujours.
      </p>
      {MOTIF_ORDER.map((family) => (
        <section key={family} className="academy-family">
          <h3 className="academy-family-title">{MOTIF_FAMILY_LABELS[family]}</h3>
          <div className="academy-cards">
            {MOTIFS.filter((m) => m.family === family).map((m) => (
              <button key={m.id} className="academy-card" onClick={() => setOpenId(m.id)}>
                <span className="ac-name">{m.title}</span>
                <span className="ac-eco">{m.keyword}</span>
                <span className="ac-idea">{m.idea}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function MotifDetail({ motif, onBack }: { motif: Motif; onBack: () => void }) {
  const flipped = motif.fen.split(' ')[1] === 'b'
  return (
    <div className="academy-detail">
      <button className="btn ghost sm" onClick={onBack}>
        ← Tous les motifs
      </button>
      <h3 className="academy-title">{motif.title}</h3>
      <p className="academy-idea">🎯 {motif.idea}</p>
      <p className="academy-style">🔎 {motif.spot}</p>
      <LineViewer
        fen={motif.fen}
        line={motif.line}
        notes={motif.notes}
        flipped={flipped}
        endLabel={
          motif.expect.kind === 'mate'
            ? '👑 Mat. Retiens la FIGURE, pas les cases.'
            : motif.expect.kind === 'win'
              ? `✅ ${motif.expect.gain} points de matériel gagnés.`
              : '🔥 Position gagnante : le roi adverse ne s’en remettra pas.'
        }
      />
    </div>
  )
}

/* ─── Défi du jour ─────────────────────────────────────────────────────── */

export function DailyTab() {
  const day = todayKey()
  const puzzle = useMemo(() => dailyPuzzle(day), [day])
  const motif = useMemo(() => dailyMotif(day), [day])
  const [streak, setStreak] = useState(() => loadStreak())
  const [solved, setSolved] = useState(() => doneToday(loadStreak(), day))
  const [board, setBoard] = useState(() => {
    const b = new Board()
    b.loadFen(puzzle.fen)
    return b
  })
  const [selected, setSelected] = useState<number | null>(null)
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const legal = useMemo(
    () => (selected === null ? [] : board.generateMoves().filter((m) => moveFrom(m) === selected)),
    [board, selected],
  )

  const reset = () => {
    const b = new Board()
    b.loadFen(puzzle.fen)
    setBoard(b)
    setSelected(null)
    setLastMove(null)
    setFeedback(null)
    setRevealed(false)
  }

  const succeed = () => {
    setFeedback('🎉 Trouvé ! Défi du jour validé.')
    playVictory()
    if (!doneToday(streak, day)) {
      const next = recordDaily(streak, day)
      saveStreak(next)
      setStreak(next)
    }
    setSolved(true)
  }

  const onSquare = (sq: number) => {
    if (revealed) return
    const piece = board.squares[sq]!
    const mine = piece !== 0 && (piece > 0 ? 1 : -1) === board.side
    if (selected === null || mine) {
      setSelected(mine ? sq : null)
      return
    }
    const move = board.generateMoves().find((m) => moveFrom(m) === selected && moveTo(m) === sq)
    setSelected(null)
    if (move === undefined) return

    const from = squareName(moveFrom(move))
    const to = squareName(moveTo(move))
    const next = new Board()
    next.loadFen(board.fen())
    const captured = next.squares[moveTo(move)] !== 0
    next.makeMove(move)
    setBoard(next)
    setLastMove({ from: moveFrom(move), to: moveTo(move) })

    if (next.isCheckmate()) playMate()
    else if (next.inCheck()) playCheck()
    else if (captured) playChessCapture()
    else playChessMove()

    if (from === puzzle.from && to === puzzle.to) {
      if (puzzle.level === 1 || next.isCheckmate()) succeed()
      else setFeedback('✅ Bon départ ! Maintenant finis le travail.')
      return
    }
    setFeedback('❌ Ce n’est pas la solution. Reprends la position.')
  }

  const revealSolution = () => {
    const b = new Board()
    b.loadFen(puzzle.fen)
    const move = b.findMove(nameToSquare(puzzle.from), nameToSquare(puzzle.to))
    if (move !== null) {
      b.makeMove(move)
      setBoard(b)
      setLastMove({ from: nameToSquare(puzzle.from), to: nameToSquare(puzzle.to) })
    }
    setRevealed(true)
    setFeedback(`La solution était ${frSan(puzzle.solutionSan)}. Reviens demain pour la revanche.`)
  }

  const last14 = useMemo(() => {
    const days: Array<{ key: string; hit: boolean }> = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const key = todayKey(d)
      days.push({ key, hit: streak.history.includes(key) })
    }
    return days
  }, [streak.history])

  return (
    <div className="daily">
      <div className="streak-card">
        <div className="streak-figures">
          <div className="streak-fig">
            <span className="sf-value">🔥 {streak.current}</span>
            <span className="sf-label">série en cours</span>
          </div>
          <div className="streak-fig">
            <span className="sf-value">🏅 {streak.best}</span>
            <span className="sf-label">record</span>
          </div>
          <div className="streak-fig">
            <span className="sf-value">✅ {streak.total}</span>
            <span className="sf-label">défis résolus</span>
          </div>
        </div>
        <p className="streak-msg">{streakMessage(streak)}</p>
        <div className="streak-calendar" aria-label="14 derniers jours">
          {last14.map((d) => (
            <span key={d.key} className={`streak-day ${d.hit ? 'hit' : ''}`} title={d.key} />
          ))}
        </div>
      </div>

      <h3 className="academy-title">
        🎯 Défi du jour {solved && <span className="daily-done">déjà validé</span>}
      </h3>
      <p className="academy-idea">
        {puzzle.level === 1 ? 'Mat en un coup.' : 'Mat en deux coups.'} Aux{' '}
        {puzzle.side === 'w' ? 'blancs' : 'noirs'} de jouer.
      </p>

      <MiniBoard
        board={board}
        flipped={puzzle.side === 'b'}
        selected={selected}
        legalMoves={legal}
        lastMove={lastMove}
        onSquare={onSquare}
      />

      {feedback && (
        <p className={`line-note ${feedback.startsWith('🎉') ? 'ok' : ''}`}>{feedback}</p>
      )}

      <div className="line-controls">
        <button className="btn ghost sm" onClick={reset}>
          ↺ Recommencer
        </button>
        <button className="btn ghost sm" onClick={() => setShowHint((s) => !s)}>
          {showHint ? 'Cacher l’indice' : '💡 Indice'}
        </button>
        <button className="btn ghost sm" onClick={revealSolution} disabled={revealed}>
          Voir la solution
        </button>
      </div>
      {showHint && <p className="line-hint">{puzzle.hint}</p>}

      <h3 className="academy-title">📚 Le motif du jour</h3>
      <p className="academy-idea">
        {motif.title} — {motif.idea}
      </p>
      <LineViewer
        fen={motif.fen}
        line={motif.line}
        notes={motif.notes}
        flipped={motif.fen.split(' ')[1] === 'b'}
        endLabel="Un motif par jour : au bout d’un mois tu les vois arriver à l’avance."
      />
    </div>
  )
}
