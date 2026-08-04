import { useEffect, useRef, useState } from 'react'
import type { ChessView, GameRules, GameView, LudoState, Move, RoomView } from '@dominos-clan/engine'
import { LudoBoard } from './LudoBoard'
import type { ChatMessage, FloatingReaction } from '../App'
import type { VoiceAudience, VoiceControls } from '../useVoice'
import { STATUS_LABELS, type Friend, type FriendStatus } from '../profile'
import { ChessBoard } from './ChessBoard'
import { Game } from './Game'

const REACTIONS = ['😂', '🔥', '👏', '😮', '😭', '😈', '🤝', '💀']

/** Soundboard : sons de chambrage joués chez TOUT le salon. */
const SOUNDS: Array<{ kind: string; emoji: string; label: string }> = [
  { kind: 'pet', emoji: '💨', label: 'Prout' },
  { kind: 'rire', emoji: '😂', label: 'Rire' },
  { kind: 'colere', emoji: '😡', label: 'Grrr' },
  { kind: 'bravo', emoji: '👏', label: 'Bravo' },
  { kind: 'tromblon', emoji: '📯', label: 'Womp womp' },
  { kind: 'bisou', emoji: '😘', label: 'Bisou' },
]

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
}

/**
 * Contrôles de règles du salon — utilisés en direct dans la barre du lobby
 * (onChange = envoi serveur) et en brouillon dans la modale « refaire les
 * réglages » (onChange = état local, appliqué d'un bloc).
 */
