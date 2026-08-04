/**
 * Moteur Ludo — piste commune de 52 cases, couloir d'arrivée de 5 cases,
 * arrivée exacte. Sortie de base sur un 6, un 6 fait rejouer (nombre de 6
 * successifs configurable), captures sauf cases sûres (départs + étoiles).
 * Mode bonus : 8 cases 🎁 qui font tirer une carte (cf. docs/LUDO.md).
 *
 * Information complète : l'état est public pour tout le salon. Le dé est
 * lancé côté serveur ; l'aléatoire (dé, bonus) est injecté pour les tests.
 * Les fonctions MUTENT l'état passé (le serveur en est l'unique détenteur).
 */

import { mulberry32 } from './tiles'

export const LUDO_TRACK = 52
export const LUDO_HOME_STEPS = 5
const FULL_PATH = LUDO_TRACK + LUDO_HOME_STEPS // 57 = arrivée exacte

export type LudoPawn =
  | { zone: 'base' }
  | { zone: 'track'; cell: number }
  | { zone: 'home'; step: number }
  | { zone: 'done' }

export interface LudoPlayerState {
  id: string
  /**
   * Coin/couleur occupé (0-3). Règle de base : à 2 joueurs, coins OPPOSÉS
   * (0 et 2) ; à 3, trois coins ; à 4, les quatre.
   */
  slot: number
  pawns: LudoPawn[]
  /** 🛡 Bouclier actif (mode bonus) : annule la prochaine capture subie. */
  shield: boolean
}

export type LudoBonus = 'reroll' | 'boost' | 'prison' | 'shield' | 'swap' | 'star'

/** Case bonus TYPÉE : son logo est visible sur le plateau ('mystery' = ❓ tiré au ramassage). */
export interface LudoBonusCell {
  cell: number
  kind: LudoBonus | 'mystery'
}

export interface LudoRulesConfig {
  /** Nombre max de 6 successifs (2 à 4) avant que le tour saute. */
  maxSixes: number
  bonusMode: boolean
}

export interface LudoState {
  rules: LudoRulesConfig
  /** Cases bonus ÉPARPILLÉES et typées : un bonus ramassé se replace ailleurs au hasard (type retiré). */
  bonusCells: LudoBonusCell[]
  players: LudoPlayerState[]
  turn: number
  /** Dé lancé, en attente du choix de pion (null = il faut lancer). */
  dice: number | null
  consecutiveSixes: number
  status: 'playing' | 'finished'
  winnerId: string | null
  /** Bonus en attente d'une cible adverse (prison / échange). */
  pendingBonus: { bonus: 'prison' | 'swap'; playerIndex: number; pawnIndex: number; rollAgain: boolean } | null
  /** Dernier événement lisible pour l'UI. */
  lastEvent: string | null
  /**
   * Dernier bonus RÉSOLU (mystère déjà tiré) — pour les effets visuels :
   * la machine à sous du boost affiche `value`. `seq` change à chaque bonus.
   */
  lastBonus: { playerIndex: number; kind: LudoBonus; value: number | null; seq: number } | null
}

export class LudoError extends Error {}

export function ludoStartCell(playerIndex: number): number {
  return playerIndex * 13
}

export function ludoStarCells(): number[] {
  return [0, 1, 2, 3].map((i) => (i * 13 + 8) % LUDO_TRACK)
}

export function ludoSafeCells(): number[] {
  return [...[0, 1, 2, 3].map(ludoStartCell), ...ludoStarCells()]
}

export const LUDO_BONUS_COUNT = 8

const BONUS_DECK: LudoBonus[] = ['reroll', 'boost', 'prison', 'shield', 'swap', 'star']

/** À la création : un bonus de chaque type + 2 ❓ mystère, éparpillés. */
const INITIAL_KINDS: Array<LudoBonus | 'mystery'> = [...BONUS_DECK, 'mystery', 'mystery']

/** Type d'une case replacée : 1 chance sur 7 d'être ❓, sinon un type du paquet. */
function drawBonusKind(rand: () => number): LudoBonus | 'mystery' {
  const pool: Array<LudoBonus | 'mystery'> = [...BONUS_DECK, 'mystery']
  return pool[Math.floor(rand() * pool.length)]!
}

