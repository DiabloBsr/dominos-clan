import type { GameRules, GameState, Move, PlayMove, RedealInfo, RoundResult, Tile } from './types'
import { DEFAULT_RULES } from './types'
import { isDouble, makeDeck, mulberry32, shuffle, tileEquals, tilePips } from './tiles'
import { deepClone } from './clone'

export const HAND_SIZE = 7

export class GameError extends Error {
  constructor(
    public code:
      | 'BAD_PLAYER_COUNT'
      | 'DUPLICATE_PLAYER'
      | 'GAME_FINISHED'
      | 'NOT_YOUR_TURN'
      | 'ILLEGAL_MOVE'
      | 'CANNOT_UNDO',
    message: string,
  ) {
    super(message)
    this.name = 'GameError'
  }
}

/**
 * Règles : domino bloqué (block) double-six, 7 dominos chacun, pas de pioche.
 * Blocage = tout le monde passe une fois de suite ; gagne la main la plus légère.
 * Égalité au minimum de points → manche NULLE (personne ne marque).
 * `rules.freePass` autorise de passer même avec un coup jouable.
 *
 * Ouverture selon `opening.policy` :
 * - 'classic' (défaut) : plus gros double en jeu, sinon domino le plus lourd — imposé.
 * - 'smallest-double' : plus petit double en main (0-0 → 6-6) — imposé ;
 *   si aucun double n'est en main, retombe sur 'classic'.
 * - 'rotate' : l'ouvreur est fourni (`starterIndex`) ; il doit poser un domino
 *   de total ≤ rules.openingMaxPips (à défaut, son domino le plus léger).
 */
export type OpeningPolicy =
  | { policy: 'classic' }
  | { policy: 'smallest-double' }
  | { policy: 'rotate'; starterIndex: number }

export function createGame(
  playerIds: string[],
  seed: number,
  rules: Partial<GameRules> = {},
  opening: OpeningPolicy = { policy: 'classic' },
): GameState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new GameError('BAD_PLAYER_COUNT', `Il faut 2 à 4 joueurs, reçu ${playerIds.length}`)
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new GameError('DUPLICATE_PLAYER', 'Identifiants de joueurs en double')
  }

  const mergedRules = { ...DEFAULT_RULES, ...rules }
  const rng = mulberry32(seed)

  // Une seule donne : la règle des doubles décide de la suite.
  // 4-5 doubles → statut 'redeal' : la partie est EN PAUSE, tout le monde voit
  // la donne fautive, et c'est le bouton « Redistribuer » (serveur) qui relance.
  // 6-7 doubles → victoire immédiate de la manche.
  const deck = shuffle(makeDeck(), rng)
  const players = playerIds.map((id, i) => ({
    id,
    hand: deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE),
  }))
  const sleeping = deck.slice(playerIds.length * HAND_SIZE)
  const verdict = evaluateDeal(players.map((p) => p.hand))

  if (verdict.type === 'instant-win') {
    const state: GameState = {
      rules: mergedRules,
      redeals: [],
      players,
      line: [],
      sleeping,
      turn: verdict.winnerIndex,
      consecutivePasses: 0,
      status: 'finished',
      result: null,
      lastPlayerIndex: null,
      forcedOpening: null,
      openingMaxPips: null,
      lastPlay: null,
    }
    state.result = buildResult(state, players[verdict.winnerIndex]!.id, 'doubles')
    return state
  }

  if (verdict.type === 'redeal') {
    const culprit = players[verdict.culpritIndex]!
    return {
      rules: mergedRules,
      redeals: [
        {
          culpritId: culprit.id,
          doublesCount: verdict.doublesCount,
          hands: players.map((p) => ({ id: p.id, hand: deepClone(p.hand) })),
        },
      ],
      players,
      line: [],
      sleeping,
      turn: 0,
      consecutivePasses: 0,
      status: 'redeal',
      result: null,
      lastPlayerIndex: null,
      forcedOpening: null,
      openingMaxPips: null,
      lastPlay: null,
    }
  }

  const hands = players.map((p) => p.hand)

  let starterIndex: number
  let openingTile: Tile | null
  let openingMaxPips: number | null = null

  if (opening.policy === 'rotate') {
    if (opening.starterIndex < 0 || opening.starterIndex >= players.length) {
      throw new GameError('BAD_PLAYER_COUNT', `starterIndex invalide : ${opening.starterIndex}`)
    }
    starterIndex = opening.starterIndex
    openingTile = null
    openingMaxPips = mergedRules.openingMaxPips ?? 12
  } else if (opening.policy === 'smallest-double') {
    const found = findSmallestDouble(hands) ?? findOpening(hands)
    starterIndex = found.starterIndex
    openingTile = found.openingTile
  } else {
    const found = findOpening(hands)
    starterIndex = found.starterIndex
    openingTile = found.openingTile
  }

  return {
    rules: mergedRules,
    redeals: [],
    players,
    line: [],
    sleeping,
    turn: starterIndex,
    consecutivePasses: 0,
    status: 'playing',
    result: null,
    lastPlayerIndex: null,
    forcedOpening: openingTile,
    openingMaxPips,
    lastPlay: null,
  }
}