function RulesEditor({
  rules,
  editable,
  onChange,
}: {
  rules: GameRules
  editable: boolean
  onChange: (r: GameRules) => void
}) {
  return (
    <>
      <span className="game-badge" title="Jeu du salon (choisi à la création)">
        {rules.gameType === 'chess' ? '♟️ Échecs' : rules.gameType === 'ludo' ? '🎲 Ludo' : '🁫 Dominos'}
      </span>
      {rules.gameType === 'chess' && (
        <>
          <label className="rules-num" title="Minutes à la pendule pour chaque joueur">
            pendule
            <input
              key={`cm-${rules.chessMinutes}`}
              type="number"
              min={1}
              max={60}
              disabled={!editable}
              defaultValue={rules.chessMinutes}
              onBlur={(e) =>
                onChange({
                  ...rules,
                  chessMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 10)),
                })
              }
            />
            min
          </label>
          <label className="rules-num" title="Secondes ajoutées à la pendule après chaque coup">
            +
            <input
              key={`ci-${rules.chessIncrement}`}
              type="number"
              min={0}
              max={30}
              disabled={!editable}
              defaultValue={rules.chessIncrement}
              onBlur={(e) =>
                onChange({
                  ...rules,
                  chessIncrement: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                })
              }
            />
            s/coup
          </label>
        </>
      )}
      {rules.gameType !== 'chess' && (
        <select
          className="voice-audience"
          disabled={!editable}
          value={String(rules.maxSeats)}
          title="Nombre de joueurs à table"
          onChange={(e) => onChange({ ...rules, maxSeats: Number(e.target.value) })}
        >
          <option value="2">Table à 2</option>
          <option value="3">Table à 3</option>
          <option value="4">Table à 4</option>
        </select>
      )}
      {rules.gameType === 'ludo' && (
        <>
          <select
            className="voice-audience"
            disabled={!editable}
            value={String(rules.ludoSixes)}
            title="Nombre de 6 successifs autorisés avant que le tour saute"
            onChange={(e) => onChange({ ...rules, ludoSixes: Number(e.target.value) })}
          >
            <option value="2">2 six max</option>
            <option value="3">3 six max</option>
            <option value="4">4 six max</option>
          </select>
          <label className="rules-check" title="Partie avec cases bonus 🎁 (sinon simple)">
            <input
              type="checkbox"
              disabled={!editable}
              checked={rules.ludoBonus}
              onChange={(e) => onChange({ ...rules, ludoBonus: e.target.checked })}
            />
            Bonus 🎁
          </label>
        </>
      )}
      {rules.gameType === 'dominos' && (
        <>
          <select
            className="voice-audience"
            disabled={!editable}
            value={rules.targetScore === null ? 'seche' : 'match'}
            onChange={(e) =>
              onChange({
                ...rules,
                targetScore: e.target.value === 'match' ? 80 : null,
                instantWinScore: e.target.value === 'match' ? 40 : null,
              })
            }
          >
            <option value="seche">Manche sèche</option>
            <option value="match">Match aux points</option>
          </select>
          {rules.targetScore !== null && (
            <>
              <label className="rules-num">
                cible
                <input
                  key={`t-${rules.targetScore}`}
                  type="number"
                  min={10}
                  max={1000}
                  disabled={!editable}
                  defaultValue={rules.targetScore}
                  onBlur={(e) =>
                    onChange({
                      ...rules,
                      targetScore: Math.max(10, Math.min(1000, Number(e.target.value) || 80)),
                    })
                  }
                />
                pts
              </label>
              <label
                className="rules-num"
                title="Si PERSONNE n'a encore marqué et que le premier gain de la rencontre atteint ce nombre, le match est gagné immédiatement (0 = désactivé)"
              >
                éclair ≥
                <input
                  key={`e-${rules.instantWinScore ?? 'off'}`}
                  type="number"
                  min={0}
                  max={1000}
                  disabled={!editable}
                  defaultValue={rules.instantWinScore ?? 0}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0
                    onChange({
                      ...rules,
                      instantWinScore: v <= 0 ? null : Math.min(1000, v),
                    })
                  }}
                />
              </label>
              <label
                className="rules-num"
                title="La première marque ne compte que si elle atteint ce seuil ; ensuite tout compte"
              >
                1re marque ≥
                <input
                  key={`s-${rules.openThreshold}`}
                  type="number"
                  min={0}
                  max={200}
                  disabled={!editable}
                  defaultValue={rules.openThreshold}
                  onBlur={(e) =>
                    onChange({
                      ...rules,
                      openThreshold: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                    })
                  }
                />
              </label>
            </>
          )}
          <select
            className="voice-audience"
            disabled={!editable}
            value={rules.openingMaxPips === null ? 'classic' : 'rotate'}
            title="Classique : le plus gros double ouvre chaque manche. Tournante : 1re manche au plus petit double (1-1 → 6-6), puis l'ouverture tourne autour de la table avec un plafond de points."
            onChange={(e) =>
              onChange({ ...rules, openingMaxPips: e.target.value === 'rotate' ? 6 : null })
            }
          >
            <option value="classic">Ouverture classique</option>
            <option value="rotate">Ouverture tournante</option>
          </select>
          {rules.openingMaxPips !== null && (
            <label
              className="rules-num"
              title="Dès la 2e manche, l'ouvreur doit poser un domino dont le total de points est ≤ ce nombre (à défaut, son plus léger)"
            >
              ouvrir ≤
              <input
                key={`o-${rules.openingMaxPips}`}
                type="number"
                min={0}
                max={12}
                disabled={!editable}
                defaultValue={rules.openingMaxPips}
                onBlur={(e) =>
                  onChange({
                    ...rules,
                    openingMaxPips: Math.max(0, Math.min(12, Number(e.target.value) || 6)),
                  })
                }
              />
              pts
            </label>
          )}
          <label className="rules-check" title="Autoriser de passer même avec un domino jouable">
            <input
              type="checkbox"
              disabled={!editable}
              checked={rules.freePass}
              onChange={(e) => onChange({ ...rules, freePass: e.target.checked })}
            />
            Passe libre
          </label>
        </>
      )}
    </>
  )
}

