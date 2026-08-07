import { useMemo } from 'react'
import {
  Board,
  KING,
  fileOf,
  moveTo,
  onBoard,
  rankOf,
  squareName,
} from '../learn/board0x88'
import { ChessPiece, type PieceType } from './ChessPieces'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const TYPE_CHARS: Record<number, PieceType> = { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' }

/**
 * Échiquier autonome branché sur le moteur maison — sert au mode solo, aux
 * puzzles et aux leçons. Il ne connaît rien au réseau : on lui donne une
 * position, il rend les cases cliquables.
 */
export function MiniBoard({
  board,
  flipped = false,
  selected = null,
  legalMoves = [],
  lastMove = null,
  onSquare,
  disabled = false,
}: {
  board: Board
  flipped?: boolean
  /** Case sélectionnée (index 0x88). */
  selected?: number | null
  /** Coups légaux de la case sélectionnée, pour éclairer les destinations. */
  legalMoves?: number[]
  lastMove?: { from: number; to: number } | null
  onSquare: (square: number) => void
  disabled?: boolean
}) {
  const targets = useMemo(() => new Set(legalMoves.map(moveTo)), [legalMoves])
  const checkedSquare = useMemo(() => {
    if (!board.inCheck()) return -1
    return board.kings[board.side]!
  }, [board])

  const cells = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rank = flipped ? row : 7 - row
      const file = flipped ? 7 - col : col
      const sq = rank * 16 + file
      if (!onBoard(sq)) continue
      const piece = board.squares[sq]!
      const type = Math.abs(piece)
      const isTarget = targets.has(sq)
      const isCapture = isTarget && piece !== 0
      cells.push(
        <button
          key={sq}
          className={`sq ${(rank + file) % 2 === 0 ? 'dark' : 'light'} ${
            selected === sq ? 'sel' : ''
          } ${isTarget ? (isCapture ? 'tgt cap' : 'tgt') : ''} ${
            lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : ''
          } ${checkedSquare === sq && type === KING ? 'chk' : ''}`}
          onClick={() => !disabled && onSquare(sq)}
          aria-label={squareName(sq)}
        >
          {col === 0 && <span className="coord rank">{rankOf(sq) + 1}</span>}
          {row === 7 && <span className="coord file">{FILES[fileOf(sq)]}</span>}
          {piece !== 0 && (
            <span className="pc">
              <ChessPiece type={TYPE_CHARS[type]!} color={piece > 0 ? 'w' : 'b'} />
            </span>
          )}
        </button>,
      )
    }
  }

  return (
    <div className="chess-board" role="grid" aria-label="Échiquier" data-fen={board.fen()}>
      {cells}
    </div>
  )
}
