import { useEffect, useMemo, useRef, useState } from 'react'
import { ludoLegalPawns, ludoSafeCells, ludoStarCells, ludoStartCell, type LudoState } from '@dominos-clan/engine'
import type { RoomView } from '@dominos-clan/engine'
import { playBonusPickup, playCapture, playDiceRoll, playGoal, playHop } from '../sounds'

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

/** Pions ARRIVÉS : en éventail dans le triangle central de LEUR couleur. */
function doneSpot(slot: number, pawnIndex: number): [number, number] {
  const spread = 6.28 + pawnIndex * 0.49
  if (slot === 0) return [spread, 6.04] // triangle gauche (rouge)
  if (slot === 1) return [6.04, spread] // triangle haut (vert)
  if (slot === 2) return [spread, 7.96] // triangle droit (jaune)
  return [7.96, spread] // triangle bas (bleu)
}

/** Couleurs du plateau CLASSIQUE (modèle de référence du user) :
 *  coin haut-gauche rouge, haut-droit vert, bas-droit jaune, bas-gauche bleu. */
export const LUDO_COLORS = ['#e02b2b', '#28a24c', '#f5c518', '#1f7fe0']

/** Cris de chambrage à la capture — tiré au hasard, plein écran. */
const CAPTURE_TAUNTS = [
  '😂 AO ZAO EEEE !',
  '🤣 MIPIAKY !',
  '😆 REKO !',
  '💀 AO ZAO EEEE !',
  '😈 MIPIAKY !',
  '🔥 REKO !',
]

/** Logo + libellé de chaque type de bonus — discernable d'un coup d'œil. */
const BONUS_ICONS: Record<string, { icon: string; label: string }> = {
  reroll: { icon: '🎲', label: 'Deuxième lancer' },
  boost: { icon: '🚀', label: 'Saut bonus (1 à 6)' },
  prison: { icon: '🚔', label: 'Prison pour un pion adverse' },
  shield: { icon: '🛡️', label: 'Bouclier (annule une capture)' },
  swap: { icon: '🔁', label: 'Échange de positions' },
  star: { icon: '🌟', label: 'Téléport vers la prochaine étoile' },
  mystery: { icon: '❓', label: 'Bonus mystère' },
}

/** Machine à sous du Saut bonus : 3 rouleaux qui défilent 1-6 et s'arrêtent
 *  en cascade sur le MÊME résultat — pur plaisir des yeux. */
