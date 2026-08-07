import { useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { LESSONS, PUZZLES, PUZZLES_BY_LEVEL, type LearnGame } from '../learn/content'
import { Board, moveFrom, moveTo, squareName } from '../learn/board0x88'
import { quizSet } from '../learn/exercises'
import { DailyTab, MotifsTab, OpeningsTab } from './Academy'
import { MiniBoard } from './MiniBoard'
import { loadStreak } from '../learn/daily'
import { ChessPiece, type PieceType } from './ChessPieces'
import { playCheck, playChessCapture, playChessMove, playMate, playVictory } from '../sounds'

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
    // data-fen : position courante, lisible par les sondes de test.
    <div className="chess-board" role="grid" aria-label="Échiquier d’entraînement" data-fen={fen}>
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
  const [level, setLevel] = useState<1 | 2>(1)
  const list = useMemo(() => PUZZLES_BY_LEVEL(level), [level])
  const [index, setIndex] = useState(0)
  const puzzle = list[Math.min(index, list.length - 1)]!
  const [fen, setFen] = useState(puzzle.fen)
  const [selected, setSelected] = useState<Square | null>(null)
  const [state, setState] = useState<'playing' | 'won' | 'wrong'>('playing')
  const [showHint, setShowHint] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  /** Mat en 2 : 0 = premier coup attendu, 1 = coup de grâce après la défense. */
  const [phase, setPhase] = useState(0)

  const engine = useMemo(() => new Chess(fen), [fen])
  const targets = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(engine.moves({ square: selected, verbose: true }).map((m) => m.to))
  }, [engine, selected])

  const reset = (i: number, lvl: 1 | 2 = level) => {
    const p = PUZZLES_BY_LEVEL(lvl)[i]!
    setIndex(i)
    setFen(p.fen)
    setSelected(null)
    setState('playing')
    setShowHint(false)
    setLastMove(null)
    setPhase(0)
  }

  const switchLevel = (lvl: 1 | 2) => {
    setLevel(lvl)
    reset(0, lvl)
  }

  const fail = () => {
    setState('wrong')
    setTimeout(() => {
      setFen(puzzle.fen)
      setLastMove(null)
      setPhase(0)
      setState('playing')
    }, 950)
  }

  const clickSquare = (sq: Square) => {
    if (state !== 'playing') return
    if (selected && targets.has(sq)) {
      const probe = new Chess(fen)
      const move = probe.move({ from: selected, to: sq, promotion: 'q' })
      setSelected(null)
      setLastMove({ from: selected, to: sq })

      if (probe.isCheckmate()) {
        setFen(probe.fen())
        setState('won')
        playMate()
        onSolved(puzzle.id)
        return
      }
      // Mat en 2 : le premier coup doit être LA solution, puis l'app joue la
      // défense adverse et le joueur doit conclure.
      if (puzzle.level === 2 && phase === 0) {
        if (selected !== puzzle.from || sq !== puzzle.to) {
          if (move.captured) playChessCapture()
          else playCheck()
          fail()
          return
        }
        playChessMove()
        setFen(probe.fen())
        setPhase(1)
        // Défense adverse jouée par l'app, après un temps de lecture.
        setTimeout(() => {
          const reply = new Chess(probe.fen())
          const moves = reply.moves({ verbose: true })
          if (moves.length === 0) return
          const chosen = moves[Math.floor(Math.random() * moves.length)]!
          reply.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion ?? 'q' })
          if (chosen.captured) playChessCapture()
          else playChessMove()
          setFen(reply.fen())
          setLastMove({ from: chosen.from, to: chosen.to })
        }, 650)
        return
      }
      if (move.captured) playChessCapture()
      else playCheck()
      fail()
      return
    }
    const piece = engine.get(sq)
    if (piece && piece.color === engine.turn()) setSelected(sq)
    else setSelected(null)
  }

  return (
    <div className="learn-training">
      <div className="learn-tabs">
        <button className={`btn ${level === 1 ? '' : 'ghost'} sm`} onClick={() => switchLevel(1)}>
          Mat en 1 ({PUZZLES_BY_LEVEL(1).filter((p) => solved.includes(p.id)).length}/
          {PUZZLES_BY_LEVEL(1).length})
        </button>
        <button className={`btn ${level === 2 ? '' : 'ghost'} sm`} onClick={() => switchLevel(2)}>
          Mat en 2 ({PUZZLES_BY_LEVEL(2).filter((p) => solved.includes(p.id)).length}/
          {PUZZLES_BY_LEVEL(2).length})
        </button>
      </div>

      <div className="learn-head">
        <h3>
          Puzzle {index + 1}/{list.length} — {puzzle.title}
        </h3>
        <p className="hint">
          {puzzle.side === 'w' ? 'Les blancs jouent' : 'Les noirs jouent'} et matent en{' '}
          {puzzle.level} coup{puzzle.level > 1 ? 's' : ''}.
          {puzzle.level === 2 && phase === 1 ? ' — à toi de conclure !' : ''}
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
          {puzzle.level === 1 ? (
            <>
              🎉 Échec et mat ! <b>{puzzle.solutionSan}</b>
            </>
          ) : (
            <>
              🎉 Mat en 2 réussi ! Le coup clé était <b>{puzzle.solutionSan}</b>
            </>
          )}
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
        <button className="btn sm" disabled={index >= list.length - 1} onClick={() => reset(index + 1)}>
          Suivant →
        </button>
      </div>
    </div>
  )
}

