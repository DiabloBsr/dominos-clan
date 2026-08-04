/**
 * Sons du jeu.
 * playTap / playSlam : VRAIS enregistrements de bois (pack « Impact Sounds »
 * de Kenney, CC0 — public/sounds/*.ogg), variante et vitesse tirées au hasard
 * pour que deux poses ne sonnent jamais pareil. La synthèse WebAudio d'origine
 * reste en secours : premier coup avant la fin du chargement, fichier absent,
 * ou navigateur sans décodeur ogg (Safari).
 * Le reste (événements, soundboard) demeure synthétisé.
 */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/* ─── Samples réels ─────────────────────────────────────────────────── */

type SampleName = 'tap' | 'slam'
const SAMPLE_COUNT: Record<SampleName, number> = { tap: 5, slam: 5 }

const fetched = new Map<SampleName, Promise<ArrayBuffer[] | null>>()
const decoded = new Map<SampleName, AudioBuffer[] | null>()

function prefetch(name: SampleName): Promise<ArrayBuffer[] | null> {
  let p = fetched.get(name)
  if (!p) {
    p = Promise.all(
      // Fichiers SANS extension : les gestionnaires de téléchargement type IDM
      // capturent les URL en .ogg/.mp3 et ouvrent une popup de téléchargement
      // — sans extension ni type média, ils ne voient rien à intercepter.
      Array.from({ length: SAMPLE_COUNT[name] }, (_, i) =>
        fetch(`/sounds/${name}-${i}`).then((r) => {
          if (!r.ok) throw new Error(`${r.status}`)
          return r.arrayBuffer()
        }),
      ),
    ).catch(() => null)
    fetched.set(name, p)
  }
  return p
}

// Précharge en tâche de fond dès l'import : les fichiers sont minuscules
// (~6-12 Ko pièce), le premier CLAC de la partie est déjà prêt.
void prefetch('tap')
void prefetch('slam')

/** Joue une variante au hasard ; false si les samples ne sont pas (encore) utilisables. */
function playSample(ac: AudioContext, name: SampleName, gainValue: number): boolean {
  const buffers = decoded.get(name)
  if (buffers && buffers.length > 0) {
    const buffer = buffers[Math.floor(Math.random() * buffers.length)]!
    const source = ac.createBufferSource()
    source.buffer = buffer
    // Légère variation de hauteur : casse l'effet « même fichier en boucle ».
    source.playbackRate.value = 0.94 + Math.random() * 0.12
    const gain = ac.createGain()
    gain.gain.value = gainValue
    source.connect(gain).connect(ac.destination)
    source.start()
    return true
  }
  if (!decoded.has(name)) {
    decoded.set(name, null)
    void prefetch(name).then(async (arrays) => {
      if (!arrays) return
      try {
        // slice() : decodeAudioData détache le buffer sur certains navigateurs.
        decoded.set(name, await Promise.all(arrays.map((a) => ac.decodeAudioData(a.slice(0)))))
      } catch {
        // Pas de décodeur ogg : la synthèse reste aux commandes.
      }
    })
  }
  return false
}

