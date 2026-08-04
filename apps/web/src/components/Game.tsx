import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { End, GameView, Move, PublicPlayer, RoomView, Tile } from '@dominos-clan/engine'
import { layoutBoard } from '../boardLayout'
import { playTap } from '../sounds'
import { DominoBack, DominoTile } from './DominoTile'

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
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
  onRedeal,
  voiceIds,
  speaking,
  shaking,
}: {
  game: GameView
  room: RoomView
  selfId: string
  onMove: (move: Move, slam?: boolean) => void
  onUndo: () => void
  onRedeal: () => void
  voiceIds: string[]
  speaking: string[]
  shaking: boolean
}) {
  const [selected, setSelected] = useState<Tile | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [showHands, setShowHands] = useState(false)
  const [slamArmed, setSlamArmed] = useState(false)
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

  // Petit « tac » à chaque pose (le CLAC du claquage arrive par game:slam).
  const prevLineLen = useRef(game.line.length)
  useEffect(() => {
    if (game.line.length > prevLineLen.current) playTap()
    prevLineLen.current = game.line.length
  }, [game.line.length])

  // Donne annulée (excès de doubles) : seule la donne fautive EN ATTENTE de
  // redistribution est montrée ; dès que la nouvelle donne est bonne, le jeu
  // reprend tout seul (le panneau disparaît avec le statut 'redeal').
  const currentRedeal = game.status === 'redeal' ? game.redeals[game.redeals.length - 1] : undefined

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

  const sendPlay = (move: Move) => {
    onMove(move, slamArmed)
    setSlamArmed(false)
  }

  const playEnd = (end: End) => {
    if (!activeTile) return
    const move = movesFor(activeTile).find((m) => m.end === end)
    if (move) sendPlay(move)
    setSelected(null)
    setDrag(null)
  }

  const tapHand = (tile: Tile) => {
    const moves = movesFor(tile)
    if (moves.length === 0) return
    if (moves.length === 1) {
      sendPlay(moves[0]!)
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
      if (move) sendPlay(move)
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

  // Vraie table : soi en bas, les adversaires autour du feutre dans l'ordre du tour
  // (1 adversaire → en face ; 2 → droite/gauche ; 3 → droite/en face/gauche).
  const selfIdx = game.players.findIndex((p) => p.id === selfId)
  const orderedSeats =
    selfIdx >= 0
      ? [...game.players.slice(selfIdx), ...game.players.slice(0, selfIdx)]
      : game.players
  const opponents = orderedSeats.slice(1)
  const arenaSpots: Record<'top' | 'left' | 'right' | 'bottom', PublicPlayer[]> = {
    top: [],
    left: [],
    right: [],
    bottom: orderedSeats[0] ? [orderedSeats[0]] : [],
  }
  if (opponents.length === 1) arenaSpots.top = [opponents[0]!]
  else if (opponents.length === 2) {
    arenaSpots.right = [opponents[0]!]
    arenaSpots.left = [opponents[1]!]
  } else if (opponents.length >= 3) {
    arenaSpots.right = [opponents[0]!]
    arenaSpots.top = [opponents[1]!]
    arenaSpots.left = [opponents[2]!]
  }

  const renderSeat = (p: PublicPlayer) => {
    const spy = Boolean(p.hand) && (showHands || game.status === 'finished')
    const frozenOf = (t: Tile) => (p.frozen ?? []).some((f) => sameTile(f, t))
    return (
      <div
        key={p.id}
        className={`seat-chip ${spy ? 'spy' : ''} ${p.id === game.currentPlayerId ? 'turn' : ''} ${
          speaking.includes(p.id) ? 'speaking' : ''
        }`}
      >
        <span className="seat-name">
          {avatarOf(room, p.id)} {pseudoOf(room, p.id)}
          {voiceIds.includes(p.id) ? ' 🎙' : ''}
          {p.id === selfId ? ' (toi)' : ''}
        </span>
        <span className="seat-tiles">
          {Array.from({ length: p.tileCount }, (_, i) => (
            <DominoBack key={i} />
          ))}
        </span>
        {p.hand && spy && (
          <span className="spy-hand">
            {p.hand.map((t, i) => (
              <span key={i} className={`spy-slot ${frozenOf(t) ? 'frozen' : ''}`}>
                <DominoTile a={t.hi} b={t.lo} vertical size="sm" />
              </span>
            ))}
          </span>
        )}
      </div>
    )
  }

  return (
    <section className="game">
      {currentRedeal && (
        <div className="redeal-banner">
          <h3>🁡 Donne annulée !</h3>
          <div className="redeal-item">
            <p>
              <b>{pseudoOf(room, currentRedeal.culpritId)}</b> avait{' '}
              <b>{currentRedeal.doublesCount} doubles</b> — donne annulée :
            </p>
            <div className="redeal-hands">
              {currentRedeal.hands.map((h) => (
                <div
                  key={h.id}
                  className={`redeal-hand ${h.id === currentRedeal.culpritId ? 'culprit' : ''}`}
                >
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
          {room.members.find((m) => m.id === selfId)?.isHost ? (
            <button className="btn" onClick={onRedeal}>
              🔀 Redistribuer
            </button>
          ) : (
            <p className="empty">En attente que l’hôte redistribue…</p>
          )}
        </div>
      )}

      <div className="table-arena">
        <div className="arena-top">{arenaSpots.top.map(renderSeat)}</div>
        <div className="arena-left">{arenaSpots.left.map(renderSeat)}</div>
        <div className="arena-right">{arenaSpots.right.map(renderSeat)}</div>
        <div className="arena-bottom">{arenaSpots.bottom.map(renderSeat)}</div>

        <div className={`arena-felt table-felt ${shaking ? 'slam-shake' : ''}`}>
        <div className="board-wrap" ref={boardRef}>
          {game.line.length === 0 ? (
            <p
              className={`felt-hint ${activeTile ? 'drop-target' : ''}`}
              data-drop-end={activeTile ? 'right' : undefined}
            >
              {game.status === 'redeal'
                ? 'Donne annulée — redistribution à venir 🔀'
                : myTurn
                  ? 'À toi l’ouverture !'
                  : 'La table attend l’ouverture…'}
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
              const frozen = (you.frozen ?? []).some((f) => sameTile(f, tile))
              return (
                <span
                  key={i}
                  className={`hand-slot ${frozen ? 'frozen' : ''}`}
                  title={frozen ? 'Gelé — tu as passé librement dessus, il reste en main' : undefined}
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
                  {frozen && <span className="frozen-mark">🧊</span>}
                </span>
              )
            })}
            {game.status === 'playing' && (
              <button
                className={`btn sm slam-btn ${slamArmed ? 'armed' : ''}`}
                onClick={() => setSlamArmed((v) => !v)}
                title="Rabats ton prochain domino de toutes tes forces — tout le salon entendra le CLAC"
              >
                💥 {slamArmed ? 'Prêt à claquer !' : 'Claquer'}
              </button>
            )}
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
            {game.status === 'redeal'
              ? 'Donne annulée — redistribution en attente 🔀'
              : game.status === 'finished'
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
