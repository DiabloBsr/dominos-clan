/**
 * Défi du jour et séries — la partie « j'y reviens tous les jours ».
 *
 * Le puzzle du jour est TIRÉ DE FAÇON DÉTERMINISTE à partir de la date : tout
 * le monde a le même, et il est identique si tu recharges la page. Aucun
 * serveur nécessaire.
 *
 * La série (« streak ») compte les jours consécutifs où le défi a été résolu.
 * Rater un jour la remet à 1, pas à 0 : on ne casse pas le moral des gens.
 */

import { PUZZLES, type Puzzle } from './content'
import { MOTIFS, type Motif } from './motifs'

/** Date locale au format AAAA-MM-JJ (jamais UTC : le défi change à MINUIT CHEZ TOI). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Hachage stable d'une chaîne — même entrée, même sortie, sur tous les appareils. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Le puzzle du jour. */
export function dailyPuzzle(dayKey: string = todayKey()): Puzzle {
  return PUZZLES[hash(`puzzle:${dayKey}`) % PUZZLES.length]!
}

/** Le motif du jour (une combinaison ou un schéma de mat à réviser). */
export function dailyMotif(dayKey: string = todayKey()): Motif {
  return MOTIFS[hash(`motif:${dayKey}`) % MOTIFS.length]!
}

/** Minuit UTC du jour désigné par une clé AAAA-MM-JJ. */
const keyToUtc = (key: string): number => {
  const parts = key.split('-')
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

/** Nombre de jours entre deux clés AAAA-MM-JJ (positif si `b` est après `a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / 86400000)
}

export interface Streak {
  /** Jours consécutifs en cours. */
  current: number
  /** Meilleure série jamais atteinte. */
  best: number
  /** Dernier jour où le défi a été résolu (AAAA-MM-JJ), ou '' si jamais. */
  lastDay: string
  /** Nombre total de défis quotidiens résolus. */
  total: number
  /** Les 14 derniers jours résolus, pour dessiner le calendrier. */
  history: string[]
}

export const EMPTY_STREAK: Streak = { current: 0, best: 0, lastDay: '', total: 0, history: [] }

const STREAK_KEY = 'dc:streak'

export function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return { ...EMPTY_STREAK }
    const s = JSON.parse(raw) as Partial<Streak>
    return {
      current: Number(s.current) || 0,
      best: Number(s.best) || 0,
      lastDay: typeof s.lastDay === 'string' ? s.lastDay : '',
      total: Number(s.total) || 0,
      history: Array.isArray(s.history) ? s.history.slice(-14) : [],
    }
  } catch {
    return { ...EMPTY_STREAK }
  }
}

export function saveStreak(s: Streak): void {
  localStorage.setItem(STREAK_KEY, JSON.stringify(s))
}

/**
 * Enregistre la réussite du défi du jour.
 * Fonction PURE : elle ne touche pas au stockage, ce qui la rend testable.
 */
export function recordDaily(streak: Streak, dayKey: string = todayKey()): Streak {
  if (streak.lastDay === dayKey) return streak // déjà validé aujourd'hui

  const gap = streak.lastDay ? daysBetween(streak.lastDay, dayKey) : Infinity
  // Un jour d'écart = la série continue. Plus, ou jamais joué = on repart à 1.
  const current = gap === 1 ? streak.current + 1 : 1

  return {
    current,
    best: Math.max(streak.best, current),
    lastDay: dayKey,
    total: streak.total + 1,
    history: [...streak.history, dayKey].slice(-14),
  }
}

/** Le défi du jour a-t-il déjà été résolu ? */
export const doneToday = (streak: Streak, dayKey: string = todayKey()): boolean =>
  streak.lastDay === dayKey

/** Petit message d'encouragement adapté à la série. */
export function streakMessage(streak: Streak): string {
  if (streak.current === 0) return 'Résous le défi du jour pour lancer ta série 🔥'
  if (streak.current === 1) return 'Série lancée ! Reviens demain pour la faire grandir.'
  if (streak.current < 7) return `${streak.current} jours d’affilée — ne casse pas la chaîne !`
  if (streak.current < 30) return `${streak.current} jours ! Tu deviens vraiment sérieux.`
  return `${streak.current} jours. À ce stade, c’est ton adversaire qui devrait s’inquiéter.`
}