function noiseBurst(ac: AudioContext, duration: number, gainValue: number, lowpassHz: number): void {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  const source = ac.createBufferSource()
  source.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpassHz
  const gain = ac.createGain()
  gain.gain.setValueAtTime(gainValue, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
  source.connect(filter).connect(gain).connect(ac.destination)
  source.start()
}

/** Coup sourd grave (la table qui encaisse). */
function thump(ac: AudioContext, fromHz: number, toHz: number, duration: number, gainValue: number): void {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(fromHz, ac.currentTime)
  osc.frequency.exponentialRampToValueAtTime(toHz, ac.currentTime + duration)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(gainValue, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

export function playTap(): void {
  const ac = audio()
  if (!ac) return
  if (!playSample(ac, 'tap', 0.45)) noiseBurst(ac, 0.05, 0.12, 2400)
}

export function playSlam(): void {
  const ac = audio()
  if (!ac) return
  const real = playSample(ac, 'slam', 0.95)
  if (!real) noiseBurst(ac, 0.12, 0.85, 3600)
  // La table qui encaisse : sub grave discret sous le vrai CLAC, plein volume en secours.
  thump(ac, 160, 45, 0.22, real ? 0.3 : 0.7)
}

/** Note simple : oscillateur + enveloppe, départ décalé de `at` secondes. */
function tone(
  ac: AudioContext,
  type: OscillatorType,
  freq: number,
  at: number,
  duration: number,
  gainValue: number,
  glideTo?: number,
): void {
  const t0 = ac.currentTime + at
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/* ─── Sons d'événements ─────────────────────────────────────────────── */

/** Invitation / toc-toc reçu : « ding-dong » chaleureux. */
export function playInvite(): void {
  const ac = audio()
  if (!ac) return
  tone(ac, 'sine', 880, 0, 0.25, 0.3)
  tone(ac, 'sine', 660, 0.18, 0.4, 0.3)
}

/** Message de chat reçu : petit « plop » discret. */
export function playMessage(): void {
  const ac = audio()
  if (!ac) return
  tone(ac, 'sine', 520, 0, 0.09, 0.22, 780)
}

/** Victoire (manche ou match) : fanfare montante. */
export function playVictory(): void {
  const ac = audio()
  if (!ac) return
  const notes = [523.25, 659.25, 783.99, 1046.5] // do mi sol do
  notes.forEach((f, i) => tone(ac, 'triangle', f, i * 0.13, 0.22, 0.32))
  tone(ac, 'triangle', 1046.5, notes.length * 0.13, 0.5, 0.35)
  noiseBurst(ac, 0.4, 0.08, 8000)
}

/** « JE PASSE ! » : wah-wah descendant, petit air dépité. */
export function playPass(): void {
  const ac = audio()
  if (!ac) return
  tone(ac, 'sawtooth', 320, 0, 0.28, 0.16, 240)
  tone(ac, 'sawtooth', 240, 0.26, 0.45, 0.16, 165)
}

/* ─── Soundboard (chambrage audible par tout le salon) ──────────────── */

export type BoardSound = 'pet' | 'rire' | 'colere' | 'bravo' | 'tromblon' | 'bisou'

/** 💨 Le pet : sciage grave qui tremble et retombe. */
function playPet(ac: AudioContext): void {
  const t0 = ac.currentTime
  const duration = 0.5
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(95, t0)
  osc.frequency.exponentialRampToValueAtTime(55, t0 + duration)
  // Tremblement : un LFO rapide module l'amplitude (le « brrr »).
  const lfo = ac.createOscillator()
  lfo.type = 'square'
  lfo.frequency.setValueAtTime(28, t0)
  lfo.frequency.exponentialRampToValueAtTime(14, t0 + duration)
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 0.4
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.5, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 500
  lfo.connect(lfoGain).connect(gain.gain)
  osc.connect(filter).connect(gain).connect(ac.destination)
  osc.start(t0)
  lfo.start(t0)
  osc.stop(t0 + duration)
  lfo.stop(t0 + duration)
}

/** 😂 Le rire : rafale de « ha ha ha » qui descendent. */
function playRire(ac: AudioContext): void {
  const base = 340
  for (let i = 0; i < 6; i++) {
    tone(ac, 'triangle', base - i * 22, i * 0.11, 0.09, 0.28, (base - i * 22) * 0.82)
  }
}

/** 😡 La colère : grognement grave qui monte et gronde. */
function playColere(ac: AudioContext): void {
  const t0 = ac.currentTime
  const duration = 0.6
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(70, t0)
  osc.frequency.exponentialRampToValueAtTime(130, t0 + duration)
  const lfo = ac.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 40
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 30
  lfo.connect(lfoGain).connect(osc.frequency)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.001, t0)
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  lfo.start(t0)
  osc.stop(t0 + duration)
  lfo.stop(t0 + duration)
}

/** 👏 Le bravo : salve d'applaudissements (claques de bruit filtré). */
function playBravo(ac: AudioContext): void {
  const t0 = ac.currentTime
  for (let i = 0; i < 14; i++) {
    const at = i * 0.07 + Math.random() * 0.04
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.03), ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / data.length)
    const src = ac.createBufferSource()
    src.buffer = buffer
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1800 + Math.random() * 1400
    const gain = ac.createGain()
    gain.gain.value = 0.25
    src.connect(filter).connect(gain).connect(ac.destination)
    src.start(t0 + at)
  }
}

/** 📯 Le tromblon : « womp womp wommmp » descendant de la défaite honteuse. */
function playTromblon(ac: AudioContext): void {
  const notes = [233.08, 220, 207.65] // si♭ la la♭
  notes.forEach((f, i) => tone(ac, 'sawtooth', f, i * 0.32, 0.28, 0.22, f * 0.97))
  // Dernière note longue qui meurt avec vibrato
  const t0 = ac.currentTime + notes.length * 0.32
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(196, t0) // sol
  const lfo = ac.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 6
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 7
  lfo.connect(lfoGain).connect(osc.frequency)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.22, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  lfo.start(t0)
  osc.stop(t0 + 0.9)
  lfo.stop(t0 + 0.9)
}

/** 😘 Le bisou : petit « smack » aigu qui glisse. */
function playBisou(ac: AudioContext): void {
  tone(ac, 'sine', 900, 0, 0.12, 0.25, 1500)
  noiseBurst(ac, 0.05, 0.1, 4000)
  tone(ac, 'sine', 1400, 0.1, 0.15, 0.2, 700)
}

const BOARD_PLAYERS: Record<BoardSound, (ac: AudioContext) => void> = {
  pet: playPet,
  rire: playRire,
  colere: playColere,
  bravo: playBravo,
  tromblon: playTromblon,
  bisou: playBisou,
}

export function playBoardSound(kind: string): void {
  const ac = audio()
  if (!ac) return
  BOARD_PLAYERS[kind as BoardSound]?.(ac)
}
