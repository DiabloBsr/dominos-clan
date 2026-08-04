import { useEffect, useMemo, useRef, useState } from 'react'
import { ludoLegalPawns, ludoSafeCells, ludoStarCells, ludoStartCell, type LudoState } from '@dominos-clan/engine'
import type { RoomView } from '@dominos-clan/engine'

type LudoPawnPos = LudoState['players'][number]['pawns'][number]

/** Piste de 52 cases → (ligne, colonne) sur la grille 15×15 (coin 0 en haut-gauche). */
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

/** Rotation de la flèche d'entrée de chaque coin (sens de la marche). */
const START_ARROWS = [0, 90, 180, 270]

/** Couleurs du plateau CLASSIQUE (modèle de référence du user) :
 *  coin haut-gauche rouge, haut-droit vert, bas-droit jaune, bas-gauche bleu. */
export const LUDO_COLORS = ['#e02b2b', '#28a24c', '#f5c518', '#1f7fe0']
const CELL = 100 / 15

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
}

/** Pion « épingle » façon jeu de société : tête ronde + corps conique + socle. */
function PawnPin({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 48" className="pawn-svg" aria-hidden="true">
      <ellipse cx="20" cy="43.5" rx="12" ry="3.6" fill="rgba(0,0,0,0.25)" stroke="none" />
      <path
        d="M20 14 C12 24 9 32 9 38 C9 42 14 44 20 44 C26 44 31 42 31 38 C31 32 28 24 20 14 Z"
        fill={color}
        stroke="#241f18"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="10.5" r="7.5" fill={color} stroke="#241f18" strokeWidth="1.6" />
      <circle cx="17" cy="8" r="2.4" fill="rgba(255,255,255,0.75)" stroke="none" />
    </svg>
  )
}

/** Dé animé : culbute + faces au hasard, puis se pose sur le résultat. */
const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DieFace({ value }: { value: number }) {
  return (
    <span className="die3d-face" data-face={value}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`die-pip ${DIE_PIPS[value]!.includes(i) ? 'on' : ''}`} />
      ))}
    </span>
  )
}