export function Room({
  room,
  game,
  chess,
  ludo,
  selfId,
  reactions,
  chat,
  voice,
  friends,
  friendStatuses,
  slamFx,
  passFx,
  onInvite,
  onSit,
  onPromote,
  onRestart,
  onStand,
  onStart,
  onMove,
  onReact,
  onSound,
  onChat,
  onRules,
  onReconfigure,
  onTransferHost,
  onUndo,
  onRedeal,
  onChessMove,
  onResign,
  onLudoRoll,
  onLudoPlay,
  onLudoTarget,
  onLeave,
}: {
  room: RoomView
  game: GameView | null
  chess: ChessView | null
  ludo: LudoState | null
  selfId: string
  reactions: FloatingReaction[]
  chat: ChatMessage[]
  voice: VoiceControls
  friends: Friend[]
  friendStatuses: Record<string, FriendStatus>
  slamFx: { key: number; pseudo: string } | null
  passFx: { key: number; pseudo: string } | null
  onInvite: (toUserId: string) => void
  onSit: () => void
  onPromote: (memberId: string) => void
  onRestart: (promoteId?: string) => void
  onStand: () => void
  onStart: () => void
  onMove: (move: Move, slam?: boolean) => void
  onReact: (emoji: string) => void
  onSound: (kind: string) => void
  onChat: (text: string) => void
  onRules: (rules: GameRules) => void
  onReconfigure: (rules: GameRules) => void
  onTransferHost: (toId: string) => void
  onUndo: () => void
  onRedeal: () => void
  onChessMove: (from: string, to: string, promotion?: string) => void
  onResign: () => void
  onLudoRoll: () => void
  onLudoPlay: (pawn: number) => void
  onLudoTarget: (player: number, pawn: number) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatSeen, setChatSeen] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftRules, setDraftRules] = useState<GameRules>(room.rules)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const msgsRef = useRef<HTMLDivElement | null>(null)

  const openSettings = () => {
    setDraftRules({ ...room.rules })
    setSettingsOpen(true)
  }

  useEffect(() => {
    if (chatOpen) {
      setChatSeen(chat.length)
      msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
    }
  }, [chatOpen, chat.length])

  const unread = Math.max(0, chat.length - chatSeen)

  const self = room.members.find((m) => m.id === selfId)
  const isHost = self?.isHost ?? false
  const seated = room.seats.includes(selfId)
  const playing = room.status === 'playing'
  const result = game?.status === 'finished' ? game.result : null

  const copyCode = () => {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="room">
      <header className="room-header">
        <span className="mini-mark">
          Domino’s <b>Clan</b>
        </span>
        <button className="code-chip" onClick={copyCode} title="Copier le code">
          salon <b>{room.code}</b> {copied ? '✔' : '⧉'}
        </button>
        <div className="invite-wrap">
          <button
            className={`icon-btn ${inviteOpen ? 'live' : ''}`}
            title="Inviter des amis"
            onClick={() => setInviteOpen((v) => !v)}
          >
            👥
          </button>
          {inviteOpen && (
            <div className="invite-panel">
              <div className="chat-head">👥 Inviter des amis</div>
              {friends.length === 0 && (
                <p className="empty">Ajoute des amis depuis l’accueil (codes amis).</p>
              )}
              {friends.map((f) => {
                const status = friendStatuses[f.id] ?? 'offline'
                return (
                  <div key={f.id} className="friend-row">
                    <span className="friend-name">
                      {f.avatar} {f.pseudo || f.id}
                    </span>
                    <span className={`friend-status ${status}`}>{STATUS_LABELS[status]}</span>
                    <button
                      className="btn ghost sm"
                      disabled={status === 'offline'}
                      onClick={() => onInvite(f.id)}
                    >
                      Inviter
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="voice-controls">
          {voice.state.status === 'off' && (
            <button className="icon-btn" onClick={voice.join} title="Activer le micro">
              🎙
            </button>
          )}
          {voice.state.status === 'connecting' && (
            <button className="icon-btn" disabled title="Connexion à la voix…">
              ⏳
            </button>
          )}
          {voice.state.status === 'on' && (
            <>
              <button
                className={`icon-btn ${voice.state.muted ? 'danger' : 'live'}`}
                onClick={voice.toggleMute}
                title={voice.state.muted ? 'Réactiver le micro' : 'Couper le micro'}
              >
                {voice.state.muted ? '🔇' : '🎙'}
              </button>
              <select
                className="voice-audience"
                value={voice.state.audience}
                onChange={(e) => voice.setAudience(e.target.value as VoiceAudience)}
                title="Qui entend ton micro"
              >
                <option value="all">🌍 Tous</option>
                <option value="players">🎯 Joueurs</option>
                <option value="spectators">👀 Spectateurs</option>
              </select>
              <button className="icon-btn danger" onClick={voice.leave} title="Quitter la voix">
                📴
              </button>
            </>
          )}
          {voice.state.status === 'unavailable' && (
            <button className="icon-btn off" disabled title="Le serveur n’a pas de configuration LiveKit">
              🎙
            </button>
          )}
        </div>
        {isHost && (
          <button
            className="icon-btn"
            title="Refaire les réglages (la partie et les scores repartent de zéro)"
            onClick={openSettings}
          >
            ⚙️
          </button>
        )}
        {isHost && (
          <button
            className="icon-btn"
            title="Tout remettre à zéro (manche et scores perdus)"
            onClick={() => {
              if (
                window.confirm(
                  'Tout remettre à zéro ? La manche en cours et tous les scores du match seront perdus.',
                )
              ) {
                onRestart()
              }
            }}
          >
            🔄
          </button>
        )}
        <button className="btn ghost sm" onClick={onLeave}>
          Quitter
        </button>
      </header>

      <div className="members-strip">
        <div className="member-group">
          <span className="group-label">🎯 À table</span>
          {room.seats.map((id, i) => (
            <span
              key={id}
              className={`chip ${id === selfId ? 'you' : ''} ${
                room.members.find((m) => m.id === id)?.connected === false ? 'off' : ''
              } ${voice.state.speaking.includes(id) ? 'speaking' : ''}`}
            >
              <span className="chip-n">{i + 1}</span>
              <span className="chip-avatar">{avatarOf(room, id)}</span>
              <span className="chip-name">{pseudoOf(room, id)}</span>
              {voice.state.inVoice.includes(id) && <span className="chip-ic">🎙</span>}
              {room.members.find((m) => m.id === id)?.isHost && <span className="chip-ic">⭐</span>}
              {room.lastWinnerId === id && <span className="chip-ic">👑</span>}
              {isHost && id !== selfId && (
                <button
                  className="chip-add"
                  title={`Passer le rôle de chef à ${pseudoOf(room, id)}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Passer le rôle de chef à ${pseudoOf(room, id)} ? Tu ne pourras plus régler le salon.`,
                      )
                    ) {
                      onTransferHost(id)
                    }
                  }}
                >
                  ⭐
                </button>
              )}
            </span>
          ))}
          {room.seats.length === 0 && <span className="empty">personne…</span>}
        </div>
        <div className="member-group">
          <span className="group-label">👀 File</span>
          {room.queue.map((id, i) => (
            <span
              key={id}
              className={`chip queue ${id === selfId ? 'you' : ''} ${
                voice.state.speaking.includes(id) ? 'speaking' : ''
              }`}
            >
              <span className="chip-n">{i + 1}</span>
              <span className="chip-avatar">{avatarOf(room, id)}</span>
              <span className="chip-name">{pseudoOf(room, id)}</span>
              {voice.state.inVoice.includes(id) && <span className="chip-ic">🎙</span>}
              {isHost && room.status !== 'playing' && room.seats.length < room.rules.maxSeats && (
                <button
                  className="chip-add"
                  title="Ajouter ce joueur à la table (manche suivante)"
                  onClick={() => onPromote(id)}
                >
                  ＋
                </button>
              )}
              {isHost && room.status === 'playing' && room.seats.length < room.rules.maxSeats && (
                <button
                  className="chip-add"
                  title="L’ajouter à la table et tout recommencer à zéro (manche et scores perdus)"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Ajouter ${pseudoOf(room, id)} à la table et tout recommencer ? La manche en cours et tous les scores seront perdus.`,
                      )
                    ) {
                      onRestart(id)
                    }
                  }}
                >
                  ＋🔄
                </button>
              )}
              {isHost && id !== selfId && (
                <button
                  className="chip-add"
                  title={`Passer le rôle de chef à ${pseudoOf(room, id)}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Passer le rôle de chef à ${pseudoOf(room, id)} ? Tu ne pourras plus régler le salon.`,
                      )
                    ) {
                      onTransferHost(id)
                    }
                  }}
                >
                  ⭐
                </button>
              )}
            </span>
          ))}
          {room.queue.length === 0 && <span className="empty">vide</span>}
        </div>
      </div>

      {room.status !== 'playing' && (
        <div className="rules-bar">
          <span className="group-label">⚙️ Règles</span>
          <RulesEditor rules={room.rules} editable={isHost} onChange={onRules} />
          {!isHost && <span className="empty">réglé par l’hôte ⭐</span>}
        </div>
      )}

      {settingsOpen && (
        <>
          <div className="panel-veil" onClick={() => setSettingsOpen(false)} />
          <div className="game-modal card settings-modal">
            <div className="panel-head">
              <h2 className="card-title">⚙️ Refaire les réglages</h2>
              <button className="icon-btn tiny" onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </div>
            <p className="hint warn">
              Appliquer efface la partie en cours et tous les scores — tout le monde repart de
              zéro.
            </p>
            <div className="rules-bar in-modal">
              <RulesEditor rules={draftRules} editable onChange={setDraftRules} />
            </div>
            <div className="lobby-actions">
              <button className="btn ghost" onClick={() => setSettingsOpen(false)}>
                Annuler
              </button>
              <button
                className="btn"
                onClick={() => {
                  setSettingsOpen(false)
                  onReconfigure(draftRules)
                }}
              >
                Appliquer — on repart de zéro
              </button>
            </div>
          </div>
        </>
      )}

      {room.rules.targetScore !== null && room.rules.gameType === 'dominos' && (
        <div className="scoreboard">
          <span className="group-label">
            🏁 Match en {room.rules.targetScore} pts
            {room.rules.openThreshold > 0 ? ` · 1re marque ≥ ${room.rules.openThreshold}` : ''}
          </span>
          {room.seats.map((id) => (
            <span key={id} className={`score-chip ${room.matchWinnerId === id ? 'winner' : ''}`}>
              {pseudoOf(room, id)} <b>{room.scores[id] ?? 0}</b>
            </span>
          ))}
        </div>
      )}

      {result && (
        <div className="banner">
          {result.winnerId === null ? (
            <h2>🤝 Manche nulle — égalité au blocage, personne ne marque</h2>
          ) : room.matchWinnerId === result.winnerId ? (
            <h2>🏆 {pseudoOf(room, result.winnerId)} remporte le match !</h2>
          ) : (
            <h2>
              👑 {pseudoOf(room, result.winnerId)}{' '}
              {result.reason === 'domino'
                ? 'a fait domino !'
                : result.reason === 'doubles'
                  ? 'avait 6 doubles en main — victoire immédiate !'
                  : 'gagne — table bloquée'}
              {room.rules.targetScore !== null ? ` (+${result.gain} pts)` : ''}
            </h2>
          )}
          <div className="pips-table">
            {Object.entries(result.pips)
              .sort(([, a], [, b]) => a - b)
              .map(([id, pips]) => (
                <span key={id} className="pips-row">
                  {pseudoOf(room, id)} : <b>{pips} pts</b> restants
                </span>
              ))}
          </div>
          {result.winnerId !== null &&
            room.rules.targetScore !== null &&
            room.rules.openThreshold > 0 &&
            (room.scores[result.winnerId] ?? 0) === 0 && (
              <p className="rotation-note">
                Marque insuffisante pour ouvrir le compteur (il faut ≥ {room.rules.openThreshold}).
              </p>
            )}
          <p className="rotation-note">
            {result.winnerId === null
              ? 'On rejoue à l’identique, même table.'
              : room.matchWinnerId
                ? 'La table tourne pour le prochain match : le champion reste, la file monte.'
                : room.rules.targetScore !== null
                  ? 'Le match continue — même table jusqu’à la victoire (la file entrera au prochain match).'
                  : 'La table a tourné : le gagnant reste, la file monte.'}
          </p>
          {isHost && (
            <button className="btn" onClick={onStart} disabled={room.seats.length < 2}>
              {room.matchWinnerId
                ? 'Nouveau match'
                : result.winnerId === null
                  ? 'Rejouer'
                  : 'Manche suivante'}
            </button>
          )}
        </div>
      )}

      {slamFx && (
        <div className="slam-fx" key={slamFx.key}>
          💥 JOYAAAA&nbsp;!
        </div>
      )}
      {passFx && (
        <div className="slam-fx pass-fx" key={passFx.key}>
          😭 JE PASSE&nbsp;!
        </div>
      )}

      {room.rules.gameType === 'ludo' && ludo && room.status !== 'lobby' ? (
        <LudoBoard
          state={ludo}
          room={room}
          selfId={selfId}
          isHost={isHost}
          onRoll={onLudoRoll}
          onPlay={onLudoPlay}
          onTarget={onLudoTarget}
          onStart={onStart}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
        />
      ) : room.rules.gameType === 'chess' && chess && room.status !== 'lobby' ? (
        <ChessBoard
          view={chess}
          room={room}
          selfId={selfId}
          isHost={isHost}
          onMove={onChessMove}
          onResign={onResign}
          onStart={onStart}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
        />
      ) : game && room.status !== 'lobby' ? (
        <Game
          game={game}
          room={room}
          selfId={selfId}
          onMove={onMove}
          onUndo={onUndo}
          onRedeal={onRedeal}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
          shaking={slamFx !== null}
        />
      ) : (
        <section className="lobby">
          <div className="table-felt idle">
            <p className="felt-hint">
              {room.rules.gameType === 'chess' ? '♟️' : room.rules.gameType === 'ludo' ? '🎲' : '🁫'}{' '}
              La table est ouverte — {room.seats.length}/{room.rules.maxSeats} assis,{' '}
              {room.members.length}/24 dans le salon.
            </p>
          </div>
          <div className="lobby-actions">
            {!playing &&
              (seated ? (
                <button className="btn ghost" onClick={onStand}>
                  Se lever (spectateur)
                </button>
              ) : (
                <button className="btn ghost" onClick={onSit} disabled={room.seats.length >= 4}>
                  S’asseoir à table
                </button>
              ))}
            {isHost && (
              <button className="btn" onClick={onStart} disabled={room.seats.length < 2}>
                {room.rules.gameType === 'dominos' ? 'Lancer la manche' : 'Lancer la partie'} (
                {room.seats.length} joueur{room.seats.length > 1 ? 's' : ''})
              </button>
            )}
            {!isHost && <p className="hint">L’hôte ⭐ lance la manche.</p>}
          </div>
        </section>
      )}

      <footer className="reactions-bar">
        {soundsOpen
          ? SOUNDS.map((s) => (
              <button
                key={s.kind}
                className="react-btn sound"
                title={s.label}
                onClick={() => onSound(s.kind)}
              >
                {s.emoji}
              </button>
            ))
          : REACTIONS.map((emoji) => (
              <button key={emoji} className="react-btn" onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
        <button
          className={`react-btn toggle ${soundsOpen ? 'on' : ''}`}
          title={soundsOpen ? 'Revenir aux emojis' : 'Sons de chambrage (tout le salon entend)'}
          onClick={() => setSoundsOpen((v) => !v)}
        >
          {soundsOpen ? '🙂' : '🔊'}
        </button>
      </footer>

      <div className="float-reactions" aria-live="polite">
        {reactions.map((r) => (
          <span key={r.key} className="float-r">
            <b>{r.pseudo}</b> {r.emoji}
          </span>
        ))}
      </div>

      <button
        className={`chat-fab ${chatOpen ? 'open' : ''}`}
        onClick={() => setChatOpen((v) => !v)}
        title="Chat du salon"
      >
        💬
        {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-head">💬 Chat du salon</div>
          <div className="chat-msgs" ref={msgsRef}>
            {chat.length === 0 && <p className="empty">Encore aucun message…</p>}
            {chat.map((m) => (
              <p key={m.key} className={`chat-msg ${m.memberId === selfId ? 'mine' : ''}`}>
                <b>{m.pseudo}</b> {m.text}
              </p>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              const text = chatText.trim()
              if (text) {
                onChat(text)
                setChatText('')
              }
            }}
          >
            <input
              className="input"
              value={chatText}
              maxLength={300}
              placeholder="Ton message…"
              onChange={(e) => setChatText(e.target.value)}
            />
            <button className="btn sm" type="submit" disabled={!chatText.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
