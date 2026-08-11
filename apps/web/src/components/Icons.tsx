/**
 * Icônes 2D en TRAIT (stroke currentColor, style ligne) — pour les CONTRÔLES
 * de l'interface : micro, sortir, réglages, menu…
 *
 * Les emojis restent réservés au CONTENU (avatars, réactions, soundboard,
 * cartes de jeux) : c'est la frontière retenue avec Samy — un bouton est un
 * pictogramme sobre, une émotion est un emoji.
 */
import type { ReactNode } from 'react'

function Icon({ children, size }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size ?? 20}
      height={size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconMenu = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </Icon>
)

export const IconMic = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </Icon>
)

export const IconMicOff = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 5a3 3 0 0 1 6 0v6" />
    <path d="M9 9v2a3 3 0 0 0 4.6 2.5" />
    <path d="M5 10v1a7 7 0 0 0 11.4 5.4" />
    <path d="M19 10v1a7 7 0 0 1-.4 2.3" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </Icon>
)

export const IconUsers = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1" />
    <path d="M16.5 4.9a3.5 3.5 0 0 1 0 6.2" />
    <path d="M21.5 20v-1a6.2 6.2 0 0 0-3.5-5.6" />
  </Icon>
)

export const IconMegaphone = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 10v4l16 5V5L3 10z" />
    <path d="M11.5 16.5a3 3 0 1 1-5.6-1.8" />
  </Icon>
)

export const IconSliders = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="5" y1="21" x2="5" y2="13" />
    <line x1="5" y1="9" x2="5" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="19" y1="21" x2="19" y2="17" />
    <line x1="19" y1="13" x2="19" y2="3" />
    <line x1="2" y1="13" x2="8" y2="13" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="16" y1="17" x2="22" y2="17" />
  </Icon>
)

export const IconRefresh = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polyline points="2 4 2 10 8 10" />
    <path d="M3.5 15a9 9 0 1 0 2-9.4L2 10" />
  </Icon>
)

export const IconLogOut = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Icon>
)

export const IconPower = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M18.36 6.64a9 9 0 1 1-12.72 0" />
    <line x1="12" y1="2" x2="12" y2="11" />
  </Icon>
)

export const IconVolume = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
  </Icon>
)

export const IconClock = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </Icon>
)

export const IconChat = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8.5z" />
  </Icon>
)

export const IconEye = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconCopy = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
)

export const IconCheck = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
)

export const IconShare = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
    <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
  </Icon>
)

export const IconChart = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="4" y1="20" x2="20" y2="20" />
    <line x1="7" y1="20" x2="7" y2="12" />
    <line x1="12" y1="20" x2="12" y2="6" />
    <line x1="17" y1="20" x2="17" y2="15" />
  </Icon>
)

/**
 * VUMÈTRE micro — l'icône d'état de CHAQUE joueur :
 *  • micro coupé → icône barrée, atténuée ;
 *  • micro ouvert, silence → contour vide ;
 *  • en train de parler → la capsule SE REMPLIT depuis le bas et oscille
 *    avec le niveau de voix.
 */
export function MicMeter({
  level,
  muted,
  size,
}: {
  /** Niveau de voix 0..1 (audioLevel LiveKit). */
  level: number
  muted: boolean
  size?: number
}) {
  if (muted) {
    return (
      <span className="mic-meter off">
        <IconMicOff size={size} />
      </span>
    )
  }
  // Les niveaux LiveKit de parole normale plafonnent vers 0,3-0,4 : la racine
  // redresse la courbe pour que le remplissage soit VISIBLE dès qu'on parle.
  const filled = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.7)
  const interiorTop = 3.1
  const interiorBottom = 12.9
  const height = (interiorBottom - interiorTop) * filled
  const speakingNow = filled > 0.08
  return (
    <span className={`mic-meter ${speakingNow ? 'live' : ''}`}>
      <svg
        width={size ?? 20}
        height={size ?? 20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
        {height > 0.4 && (
          <rect
            className="mic-fill"
            x="9.9"
            y={interiorBottom - height}
            width="4.2"
            height={height}
            rx="2"
            fill="currentColor"
            stroke="none"
          />
        )}
      </svg>
    </span>
  )
}
