import { useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { LESSONS, PUZZLES, QUIZ, type LearnGame } from '../learn/content'
import { ChessPiece, type PieceType } from './ChessPieces'
import { playCheck, playChessCapture, playMate, playVictory } from '../sounds'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const GAME_LABELS: Record<LearnGame, string> = {
  chess: '♟️ Échecs',
  dominos: '🁫 Dominos',
  ludo: '🎲 Ludo',
}

/** Progression locale (aucun compte requis). */
const PROGRESS_KEY = 'dc:learn'

interface Progress {
  solved: string[]
  bestQuiz: number
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Progress
      if (Array.isArray(p.solved)) return { solved: p.solved, bestQuiz: Number(p.bestQuiz) || 0 }
    }
  } catch {
    // stockage corrompu : on repart de zéro
  }
  return { solved: [], bestQuiz: 0 }
}

function saveProgress(p: Progress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
}

/* ─── Échiquier d'entraînement (autonome, sans serveur) ──────────────── */

function PuzzleBoard({
  fen,
  flipped,
  selected,
  targets,
  lastMove,
  onSquare,
}: {
  fen: string
  flipped: boolean
  selected: Square | null
  targets: Set<string>
  lastMove: { from: string; to: string } | null
  onSquare: (sq: Square) => void
}) {
  const engine = useMemo(() => new Chess(fen), [fen])
  const cells = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rankIndex = flipped ? 7 - r : r
      const fileIndex = flipped ? 7 - c : c
      const sq = `${FILES[fileIndex]}${8 - rankIndex}` as Square
      const piece = engine.board()[rankIndex]![fileIndex]
      const capture = targets.has(sq) && piece !== null
      cells.push(
        <button
          key={sq}
          className={`sq ${(r + c) % 2 === 0 ? 'light' : 'dark'} ${selected === sq ? 'sel' : ''} ${
            targets.has(sq) ? (capture ? 'tgt cap' : 'tgt') : ''
          } ${lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : ''}`}
          onClick={() => onSquare(sq)}
        >
          {c === 0 && <span className="coord rank">{8 - rankIndex}</span>}
          {r === 7 && <span className="coord file">{FILES[fileIndex]}</span>}
          {piece && (
            <span className="pc">
              <ChessPiece type={piece.type as PieceType} color={piece.color} />
            </span>
          )}
        </button>,
      )
    }
  }
  return (
    <div className="chess-board" role="grid" aria-label="Échiquier d’entraînement">
      {cells}
    </div>
  )
}

function Training({
  solved,
  onSolved,
}: {
  solved: string[]
  onSolved: (id: string) => void
}) {
  const [index, setIndex] = useState(0)
  const puzzle = PUZZLES[index]!
  const [fen, setFen] = useState(puzzle.fen)
  const [selected, setSelected] = useState<Square | null>(null)
  const [state, setState] = useState<'playing' | 'won' | 'wrong'>('playing')
  const [showHint, setShowHint] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)

  const engine = useMemo(() => new Chess(fen), [fen])
  const targets = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(engine.moves({ square: selected, verbose: true }).map((m) => m.to))
  }, [engine, selected])

  const reset = (i: number) => {
    const p = PUZZLES[i]!
    setIndex(i)
    setFen(p.fen)
    setSelected(null)
    setState('playing')
    setShowHint(false)
    setLastMove(null)
  }

  const clickSquare = (sq: Square) => {
    if (state === 'won') return
    if (selected && targets.has(sq)) {
      const probe = new Chess(fen)
      const move = probe.move({ from: selected, to: sq, promotion: 'q' })
      setLastMove({ from: selected, to: sq })
      setSelected(null)
      if (probe.isCheckmate()) {
        setFen(probe.fen())
        setState('won')
        playMate()
        onSolved(puzzle.id)
      } else {
        // Coup joué mais pas de mat : on montre l'erreur et on remet la position.
        if (move.captured) playChessCapture()
        else playCheck()
        setState('wrong')
        setTimeout(() => {
          setFen(puzzle.fen)
          setLastMove(null)
          setState('playing')
        }, 900)
      }
      return
    }
    const piece = engine.get(sq)
    if (piece && piece.color === engine.turn()) setSelected(sq)
    else setSelected(null)
  }

  return (
    <div className="learn-training">
      <div className="learn-head">
        <h3>
          Puzzle {index + 1}/{PUZZLES.length} — {puzzle.title}
        </h3>
        <p className="hint">
          {puzzle.side === 'w' ? 'Les blancs jouent' : 'Les noirs jouent'} et font mat en 1 coup.
          {solved.includes(puzzle.id) ? ' ✅ déjà résolu' : ''}
        </p>
      </div>

      <PuzzleBoard
        fen={fen}
        flipped={puzzle.side === 'b'}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        onSquare={clickSquare}
      />

      {state === 'won' && (
        <p className="learn-verdict ok">
          🎉 Échec et mat ! <b>{puzzle.solutionSan}</b>
        </p>
      )}
      {state === 'wrong' && <p className="learn-verdict ko">Pas encore — ce n’est pas mat.</p>}
      {showHint && state !== 'won' && <p className="learn-verdict tip">💡 {puzzle.hint}</p>}

      <div className="learn-actions">
        <button className="btn ghost sm" onClick={() => reset(index)}>
          ↺ Recommencer
        </button>
        {state !== 'won' && (
          <button className="btn ghost sm" onClick={() => setShowHint(true)}>
            💡 Indice
          </button>
        )}
        <button
          className="btn sm"
          disabled={index >= PUZZLES.length - 1}
          onClick={() => reset(index + 1)}
        >
          Suivant →
        </button>
      </div>
    </div>
  )
}

