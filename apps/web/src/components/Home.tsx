import { useState } from 'react'
import type { GameRules } from '@dominos-clan/engine'
import { DominoTile } from './DominoTile'
import {
  AVATARS,
  STATUS_LABELS,
  type Friend,
  type FriendStatus,
  type Profile,
} from '../profile'

const GAMES: Array<{
  type: GameRules['gameType']
  emoji: string
  name: string
  tag: string
  desc: string
  soon?: boolean
}> = [
  {
    type: 'dominos',
    emoji: '🁫',
    name: 'Dominos',
    tag: '2-4 joueurs',
    desc: 'Le classique de la table — claquage autorisé.',
  },
  {
    type: 'chess',
    emoji: '♟️',
    name: 'Échecs',
    tag: '1 vs 1 · blitz',
    desc: 'Pendules 10 min, mat ou drapeau.',
    soon: true,
  },
  {
    type: 'ludo',
    emoji: '🎲',
    name: 'Ludo',
    tag: '2-4 joueurs',
    desc: 'Petits chevaux, gros chaos — mode bonus 🎁.',
    soon: true,
  },
]

export function Home({
  profile,
  friends,
  statuses,
  onProfile,
  onAddFriend,
  onRemoveFriend,
  onKnock,
  onCreate,
  onJoin,
}: {
  profile: Profile
  friends: Friend[]
  statuses: Record<string, FriendStatus>
  onProfile: (p: Profile) => void
  onAddFriend: (code: string) => void
  onRemoveFriend: (id: string) => void
  onKnock: (id: string) => void
  onCreate: (gameType: GameRules['gameType']) => void
  onJoin: (code: string) => void
}) {
  const [code, setCode] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [gamePanel, setGamePanel] = useState<GameRules['gameType'] | null>(null)

  const ready = profile.pseudo.trim().length > 0

  const copyFriendCode = async () => {
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // presse-papier indisponible : le code reste affiché
    }
  }

  const requirePseudo = (fn: () => void) => () => {
    if (!ready) {
      setProfileOpen(true)
      return
    }
    fn()
  }

  return (
    <main className="home hub">
      <header className="hub-header">
        <h1 className="wordmark small">
          Domino’s <span>Clan</span>
        </h1>
        <button
          className={`profile-btn ${!ready ? 'attention' : ''}`}
          onClick={() => setProfileOpen(true)}
          title="Ton profil"
        >
          <span className="profile-avatar">{profile.avatar}</span>
          <span className="profile-name">{profile.pseudo.trim() || 'Ton profil'}</span>
        </button>
      </header>

      <p className="tagline">Le jeu entre potes — mic ouvert, chambrage permis.</p>

      <div className="hub-games">
        {GAMES.map((g, i) => (
          <button
            key={g.type}
            className={`game-card ${g.soon ? 'soon' : ''}`}
            style={{ ['--i' as string]: i }}
            disabled={g.soon}
            onClick={g.soon ? undefined : requirePseudo(() => setGamePanel(g.type))}
          >
            <span className="game-emoji">{g.emoji}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-tag">{g.tag}</span>
            <span className="game-desc">{g.desc}</span>
            {g.soon ? (
              <span className="game-soon">⏳ Bientôt disponible</span>
            ) : (
              <span className="game-cta">Créer un salon →</span>
            )}
          </button>
        ))}
      </div>

      {gamePanel && (
        <>
          <div className="panel-veil" onClick={() => setGamePanel(null)} />
          <div className="game-modal card">
            <div className="panel-head">
              <h2 className="card-title">
                {GAMES.find((g) => g.type === gamePanel)?.emoji}{' '}
                {GAMES.find((g) => g.type === gamePanel)?.name}
              </h2>
              <button className="icon-btn tiny" onClick={() => setGamePanel(null)}>
                ✕
              </button>
            </div>
            <button
              className="btn"
              onClick={() => {
                setGamePanel(null)
                onCreate(gamePanel)
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
                disabled={code.trim().length !== 4}
                onClick={() => {
                  setGamePanel(null)
                  onJoin(code.trim())
                }}
              >
                Rejoindre
              </button>
            </div>
            <p className="hint">Le code du salon est donné par celui qui l’a créé.</p>
          </div>
        </>
      )}

      <p className="hint">2 à 4 à table · jusqu’à 20 en file · le gagnant reste 👑</p>

      {profileOpen && (
        <>
          <div className="panel-veil" onClick={() => setProfileOpen(false)} />
          <aside className="profile-panel">
            <div className="panel-head">
              <h2 className="card-title">Ton profil</h2>
              <button className="icon-btn tiny" onClick={() => setProfileOpen(false)}>
                ✕
              </button>
            </div>
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
              <span>Pseudo</span>
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
            <p className="hint">Partage ton code ami pour qu’on te retrouve.</p>

            <div className="panel-friends">
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
                    {(status === 'room' || status === 'playing') && (
                      <button
                        className="btn ghost sm"
                        title="Lui demander de t’inviter dans sa partie"
                        onClick={requirePseudo(() => onKnock(f.id))}
                      >
                        Rejoindre
                      </button>
                    )}
                    <button
                      className="icon-btn tiny"
                      title="Retirer cet ami"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Retirer ${f.pseudo || f.id} de tes amis ? Il faudra ré-échanger vos codes pour le retrouver.`,
                          )
                        ) {
                          onRemoveFriend(f.id)
                        }
                      }}
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
          </aside>
        </>
      )}

      <div className="deco-tiles" aria-hidden="true">
        <span className="deco deco-1">
          <DominoTile a={6} b={6} vertical />
        </span>
        <span className="deco deco-2">
          <DominoTile a={3} b={5} vertical />
        </span>
      </div>
    </main>
  )
}
