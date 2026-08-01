import { useEffect, useRef, useState } from 'react'
import type { GameRules, GameView, Move, RoomView } from '@dominos-clan/engine'
import type { ChatMessage, FloatingReaction } from '../App'
import type { VoiceAudience, VoiceControls } from '../useVoice'
import { Game } from './Game'

const REACTIONS = ['😂', '🔥', '👏', '😮', '😭', '😈', '🤝', '💀']

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

export function Room({
  room,
  game,
  selfId,
  reactions,
  chat,
  voice,
  onSit,
  onStand,
  onStart,
  onMove,
  onReact,
  onChat,
  onRules,
  onLeave,
}: {
  room: RoomView
  game: GameView | null
  selfId: string
  reactions: FloatingReaction[]
  chat: ChatMessage[]
  voice: VoiceControls
  onSit: () => void
  onStand: () => void
  onStart: () => void
  onMove: (move: Move) => void
  onReact: (emoji: string) => void
  onChat: (text: string) => void
  onRules: (rules: GameRules) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatSeen, setChatSeen] = useState(0)
  const msgsRef = useRef<HTMLDivElement | null>(null)

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
              {i + 1}. {pseudoOf(room, id)}
              {voice.state.inVoice.includes(id) ? ' 🎙' : ''}
              {room.members.find((m) => m.id === id)?.isHost ? ' ⭐' : ''}
              {room.lastWinnerId === id ? ' 👑' : ''}
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
              {i + 1}. {pseudoOf(room, id)}
              {voice.state.inVoice.includes(id) ? ' 🎙' : ''}
            </span>
          ))}
          {room.queue.length === 0 && <span className="empty">vide</span>}
        </div>
      </div>

      {room.status !== 'playing' && (
        <div className="rules-bar">
          <span className="group-label">⚙️ Règles</span>
          <select
            className="voice-audience"
            disabled={!isHost}
            value={room.rules.targetScore === null ? 'seche' : 'match'}
            onChange={(e) =>
              onRules({ ...room.rules, targetScore: e.target.value === 'match' ? 80 : null })
            }
          >
            <option value="seche">Manche sèche</option>
            <option value="match">Match aux points</option>
          </select>
          {room.rules.targetScore !== null && (
            <>
              <label className="rules-num">
                cible
                <input
                  key={`t-${room.rules.targetScore}`}
                  type="number"
                  min={10}
                  max={1000}
                  disabled={!isHost}
                  defaultValue={room.rules.targetScore}
                  onBlur={(e) =>
                    onRules({
                      ...room.rules,
                      targetScore: Math.max(10, Math.min(1000, Number(e.target.value) || 80)),
                    })
                  }
                />
                pts
              </label>
              <label className="rules-num" title="La première marque ne compte que si elle atteint ce seuil ; ensuite tout compte">
                1re marque ≥
                <input
                  key={`s-${room.rules.openThreshold}`}
                  type="number"
                  min={0}
                  max={200}
                  disabled={!isHost}
                  defaultValue={room.rules.openThreshold}
                  onBlur={(e) =>
                    onRules({
                      ...room.rules,
                      openThreshold: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                    })
                  }
                />
              </label>
            </>
          )}
          <label className="rules-check" title="Autoriser de passer même avec un domino jouable">
            <input
              type="checkbox"
              disabled={!isHost}
              checked={room.rules.freePass}
              onChange={(e) => onRules({ ...room.rules, freePass: e.target.checked })}
            />
            Passe libre
          </label>
          {!isHost && <span className="empty">réglé par l’hôte ⭐</span>}
        </div>
      )}

      {room.rules.targetScore !== null && (
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
              {result.reason === 'domino' ? 'a fait domino !' : 'gagne — table bloquée'}
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
                  ? 'Le match continue — même table.'
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

      {game && room.status !== 'lobby' ? (
        <Game
          game={game}
          room={room}
          selfId={selfId}
          onMove={onMove}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
        />
      ) : (
        <section className="lobby">
          <div className="table-felt idle">
            <p className="felt-hint">
              La table est ouverte — {room.seats.length}/4 assis, {room.members.length}/10 dans le salon.
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
                Lancer la manche ({room.seats.length} joueur{room.seats.length > 1 ? 's' : ''})
              </button>
            )}
            {!isHost && <p className="hint">L’hôte ⭐ lance la manche.</p>}
          </div>
        </section>
      )}

      <footer className="reactions-bar">
        {REACTIONS.map((emoji) => (
          <button key={emoji} className="react-btn" onClick={() => onReact(emoji)}>
            {emoji}
          </button>
        ))}
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
