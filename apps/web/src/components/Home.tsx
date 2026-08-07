import { useState } from 'react'
import type { GameRules } from '@dominos-clan/engine'
import { DominoTile } from './DominoTile'
import { ConfirmBox, type ConfirmRequest } from './ConfirmBox'
import {
  AVATARS,
  STATUS_LABELS,
  friendAvatar,
  friendLabel,
  type Friend,
  type FriendStatus,
  type Profile,
} from '../profile'

const GAMES: Array<{
  type: GameRules['gameType']
  emoji: string
  name: string
  tag: string
  /** Grise complètement la carte. */
  soon?: boolean
  /** Signale un chantier en cours SANS bloquer l'accès (l'académie est dedans). */
  wip?: boolean
}> = [
  { type: 'dominos', emoji: '🁫', name: 'Dominos', tag: '2-4 joueurs' },
  { type: 'chess', emoji: '♟️', name: 'Échecs', tag: 'académie · IA', wip: true },
  { type: 'ludo', emoji: '🎲', name: 'Ludo', tag: '2-4 joueurs' },
]

export function Home({
  profile,
  friends,
  statuses,
  cloudOn,
  cloudUser,
  onCloudSignIn,
  onCloudSignOut,
  onProfile,
  onAddFriend,
  onRemoveFriend,
  onKnock,
  onCreate,
  onJoin,
  onLearn,
  onChessHub,
}: {
  profile: Profile
  friends: Friend[]
  statuses: Record<string, FriendStatus>
  cloudOn: boolean
  cloudUser: { uid: string; name: string; email: string; photo: string | null } | null
  onCloudSignIn: () => void
  onCloudSignOut: () => void
  onProfile: (p: Profile) => void
  onAddFriend: (code: string) => void
  onRemoveFriend: (id: string) => void
  onKnock: (id: string) => void
  onCreate: (gameType: GameRules['gameType']) => void
  onJoin: (code: string) => void
  onLearn: (game: GameRules['gameType']) => void
  onChessHub: () => void
}) {
  const [code, setCode] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [gamePanel, setGamePanel] = useState<GameRules['gameType'] | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)

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
            className={`game-card ${g.soon ? 'soon' : ''} ${g.wip ? 'wip' : ''}`}
            style={{ ['--i' as string]: i }}
            disabled={g.soon}
            onClick={
              g.soon
                ? undefined
                : g.type === 'chess'
                  ? // Les Échecs ouvrent leur propre écran de modes : académie,
                    // entraînement coaché, partie contre l'IA, ou salon.
                    onChessHub
                  : requirePseudo(() => setGamePanel(g.type))
            }
          >
            <span className="game-emoji">{g.emoji}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-tag">{g.tag}</span>
            {g.soon && <span className="game-soon">⏳ Bientôt</span>}
            {g.wip && <span className="game-soon wip">🚧 En chantier</span>}
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
            {/* Les règles vivent DANS le jeu concerné, plus sur l'accueil. */}
            <button
              className="btn ghost sm"
              onClick={() => {
                const game = gamePanel
                setGamePanel(null)
                onLearn(game)
              }}
            >
              📖 Règles du jeu
            </button>
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
            <label className="field">
              <span>Ton cri de claque 😤</span>
              <input
                className="input"
                value={profile.taunt ?? ''}
                maxLength={24}
                placeholder="ex. RENAO ! / ANY ZANY EEE"
                onChange={(e) => onProfile({ ...profile, taunt: e.target.value })}
              />
            </label>
            <button className="friend-code" onClick={copyFriendCode} title="Copier ton code ami">
              code ami : <b>{profile.id}</b> {copied ? '✔' : '⧉'}
            </button>
            <p className="hint">Partage ton code ami pour qu’on te retrouve.</p>

            {cloudOn && (
              <div className="cloud-box">
                {cloudUser ? (
                  <>
                    <p className="cloud-status">
                      ☁️ Sauvegardé sur <b>{cloudUser.email || cloudUser.name}</b>
                    </p>
                    <p className="hint">
                      Connecte-toi avec ce compte sur un autre appareil pour tout retrouver.
                    </p>
                    <button className="btn ghost sm" onClick={onCloudSignOut}>
                      Se déconnecter
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn google" onClick={onCloudSignIn}>
                      <span className="g-badge">G</span> Continuer avec Google
                    </button>
                    <p className="hint">
                      Sauvegarde ton profil et tes amis — retrouve tout même en changeant
                      d’appareil.
                    </p>
                  </>
                )}
              </div>
            )}

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
                      {friendAvatar(f)} {friendLabel(f)}
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
                      onClick={() =>
                        setConfirmReq({
                          message: `Retirer ${friendLabel(f)} de tes amis ? Il faudra ré-échanger vos codes pour le retrouver.`,
                          yesLabel: 'Retirer',
                          onYes: () => onRemoveFriend(f.id),
                        })
                      }
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

      <ConfirmBox req={confirmReq} onClose={() => setConfirmReq(null)} />
    </main>
  )
}
