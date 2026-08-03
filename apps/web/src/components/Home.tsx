import { useState } from 'react'
import { DominoTile } from './DominoTile'
import {
  AVATARS,
  STATUS_LABELS,
  type Friend,
  type FriendStatus,
  type Profile,
} from '../profile'

export function Home({
  profile,
  friends,
  statuses,
  onProfile,
  onAddFriend,
  onRemoveFriend,
  onCreate,
  onJoin,
}: {
  profile: Profile
  friends: Friend[]
  statuses: Record<string, FriendStatus>
  onProfile: (p: Profile) => void
  onAddFriend: (code: string) => void
  onRemoveFriend: (id: string) => void
  onCreate: () => void
  onJoin: (code: string) => void
}) {
  const [code, setCode] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [copied, setCopied] = useState(false)

  const ready = profile.pseudo.trim().length > 0

  const copyFriendCode = async () => {
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // le presse-papier peut être indisponible : le code reste affiché
    }
  }

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
        <div className="avatar-row" role="radiogroup" aria-label="Ton avatar">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar-pick ${profile.avatar === a ? 'active' : ''}`}
              onClick={() => onProfile({ ...profile, avatar: a })}
            >
              {a}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Ton blaze</span>
          <input
            className="input"
            value={profile.pseudo}
            maxLength={20}
            placeholder="ex. Diablo, Bokolo, Del's"
            onChange={(e) => onProfile({ ...profile, pseudo: e.target.value })}
          />
        </label>

        <button className="friend-code" onClick={copyFriendCode} title="Copier ton code ami">
          code ami : <b>{profile.id}</b> {copied ? '✔' : '⧉'}
        </button>

        <button className="btn" disabled={!ready} onClick={onCreate}>
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
            onClick={() => onJoin(code.trim())}
          >
            Rejoindre
          </button>
        </div>
      </div>

      <div className="card friends-card">
        <h2 className="card-title">👥 Tes amis</h2>
        {friends.length === 0 && (
          <p className="empty">
            Échangez vos codes amis, et tu verras qui est chaud pour une partie.
          </p>
        )}
        {friends.map((f) => {
          const status = statuses[f.id] ?? 'offline'
          return (
            <div key={f.id} className="friend-row">
              <span className="friend-name">
                {f.avatar} {f.pseudo || f.id}
              </span>
              <span className={`friend-status ${status}`}>{STATUS_LABELS[status]}</span>
              <button
                className="icon-btn tiny"
                title="Retirer cet ami"
                onClick={() => onRemoveFriend(f.id)}
              >
                ✕
              </button>
            </div>
          )
        })}
        <div className="join-row">
          <input
            className="input"
            value={friendCode}
            maxLength={24}
            placeholder="code ami à ajouter"
            onChange={(e) => setFriendCode(e.target.value.trim())}
          />
          <button
            className="btn ghost sm"
            disabled={friendCode.trim().length < 6}
            onClick={() => {
              onAddFriend(friendCode.trim())
              setFriendCode('')
            }}
          >
            Ajouter
          </button>
        </div>
      </div>

      <p className="hint">Jusqu’à 10 dans le salon · 2 à 4 à table · le gagnant reste 👑</p>
    </main>
  )
}