/* ─── Quiz ───────────────────────────────────────────────────────────── */

function Quiz({ best, onScore }: { best: number; onScore: (score: number) => void }) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const q = QUIZ[step]!

  const answer = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    if (i === q.answer) setScore((s) => s + 1)
  }

  const next = () => {
    if (step >= QUIZ.length - 1) {
      const finalScore = score
      setDone(true)
      onScore(finalScore)
      if (finalScore > best) playVictory()
      return
    }
    setStep((s) => s + 1)
    setPicked(null)
  }

  if (done) {
    return (
      <div className="learn-quiz">
        <h3>
          🏁 Score : {score}/{QUIZ.length}
        </h3>
        <p className="hint">
          {score === QUIZ.length
            ? 'Sans faute — tu connais les règles mieux que la table !'
            : score >= QUIZ.length * 0.7
              ? 'Solide. Relis les fiches pour le reste.'
              : 'Passe un tour par l’onglet Règles, puis reviens.'}
          {score > best ? ' 🎉 Nouveau record !' : ` (record : ${Math.max(best, score)})`}
        </p>
        <button
          className="btn"
          onClick={() => {
            setStep(0)
            setPicked(null)
            setScore(0)
            setDone(false)
          }}
        >
          Rejouer le quiz
        </button>
      </div>
    )
  }

  return (
    <div className="learn-quiz">
      <div className="learn-head">
        <h3>
          Question {step + 1}/{QUIZ.length}{' '}
          <span className="quiz-tag">{GAME_LABELS[q.game]}</span>
        </h3>
        <p className="quiz-question">{q.question}</p>
      </div>
      <div className="quiz-options">
        {q.options.map((opt, i) => (
          <button
            key={i}
            className={`btn ghost quiz-opt ${
              picked === null ? '' : i === q.answer ? 'good' : i === picked ? 'bad' : 'dim'
            }`}
            onClick={() => answer(i)}
          >
            {opt}
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          <p className={`learn-verdict ${picked === q.answer ? 'ok' : 'ko'}`}>
            {picked === q.answer ? '✅ Exact !' : '❌ Raté.'} {q.explanation}
          </p>
          <button className="btn" onClick={next}>
            {step >= QUIZ.length - 1 ? 'Voir mon score' : 'Question suivante →'}
          </button>
        </>
      )}
    </div>
  )
}

/* ─── Écran Apprendre ────────────────────────────────────────────────── */

export function Learn({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'rules' | 'training' | 'quiz'>('rules')
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  const [openLesson, setOpenLesson] = useState<string | null>(null)

  const markSolved = (id: string) => {
    setProgress((p) => {
      if (p.solved.includes(id)) return p
      const next = { ...p, solved: [...p.solved, id] }
      saveProgress(next)
      return next
    })
  }

  const recordScore = (score: number) => {
    setProgress((p) => {
      if (score <= p.bestQuiz) return p
      const next = { ...p, bestQuiz: score }
      saveProgress(next)
      return next
    })
  }

  return (
    <main className="home learn">
      <header className="hub-header">
        <button className="btn ghost sm" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="wordmark small">
          📚 Appren<span>dre</span>
        </h1>
      </header>

      <div className="learn-tabs">
        <button className={`btn ${tab === 'rules' ? '' : 'ghost'} sm`} onClick={() => setTab('rules')}>
          📖 Règles
        </button>
        <button
          className={`btn ${tab === 'training' ? '' : 'ghost'} sm`}
          onClick={() => setTab('training')}
        >
          ♟️ Entraînement ({progress.solved.length}/{PUZZLES.length})
        </button>
        <button className={`btn ${tab === 'quiz' ? '' : 'ghost'} sm`} onClick={() => setTab('quiz')}>
          ❓ Quiz ({progress.bestQuiz}/{QUIZ.length})
        </button>
      </div>

      {tab === 'rules' && (
        <div className="learn-lessons">
          {LESSONS.map((l) => (
            <div key={l.id} className={`lesson-card ${openLesson === l.id ? 'open' : ''}`}>
              <button
                className="lesson-head"
                onClick={() => setOpenLesson((cur) => (cur === l.id ? null : l.id))}
              >
                <span className="lesson-title">{l.title}</span>
                <span className="lesson-tag">{GAME_LABELS[l.game]}</span>
                <span className="lesson-chevron">{openLesson === l.id ? '▲' : '▼'}</span>
              </button>
              {openLesson === l.id ? (
                <div className="lesson-body">
                  {l.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : (
                <p className="lesson-teaser">{l.body[0]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'training' && <Training solved={progress.solved} onSolved={markSolved} />}
      {tab === 'quiz' && <Quiz best={progress.bestQuiz} onScore={recordScore} />}
    </main>
  )
}
