/** Domino canonique : hi >= lo (ex. le 6-3 est toujours {hi: 6, lo: 3}). */
export interface Tile {
  hi: number
  lo: number
}

/** Domino posé sur la ligne, orienté : `left` touche le voisin de gauche, `right` celui de droite. */
export interface PlacedTile {
  tile: Tile
  left: number
  right: number
}

export type End = 'left' | 'right'

export type PlayMove = { type: 'play'; tile: Tile; end: End }
export type PassMove = { type: 'pass' }
export type Move = PlayMove | PassMove

export interface PlayerState {
  id: string
  hand: Tile[]
}

/** Préréglages de la table, choisis par l'hôte. */
export interface GameRules {
  /** null = manche sèche ; sinon match aux points : premier à atteindre ce score. */
  targetScore: number | null
  /** Ouverture du compteur : la première marque ne compte que si le gain atteint ce seuil (0 = tout compte). */
  openThreshold: number
  /** Autoriser de passer même quand on a un domino jouable. */
  freePass: boolean
}

export const DEFAULT_RULES: GameRules = {
  targetScore: null,
  openThreshold: 0,
  freePass: false,
}

export interface RoundResult {
  /** null = manche nulle (blocage avec égalité au minimum de points) : personne ne marque. */
  winnerId: string | null
  reason: 'domino' | 'blocked'
  /** Points restants dans chaque main à la fin de la manche. */
  pips: Record<string, number>
  /** Points pris par le gagnant (somme des mains adverses) ; 0 si manche nulle. */
  gain: number
}

export interface GameState {
  /** Règles de la manche (freePass influe sur les coups légaux). */
  rules: GameRules
  /** Joueurs dans l'ordre du tour (2 à 4). */
  players: PlayerState[]
  line: PlacedTile[]
  /** Dominos non distribués (dorment, jamais révélés). */
  sleeping: Tile[]
  /** Index du joueur dont c'est le tour. */
  turn: number
  consecutivePasses: number
  status: 'playing' | 'finished'
  result: RoundResult | null
  /** Index du dernier joueur ayant posé un domino (départage des blocages). */
  lastPlayerIndex: number | null
  /** Domino imposé pour l'ouverture (plus gros double, sinon domino le plus lourd). */
  forcedOpening: Tile | null
}

export type Role = 'player' | 'spectator'

/** Joueur tel que vu de l'extérieur : la main n'est présente que pour les spectateurs. */
export interface PublicPlayer {
  id: string
  tileCount: number
  hand?: Tile[]
}

export interface GameView {
  players: PublicPlayer[]
  line: PlacedTile[]
  ends: { left: number; right: number } | null
  currentPlayerId: string | null
  status: 'playing' | 'finished'
  result: RoundResult | null
  sleepingCount: number
  /** Présent uniquement pour un joueur : sa main et ses coups légaux. */
  you: { id: string; hand: Tile[]; legalMoves: Move[] } | null
}
