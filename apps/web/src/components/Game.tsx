import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { End, GameView, Move, RoomView, Tile } from '@dominos-clan/engine'
import { layoutBoard } from '../boardLayout'
import { DominoBack, DominoTile } from './DominoTile'

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function sameTile(a: Tile, b: Tile): boolean {
  return a.hi === b.hi && a.lo === b.lo
}

interface DragState {
  tile: Tile
  x: number
  y: number
  over: End | null
}

export function Game({
  game,
  room,
  selfId,
  onMove,
  onUndo,
  voiceIds,
  speaking,
}: {
  game: GameView
  room: RoomView
  selfId: string
  onMove: (move: Move) => void
  onUndo: () => void
  voiceIds: string[]
  speaking: string[]
}) {
  const [selected, setSelected] = useState<Tile | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [showHands, setShowHands] = useState(false)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const movedRef = useRef(false)

  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el) return
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Nouveau coup ou nouveau tour : on repart proprement.
  useEffect(() => {
    setSelected(null)
    setDrag(null)
  }, [game.line.length, game.currentPlayerId])

  // Donnes annulées (excès de doubles) : panneau montré à chaque nouvelle donne.
  const [hideRedeals, setHideRedeals] = useState(false)
  const redealKey = game.redeals.map((r) => `${r.culpritId}:${r.doublesCount}`).join('|')
  useEffect(() => {
    setHideRedeals(false)
  }, [redealKey])

  const you = game.you
  const isSpectator = you === null
  const playMoves = (you?.legalMoves ?? []).filter(
    (m): m is Extract<Move, { type: 'play' }> => m.type === 'play',
  )
  const canPass = !!you && you.legalMoves.some((m) => m.type === 'pass')
  const myTurn = game.currentPlayerId === selfId

  const movesFor = (tile: Tile) => playMoves.filter((m) => sameTile(m.tile, tile))

  // Serpentin : nombre de colonnes selon la forme réelle du feutre, échelle pour tout faire tenir.
  const columns = box.h > 0 ? Math.min(18, Math.max(8, Math.round((box.w / box.h) * 10))) : 12
  const layout = useMemo(() => layoutBoard(game.line, columns), [game.line, columns])
  const u =
    box.w > 0 && box.h > 0
      ? Math.min(34, (box.w - 12) / layout.width, (box.h - 12) / layout.height)
      : 0

  const activeTile = drag?.tile ?? selected
  const activeEnds: End[] = activeTile ? movesFor(activeTile).map((m) => m.end) : []

  const playEnd = (end: End) => {
    if (!activeTile) return
    const move = movesFor(activeTile).find((m) => m.end === end)
    if (move) onMove(move)
    setSelected(null)
    setDrag(null)
  }

  const tapHand = (tile: Tile) => {
    const moves = movesFor(tile)
    if (moves.length === 0) return
    if (moves.length === 1) {
      onMove(moves[0]!)
      setSelected(null)
    } else {
      setSelected((prev) => (prev && sameTile(prev, tile) ? null : tile))
    }
  }

  const hitZone = (clientX: number, clientY: number): End | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const zone = el?.closest?.('[data-drop-end]')
    return (zone?.getAttribute('data-drop-end') as End | null) ?? null
  }

  const onTilePointerDown = (tile: Tile) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (movesFor(tile).length === 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    movedRef.current = false
    setDrag({ tile, x: e.clientX, y: e.clientY, over: null })
  }

  const onTilePointerMove = (tile: Tile) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag || !sameTile(drag.tile, tile)) return
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) movedRef.current = true
    setDrag({ tile, x: e.clientX, y: e.clientY, over: hitZone(e.clientX, e.clientY) })
  }

  const onTilePointerUp = (tile: Tile) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag || !sameTile(drag.tile, tile)) return
    const dropped = movedRef.current ? hitZone(e.clientX, e.clientY) : null
    if (dropped) {
      const move = movesFor(tile).find((m) => m.end === dropped)
      if (move) onMove(move)
      setSelected(null)
    } else if (!movedRef.current) {
      tapHand(tile)
    }
    setDrag(null)
    movedRef.current = false
  }

  const zoneStyle = (z: { x: number; y: number; w: number; h: number }) => ({
    left: (z.x - layout.minX) * u,
    top: (z.y - layout.minY) * u,
    width: z.w * u,
    height: z.h * u,
  })

  return (
    <section className="game">
      {game.redeals.length > 0 && !hideRedeals && (
        <div className="redeal-banner">
          <h3>🁡 Redistribution !</h3>
          {game.redeals.map((redeal, i) => (
            <div key={i} className="redeal-item">
              <p>
                <b>{pseudoOf(room, redeal.culpritId)}</b> avait{' '}
                <b>{redeal.doublesCount} doubles</b> — donne annulée :
              </p>
              <div className="redeal-hands">
                {redeal.hands.map((h) => (
                  <div key={h.id} className={`redeal-hand ${h.id === redeal.culpritId ? 'culprit' : ''}`}>
                    <span className="redeal-name">{pseudoOf(room, h.id)}</span>
                    <span className="redeal-tiles">
                      {h.hand.map((t, j) => (
                        <DominoTile key={j} a={t.hi} b={t.lo} vertical size="sm" />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button className="btn sm" onClick={() => setHideRedeals(true)}>
            OK, on joue !
          </button>
        </div>
      )}

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
            {p.hand && (showHands || game.status === 'finished') && (
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
        <div className="board-wrap" ref={boardRef}>
          {game.line.length === 0 ? (
            <p
              className={`felt-hint ${activeTile ? 'drop-target' : ''}`}
              data-drop-end={activeTile ? 'right' : undefined}
            >
              {myTurn ? 'À toi l’ouverture !' : 'La table attend l’ouverture…'}
            </p>
          ) : (
            u > 0 && (
              <div
                className="board-abs"
                style={{
                  width: layout.width * u,
                  height: layout.height * u,
                  ['--u' as string]: `${u}px`,
                }}
              >
                {layout.tiles.map((t) => (
                  <span
                    key={t.key}
                    className="abs-tile"
                    style={{ left: (t.x - layout.minX) * u, top: (t.y - layout.minY) * u }}
                  >
                    <DominoTile a={t.a} b={t.b} vertical={t.vertical} size="abs" />
                  </span>
                ))}
                {myTurn && activeTile && activeEnds.includes('left') && (
                  <button
                    className={`drop-zone ${drag?.over === 'left' ? 'hot' : ''}`}
                    style={zoneStyle(layout.zoneLeft)}
                    data-drop-end="left"
                    onClick={() => playEnd('left')}
                  >
                    {game.ends?.left}
                  </button>
                )}
                {myTurn && activeTile && activeEnds.includes('right') && (
                  <button
                    className={`drop-zone ${drag?.over === 'right' ? 'hot' : ''}`}
                    style={zoneStyle(layout.zoneRight)}
                    data-drop-end="right"
                    onClick={() => playEnd('right')}
                  >
                    {game.ends?.right}
                  </button>
                )}
              </div>
            )
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
          <div className="hand-rack">
            {you.hand.map((tile, i) => {
              const playable = movesFor(tile).length > 0
              return (
                <span
                  key={i}
                  className="hand-slot"
                  onPointerDown={playable ? onTilePointerDown(tile) : undefined}
                  onPointerMove={playable ? onTilePointerMove(tile) : undefined}
                  onPointerUp={playable ? onTilePointerUp(tile) : undefined}
                >
                  <DominoTile
                    a={tile.hi}
                    b={tile.lo}
                    vertical
                    playable={playable}
                    selected={!!selected && sameTile(selected, tile)}
                    onClick={playable ? () => {} : undefined}
                  />
                </span>
              )
            })}
            {canPass && (
              <button
                className={`btn pass ${playMoves.length > 0 ? 'optional' : ''}`}
                onClick={() => onMove({ type: 'pass' })}
              >
                Je passe 😤
              </button>
            )}
            {game.canUndo && (
              <button
                className="btn ghost sm"
                onClick={onUndo}
                title="Reprendre ton domino tant que le joueur suivant n’a pas agi"
              >
                ↩ Reprendre
              </button>
            )}
          </div>
          <p className={`turn-hint ${myTurn ? 'live' : ''}`}>
            {game.status === 'finished'
              ? 'Manche terminée'
              : myTurn
                ? selected
                  ? 'Choisis où poser (ou glisse le domino)'
                  : 'À toi de jouer !'
                : `Au tour de ${pseudoOf(room, game.currentPlayerId ?? '')}…`}
          </p>
        </div>
      )}

      {drag && movedRef.current && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <DominoTile a={drag.tile.hi} b={drag.tile.lo} vertical size="md" />
        </div>
      )}
    </section>
  )
}