/* ─── Quiz SUR PLATEAU ───────────────────────────────────────────────── */

const QUIZ_LENGTH = 10

/**
 * Le quiz ne pose plus de questions à choix multiples : on affiche une
 * position et il faut JOUER le bon coup. On retient un motif quand la main l'a
 * exécuté, pas quand on a coché la bonne case.
 */
function BoardQuiz({ best, onScore }: { best: number; onScore: (score: number) => void }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const series = useMemo(() => quizSet(QUIZ_LENGTH, seed), [seed])
  const [step, setStep] = useState(0)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [verdict, setVerdict] = useState<'ok' | 'ko' | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)

  const exercise = series[step]!
  const [board, setBoard] = useState(() => {
    const b = new Board()
    b.loadFen(exercise.fen)
    return b
  })

  // Nouvelle position à chaque question.
  useEffect(() => {
    const b = new Board()
    b.loadFen(exercise.fen)
    setBoard(b)
    setSelected(null)
    setLastMove(null)
    setVerdict(null)
    setShowHint(false)
  }, [exercise])

  const legal = useMemo(
    () => (selected === null ? [] : board.generateMoves().filter((m) => moveFrom(m) === selected)),
    [board, selected],
  )

  const onSquare = (sq: number) => {
    if (verdict !== null) return
    const piece = board.squares[sq]!
    const mine = piece !== 0 && (piece > 0 ? 1 : -1) === board.side
    if (selected === null || mine) {
      setSelected(mine ? sq : null)
      return
    }
    const move = board.generateMoves().find((m) => moveFrom(m) === selected && moveTo(m) === sq)
    setSelected(null)
    if (move === undefined) return

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

    const good =
      squareName(moveFrom(move)) === exercise.from && squareName(moveTo(move)) === exercise.to
    setVerdict(good ? 'ok' : 'ko')
    if (good) setScore((s) => s + 1)
  }

  const next = () => {
    if (step >= series.length - 1) {
      setDone(true)
      onScore(score)
      if (score > best) playVictory()
      return
    }
    setStep((s) => s + 1)
  }

  const restart = () => {
    setSeed(Math.floor(Math.random() * 1e9))
    setStep(0)
    setScore(0)
    setDone(false)
  }

  if (done) {
    return (
      <div className="learn-quiz">
        <h3>
          🏁 Score : {score}/{series.length}
        </h3>
        <p className="hint">
          {score === series.length
            ? 'Sans faute — tu vois les motifs à l’œil nu.'
            : score >= series.length * 0.7
              ? 'Solide. Repasse par l’onglet Combinaisons pour le reste.'
              : 'Va réviser les Combinaisons, puis reviens te venger.'}
          {score > best ? ' 🎉 Nouveau record !' : ` (record : ${Math.max(best, score)})`}
        </p>
        <button className="btn" onClick={restart}>
          Une nouvelle série
        </button>
      </div>
    )
  }

  return (
    <div className="learn-quiz board-quiz">
      <div className="quiz-head">
        <span className="quiz-count">
          {step + 1}/{series.length}
        </span>
        <span className="quiz-theme">{exercise.theme}</span>
        <span className="quiz-score">✅ {score}</span>
      </div>
      <p className="quiz-question">
        {exercise.question} Aux {exercise.side === 'w' ? 'blancs' : 'noirs'} de jouer.
      </p>

      <MiniBoard
        board={board}
        flipped={exercise.side === 'b'}
        selected={selected}
        legalMoves={legal}
        lastMove={lastMove}
        onSquare={onSquare}
      />

      {verdict === null ? (
        <>
          <div className="line-controls">
            <button className="btn ghost sm" onClick={() => setShowHint((s) => !s)}>
              {showHint ? 'Cacher l’indice' : '💡 Indice'}
            </button>
            <button className="btn ghost sm" onClick={() => setVerdict('ko')}>
              Je donne ma langue au chat
            </button>
          </div>
          {showHint && <p className="line-hint">{exercise.hint}</p>}
        </>
      ) : (
        <>
          <p className={`learn-verdict ${verdict}`}>
            {verdict === 'ok' ? '✅ Exact !' : `❌ Il fallait jouer ${exercise.from}–${exercise.to}.`}{' '}
            {exercise.explanation}
          </p>
          <button className="btn" onClick={next}>
            {step >= series.length - 1 ? 'Voir mon score' : 'Position suivante →'}
          </button>
        </>
      )}
    </div>
  )
}

