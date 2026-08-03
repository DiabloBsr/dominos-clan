import { useEffect, useRef, useState } from 'react'
import {
  LUDO_BONUS_CELLS,
  ludoLegalPawns,
  ludoStarCells,
  ludoStartCell,
  type LudoState,
} from '@dominos-clan/engine'
import type { RoomView } from '@dominos-clan/engine'

type LudoPawnPos = LudoState['players'][number]['pawns'][number]

const CELL = 100 / 15 // % d'une case de la grille 15×15

/** Piste de 52 cases → coordonnées (ligne, colonne) sur la grille 15×15. */
const TRACK: Array<[number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
]

const HOME: Array<Array<[number, number]>> = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
]

const BASE_SLOTS: Array<Array<[number, number]>> = [
  [[2, 2], [2, 3], [3, 2], [3, 3]],
  [[2, 11], [2, 12], [3, 11], [3, 12]],
  [[11, 11], [11, 12], [12, 11], [12, 12]],
  [[11, 2], [11, 3], [12, 2], [12, 3]],
]

const BASE_ZONES: Array<[number, number]> = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
]

export const LUDO_COLORS = ['#e2574c', '#4d9de0', '#ffb648', '#7ee0a3']
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
}

export function LudoBoard({
  state,
  room,
  selfId,
  isHost,
  onRoll,
  onPlay,
  onTarget,
  onStart,
  voiceIds,
  speaking,
}: {
  state: LudoState
  room: RoomView
  selfId: string
  isHost: boolean
  onRoll: () => void
  onPlay: (pawn: number) => void
  onTarget: (player: number, pawn: number) => void
  onStart: () => void
  voiceIds: string[]
  speaking: string[]
}) {
  const myIndex = state.players.findIndex((p) => p.id === selfId)
  const myTurn = myIndex >= 0 && state.turn === myIndex && state.status === 'playing'
  const targeting = state.pendingBonus !== null && state.pendingBonus.playerIndex === myIndex
  const legal = myTurn && state.dice !== null ? ludoLegalPawns(state, myIndex) : []

  // Animation du dé à chaque nouveau lancer.
  const [diceAnim, setDiceAnim] = useState(0)
  useEffect(() => {
    if (state.dice !== null) setDiceAnim((n) => n + 1)
  }, [state.dice])

  const stars = ludoStarCells()
  const starts = [0, 1, 2, 3].map(ludoStartCell)

  const pos = (row: number, col: number) => ({
    top: `${row * CELL}%`,
    left: `${col * CELL}%`,
  })

  /** Coordonnées (ligne, colonne) d'un pion sur la grille. */
  const gridOf = (playerIndex: number, pawnIndex: number, pawn: LudoPawnPos): [number, number] => {
    if (pawn.zone === 'base') return BASE_SLOTS[playerIndex]![pawnIndex]!
    if (pawn.zone === 'track') return TRACK[pawn.cell]!
    if (pawn.zone === 'home') return HOME[playerIndex]![pawn.step]!
    return [6.6 + playerIndex * 0.5, 6.6 + pawnIndex * 0.4]
  }

  // ── Saut case par case : on anime les positions intermédiaires du chemin ──
  const relOfPawn = (playerIndex: number, pawn: LudoPawnPos): number | null => {
    if (pawn.zone === 'track') return (pawn.cell - ludoStartCell(playerIndex) + 52) % 52
    if (pawn.zone === 'home') return 52 + pawn.step
    if (pawn.zone === 'done') return 57
    return null
  }

  const pawnAtRel = (playerIndex: number, rel: number): LudoPawnPos =>
    rel < 52
      ? { zone: 'track', cell: (ludoStartCell(playerIndex) + rel) % 52 }
      : rel < 57
        ? { zone: 'home', step: rel - 52 }
        : { zone: 'done' }

  const prevPawns = useRef<Map<string, LudoPawnPos>>(new Map())
  const queues = useRef<Map<string, Array<[number, number]>>>(new Map())
  const [display, setDisplay] = useState<Record<string, [number, number]>>({})

  useEffect(() => {
    const next = new Map<string, LudoPawnPos>()
    state.players.forEach((player, pi) =>
      player.pawns.forEach((pawn, pwi) => {
        const key = `${pi}-${pwi}`
        next.set(key, pawn)
        const prev = prevPawns.current.get(key)
        if (!prev || JSON.stringify(prev) === JSON.stringify(pawn)) return
        const fromRel = relOfPawn(pi, prev)
        const toRel = relOfPawn(pi, pawn)
        // En avant sur son chemin → une étape par case ; sinon (sortie,
        // capture, échange, prison…) → un seul saut direct.
        if (fromRel !== null && toRel !== null && toRel > fromRel && toRel - fromRel <= 12) {
          const path: Array<[number, number]> = []
          for (let r = fromRel + 1; r <= toRel; r++) path.push(gridOf(pi, pwi, pawnAtRel(pi, r)))
          queues.current.set(key, path)
        } else {
          queues.current.set(key, [gridOf(pi, pwi, pawn)])
        }
      }),
    )
    prevPawns.current = next
  }, [state])

  useEffect(() => {
    const timer = setInterval(() => {
      const updates: Record<string, [number, number]> = {}
      for (const [key, queue] of [...queues.current.entries()]) {
        const step = queue.shift()
        if (step) updates[key] = step
        if (queue.length === 0) queues.current.delete(key)
      }
      if (Object.keys(updates).length > 0) setDisplay((prev) => ({ ...prev, ...updates }))
    }, 200)
    return () => clearInterval(timer)
  }, [])

  const pawnPos = (playerIndex: number, pawnIndex: number, pawn: LudoPawnPos) => {
    const shown = display[`${playerIndex}-${pawnIndex}`] ?? gridOf(playerIndex, pawnIndex, pawn)
    return pos(shown[0], shown[1])
  }

  return (
    <section className="game ludo-game">
      <div className="ludo-players">
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={`seat-chip ludo-chip ${state.turn === i && state.status === 'playing' ? 'turn' : ''} ${
              speaking.includes(p.id) ? 'speaking' : ''
            }`}
            style={{ ['--pc' as string]: LUDO_COLORS[i] }}
          >
            <span className="ludo-dot" />
            <span className="seat-name">
              {avatarOf(room, p.id)} {pseudoOf(room, p.id)}
              {voiceIds.includes(p.id) ? ' 🎙' : ''}
              {p.id === selfId ? ' (toi)' : ''}
              {p.shield ? ' 🛡' : ''}
            </span>
            <span className="ludo-done">{p.pawns.filter((pw) => pw.zone === 'done').length}/4 🏁</span>
          </div>
        ))}
      </div>

      <div className="ludo-board">
        {BASE_ZONES.map(([r, c], i) => (
          <div
            key={i}
            className="ludo-base"
            style={{ ...pos(r, c), width: `${6 * CELL}%`, height: `${6 * CELL}%`, ['--pc' as string]: LUDO_COLORS[i] }}
          />
        ))}
        <div
          className="ludo-goal"
          style={{ ...pos(6, 6), width: `${3 * CELL}%`, height: `${3 * CELL}%` }}
        >
          🏆
        </div>

        {TRACK.map(([r, c], cell) => {
          const startOwner = starts.indexOf(cell)
          return (
            <div
              key={cell}
              className={`ludo-cell ${stars.includes(cell) ? 'star' : ''}`}
              style={{
                ...pos(r, c),
                ...(startOwner >= 0 ? { background: LUDO_COLORS[startOwner], opacity: 0.9 } : {}),
              }}
            >
              {startOwner < 0 && stars.includes(cell) && '⭐'}
              {state.rules.bonusMode && LUDO_BONUS_CELLS.includes(cell) && '🎁'}
            </div>
          )
        })}

        {HOME.map((column, playerIndex) =>
          column.map(([r, c], step) => (
            <div
              key={`${playerIndex}-${step}`}
              className="ludo-cell home"
              style={{ ...pos(r, c), ['--pc' as string]: LUDO_COLORS[playerIndex] }}
            />
          )),
        )}

        {state.players.map((player, pi) =>
          player.pawns.map((pawn, pwi) => {
            const mine = pi === myIndex
            const playable = mine && legal.includes(pwi) && !targeting
            const targetable = targeting && !mine && pawn.zone === 'track'
            return (
              <button
                key={`${pi}-${pwi}`}
                className={`ludo-pawn ${playable ? 'playable' : ''} ${targetable ? 'targetable' : ''}`}
                style={{ ...pawnPos(pi, pwi, pawn), ['--pc' as string]: LUDO_COLORS[pi] }}
                disabled={!playable && !targetable}
                onClick={() => {
                  if (targetable) onTarget(pi, pwi)
                  else if (playable) onPlay(pwi)
                }}
              />
            )
          }),
        )}
      </div>

      <div className="ludo-hud">
        {state.status === 'playing' && (
          <>
            {state.dice !== null && (
              <span key={diceAnim} className="ludo-dice-face">
                {DICE_FACES[state.dice - 1]}
              </span>
            )}
            {myTurn && state.dice === null && !targeting && (
              <button className="btn ludo-roll" onClick={onRoll}>
                🎲 Lancer le dé
              </button>
            )}
            {myTurn && state.dice !== null && !targeting && (
              <span className="turn-hint live">Choisis un pion à avancer !</span>
            )}
            {targeting && <span className="turn-hint live">Choisis un pion adverse 🎯</span>}
            {!myTurn && myIndex >= 0 && (
              <span className="turn-hint">
                Au tour de {pseudoOf(room, state.players[state.turn]!.id)}…
              </span>
            )}
            {myIndex < 0 && <span className="turn-hint">👀 Spectateur</span>}
          </>
        )}
        {state.lastEvent && <span className="ludo-event">{state.lastEvent}</span>}
      </div>

      {state.status === 'finished' && state.winnerId && (
        <div className="banner">
          <h2>👑 {pseudoOf(room, state.winnerId)} gagne la partie !</h2>
          <p className="rotation-note">Le gagnant reste — la file monte au prochain lancement.</p>
          {isHost && (
            <button className="btn" onClick={onStart}>
              Nouvelle partie
            </button>
          )}
        </div>
      )}
    </section>
  )
}
