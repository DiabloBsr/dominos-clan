import { useEffect, useMemo, useRef, useState } from 'react'
import { Confetti } from './Confetti'
import { PER_FAMILY, PUZZLE_FAMILIES, sceneName, sceneUrl, type FamilyKey } from '../puzzleArt'
import { playTap, playPass, playVictory } from '../sounds'

/**
 * 🧩 PUZZLE — reconstituer une scène de Madagascar, en solo.
 *
 * Le NIVEAU, c'est le nombre de pièces : 12, 24, 48 ou 96. On touche une
 * pièce de la réserve, puis sa case sur le plateau : bonne case → elle se
 * verrouille (tac !), mauvaise → elle tremble et reste en réserve. Chrono et
 * record local par scène et par niveau. Le mode duel entre amis suivra.
 */

/** Scènes DESSINÉES À LA MAIN (Madagascar) — le cœur identitaire. */
const HANDMADE = [
  { id: 'baobab', name: 'Allée des baobabs' },
  { id: 'lemurien', name: 'Maki catta' },
  { id: 'pirogue', name: 'Pirogue à balancier' },
  { id: 'cameleon', name: 'Caméléon' },
  { id: 'tsingy', name: 'Tsingy' },
  { id: 'ravinala', name: 'Ravinala au soir' },
  { id: 'dominos', name: 'La table du Clan' },
] as const

/** Une scène jouable, quelle que soit son origine. */
interface Scene {
  id: string
  name: string
  url: string
}

const HAND_SCENES: Scene[] = HANDMADE.map((s) => ({ ...s, url: `/puzzle/${s.id}.svg` }))

/** Les collections : Madagascar + 6 familles générées (60 chacune) + ta photo. */
const PACKS: Array<{ key: string; label: string; count: number }> = [
  { key: 'mada', label: '🇲🇬 Madagascar', count: HAND_SCENES.length },
  ...PUZZLE_FAMILIES.map((f) => ({ key: f.key, label: f.label, count: PER_FAMILY })),
]

const TOTAL_PUZZLES = PACKS.reduce((n, p) => n + p.count, 0)

function scenesOf(pack: string): Scene[] {
  if (pack === 'mada') return HAND_SCENES
  return Array.from({ length: PER_FAMILY }, (_, i) => ({
    id: `${pack}-${i}`,
    name: sceneName(pack as FamilyKey, i),
    url: sceneUrl(pack as FamilyKey, i),
  }))
}

const LEVELS = [
  { label: 'Découverte', cols: 4, rows: 3 },
  { label: 'Facile', cols: 6, rows: 4 },
  { label: 'Sérieux', cols: 8, rows: 6 },
  { label: 'Expert', cols: 12, rows: 8 },
] as const

type Level = (typeof LEVELS)[number]

const bestKey = (scene: string, pieces: number) => `dc:puzzle:${scene}:${pieces}`