/** Dé 3D : cube ivoire qui culbute et rebondit, puis se pose en ressort. */
function Die({ value, animKey }: { value: number; animKey: number }) {
  const [rolling, setRolling] = useState(true)
  useEffect(() => {
    setRolling(true)
    const settle = setTimeout(() => setRolling(false), 850)
    return () => clearTimeout(settle)
  }, [animKey, value])
  return (
    <span className={`die3d-scene ${rolling ? 'rolling' : 'settled'}`} aria-label={`Dé : ${value}`}>
      <span className="die3d" data-value={value}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <DieFace key={f} value={f} />
        ))}
      </span>
      <span className="die3d-shadow" />
    </span>
  )
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

  // Le dé AFFICHÉ survit au dé serveur : quand rien n'est jouable, le serveur
  // passe le tour et remet dice à null immédiatement — sans ça, la culbute
  // n'aurait jamais le temps d'être vue ni le résultat d'être lu.
  const [shownDie, setShownDie] = useState<{ value: number; key: number } | null>(null)
  const dieHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (state.dice !== null) {
      if (dieHideTimer.current) {
        clearTimeout(dieHideTimer.current)
        dieHideTimer.current = null
      }
      const value = state.dice
      setShownDie((prev) => ({ value, key: (prev?.key ?? 0) + 1 }))
    } else {
      dieHideTimer.current = setTimeout(() => setShownDie(null), 1600)
    }
  }, [state.dice])

  const stars = ludoStarCells()
  const starts = [0, 1, 2, 3].map(ludoStartCell)
  const safes = useMemo(() => ludoSafeCells(), [])

  const pos = (row: number, col: number) => ({ top: `${row * CELL}%`, left: `${col * CELL}%` })

  const gridOf = (slot: number, pawnIndex: number, pawn: LudoPawnPos): [number, number] => {
    if (pawn.zone === 'base') return BASE_SLOTS[slot]![pawnIndex]!
    if (pawn.zone === 'track') return TRACK[pawn.cell]!
    if (pawn.zone === 'home') return HOME[slot]![pawn.step]!
    return [6.55 + slot * 0.55, 6.55 + pawnIndex * 0.45]
  }

  // ── Sautillement case par case : file d'étapes + rebond visible ──
  const relOfPawn = (slot: number, pawn: LudoPawnPos): number | null => {
    if (pawn.zone === 'track') return (pawn.cell - ludoStartCell(slot) + 52) % 52
    if (pawn.zone === 'home') return 52 + pawn.step
    if (pawn.zone === 'done') return 57
    return null
  }

  const pawnAtRel = (slot: number, rel: number): LudoPawnPos =>
    rel < 52
      ? { zone: 'track', cell: (ludoStartCell(slot) + rel) % 52 }
      : rel < 57
        ? { zone: 'home', step: rel - 52 }
        : { zone: 'done' }

  const prevPawns = useRef<Map<string, LudoPawnPos>>(new Map())
  const queues = useRef<Map<string, Array<[number, number]>>>(new Map())
  const [display, setDisplay] = useState<Record<string, [number, number]>>({})
  const [moving, setMoving] = useState<Set<string>>(new Set())

  useEffect(() => {
    const next = new Map<string, LudoPawnPos>()
    state.players.forEach((player, pi) =>
      player.pawns.forEach((pawn, pwi) => {
        const key = `${pi}-${pwi}`
        next.set(key, pawn)
        const prev = prevPawns.current.get(key)
        if (!prev || JSON.stringify(prev) === JSON.stringify(pawn)) return
        const fromRel = relOfPawn(player.slot, prev)
        const toRel = relOfPawn(player.slot, pawn)
        if (fromRel !== null && toRel !== null && toRel > fromRel && toRel - fromRel <= 12) {
          const path: Array<[number, number]> = []
          for (let r = fromRel + 1; r <= toRel; r++) path.push(gridOf(player.slot, pwi, pawnAtRel(player.slot, r)))
          queues.current.set(key, path)
        } else {
          queues.current.set(key, [gridOf(player.slot, pwi, pawn)])
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
      const nowMoving = new Set([...queues.current.keys(), ...Object.keys(updates)])
      setMoving((prev) =>
        prev.size === nowMoving.size && [...prev].every((k) => nowMoving.has(k)) ? prev : nowMoving,
      )
      if (Object.keys(updates).length > 0) setDisplay((prev) => ({ ...prev, ...updates }))
    }, 230)
    return () => clearInterval(timer)
  }, [])

  const pawnPos = (slot: number, key: string, pawnIndex: number, pawn: LudoPawnPos) => {
    const shown = display[key] ?? gridOf(slot, pawnIndex, pawn)
    return pos(shown[0], shown[1])
  }

  const grid = (r: number, c: number, spanR = 1, spanC = 1) => ({
    gridRow: `${r + 1} / span ${spanR}`,
    gridColumn: `${c + 1} / span ${spanC}`,
  })

  return (
    <section className="game ludo-game">
      <div className="ludo-players">
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={`seat-chip ludo-chip ${state.turn === i && state.status === 'playing' ? 'turn' : ''} ${
              speaking.includes(p.id) ? 'speaking' : ''
            }`}
            style={{ ['--pc' as string]: LUDO_COLORS[p.slot] }}
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

      <div className="ludo-frame">
      <div className="ludo-board">
        {BASE_ZONES.map(([r, c], slot) => (
          <div key={slot} className="ludo-base" style={{ ...grid(r, c, 6, 6), ['--pc' as string]: LUDO_COLORS[slot] }}>
            <div className="ludo-base-inner" />
          </div>
        ))}

        <div className="ludo-goal" style={grid(6, 6, 3, 3)} />

        {TRACK.map(([r, c], cell) => {
          const startOwner = starts.indexOf(cell)
          return (
            <div
              key={cell}
              className={`ludo-cell ${startOwner >= 0 ? 'start' : ''}`}
              style={{ ...grid(r, c), ['--pc' as string]: startOwner >= 0 ? LUDO_COLORS[startOwner] : undefined }}
            >
              {startOwner >= 0 && (
                <span className="ludo-arrow" style={{ transform: `rotate(${START_ARROWS[startOwner]}deg)` }}>
                  ➤
                </span>
              )}
              {startOwner < 0 && stars.includes(cell) && <span className="ludo-star">★</span>}
              {state.rules.bonusMode && state.bonusCells.includes(cell) && !safes.includes(cell) && (
                <span className="ludo-gift">🎁</span>
              )}
            </div>
          )
        })}

        {HOME.map((column, slot) =>
          column.map(([r, c], step) => (
            <div
              key={`${slot}-${step}`}
              className="ludo-cell home-lane"
              style={{ ...grid(r, c), ['--pc' as string]: LUDO_COLORS[slot] }}
            />
          )),
        )}

        <div className="ludo-overlay">
          {BASE_SLOTS.map((slots, slot) =>
            slots.map(([r, c], si) => (
              <span
                key={`${slot}-${si}`}
                className="ludo-ring"
                style={{ ...pos(r, c), ['--pc' as string]: LUDO_COLORS[slot] }}
              />
            )),
          )}

          {state.players.map((player, pi) =>
            player.pawns.map((pawn, pwi) => {
              const key = `${pi}-${pwi}`
              const mine = pi === myIndex
              const playable = mine && legal.includes(pwi) && !targeting
              const targetable = targeting && !mine && pawn.zone === 'track'
              return (
                <button
                  key={key}
                  className={`ludo-pawn ${playable ? 'playable' : ''} ${targetable ? 'targetable' : ''} ${
                    moving.has(key) ? 'moving' : ''
                  }`}
                  style={pawnPos(player.slot, key, pwi, pawn)}
                  disabled={!playable && !targetable}
                  onClick={() => {
                    if (targetable) onTarget(pi, pwi)
                    else if (playable) onPlay(pwi)
                  }}
                >
                  <PawnPin color={LUDO_COLORS[player.slot]!} />
                </button>
              )
            }),
          )}
        </div>

        {shownDie && state.status === 'playing' && (
          <div className="ludo-die-spot">
            <Die value={shownDie.value} animKey={shownDie.key} />
          </div>
        )}
      </div>
      </div>

      <div className="ludo-hud">
        {state.status === 'playing' && (
          <>

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
              <span className="turn-hint">Au tour de {pseudoOf(room, state.players[state.turn]!.id)}…</span>
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