export type DealVerdict =
  | { type: 'ok' }
  | { type: 'redeal'; culpritIndex: number; doublesCount: number }
  | { type: 'instant-win'; winnerIndex: number }

/** Règle des doubles à la donne : 4 ou 5 doubles dans une même main → on redistribue ; 6 ou 7 → victoire immédiate. */
export function evaluateDeal(hands: Tile[][]): DealVerdict {
  let best = -1
  let bestIndex = -1
  for (let i = 0; i < hands.length; i++) {
    const count = hands[i]!.filter(isDouble).length
    if (count > best) {
      best = count
      bestIndex = i
    }
  }
  if (best >= 6) return { type: 'instant-win', winnerIndex: bestIndex }
  if (best >= 4) return { type: 'redeal', culpritIndex: bestIndex, doublesCount: best }
  return { type: 'ok' }
}

/** Plus petit double en main : 0-0, 1-1, 2-2… jusqu'au 6-6. */
function findSmallestDouble(
  hands: Tile[][],
): { starterIndex: number; openingTile: Tile } | null {
  for (const value of [0, 1, 2, 3, 4, 5, 6]) {
    for (let i = 0; i < hands.length; i++) {
      const tile = hands[i]!.find((t) => t.hi === value && t.lo === value)
      if (tile) return { starterIndex: i, openingTile: tile }
    }
  }
  return null
}

/** Plus gros double toutes mains confondues, sinon domino le plus lourd (départage : plus gros hi). */
function findOpening(hands: Tile[][]): { starterIndex: number; openingTile: Tile } {
  let best: { starterIndex: number; openingTile: Tile } | null = null
  for (let i = 0; i < hands.length; i++) {
    for (const tile of hands[i]!) {
      if (!isDouble(tile)) continue
      if (!best || tile.hi > best.openingTile.hi) best = { starterIndex: i, openingTile: tile }
    }
  }
  if (best) return best

  for (let i = 0; i < hands.length; i++) {
    for (const tile of hands[i]!) {
      if (
        !best ||
        tilePips(tile) > tilePips(best.openingTile) ||
        (tilePips(tile) === tilePips(best.openingTile) && tile.hi > best.openingTile.hi)
      ) {
        best = { starterIndex: i, openingTile: tile }
      }
    }
  }
  return best!
}

export function lineEnds(state: GameState): { left: number; right: number } | null {
  const first = state.line[0]
  const last = state.line[state.line.length - 1]
  if (!first || !last) return null
  return { left: first.left, right: last.right }
}

/** Coups légaux du joueur. Vide si ce n'est pas son tour. `pass` n'est légal que sans coup jouable. */
export function legalMoves(state: GameState, playerId: string): Move[] {
  if (state.status !== 'playing') return []
  const playerIndex = state.players.findIndex((p) => p.id === playerId)
  if (playerIndex !== state.turn) return []
  const hand = state.players[playerIndex]!.hand

  const ends = lineEnds(state)
  if (!ends) {
    // Ouverture imposée : le meneur doit poser le domino qui lui a donné la main.
    if (state.forcedOpening) return [{ type: 'play', tile: state.forcedOpening, end: 'right' }]
    // Ouverture plafonnée (manches tournantes) : total ≤ N, sinon le plus léger.
    if (state.openingMaxPips !== null) {
      const cap = state.openingMaxPips
      const allowed = hand.filter((t) => tilePips(t) <= cap)
      if (allowed.length > 0) return allowed.map((tile) => ({ type: 'play' as const, tile, end: 'right' as const }))
      const min = Math.min(...hand.map(tilePips))
      return hand
        .filter((t) => tilePips(t) === min)
        .map((tile) => ({ type: 'play' as const, tile, end: 'right' as const }))
    }
    // Ouverture libre.
    return hand.map((tile) => ({ type: 'play' as const, tile, end: 'right' as const }))
  }

  const moves: Move[] = []
  for (const tile of hand) {
    if (tile.hi === ends.left || tile.lo === ends.left) moves.push({ type: 'play', tile, end: 'left' })
    if (tile.hi === ends.right || tile.lo === ends.right) moves.push({ type: 'play', tile, end: 'right' })
  }
  // Passe libre : on peut garder ses dominos même quand on a un coup jouable.
  if (moves.length === 0 || state.rules.freePass) moves.push({ type: 'pass' })
  return moves
}

