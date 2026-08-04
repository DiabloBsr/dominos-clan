import type { ChessColor } from '@dominos-clan/engine'

/**
 * Pièces d'échecs : set standard « Cburnett » (celui de Lichess/Wikipédia,
 * licence CC BY-SA), servi en fichiers statiques /pieces/{couleur}{type}.svg.
 * Silhouettes universellement reconnaissables — cavalier compris.
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export function ChessPiece({ type, color }: { type: PieceType; color: ChessColor }) {
  return (
    <img
      className="piece-svg"
      src={`/pieces/${color}${type}.svg`}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  )
}
