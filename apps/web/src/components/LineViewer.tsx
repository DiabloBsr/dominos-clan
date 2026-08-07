import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board, moveFrom, moveTo } from '../learn/board0x88'
import { frSan } from '../learn/openings'
import { MiniBoard } from './MiniBoard'
import { playCheck, playChessCapture, playChessMove, playMate } from '../sounds'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Lecteur de variante : rejoue une ligne coup par coup, avec commentaires.
 *
 * On peut avancer avec les flèches OU jouer soi-même le coup sur l'échiquier —
 * c'est là qu'on retient vraiment, parce que la main fait le geste.
 */
export function LineViewer({
  fen = START_FEN,
  line,
  notes,
  flipped = false,
  /** Message affiché quand on arrive au bout. */
  endLabel = 'Fin de la variante.',
}: {
  fen?: string
  line: string[]
  notes: Record<number, string>
  flipped?: boolean
  endLabel?: string
}) {
  const [ply, setPly] = useState(0)
  const [auto, setAuto] = useState(false)
  const [wrong, setWrong] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  // On rejoue depuis le début à chaque changement : c'est instantané (moins de
  // 20 coups) et ça évite toute désynchronisation entre l'affichage et l'état.
  const { board, lastMove } = useMemo(() => {
    const b = new Board()
    b.loadFen(fen)
    let last: { from: number; to: number } | null = null
    for (let i = 0; i < ply; i++) {
      const move = b.findSan(line[i]!)
      if (move === null) break
      last = { from: moveFrom(move), to: moveTo(move) }
      b.makeMove(move)
    }
    return { board: b, lastMove: last }
  }, [fen, line, ply])

  // Remise à zéro quand on change de variante.
  useEffect(() => {
    setPly(0)
    setAuto(false)
    setWrong(null)
    setSelected(null)
  }, [fen, line])

  const advance = useCallback(() => {
    setPly((p) => {
      if (p >= line.length) return p
      const b = new Board()
      b.loadFen(fen)
      for (let i = 0; i < p; i++) {
        const m = b.findSan(line[i]!)
        if (m !== null) b.makeMove(m)
      }
      const move = b.findSan(line[p]!)
      if (move !== null) {
        const captured = b.squares[moveTo(move)] !== 0
        b.makeMove(move)
        if (b.isCheckmate()) playMate()
        else if (b.inCheck()) playCheck()
        else if (captured) playChessCapture()
        else playChessMove()
      }
      return p + 1
    })
    setWrong(null)
    setSelected(null)
  }, [fen, line])

  // Lecture automatique.
  const autoRef = useRef(auto)
  autoRef.current = auto
  useEffect(() => {
    if (!auto) return
    if (ply >= line.length) {
      setAuto(false)
      return
    }
    const timer = setTimeout(advance, 900)
    return () => clearTimeout(timer)
  }, [auto, ply, line.length, advance])

  const expected = ply < line.length ? line[ply]! : null
  const legal = useMemo(
    () => (selected === null ? [] : board.generateMoves().filter((m) => moveFrom(m) === selected)),
    [board, selected],
  )

  /** Clic sur l'échiquier : on n'accepte que le coup de la variante. */
  const onSquare = (sq: number) => {
    if (!expected) return
    const piece = board.squares[sq]!
    const mine = piece !== 0 && (piece > 0 ? 1 : -1) === board.side
    if (selected === null || mine) {
      setSelected(mine ? sq : null)
      setWrong(null)
      return
    }
    const move = board.generateMoves().find((m) => moveFrom(m) === selected && moveTo(m) === sq)
    setSelected(null)
    if (move === undefined) return
    if (board.san(move) === expected) advance()
    else setWrong(`Pas dans cette variante — ici on joue ${frSan(expected)}.`)
  }

  const note = notes[ply - 1]
  const done = ply >= line.length

  return (
    <div className="line-viewer">
      <MiniBoard
        board={board}
        flipped={flipped}
        selected={selected}
        legalMoves={legal}
        lastMove={lastMove}
        onSquare={onSquare}
      />

      <div className="line-controls">
        <button className="btn ghost sm" onClick={() => setPly(0)} disabled={ply === 0}>
          ⏮
        </button>
        <button className="btn ghost sm" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>
          ◀
        </button>
        <button className="btn sm" onClick={advance} disabled={done}>
          Coup suivant ▶
        </button>
        <button
          className={`btn ${auto ? '' : 'ghost'} sm`}
          onClick={() => setAuto((a) => !a)}
          disabled={done}
        >
          {auto ? '⏸' : '▶▶'}
        </button>
      </div>

      <p className="line-hint">
        {done
          ? endLabel
          : `Joue ${frSan(expected!)} sur l’échiquier, ou appuie sur « Coup suivant ».`}
      </p>

      {wrong && <p className="line-wrong">{wrong}</p>}
      {note && <p className="line-note">💡 {note}</p>}

      <div className="line-moves">
        {line.map((san, i) => {
          const number = i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''
          return (
            <button
              key={i}
              className={`move-chip ${i < ply ? 'played' : ''} ${i === ply - 1 ? 'cur' : ''}`}
              onClick={() => {
                setPly(i + 1)
                setAuto(false)
                setWrong(null)
                setSelected(null)
              }}
            >
              {number}
              {frSan(san)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
