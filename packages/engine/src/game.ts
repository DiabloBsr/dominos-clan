import type { GameRules, GameState, Move, PlayMove, RoundResult, Tile } from './types'
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
      | 'ILLEGAL_MOVE',
    message: string,
  ) {
    super(message)
    this.name = 'GameError'
  }
}

/**
 * Règles : domino bloqué (block) double-six, 7 dominos chacun, pas de pioche.
 * L'ouverture est imposée : plus gros double en jeu, sinon domino le plus lourd.
 * Blocage = tout le monde passe une fois de suite ; gagne la main la plus légère.
 * Égalité au minimum de points → manche NULLE (personne ne marque).
 * `rules.freePass` autorise de passer même avec un coup jouable.
 */
export function createGame(
  playerIds: string[],
  seed: number,
  rules: Partial<GameRules> = {},
): GameState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new GameError('BAD_PLAYER_COUNT', `Il faut 2 à 4 joueurs, reçu ${playerIds.length}`)
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new GameError('DUPLICATE_PLAYER', 'Identifiants de joueurs en double')
  }

  const deck = shuffle(makeDeck(), mulberry32(seed))
  const players = playerIds.map((id, i) => ({
    id,
    hand: deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE),
  }))
  const sleeping = deck.slice(playerIds.length * HAND_SIZE)

  const { starterIndex, openingTile } = findOpening(players.map((p) => p.hand))

  return {
    rules: { ...DEFAULT_RULES, ...rules },
    players,
    line: [],
    sleeping,
    turn: starterIndex,
    consecutivePasses: 0,
    status: 'playing',
    result: null,
    lastPlayerIndex: null,
    forcedOpening: openingTile,
  }
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
    return [{ type: 'play', tile: state.forcedOpening!, end: 'right' }]
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

  const hand = next.players[playerIndex]!.hand
  if (hand.length === 0) {
    next.status = 'finished'
    next.result = buildResult(next, playerId, 'domino')
  } else {
    next.turn = (next.turn + 1) % next.players.length
  }
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
