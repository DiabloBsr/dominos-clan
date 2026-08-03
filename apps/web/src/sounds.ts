/**
 * Sons du jeu — synthétisés en WebAudio, aucun fichier à charger.
 * playTap : petit « tac » discret à chaque pose.
 * playSlam : le CLAC du domino rabattu de toutes ses forces (joyaaa !).
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
  noiseBurst(ac, 0.05, 0.12, 2400)
}

export function playSlam(): void {
  const ac = audio()
  if (!ac) return
  noiseBurst(ac, 0.12, 0.85, 3600)
  thump(ac, 160, 45, 0.22, 0.7)
}