/** Tire une case libre (ni sûre, ni déjà bonus) pour y placer un bonus. */
function drawBonusCell(taken: readonly LudoBonusCell[], rand: () => number): number | null {
  const forbidden = new Set([...ludoSafeCells(), ...taken.map((b) => b.cell)])
  for (let attempt = 0; attempt < 300; attempt++) {
    const cell = Math.floor(rand() * LUDO_TRACK)
    if (!forbidden.has(cell)) return cell
  }
  return null
}

export function createLudo(
  playerIds: string[],
  rules: Partial<LudoRulesConfig> = {},
  rand: () => number = mulberry32(1),
): LudoState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new LudoError(`Il faut 2 à 4 joueurs, reçu ${playerIds.length}`)
  }
  const maxSixes = rules.maxSixes ?? 3
  if (!Number.isInteger(maxSixes) || maxSixes < 2 || maxSixes > 4) {
    throw new LudoError('maxSixes doit être 2, 3 ou 4')
  }
  const bonusCells: LudoBonusCell[] = []
  if (rules.bonusMode) {
    for (const kind of INITIAL_KINDS) {
      const cell = drawBonusCell(bonusCells, rand)
      if (cell === null) break
      bonusCells.push({ cell, kind })
    }
  }
  return {
    rules: { maxSixes, bonusMode: rules.bonusMode ?? false },
    bonusCells,
    players: playerIds.map((id, i) => ({
      id,
      slot: (playerIds.length === 2 ? [0, 2] : [0, 1, 2, 3])[i]!,
      pawns: [{ zone: 'base' }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }],
      shield: false,
    })),
    turn: 0,
    dice: null,
    consecutiveSixes: 0,
    status: 'playing',
    winnerId: null,
    pendingBonus: null,
    lastEvent: null,
    lastBonus: null,
  }
}

/** Progression relative (0..56) d'un pion sur le chemin de son coin (slot). */
function relOf(slot: number, pawn: LudoPawn): number | null {
  if (pawn.zone === 'track') {
    return (pawn.cell - ludoStartCell(slot) + LUDO_TRACK) % LUDO_TRACK
  }
  if (pawn.zone === 'home') return LUDO_TRACK + pawn.step
  return null
}

/** Destination d'un pion pour `steps` pas — null si coup impossible. */
function destinationOf(slot: number, pawn: LudoPawn, steps: number): LudoPawn | null {
  if (pawn.zone === 'done') return null
  if (pawn.zone === 'base') {
    return steps === 6 ? { zone: 'track', cell: ludoStartCell(slot) } : null
  }
  const rel = relOf(slot, pawn)!
  const next = rel + steps
  if (next < LUDO_TRACK) {
    return { zone: 'track', cell: (ludoStartCell(slot) + next) % LUDO_TRACK }
  }
  if (next < FULL_PATH) return { zone: 'home', step: next - LUDO_TRACK }
  if (next === FULL_PATH) return { zone: 'done' }
  return null // dépassement : arrivée exacte obligatoire
}

export function ludoLegalPawns(state: LudoState, playerIndex: number): number[] {
  if (state.dice === null) return []
  const player = state.players[playerIndex]!
  return player.pawns
    .map((pawn, i) => (destinationOf(player.slot, pawn, state.dice!) ? i : -1))
    .filter((i) => i >= 0)
}

function requirePlaying(state: LudoState): void {
  if (state.status !== 'playing') throw new LudoError('La partie est terminée')
  if (state.pendingBonus) throw new LudoError('Un bonus attend sa cible')
}

function playerIndexOf(state: LudoState, playerId: string): number {
  const index = state.players.findIndex((p) => p.id === playerId)
  if (index < 0) throw new LudoError('Tu ne joues pas cette partie')
  return index
}

function advanceTurn(state: LudoState): void {
  state.turn = (state.turn + 1) % state.players.length
  state.dice = null
  state.consecutiveSixes = 0
}

/** Fin de coup : un 6 (ou un bonus « rejoue ») redonne le dé, sinon le tour passe. */
function endMove(state: LudoState, rollAgain: boolean): void {
  if (state.status !== 'playing' || state.pendingBonus) return
  state.dice = null
  if (!rollAgain) advanceTurn(state)
}

