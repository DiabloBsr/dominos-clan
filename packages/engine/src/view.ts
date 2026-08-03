import type { GameState, GameView, Role } from './types'
import { legalMoves, lineEnds } from './game'
import { deepClone } from './clone'

/**
 * Vue filtrée par rôle — c'est la SEULE forme d'état qui doit sortir du serveur.
 *
 * - joueur : sa main + ses coups légaux, mais JAMAIS les mains adverses
 *   (uniquement les comptes) — l'anti-triche se joue ici, pas à l'affichage.
 * - spectateur : toutes les mains visibles.
 * - manche terminée (domino, blocage ou doubles) : toutes les mains sont
 *   révélées à tout le monde, avec les points dans result.pips.
 * - les dominos dormants ne sont révélés à personne (compte seulement).
 */
export function viewFor(state: GameState, viewerId: string, role: Role): GameView {
  const spectator = role === 'spectator'
  const revealAll = spectator || state.status === 'finished'
  const self = state.players.find((p) => p.id === viewerId)

  const playerIndex = state.players.findIndex((p) => p.id === viewerId)
  const canUndo =
    state.status === 'playing' &&
    state.lastPlay !== null &&
    state.lastPlay.playerIndex === playerIndex &&
    state.turn === (playerIndex + 1) % state.players.length

  return {
    players: state.players.map((p) => ({
      id: p.id,
      tileCount: p.hand.length,
      ...(revealAll ? { hand: deepClone(p.hand) } : {}),
    })),
    line: deepClone(state.line),
    ends: lineEnds(state),
    currentPlayerId: state.status === 'playing' ? state.players[state.turn]!.id : null,
    status: state.status,
    result: state.result ? deepClone(state.result) : null,
    sleepingCount: state.sleeping.length,
    you:
      !spectator && self
        ? { id: self.id, hand: deepClone(self.hand), legalMoves: legalMoves(state, viewerId) }
        : null,
    canUndo,
  }
}
