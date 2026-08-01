import { useState } from 'react'
import type { GameView, Move, RoomView } from '@dominos-clan/engine'
import type { FloatingReaction } from '../App'
import type { VoiceControls } from '../useVoice'
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
  voice,
  onSit,
  onStand,
  onStart,
  onMove,
  onReact,
  onLeave,
}: {
  room: RoomView
  game: GameView | null
  selfId: string
  reactions: FloatingReaction[]
  voice: VoiceControls
  onSit: () => void
  onStand: () => void
  onStart: () => void
  onMove: (move: Move) => void
  onReact: (emoji: string) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)

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
            <button className="btn ghost sm" onClick={voice.join}>
              🎙 Rejoindre la voix
            </button>
          )}
          {voice.state.status === 'connecting' && (
            <button className="btn ghost sm" disabled>
              Connexion…
            </button>
          )}
          {voice.state.status === 'on' && (
            <>
              <button
                className={`btn sm ${voice.state.muted ? 'muted' : ''}`}
                onClick={voice.toggleMute}
                title={voice.state.muted ? 'Réactiver le micro' : 'Couper le micro'}
              >
                {voice.state.muted ? '🔇 Muet' : '🎙 En ligne'}
              </button>
              <button className="btn ghost sm" onClick={voice.leave}>
                Raccrocher
              </button>
            </>
          )}
          {voice.state.status === 'unavailable' && (
            <button className="btn ghost sm" disabled title="Le serveur n’a pas de configuration LiveKit">
              🎙 Voix indisponible
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

      {result && (
        <div className="banner">
          <h2>
            👑 {pseudoOf(room, result.winnerId)}{' '}
            {result.reason === 'domino' ? 'a fait domino !' : 'gagne — table bloquée'}
          </h2>
          <div className="pips-table">
            {Object.entries(result.pips)
              .sort(([, a], [, b]) => a - b)
              .map(([id, pips]) => (
                <span key={id} className="pips-row">
                  {pseudoOf(room, id)} : <b>{pips} pts</b> restants
                </span>
              ))}
          </div>
          <p className="rotation-note">La table a tourné : le gagnant reste, la file monte.</p>
          {isHost && (
            <button className="btn" onClick={onStart} disabled={room.seats.length < 2}>
              Manche suivante
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
    </div>
  )
}