/** Lancer du serveur : `roll` est le résultat (1-6) tiré côté serveur. */
export function ludoRoll(state: LudoState, playerId: string, roll: number): void {
  requirePlaying(state)
  const index = playerIndexOf(state, playerId)
  if (index !== state.turn) throw new LudoError('Ce n’est pas ton tour')
  if (state.dice !== null) throw new LudoError('Tu as déjà lancé : choisis un pion')
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new LudoError('Dé invalide')

  if (roll === 6) {
    state.consecutiveSixes += 1
    if (state.consecutiveSixes >= state.rules.maxSixes) {
      // Trop de 6 d'affilée : le tour saute.
      state.lastEvent = `${state.rules.maxSixes} six d’affilée — le tour saute !`
      advanceTurn(state)
      return
    }
  }

  state.dice = roll
  if (ludoLegalPawns(state, index).length === 0) {
    // Aucun coup possible : un 6 redonne le dé, sinon le tour passe.
    state.lastEvent = 'Aucun coup possible'
    state.dice = null
    if (roll !== 6) advanceTurn(state)
  }
}

/** Captures sur une case de piste (sauf case sûre ; le bouclier encaisse une fois). */
function resolveCaptures(state: LudoState, moverIndex: number, cell: number): void {
  if (ludoSafeCells().includes(cell)) return
  for (let i = 0; i < state.players.length; i++) {
    if (i === moverIndex) continue
    const enemy = state.players[i]!
    for (let p = 0; p < enemy.pawns.length; p++) {
      const pawn = enemy.pawns[p]!
      if (pawn.zone === 'track' && pawn.cell === cell) {
        if (enemy.shield) {
          enemy.shield = false
          state.lastEvent = '🛡 Bouclier ! La capture est annulée'
        } else {
          enemy.pawns[p] = { zone: 'base' }
          state.lastEvent = '💥 Capture — retour en prison !'
        }
      }
    }
  }
}

function checkWin(state: LudoState, playerIndex: number): void {
  const player = state.players[playerIndex]!
  if (player.pawns.every((p) => p.zone === 'done')) {
    state.status = 'finished'
    state.winnerId = player.id
    state.pendingBonus = null
    state.dice = null
  }
}

function drawBonus(
  state: LudoState,
  playerIndex: number,
  pawnIndex: number,
  rollAgain: boolean,
  rand: () => number,
  kind: LudoBonus | 'mystery',
): boolean {
  // ❓ mystère : le type est tiré au ramassage ; les autres sont connus d'avance.
  const bonus = kind === 'mystery' ? BONUS_DECK[Math.floor(rand() * BONUS_DECK.length)]! : kind
  const player = state.players[playerIndex]!
  const announce = (value: number | null) => {
    state.lastBonus = {
      playerIndex,
      kind: bonus,
      value,
      seq: (state.lastBonus?.seq ?? 0) + 1,
    }
  }
  const enemiesOnTrack = state.players.some(
    (p, i) => i !== playerIndex && p.pawns.some((pw) => pw.zone === 'track'),
  )

  switch (bonus) {
    case 'reroll':
      announce(null)
      state.lastEvent = '🎁 🎲 Deuxième lancer !'
      return true // rejoue quoi qu'il arrive
    case 'shield':
      player.shield = true
      announce(null)
      state.lastEvent = '🎁 🛡 Bouclier activé !'
      return rollAgain
    case 'boost': {
      const steps = 1 + Math.floor(rand() * 6)
      announce(steps)
      const pawn = player.pawns[pawnIndex]!
      const dest = destinationOf(player.slot, pawn, steps)
      if (dest) {
        player.pawns[pawnIndex] = dest
        if (dest.zone === 'track') resolveCaptures(state, playerIndex, dest.cell)
        checkWin(state, playerIndex)
      }
      state.lastEvent = `🎁 🚀 Saut +${steps} !`
      return rollAgain
    }
    case 'star': {
      announce(null)
      const pawn = player.pawns[pawnIndex]!
      if (pawn.zone === 'track') {
        const rel = relOf(player.slot, pawn)!
        for (let k = 1; rel + k < LUDO_TRACK; k++) {
          const cell = (pawn.cell + k) % LUDO_TRACK
          if (ludoStarCells().includes(cell)) {
            player.pawns[pawnIndex] = { zone: 'track', cell }
            resolveCaptures(state, playerIndex, cell)
            break
          }
        }
      }
      state.lastEvent = '🎁 🌟 Téléport étoile !'
      return rollAgain
    }
    case 'prison':
    case 'swap':
      announce(null)
      if (!enemiesOnTrack) {
        state.lastEvent = '🎁 … mais aucune cible adverse !'
        return rollAgain
      }
      state.pendingBonus = { bonus, playerIndex, pawnIndex, rollAgain }
      state.lastEvent = bonus === 'prison' ? '🎁 🚔 Choisis un pion à emprisonner !' : '🎁 ↔️ Choisis un pion à échanger !'
      return rollAgain
  }
}

