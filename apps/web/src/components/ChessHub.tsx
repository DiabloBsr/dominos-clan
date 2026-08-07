import { useState } from 'react'
import { WHITE } from '../learn/board0x88'
import type { AiProfile } from '../learn/ai'
import { SoloChess, SoloSetup } from './SoloChess'
import { Learn } from './Learn'

type Screen =
  | { kind: 'modes' }
  | { kind: 'setup'; coached: boolean }
  | { kind: 'play'; profile: AiProfile; side: number; coached: boolean }
  | { kind: 'academy' }
  | { kind: 'friend' }

/**
 * Entrée des Échecs : on choisit d'abord un MODE (s'entraîner seul, jouer
 * contre l'IA, apprendre, ou affronter un ami) au lieu d'atterrir directement
 * dans un salon. Tout ce qui est solo tourne sur l'appareil, sans serveur —
 * et l'ACADÉMIE vit ici, pas sur l'accueil : on apprend là où on joue.
 */
export function ChessHub({
  onCreate,
  onJoin,
  onBack,
}: {
  onCreate: () => void
  onJoin: (code: string) => void
  onBack: () => void
}) {
  const [screen, setScreen] = useState<Screen>({ kind: 'modes' })
  const [code, setCode] = useState('')

  if (screen.kind === 'academy') {
    return <Learn game="chess" onBack={() => setScreen({ kind: 'modes' })} />
  }

  if (screen.kind === 'friend') {
    return (
      <main className="home learn">
        <header className="hub-header">
          <button className="btn ghost sm" onClick={() => setScreen({ kind: 'modes' })}>
            ← Retour
          </button>
          <h1 className="wordmark small">
            👥 Avec un <span>ami</span>
          </h1>
        </header>
        <div className="friend-choice card">
          <button className="btn" onClick={onCreate}>
            Créer un salon
          </button>
          <div className="or">— ou —</div>
          <div className="join-row">
            <input
              className="input code"
              value={code}
              maxLength={4}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="btn ghost"
              disabled={code.trim().length !== 4}
              onClick={() => onJoin(code.trim())}
            >
              Rejoindre
            </button>
          </div>
          <p className="hint">Le code du salon est donné par celui qui l’a créé.</p>
        </div>
      </main>
    )
  }

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
            Sept niveaux, de 400 à 2600 ELO. Le Grand Maître ne perd pas contre l’ancien moteur.
            Analyse complète de ta partie à la fin, coup par coup.
          </span>
        </button>

        <button className="mode-card learn" onClick={() => setScreen({ kind: 'academy' })}>
          <span className="mode-emoji">📚</span>
          <span className="mode-name">Académie</span>
          <span className="mode-desc">
            Défi du jour et séries, 38 ouvertures jouables, combinaisons et schémas de mat, règles,
            et un quiz où l’on joue vraiment les positions.
          </span>
        </button>

        <button className="mode-card" onClick={() => setScreen({ kind: 'friend' })}>
          <span className="mode-emoji">👥</span>
          <span className="mode-name">Jouer avec un ami</span>
          <span className="mode-desc">
            Crée un salon ou rejoins celui d’un pote avec son code, micro et pendules compris.
          </span>
        </button>
      </div>
    </main>
  )
}

export { WHITE }