const fmt = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Mélange déterministe suffisant pour étaler la réserve. */
function shuffled(count: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function Play({ scene, level, onBack }: { scene: Scene; level: Level; onBack: () => void }) {
  const total = level.cols * level.rows
  const [placed, setPlaced] = useState<boolean[]>(() => Array(total).fill(false))
  const [tray, setTray] = useState<number[]>(() => shuffled(total))
  const [selected, setSelected] = useState<number | null>(null)
  const [shake, setShake] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [, tick] = useState(0)
  const [record, setRecord] = useState<number | null>(() => {
    const raw = localStorage.getItem(bestKey(scene.id, total))
    return raw ? Number(raw) : null
  })

  // Chrono vivant.
  useEffect(() => {
    if (endedAt) return
    const timer = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [endedAt])

  const url = scene.url
  const done = placed.filter(Boolean).length

  const tryPlace = (cell: number) => {
    if (selected === null || endedAt) return
    if (placed[cell]) return
    if (cell !== selected) {
      // Mauvaise case : la pièce proteste, reste en réserve… et se
      // DÉSÉLECTIONNE (sinon le joueur croit viser et ne vise plus rien).
      const wrong = selected
      setShake(wrong)
      setSelected(null)
      setTimeout(() => setShake(null), 350)
      playPass()
      return
    }
    playTap()
    const nextPlaced = placed.slice()
    nextPlaced[cell] = true
    setPlaced(nextPlaced)
    setTray((t) => t.filter((p) => p !== selected))
    setSelected(null)
    if (nextPlaced.every(Boolean)) {
      const elapsed = Date.now() - startedAt
      setEndedAt(Date.now())
      playVictory()
      if (record === null || elapsed < record) {
        localStorage.setItem(bestKey(scene.id, total), String(elapsed))
        setRecord(elapsed)
      }
    }
  }

  /** Style d'une pièce : la bonne découpe de la scène. */
  const pieceStyle = (index: number, forTray: boolean) => {
    const col = index % level.cols
    const row = Math.floor(index / level.cols)
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: `${level.cols * 100}% ${level.rows * 100}%`,
      backgroundPosition: `${(col / (level.cols - 1)) * 100}% ${(row / (level.rows - 1)) * 100}%`,
      ...(forTray ? {} : {}),
    }
  }

  const elapsed = (endedAt ?? Date.now()) - startedAt

  return (
    <div className="puzzle-play">
      <div className="puzzle-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← Quitter
        </button>
        <span className="puzzle-timer">
          ⏱ {fmt(elapsed)} · {done}/{total}
          {record !== null && <span className="puzzle-best"> · 🏅 {fmt(record)}</span>}
        </span>
      </div>

      <div
        className="puzzle-board"
        style={{ ['--cols' as string]: level.cols, ['--rows' as string]: level.rows }}
      >
        {Array.from({ length: total }, (_, cell) => (
          <button
            key={cell}
            data-cell={cell}
            className={`puzzle-cell ${placed[cell] ? 'ok' : ''} ${
              selected !== null && !placed[cell] ? 'open' : ''
            }`}
            style={placed[cell] ? pieceStyle(cell, false) : undefined}
            onClick={() => tryPlace(cell)}
          />
        ))}
        {/* Filigrane de la scène pour se repérer (s'efface en Expert). */}
        {!endedAt && level.cols < 12 && (
          <div className="puzzle-ghost" style={{ backgroundImage: `url(${url})` }} />
        )}
      </div>

      {endedAt ? (
        <div className="puzzle-win">
          <Confetti />
          <p className="puzzle-win-text">
            🎉 Terminé en <b>{fmt(elapsed)}</b>
            {record === elapsed ? ' — nouveau record !' : ''}
          </p>
          <button className="btn" onClick={onBack}>
            Rejouer
          </button>
        </div>
      ) : (
        <div className="puzzle-tray">
          {tray.map((piece) => (
            <button
              key={piece}
              data-piece={piece}
              className={`puzzle-piece ${selected === piece ? 'sel' : ''} ${
                shake === piece ? 'shake' : ''
              }`}
              style={pieceStyle(piece, true)}
              onClick={() => setSelected((s) => (s === piece ? null : piece))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PuzzleGame({ onBack }: { onBack: () => void }) {
  const [pack, setPack] = useState<string | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [level, setLevel] = useState<Level | null>(null)
  const scenes = useMemo(() => (pack ? scenesOf(pack) : []), [pack])
  const records = useMemo(() => {
    const out: Record<string, string> = {}
    if (!scene) return out
    for (const l of LEVELS) {
      const raw = localStorage.getItem(bestKey(scene.id, l.cols * l.rows))
      if (raw) out[`${scene.id}:${l.cols * l.rows}`] = fmt(Number(raw))
    }
    return out
  }, [scene, level])
  const playKey = useRef(0)

  /** 📷 Ta propre photo devient un puzzle (lue en local, jamais envoyée). */
  const onPhoto = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setScene({ id: `photo-${file.size}`, name: file.name.slice(0, 28), url: String(reader.result) })
    }
    reader.readAsDataURL(file)
  }

  if (scene && level) {
    return (
      <main className="home learn">
        <Play
          key={playKey.current}
          scene={scene}
          level={level}
          onBack={() => {
            playKey.current++
            setLevel(null)
          }}
        />
      </main>
    )
  }

  return (
    <main className="home learn">
      <header className="hub-header">
        <button
          className="btn ghost sm"
          onClick={() => (scene ? setScene(null) : pack ? setPack(null) : onBack())}
        >
          ← Retour
        </button>
        <h1 className="wordmark small">
          🧩 Puz<span>zle</span>
        </h1>
      </header>

      {!pack && !scene ? (
        <>
          <p className="tagline">
            {TOTAL_PUZZLES} puzzles — et ta propre photo si tu veux.
          </p>
          <div className="puzzle-scenes">
            {PACKS.map((p) => (
              <button key={p.key} className="puzzle-scene pack" onClick={() => setPack(p.key)}>
                <img src={scenesOf(p.key)[0]!.url} alt="" loading="lazy" />
                <span>
                  {p.label} <small>· {p.count}</small>
                </span>
              </button>
            ))}
            <label className="puzzle-scene pack photo">
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
              <span className="photo-icon">📷</span>
              <span>Ta photo</span>
            </label>
          </div>
        </>
      ) : !scene ? (
        <>
          <p className="tagline">{PACKS.find((p) => p.key === pack)?.label}</p>
          <div className="puzzle-scenes">
            {scenes.map((s) => (
              <button key={s.id} className="puzzle-scene" onClick={() => setScene(s)}>
                <img src={s.url} alt="" loading="lazy" />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="tagline">{scene.name} — combien de pièces ?</p>
          <div className="mode-list">
            {LEVELS.map((l) => {
              const total = l.cols * l.rows
              const best = records[`${scene.id}:${total}`]
              return (
                <button key={l.label} className="mode-card" onClick={() => setLevel(l)}>
                  <span className="mode-emoji">🧩</span>
                  <span className="mode-name">
                    {l.label} — {total} pièces
                  </span>
                  <span className="mode-desc">
                    {l.cols} × {l.rows}
                    {best ? ` · 🏅 record : ${best}` : ' · jamais joué'}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