/** Applique un coup et retourne le nouvel état (l'état d'entrée n'est jamais muté). */
export function applyMove(state: GameState, playerId: string, move: Move): GameState {
  if (state.status !== 'playing') {
    throw new GameError('GAME_FINISHED', 'La manche est terminée')
  }
  const playerIndex = state.players.findIndex((p) => p.id === playerId)
  if (playerIndex !== state.turn) {
    throw new GameError('NOT_YOUR_TURN', `Ce n'est pas le tour de ${playerId}`)
  }

  const legal = legalMoves(state, playerId)
  const isLegal = legal.some((m) =>
    m.type === 'pass'
      ? move.type === 'pass'
      : move.type === 'play' && tileEquals(m.tile, move.tile) && m.end === move.end,
  )
  if (!isLegal) {
    throw new GameError('ILLEGAL_MOVE', 'Coup illégal (domino absent de la main, extrémité incompatible, ou passe avec un coup jouable)')
  }

  const next = deepClone(state)

  if (move.type === 'pass') {
    next.consecutivePasses += 1
    next.lastPlay = null
    if (next.consecutivePasses >= next.players.length) {
      finishBlocked(next)
    } else {
      next.turn = (next.turn + 1) % next.players.length
    }
    return next
  }

  placeTile(next, playerIndex, move)
  next.consecutivePasses = 0
  next.lastPlayerIndex = playerIndex
  next.lastPlay = { playerIndex, end: move.end }

  const hand = next.players[playerIndex]!.hand
  if (hand.length === 0) {
    next.status = 'finished'
    next.result = buildResult(next, playerId, 'domino')
  } else {
    next.turn = (next.turn + 1) % next.players.length
  }
  return next
}

/**
 * Reprendre son dernier domino posé — possible UNIQUEMENT tant que le joueur
 * suivant n'a pas encore agi (ni posé, ni passé). Le domino revient en main
 * et le tour repasse à son auteur.
 */
export function undoLastMove(state: GameState, playerId: string): GameState {
  if (state.status !== 'playing') {
    throw new GameError('CANNOT_UNDO', 'La manche est terminée')
  }
  const playerIndex = state.players.findIndex((p) => p.id === playerId)
  const lastPlay = state.lastPlay
  if (
    playerIndex < 0 ||
    !lastPlay ||
    lastPlay.playerIndex !== playerIndex ||
    state.turn !== (playerIndex + 1) % state.players.length
  ) {
    throw new GameError('CANNOT_UNDO', 'Trop tard pour reprendre : le joueur suivant a déjà agi')
  }

  const next = deepClone(state)
  const placed = lastPlay.end === 'left' ? next.line.shift()! : next.line.pop()!
  next.players[playerIndex]!.hand.push(placed.tile)
  next.turn = playerIndex
  next.lastPlay = null
  return next
}

function placeTile(state: GameState, playerIndex: number, move: PlayMove): void {
  const hand = state.players[playerIndex]!.hand
  const tileIndex = hand.findIndex((t) => tileEquals(t, move.tile))
  hand.splice(tileIndex, 1)

  const ends = lineEnds(state)
  if (!ends) {
    state.line.push({ tile: move.tile, left: move.tile.hi, right: move.tile.lo })
    return
  }
  if (move.end === 'left') {
    const other = move.tile.hi === ends.left ? move.tile.lo : move.tile.hi
    state.line.unshift({ tile: move.tile, left: other, right: ends.left })
  } else {
    const other = move.tile.hi === ends.right ? move.tile.lo : move.tile.hi
    state.line.push({ tile: move.tile, left: ends.right, right: other })
  }
}

function finishBlocked(state: GameState): void {
  state.status = 'finished'
  const pips = new Map(state.players.map((p) => [p.id, p.hand.reduce((sum, t) => sum + tilePips(t), 0)]))
  const min = Math.min(...pips.values())

  // « X » : plusieurs mains à égalité au minimum → manche nulle, personne ne marque.
  const lightest = state.players.filter((p) => pips.get(p.id) === min)
  const winnerId = lightest.length === 1 ? lightest[0]!.id : null
  state.result = buildResult(state, winnerId, 'blocked')
}

function buildResult(
  state: GameState,
  winnerId: string | null,
  reason: RoundResult['reason'],
): RoundResult {
  const pips: Record<string, number> = {}
  for (const p of state.players) {
    pips[p.id] = p.hand.reduce((sum, t) => sum + tilePips(t), 0)
  }
  const gain = winnerId
    ? Object.entries(pips).reduce((sum, [id, v]) => (id === winnerId ? sum : sum + v), 0)
    : 0
  return { winnerId, reason, pips, gain }
}
