import { useState } from 'react'
import { DominoTile } from './DominoTile'

export function Home({
  onCreate,
  onJoin,
}: {
  onCreate: (pseudo: string) => void
  onJoin: (code: string, pseudo: string) => void
}) {
  const [pseudo, setPseudo] = useState(() => localStorage.getItem('dc-pseudo') ?? '')
  const [code, setCode] = useState('')

  const ready = pseudo.trim().length > 0

  const remember = () => localStorage.setItem('dc-pseudo', pseudo.trim())

  return (
    <main className="home">
      <div className="deco-tiles" aria-hidden="true">
        <span className="deco deco-1">
          <DominoTile a={6} b={6} vertical />
        </span>
        <span className="deco deco-2">
          <DominoTile a={3} b={5} vertical />
        </span>
      </div>

      <h1 className="wordmark">
        Domino’s <span>Clan</span>
      </h1>
      <p className="tagline">Le domino entre potes — mic ouvert, chambrage permis.</p>

      <div className="card">
        <label className="field">
          <span>Ton blaze</span>
          <input
            className="input"
            value={pseudo}
            maxLength={20}
            placeholder="ex. Samy le Boss"
            onChange={(e) => setPseudo(e.target.value)}
          />
        </label>

        <button
          className="btn"
          disabled={!ready}
          onClick={() => {
            remember()
            onCreate(pseudo.trim())
          }}
        >
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
            disabled={!ready || code.trim().length !== 4}
            onClick={() => {
              remember()
              onJoin(code.trim(), pseudo.trim())
            }}
          >
            Rejoindre
          </button>
        </div>
      </div>

      <p className="hint">Jusqu’à 10 dans le salon · 2 à 4 à table · le gagnant reste 👑</p>
    </main>
  )
}
