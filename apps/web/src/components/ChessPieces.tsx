import type { ChessColor } from '@dominos-clan/engine'

/**
 * Pièces d'échecs vectorielles maison — silhouettes Staunton épurées :
 * blanches en ivoire contouré sombre, noires pleines contourées clair.
 * SVG inline (viewBox 45×45) : rendu identique sur tous les appareils,
 * contrairement aux caractères Unicode (rendus emoji sur certains mobiles).
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

function palette(color: ChessColor): { fill: string; stroke: string } {
  return color === 'w'
    ? { fill: '#f7f2e7', stroke: '#241f18' }
    : { fill: '#221d16', stroke: '#e8e0cd' }
}

/** Socle commun à toutes les pièces (deux étages, comme sur une vraie table). */
function Base() {
  return (
    <>
      <rect x="13.5" y="30.5" width="18" height="4" rx="1.5" />
      <rect x="11" y="35.5" width="23" height="5" rx="2" />
    </>
  )
}

function body(type: PieceType, accent: string) {
  switch (type) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="12.5" r="5.2" />
          <path d="M17.5 28.5 C17.5 21 19.5 18 22.5 17.5 C25.5 18 27.5 21 27.5 28.5 Z" />
          <Base />
        </>
      )
    case 'r':
      return (
        <>
          <path d="M14 9.5 h4.2 v3.2 h3 v-3.2 h2.6 v3.2 h3 v-3.2 H31 v7.3 H14 Z" />
          <path d="M16.5 16.8 h12 l-1 12 h-10 Z" />
          <Base />
        </>
      )
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="7.6" r="2" />
          <path d="M22.5 9.5 C27 13.5 29 17 29 21 C29 25.5 26.2 28 22.5 28 C18.8 28 16 25.5 16 21 C16 17 18 13.5 22.5 9.5 Z" />
          <path d="M20.4 15 L25.2 20" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
          <Base />
        </>
      )
    case 'n':
      return (
        <>
          <path d="M14.8 30.5 C14.8 23.5 16.2 19 19.8 16 C18.8 13.8 19 11.2 20.4 9.4 L21.6 12 L23.2 8.2 L24.6 12.2 C29.4 13.8 31.8 18 31.8 24 L31.8 30.5 Z" />
          <circle cx="24" cy="15.6" r="1" fill={accent} stroke="none" />
          <Base />
        </>
      )
    case 'q':
      return (
        <>
          <circle cx="11.8" cy="12.6" r="1.7" />
          <circle cx="22.5" cy="9.6" r="1.7" />
          <circle cx="33.2" cy="12.6" r="1.7" />
          <path d="M13.4 28.5 L11.8 15 L18 20.6 L22.5 12 L27 20.6 L33.2 15 L31.6 28.5 Z" />
          <Base />
        </>
      )
    case 'k':
      return (
        <>
          <path d="M22.5 4.5 v7 M19 8 h7" fill="none" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M15.4 28.5 C13.4 19.5 17 14.5 22.5 14.5 C28 14.5 31.6 19.5 29.6 28.5 Z" />
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
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {body(type, stroke)}
    </svg>
  )
}