/* ─── Écran Apprendre ────────────────────────────────────────────────── */

type Tab = 'daily' | 'rules' | 'openings' | 'motifs' | 'training' | 'quiz'

/**
 * Écran d'apprentissage. Aux échecs c'est l'ACADÉMIE complète ; pour les autres
 * jeux ce sont simplement leurs règles, ouvertes depuis leur propre panneau.
 */
export function Learn({ game = 'chess', onBack }: { game?: LearnGame; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>(game === 'chess' ? 'daily' : 'rules')
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  const [openLesson, setOpenLesson] = useState<string | null>(null)
  // Lu une seule fois : sert juste à afficher la flamme sur l'onglet.
  const [streakAtOpen] = useState(() => loadStreak().current)

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

  const lessons = LESSONS.filter((l) => l.game === game)

  return (
    <main className="home learn">
      <header className="hub-header">
        <button className="btn ghost sm" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="wordmark small">
          {game === 'chess' ? '📚 Acadé' : '📖 Rè'}
          <span>{game === 'chess' ? 'mie' : 'gles'}</span>
        </h1>
      </header>

      <div className="learn-tabs">
        {game === 'chess' && (
          <>
            <button
              className={`btn ${tab === 'daily' ? '' : 'ghost'} sm`}
              onClick={() => setTab('daily')}
            >
              🔥 Défi du jour{streakAtOpen > 0 ? ` (${streakAtOpen})` : ''}
            </button>
            <button
              className={`btn ${tab === 'openings' ? '' : 'ghost'} sm`}
              onClick={() => setTab('openings')}
            >
              📚 Ouvertures
            </button>
            <button
              className={`btn ${tab === 'motifs' ? '' : 'ghost'} sm`}
              onClick={() => setTab('motifs')}
            >
              ⚡ Combinaisons
            </button>
          </>
        )}
        <button className={`btn ${tab === 'rules' ? '' : 'ghost'} sm`} onClick={() => setTab('rules')}>
          📖 Règles
        </button>
        {game === 'chess' && (
          <>
            <button
              className={`btn ${tab === 'training' ? '' : 'ghost'} sm`}
              onClick={() => setTab('training')}
            >
              ♟️ Entraînement ({progress.solved.length}/{PUZZLES.length})
            </button>
            <button
              className={`btn ${tab === 'quiz' ? '' : 'ghost'} sm`}
              onClick={() => setTab('quiz')}
            >
              🎯 Quiz sur plateau ({progress.bestQuiz}/{QUIZ_LENGTH})
            </button>
          </>
        )}
      </div>

      {tab === 'daily' && <DailyTab />}
      {tab === 'openings' && <OpeningsTab />}
      {tab === 'motifs' && <MotifsTab />}

      {tab === 'rules' && (
        <div className="learn-lessons">
          {lessons.map((l) => (
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
      {tab === 'quiz' && <BoardQuiz best={progress.bestQuiz} onScore={recordScore} />}
    </main>
  )
}