/** Joue le pion choisi avec le dé en attente. `rand` sert aux bonus. */
export function ludoPlay(
  state: LudoState,
  playerId: string,
  pawnIndex: number,
  rand: () => number,
): void {
  requirePlaying(state)
  const index = playerIndexOf(state, playerId)
  if (index !== state.turn) throw new LudoError('Ce n’est pas ton tour')
  if (state.dice === null) throw new LudoError('Lance d’abord le dé')
  if (!ludoLegalPawns(state, index).includes(pawnIndex)) throw new LudoError('Ce pion ne peut pas bouger')

  const roll = state.dice
  const player = state.players[index]!
  const dest = destinationOf(player.slot, player.pawns[pawnIndex]!, roll)!
  player.pawns[pawnIndex] = dest
  state.lastEvent = null

  if (dest.zone === 'track') resolveCaptures(state, index, dest.cell)
  checkWin(state, index)
  if (state.status === 'finished') return

  let rollAgain = roll === 6
  const landedBonus =
    state.rules.bonusMode && dest.zone === 'track'
      ? state.bonusCells.find((b) => b.cell === dest.cell)
      : undefined
  if (landedBonus) {
    rollAgain = drawBonus(state, index, pawnIndex, rollAgain, rand, landedBonus.kind)
    // Le bonus ramassé se replace ailleurs, au hasard — case ET type retirés.
    const next = drawBonusCell(state.bonusCells, rand)
    state.bonusCells = state.bonusCells.filter((b) => b.cell !== landedBonus.cell)
    if (next !== null) state.bonusCells.push({ cell: next, kind: drawBonusKind(rand) })
    checkWin(state, index)
    if (state.winnerId !== null) return
  }

  endMove(state, rollAgain)
}

/** Cible d'un bonus prison/échange : n'importe quel pion adverse sur la piste. */
export function ludoTarget(
  state: LudoState,
  playerId: string,
  targetPlayerIndex: number,
  targetPawnIndex: number,
): void {
  if (state.status !== 'playing') throw new LudoError('La partie est terminée')
  const pending = state.pendingBonus
  if (!pending) throw new LudoError('Aucun bonus en attente')
  const index = playerIndexOf(state, playerId)
  if (pending.playerIndex !== index) throw new LudoError('Ce bonus ne t’appartient pas')
  if (targetPlayerIndex === index) throw new LudoError('Choisis un pion ADVERSE')
  const enemy = state.players[targetPlayerIndex]
  const target = enemy?.pawns[targetPawnIndex]
  if (!enemy || !target || target.zone !== 'track') {
    throw new LudoError('Cible invalide : il faut un pion adverse sur la piste')
  }

  if (pending.bonus === 'prison') {
    if (enemy.shield) {
      enemy.shield = false
      state.lastEvent = '🛡 Bouclier ! La prison est annulée'
    } else {
      enemy.pawns[targetPawnIndex] = { zone: 'base' }
      state.lastEvent = '🚔 En prison !'
    }
  } else {
    // Échange de positions entre le pion bonus et la cible.
    const mine = state.players[index]!.pawns[pending.pawnIndex]!
    if (mine.zone !== 'track') throw new LudoError('Ton pion n’est plus sur la piste')
    const myCell = mine.cell
    state.players[index]!.pawns[pending.pawnIndex] = { zone: 'track', cell: target.cell }
    enemy.pawns[targetPawnIndex] = { zone: 'track', cell: myCell }
    state.lastEvent = '↔️ Échange !'
  }

  const rollAgain = pending.rollAgain
  state.pendingBonus = null
  endMove(state, rollAgain)
}
