import { useEffect, useRef, useState } from 'react'
import type { GameView, Move, RoomView, Tile } from '@dominos-clan/engine'
import { DominoBack, DominoTile } from './DominoTile'

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function sameTile(a: Tile, b: Tile): boolean {
  return a.hi === b.hi && a.lo === b.lo
}

export function Game({
  game,
  room,
  selfId,
  onMove,
  voiceIds,
  speaking,
}: {
  game: GameView
  room: RoomView
  selfId: string
  onMove: (move: Move) => void
  voiceIds: string[]
  speaking: string[]
}) {
  const [pending, setPending] = useState<Tile | null>(null)
  const [showHands, setShowHands] = useState(false)
  const lineRef = useRef<HTMLDivElement | null>(null)

  const you = game.you
  const isSpectator = you === null
  const playMoves = (you?.legalMoves ?? []).filter((m): m is Extract<Move, { type: 'play' }> => m.type === 'play')
  const mustPass = !!you && you.legalMoves.length === 1 && you.legalMoves[0]?.type === 'pass'
  const myTurn = game.currentPlayerId === selfId

  // La chaîne grandit des deux côtés : on garde le centre visible.
  useEffect(() => {
    const el = lineRef.current
    if (el) el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2, behavior: 'smooth' })
  }, [game.line.length])

  useEffect(() => setPending(null), [game.currentPlayerId, game.line.length])

  const movesFor = (tile: Tile) => playMoves.filter((m) => sameTile(m.tile, tile))

  const clickTile = (tile: Tile) => {
    const moves = movesFor(tile)
    if (moves.length === 0) return
    if (moves.length === 1) {
      onMove(moves[0]!)
      setPending(null)
    } else {
      setPending(tile)
    }
  }

  return (
    <section className="game">
      <div className="players-row">
        {game.players.map((p) => (
          <div
            key={p.id}
            className={`seat-chip ${p.id === game.currentPlayerId ? 'turn' : ''} ${
              speaking.includes(p.id) ? 'speaking' : ''
            }`}
          >
            <span className="seat-name">
              {pseudoOf(room, p.id)}
              {voiceIds.includes(p.id) ? ' 🎙' : ''}
              {p.id === selfId ? ' (toi)' : ''}
            </span>
            <span className="seat-tiles">
              {Array.from({ length: p.tileCount }, (_, i) => (
                <DominoBack key={i} />
              ))}
            </span>
            {isSpectator && showHands && p.hand && (
              <span className="spy-hand">
                {p.hand.map((t, i) => (
                  <DominoTile key={i} a={t.hi} b={t.lo} vertical size="sm" />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="table-felt">
        <div className="line" ref={lineRef}>
          {game.line.length === 0 ? (
            <p className="felt-hint">
              {myTurn ? 'À toi l’ouverture — pose ton domino imposé' : 'La table attend l’ouverture…'}
            </p>
          ) : (
            <div className="line-inner">
              {game.line.map((placed, i) => (
                // Convention des vraies tables : les doubles se posent en travers.
                <DominoTile
                  key={i}
                  a={placed.left}
                  b={placed.right}
                  vertical={placed.left === placed.right}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>
        {game.ends && (
          <p className="ends-hint">
            bouts ouverts : <b>{game.ends.left}</b> · <b>{game.ends.right}</b>
            {game.sleepingCount > 0 && <span> — {game.sleepingCount} dominos dorment</span>}
          </p>
        )}
      </div>

      {isSpectator ? (
        <div className="spectator-bar">
          <span className="spectator-tag">👀 Spectateur — tu vois tout, eux non.</span>
          <button className="btn ghost sm" onClick={() => setShowHands((v) => !v)}>
            {showHands ? 'Masquer les mains' : 'Voir les mains'}
          </button>
        </div>
      ) : (
        <div className="hand-zone">
          {pending && (
            <div className="chooser">
              <span>
                Poser le {pending.hi}-{pending.lo} :
              </span>
              <button className="btn sm" onClick={() => { onMove({ type: 'play', tile: pending, end: 'left' }); setPending(null) }}>
                ⬅ À gauche
              </button>
              <button className="btn sm" onClick={() => { onMove({ type: 'play', tile: pending, end: 'right' }); setPending(null) }}>
                À droite ➡
              </button>
              <button className="btn ghost sm" onClick={() => setPending(null)}>
                Annuler
              </button>
            </div>
          )}
          <div className="hand-rack">
            {you.hand.map((tile, i) => {
              const playable = movesFor(tile).length > 0
              return (
                <DominoTile
                  key={i}
                  a={tile.hi}
                  b={tile.lo}
                  vertical
                  playable={playable}
                  selected={!!pending && sameTile(pending, tile)}
                  onClick={playable ? () => clickTile(tile) : undefined}
                />
              )
            })}
            {mustPass && (
              <button className="btn pass" onClick={() => onMove({ type: 'pass' })}>
                Je passe 😤
              </button>
            )}
          </div>
          <p className={`turn-hint ${myTurn ? 'live' : ''}`}>
            {game.status === 'finished'
              ? 'Manche terminée'
              : myTurn
                ? 'À toi de jouer !'
                : `Au tour de ${pseudoOf(room, game.currentPlayerId ?? '')}…`}
          </p>
        </div>
      )}
    </section>
  )
}
