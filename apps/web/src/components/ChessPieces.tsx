import type { ChessColor } from '@dominos-clan/engine'

/**
 * Pièces d'échecs cartoon simples (style plateau vert/crème) : formes rondes,
 * gros contours, blanches ivoire / noires charbon. SVG inline (viewBox 45×45) :
 * rendu identique partout, aucun caractère Unicode.
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

function palette(color: ChessColor): { fill: string; stroke: string } {
  return color === 'w'
    ? { fill: '#f9f9f7', stroke: '#3a3733' }
    : { fill: '#54504c', stroke: '#211e1b' }
}

/** Socle arrondi commun. */
function Base() {
  return (
    <>
      <rect x="13" y="31.5" width="19" height="4.5" rx="2.2" />
      <rect x="10" y="36.5" width="25" height="6" rx="3" />
    </>
  )
}

function body(type: PieceType, accent: string) {
  switch (type) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="13.5" r="7" />
          <path d="M16.5 30.5 C16.5 22.5 19 19.8 22.5 19.8 C26 19.8 28.5 22.5 28.5 30.5 Z" />
          <Base />
        </>
      )
    case 'r':
      return (
        <>
          <path d="M12.5 8 h5.2 v4 h3.2 v-4 h3.2 v4 h3.2 v-4 h5.2 v8.5 h-20 Z" />
          <path d="M15.2 16.5 h14.6 l-1.2 15 h-12.2 Z" />
          <Base />
        </>
      )
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="6.8" r="2.3" />
          <path d="M22.5 9.5 C28 14.5 30.2 18.8 30.2 23.2 C30.2 28.4 26.8 31 22.5 31 C18.2 31 14.8 28.4 14.8 23.2 C14.8 18.8 17 14.5 22.5 9.5 Z" />
          <path d="M20 15.5 L25.4 21" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          <Base />
        </>
      )
    case 'n':
      return (
        <>
          <path d="M13.8 31.5 C13.8 23 15.8 18 20.2 15 C19.2 12.4 19.5 9.6 21.2 7.6 L22.5 10.6 L24.6 6.6 L26.2 11 C31.8 13.4 34.2 19 34.2 26 L34.2 31.5 Z" />
          <circle cx="24.6" cy="14.6" r="1.1" fill={accent} stroke="none" />
          <Base />
        </>
      )
    case 'q':
      return (
        <>
          <circle cx="12.8" cy="11" r="2" />
          <circle cx="22.5" cy="7.8" r="2" />
          <circle cx="32.2" cy="11" r="2" />
          <path d="M14.2 31.5 L12 14 L18.8 21.5 L22.5 10.8 L26.2 21.5 L33 14 L30.8 31.5 Z" />
          <Base />
        </>
      )
    case 'k':
      return (
        <>
          <path d="M22.5 3.5 v7.5 M18.8 7 h7.4" fill="none" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M15 31.5 C12.8 20.5 17 15.5 22.5 15.5 C28 15.5 32.2 20.5 30 31.5 Z" />
          <Base />
        </>
      )
  }
}

export function ChessPiece({ type, color }: { type: PieceType; color: ChessColor }) {
  const { fill, stroke } = palette(color)
  return (
    <svg
      viewBox="0 0 45 45"
      className="piece-svg"
      fill={fill}
      stroke={stroke}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {body(type, stroke)}
    </svg>
  )
}
