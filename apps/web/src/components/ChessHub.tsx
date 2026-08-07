import { useState } from 'react'
import { WHITE } from '../learn/board0x88'
import type { AiProfile } from '../learn/ai'
import { SoloChess, SoloSetup } from './SoloChess'

type Screen =
  | { kind: 'modes' }
  | { kind: 'setup'; coached: boolean }
  | { kind: 'play'; profile: AiProfile; side: number; coached: boolean }

/**
 * Entrée des Échecs : on choisit d'abord un MODE (s'entraîner seul, jouer
 * contre l'IA, ou affronter un ami) au lieu d'atterrir directement dans un
 * salon. Les modes solo tournent entièrement sur l'appareil, sans serveur.
 */
export function ChessHub({
  onFriendGame,
  onLearn,
  onBack,
}: {
  onFriendGame: () => void
  onLearn: () => void
  onBack: () => void
}) {
  const [screen, setScreen] = useState<Screen>({ kind: 'modes' })

  if (screen.kind === 'setup') {
    return (
      <main className="home learn">
        <SoloSetup
          coached={screen.coached}
          onBack={() => setScreen({ kind: 'modes' })}
          onStart={(profile, side) => setScreen({ kind: 'play', profile, side, coached: screen.coached })}
        />
      </main>
    )
  }

  if (screen.kind === 'play') {
    return (
      <main className="home learn">
        <SoloChess
          profile={screen.profile}
          playerSide={screen.side}
          coached={screen.coached}
          onQuit={() => setScreen({ kind: 'modes' })}
        />
      </main>
    )
  }

  return (
    <main className="home learn">
      <header className="hub-header">
        <button className="btn ghost sm" onClick={onBack}>
          ← Retour
        </button>
        <h1 className="wordmark small">
          ♟️ Éch<span>ecs</span>
        </h1>
      </header>

      <p className="tagline">Choisis ton mode — on joue, on apprend, ou les deux.</p>

      <div className="mode-list">
        <button className="mode-card coach" onClick={() => setScreen({ kind: 'setup', coached: true })}>
          <span className="mode-emoji">🎓</span>
          <span className="mode-name">Entraînement coaché</span>
          <span className="mode-desc">
            L’IA joue contre toi ET commente chaque coup : « excellent », « imprécision », « il
            fallait jouer… ». Tu peux reprendre un coup pour essayer mieux.
          </span>
        </button>

        <button className="mode-card" onClick={() => setScreen({ kind: 'setup', coached: false })}>
          <span className="mode-emoji">🤖</span>
          <span className="mode-name">Partie contre l’IA</span>
          <span className="mode-desc">
            Cinq niveaux, de 400 à 2000 ELO. Analyse complète de ta partie à la fin, coup par coup.
          </span>
        </button>

        <button className="mode-card" onClick={onFriendGame}>
          <span className="mode-emoji">👥</span>
          <span className="mode-name">Jouer avec un ami</span>
          <span className="mode-desc">
            Crée un salon ou rejoins celui d’un pote, avec le micro et les pendules.
          </span>
        </button>

        <button className="mode-card learn" onClick={onLearn}>
          <span className="mode-emoji">📚</span>
          <span className="mode-name">Académie</span>
          <span className="mode-desc">
            Règles, puzzles (mat en 1 et en 2) et quiz — pour comprendre avant de jouer.
          </span>
        </button>
      </div>
    </main>
  )
}

export { WHITE }