function SlotFx({ value }: { value: number }) {
  const digits = [...[1, 2, 3, 4, 5, 6], ...[1, 2, 3, 4, 5, 6], ...[1, 2, 3, 4, 5, 6], value]
  const [go, setGo] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGo(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="ludo-slot" role="status" aria-label={`Saut bonus : ${value}`}>
      <div className="slot-title">🚀 SAUT BONUS&nbsp;!</div>
      <div className="slot-reels">
        {[0, 1, 2].map((reel) => (
          <div key={reel} className="slot-reel">
            <div
              className="slot-strip"
              style={{
                transitionDuration: `${1.05 + reel * 0.4}s`,
                transform: go ? `translateY(calc(-${digits.length - 1} * var(--digit)))` : 'none',
              }}
            >
              {digits.map((d, i) => (
                <span key={i} className="slot-digit">
                  {d}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
const CELL = 100 / 15

const pos = (row: number, col: number) => ({ top: `${row * CELL}%`, left: `${col * CELL}%` })

const grid = (r: number, c: number, spanR = 1, spanC = 1) => ({
  gridRow: `${r + 1} / span ${spanR}`,
  gridColumn: `${c + 1} / span ${spanC}`,
})

/** Plateau Ludo STATIQUE (lobby) : la table du jeu, sans pions ni état. */
export function LudoLobbyBoard() {
  const stars = ludoStarCells()
  const starts = [0, 1, 2, 3].map(ludoStartCell)
  return (
    <div className="ludo-board" aria-hidden="true">
      {BASE_ZONES.map(([r, c], slot) => (
        <div
          key={slot}
          className="ludo-base"
          style={{ ...grid(r, c, 6, 6), ['--pc' as string]: LUDO_COLORS[slot] }}
        >
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
      </div>
    </div>
  )
}

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

/** Dé 3D : cube ivoire qui culbute et rebondit, puis se pose en ressort.
 *  animKey=0 = affichage statique (pas de culbute au montage). */
function Die({ value, animKey }: { value: number; animKey: number }) {
  const [rolling, setRolling] = useState(false)
  useEffect(() => {
    if (animKey === 0) return
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
  roll,
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
  /** Dernier tirage diffusé par le serveur (survit aux tirages consommés). */
  roll: { player: number; value: number; key: number } | null
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

  // Chaque case de dé garde LA DERNIÈRE face tirée de son joueur, en
  // permanence. La valeur arrive par l'événement serveur ludo:rolled (le
  // state seul ne suffit pas : un tirage sans coup jouable est consommé et
  // le tour passé dans le même broadcast).
  const [lastRolls, setLastRolls] = useState<Record<number, { value: number; key: number }>>({})
  // La case du lanceur reste VIVE le temps de la culbute + lecture du
  // résultat (~2 s), même si le tour est déjà passé — elle ne devient
  // grisâtre qu'APRÈS l'affichage du résultat.
  const [freshRoll, setFreshRoll] = useState<number | null>(null)
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Retenue d'animation : les pions ne bougent qu'après la face affichée. */
  const animHoldUntil = useRef(0)
  /** Le prochain lancer n'est disponible qu'une fois TOUTES les animations
   *  finies (face affichée, pions arrivés, machine à sous, recul…). */
  const [rollHold, setRollHold] = useState(false)
  /** Seq du dernier bonus déjà intégré aux files d'animation. */
  const animBonusSeq = useRef(0)
  // Le tirage déjà présent AU MONTAGE date d'une partie précédente : on
  // l'ignore, sinon un dé culbute tout seul au départ sans avoir cliqué.
  const staleRollKey = useRef(roll?.key ?? null)
  useEffect(() => {
    if (!roll || roll.key === staleRollKey.current) return
    setLastRolls((prev) => ({ ...prev, [roll.player]: { value: roll.value, key: roll.key } }))
    animHoldUntil.current = Date.now() + 1000
    playDiceRoll()
    // Le lancer SUIVANT attend la fin de TOUTE la séquence (relâché par le
    // ticker d'animation quand plus rien n'est en file).
    setRollHold(true)
    setFreshRoll(roll.player)
    if (freshTimer.current) clearTimeout(freshTimer.current)
    freshTimer.current = setTimeout(() => setFreshRoll(null), 2100)
  }, [roll])
  // Reprise en cours de partie : le dé déjà tiré s'affiche sans culbute.
  useEffect(() => {
    if (state.dice !== null) {
      const value = state.dice
      const player = state.turn
      setLastRolls((prev) => (prev[player] ? prev : { ...prev, [player]: { value, key: 0 } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stars = ludoStarCells()
  const starts = [0, 1, 2, 3].map(ludoStartCell)
  const safes = useMemo(() => ludoSafeCells(), [])

  const gridOf = (slot: number, pawnIndex: number, pawn: LudoPawnPos): [number, number] => {
    if (pawn.zone === 'base') return BASE_SLOTS[slot]![pawnIndex]!
    if (pawn.zone === 'track') return TRACK[pawn.cell]!
    if (pawn.zone === 'home') return HOME[slot]![pawn.step]!
    // Pion ARRIVÉ : rangé dans le triangle central de SA couleur.
    return doneSpot(slot, pawnIndex)
  }

  // ── Sautillement case par case : file d'étapes + rebond visible ──
  // Couloir à rel 51 (51 cases de piste), arrivée à rel 56 — aligné moteur.
  const relOfPawn = (slot: number, pawn: LudoPawnPos): number | null => {
    if (pawn.zone === 'track') return (pawn.cell - ludoStartCell(slot) + 52) % 52
    if (pawn.zone === 'home') return 51 + pawn.step
    if (pawn.zone === 'done') return 56
    return null
  }

  const pawnAtRel = (slot: number, rel: number): LudoPawnPos =>
    rel < 51
      ? { zone: 'track', cell: (ludoStartCell(slot) + rel) % 52 }
      : rel < 56
        ? { zone: 'home', step: rel - 51 }
        : { zone: 'done' }

  const prevPawns = useRef<Map<string, LudoPawnPos>>(new Map())
  /** File d'étapes par pion — `null` = tick d'attente (séquencement). */
  const queues = useRef<Map<string, Array<[number, number] | null>>>(new Map())
  const [display, setDisplay] = useState<Record<string, [number, number]>>({})
  const [moving, setMoving] = useState<Set<string>>(new Set())
  /** Pions capturés en cours de RETOUR : ils GLISSENT (pas de sautillement). */
  const slidingKeys = useRef<Set<string>>(new Set())

  useEffect(() => {
    // 1er passage : compter les capturés de cette mise à jour (piste → base).
    // UN seul capturé → il RECULE tout son parcours case par case ; plusieurs
    // (2-4 pions sur la même case) → retour direct en prison, règle du user.
    const capturedKeys: string[] = []
    state.players.forEach((player, pi) =>
      player.pawns.forEach((pawn, pwi) => {
        const prev = prevPawns.current.get(`${pi}-${pwi}`)
        if (prev && prev.zone === 'track' && pawn.zone === 'base') capturedKeys.push(`${pi}-${pwi}`)
      }),
    )
    if (capturedKeys.length > 0) {
      playCapture()
      captureKey.current += 1
      setCaptureFx({
        key: captureKey.current,
        text: CAPTURE_TAUNTS[Math.floor(Math.random() * CAPTURE_TAUNTS.length)]!,
      })
      const key = captureKey.current
      setTimeout(() => setCaptureFx((prev) => (prev?.key === key ? null : prev)), 3100)
    }
    // 🏁 Un pion vient d'atteindre l'objectif : mini-fanfare.
    let reachedGoal = false
    state.players.forEach((player, pi) =>
      player.pawns.forEach((pawn, pwi) => {
        const prev = prevPawns.current.get(`${pi}-${pwi}`)
        if (prev && prev.zone !== 'done' && pawn.zone === 'done') reachedGoal = true
      }),
    )
    if (reachedGoal) playGoal()

    // Les pas s'AJOUTENT à la file en cours (jamais d'écrasement) : si une
    // animation tourne encore quand l'état suivant arrive, le pion enchaîne
    // sans téléportation ni pas perdus.
    const append = (key: string, path: Array<[number, number] | null>) =>
      queues.current.set(key, [...(queues.current.get(key) ?? []), ...path])

    // 🚀 Saut bonus ramassé pendant CE coup : le pion s'arrête sur la case
    // bonus, la machine à sous tourne, PUIS le saut s'anime.
    const lb = state.lastBonus
    const bonusNow =
      lb && lb.kind === 'boost' && lb.value !== null && lb.seq !== animBonusSeq.current ? lb : null
    animBonusSeq.current = lb?.seq ?? animBonusSeq.current

    const SLOT_TICKS = 10 // ≈ 2,3 s de machine à sous
    let maxForwardTicks = 0
    const slidingPaths: Array<{ key: string; path: Array<[number, number] | null> }> = []

    const next = new Map<string, LudoPawnPos>()
    state.players.forEach((player, pi) =>
      player.pawns.forEach((pawn, pwi) => {
        const key = `${pi}-${pwi}`
        next.set(key, pawn)
        const prev = prevPawns.current.get(key)
        if (!prev || JSON.stringify(prev) === JSON.stringify(pawn)) return
        const fromRel = relOfPawn(player.slot, prev)
        const toRel = relOfPawn(player.slot, pawn)
        if (
          capturedKeys.length === 1 &&
          capturedKeys[0] === key &&
          prev.zone === 'track' &&
          fromRel !== null
        ) {
          // Marche arrière : tout le chemin parcouru depuis la sortie,
          // puis retour au box (pas de 2 cases au-delà de 14 pour le rythme).
          const path: Array<[number, number] | null> = []
          const stride = fromRel > 14 ? 2 : 1
          for (let r = fromRel - stride; r > 0; r -= stride) {
            path.push(gridOf(player.slot, pwi, pawnAtRel(player.slot, r)))
          }
          path.push(gridOf(player.slot, pwi, pawnAtRel(player.slot, 0)))
          path.push(gridOf(player.slot, pwi, pawn))
          slidingKeys.current.add(key)
          slidingPaths.push({ key, path }) // démarré APRÈS l'arrivée du capteur
        } else if (fromRel !== null && toRel !== null && toRel > fromRel && toRel - fromRel <= 12) {
          const path: Array<[number, number] | null> = []
          const boostSplit =
            bonusNow && bonusNow.playerIndex === pi && roll && roll.player === pi
              ? fromRel + roll.value
              : null
          for (let r = fromRel + 1; r <= toRel; r++) {
            path.push(gridOf(player.slot, pwi, pawnAtRel(player.slot, r)))
            // Pause machine à sous sur la case bonus, puis le saut reprend.
            if (boostSplit !== null && r === boostSplit && r < toRel) {
              for (let w = 0; w < SLOT_TICKS; w++) path.push(null)
            }
          }
          maxForwardTicks = Math.max(maxForwardTicks, path.length)
          append(key, path)
        } else {
          maxForwardTicks = Math.max(maxForwardTicks, 1)
          append(key, [gridOf(player.slot, pwi, pawn)])
        }
      }),
    )
    // Le recul du capturé ne COMMENCE qu'une fois le capteur arrivé.
    for (const { key, path } of slidingPaths) {
      append(key, [...Array.from({ length: maxForwardTicks }, () => null), ...path])
    }
    prevPawns.current = next
  }, [state])

  // Cri de chambrage plein écran à chaque capture (aléatoire).
  const [captureFx, setCaptureFx] = useState<{ key: number; text: string } | null>(null)
  const captureKey = useRef(0)

  // Machine à sous du Saut bonus : déclenchée par lastBonus (seq).
  const [slotFx, setSlotFx] = useState<{ value: number; seq: number } | null>(null)
  const slotSeq = useRef(0)
  const slotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const lb = state.lastBonus
    if (!lb || lb.seq === slotSeq.current) return
    slotSeq.current = lb.seq
    playBonusPickup()
    if (lb.kind === 'boost' && lb.value !== null) {
      setSlotFx({ value: lb.value, seq: lb.seq })
      if (slotTimer.current) clearTimeout(slotTimer.current)
      slotTimer.current = setTimeout(() => setSlotFx(null), 3400)
    }
  }, [state.lastBonus])

  useEffect(() => {
    const timer = setInterval(() => {
      // Les pions attendent la fin de la culbute du dé : le déplacement ne
      // démarre qu'APRÈS l'affichage de la face tirée.
      if (Date.now() < animHoldUntil.current) return
      // Plus rien à animer et face affichée → le lancer suivant se débloque.
      if (queues.current.size === 0) {
        setRollHold((held) => (held ? false : held))
        return
      }
      const updates: Record<string, [number, number]> = {}
      for (const [key, queue] of [...queues.current.entries()]) {
        const step = queue.shift()
        if (step) updates[key] = step
        if (queue.length === 0) {
          queues.current.delete(key)
          slidingKeys.current.delete(key)
        }
      }
      const nowMoving = new Set([...queues.current.keys(), ...Object.keys(updates)])
      setMoving((prev) =>
        prev.size === nowMoving.size && [...prev].every((k) => nowMoving.has(k)) ? prev : nowMoving,
      )
      if (Object.keys(updates).length > 0) {
        // Le tic ne joue que pour les SAUTS — la glissade du retour est muette.
        if (Object.keys(updates).some((k) => !slidingKeys.current.has(k))) playHop()
        setDisplay((prev) => ({ ...prev, ...updates }))
      }
    }, 230)
    return () => clearInterval(timer)
  }, [])

  const pawnPos = (slot: number, key: string, pawnIndex: number, pawn: LudoPawnPos) => {
    const shown = display[key] ?? gridOf(slot, pawnIndex, pawn)
    return pos(shown[0], shown[1])
  }

  return (
    <section className="game ludo-game">
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
              {(() => {
                if (!state.rules.bonusMode || safes.includes(cell)) return null
                const bonus = state.bonusCells.find((b) => b.cell === cell)
                if (!bonus) return null
                const meta = BONUS_ICONS[bonus.kind] ?? BONUS_ICONS.mystery!
                return (
                  <span className="ludo-gift" title={meta.label}>
                    {meta.icon}
                  </span>
                )
              })()}
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
                    moving.has(key) ? (slidingKeys.current.has(key) ? 'sliding' : 'moving') : ''
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

        {/* Plaque nominative de chaque joueur, ancrée au coin de SA base,
            + sa case de lancé de dé au coin intérieur (vers le centre). */}
        {state.players.map((p, i) => {
          const mine = p.id === selfId
          const isTurn = state.turn === i && state.status === 'playing'
          const canTapRoll = isTurn && mine && state.dice === null && !targeting && !rollHold
          return (
            <div key={`corner-${p.id}`}>
              <div
                className={`ludo-plate slot-${p.slot} ${isTurn ? 'turn' : ''} ${
                  speaking.includes(p.id) ? 'speaking' : ''
                }`}
                style={{ ['--pc' as string]: LUDO_COLORS[p.slot] }}
              >
                <span className="ludo-dot" />
                <span className="plate-name">
                  {avatarOf(room, p.id)} {pseudoOf(room, p.id)}
                  {voiceIds.includes(p.id) ? ' 🎙' : ''}
                  {mine ? ' (toi)' : ''}
                  {p.shield ? ' 🛡' : ''}
                </span>
                <span className="plate-done">
                  {p.pawns.filter((pw) => pw.zone === 'done').length}/4 🏁
                </span>
              </div>
              <button
                className={`ludo-tray slot-${p.slot} ${
                  isTurn || freshRoll === i ? 'active' : 'idle'
                } ${canTapRoll ? 'rollable' : ''}`}
                style={{ ['--pc' as string]: LUDO_COLORS[p.slot] }}
                disabled={!canTapRoll}
                title={canTapRoll ? 'Tape pour lancer le dé !' : undefined}
                onClick={canTapRoll ? onRoll : undefined}
              >
                <Die value={lastRolls[i]?.value ?? 6} animKey={lastRolls[i]?.key ?? 0} />
              </button>
            </div>
          )
        })}
      </div>
      </div>

      {slotFx && <SlotFx key={slotFx.seq} value={slotFx.value} />}

      {captureFx && (
        <div className="slam-fx capture-fx" key={captureFx.key}>
          {captureFx.text}
        </div>
      )}

      <div className="ludo-hud">
        {state.status === 'playing' && (
          <>
            {myTurn && state.dice === null && !targeting && (
              <span className="turn-hint live">🎲 À toi — tape ta case de dé !</span>
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
