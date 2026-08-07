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
  /**
   * Dominos GELÉS par une passe libre : jouables au moment où le joueur a
   * choisi de passer, ils ne peuvent plus être posés de la manche (mais
   * comptent toujours dans ses points en fin de manche).
   */
  frozen: Tile[]
}

/** Préréglages de la table, choisis par l'hôte. */
export interface GameRules {
  /** null = manche sèche ; sinon match aux points : premier à atteindre ce score. */
  targetScore: number | null
  /** Ouverture du compteur : la première marque ne compte que si le gain atteint ce seuil (0 = tout compte). */
  openThreshold: number
  /** Autoriser de passer même quand on a un domino jouable. */
  freePass: boolean
  /**
   * Ouverture tournante : null = ouverture classique (plus gros double).
   * Sinon : 1re manche désignée par le plus petit double (1-1 → 6-6),
   * puis l'ouverture tourne autour de la table et l'ouvreur doit poser
   * un domino dont le total de points est ≤ à ce nombre.
   */
  openingMaxPips: number | null
  /**
   * Victoire éclair (mode match) : si PERSONNE n'a encore marqué et que le
   * premier gain de la rencontre atteint ce nombre, le match est gagné
   * immédiatement. null = désactivé.
   */
  instantWinScore: number | null
  /** Nombre de joueurs à table (2 à 4). Défaut : 3 — on joue toujours à 3. */
  maxSeats: number
  /**
   * Nombre de joueurs remplacés par la file à chaque victoire (1 à 3).
   * Défaut 1 : seul le plus petit score sort (à égalité, à gauche du gagnant).
   */
  swapCount: number
  /** Jeu du salon : dominos, échecs blitz (2 joueurs) ou Ludo (2-4). */
  gameType: 'dominos' | 'chess' | 'ludo'
  /** Échecs : minutes au départ pour chaque pendule (défaut 10). */
  chessMinutes: number
  /** Échecs : secondes ajoutées après chaque coup (défaut 0). */
  chessIncrement: number
  /** Ludo : nombre max de 6 successifs (2-4, défaut 3). */
  ludoSixes: number
  /** Ludo : partie avec bonus 🎁 (sinon simple). */
  ludoBonus: boolean
}

export const DEFAULT_RULES: GameRules = {
  targetScore: null,
  openThreshold: 0,
  freePass: false,
  openingMaxPips: null,
  instantWinScore: null,
  maxSeats: 3,
  swapCount: 1,
  gameType: 'dominos',
  chessMinutes: 10,
  chessIncrement: 0,
  ludoSixes: 3,
  ludoBonus: true,
}

/* ─── Échecs ──────────────────────────────────────────────────────── */

export type ChessColor = 'w' | 'b'

export type ChessEndReason =
  | 'checkmate'
  | 'timeout'
  /** Drapeau tombé mais l'adversaire ne peut pas mater (FIDE 6.9) → nulle. */
  | 'timeout-material'
  | 'resign'
  | 'stalemate'
  | 'draw'
  /** Nulle par accord mutuel. */
  | 'agreement'
  | 'threefold'
  | 'fifty'
  | 'material'
  | 'abandon'

/** Vue d'une partie d'échecs — information complète (rien à cacher aux échecs). */
export interface ChessView {
  fen: string
  whiteId: string
  blackId: string
  /** Temps restants (ms) au moment de l'envoi ; la pendule active décompte côté client. */
  whiteMs: number
  blackMs: number
  turn: ChessColor
  serverNow: number
  status: 'playing' | 'finished'
  /** false tant que chaque joueur n'a pas joué son premier coup : pendules gelées. */
  clockRunning: boolean
  check: boolean
  lastMove: { from: string; to: string } | null
  /** Couleur ayant proposé la nulle et attendant une réponse. */
  drawOffer: ChessColor | null
  /** Coups joués en notation algébrique (historique lisible). */
  history: string[]
  result: { winnerId: string | null; reason: ChessEndReason } | null
}

export interface RoundResult {
  /** null = manche nulle (blocage avec égalité au minimum de points) : personne ne marque. */
  winnerId: string | null
  /** 'doubles' = 6 ou 7 doubles dans une main à la donne → victoire immédiate. */
  reason: 'domino' | 'blocked' | 'doubles'
  /** Points restants dans chaque main à la fin de la manche. */
  pips: Record<string, number>
  /** Points pris par le gagnant (somme des mains adverses) ; 0 si manche nulle. */
  gain: number
}

/** Donne annulée (4 ou 5 doubles dans une main) — montrée à tout le monde. */
export interface RedealInfo {
  /** Le joueur qui avait trop de doubles. */
  culpritId: string
  doublesCount: number
  /** Toutes les mains de la donne annulée (révélées : la donne est morte). */
  hands: { id: string; hand: Tile[] }[]
}

export interface GameState {
  /** Règles de la manche (freePass influe sur les coups légaux). */
  rules: GameRules
  /** Donnes annulées pour excès de doubles avant celle-ci (affichées à tous). */
  redeals: RedealInfo[]
  /** Joueurs dans l'ordre du tour (2 à 4). */
  players: PlayerState[]
  line: PlacedTile[]
  /** Dominos non distribués (dorment, jamais révélés). */
  sleeping: Tile[]
  /** Index du joueur dont c'est le tour. */
  turn: number
  consecutivePasses: number
  /** 'redeal' = donne annulée (4-5 doubles) : partie en pause jusqu'à redistribution. */
  status: 'playing' | 'finished' | 'redeal'
  result: RoundResult | null
  /** Index du dernier joueur ayant posé un domino (départage des blocages). */
  lastPlayerIndex: number | null
  /** Domino imposé pour l'ouverture (plus gros double, sinon domino le plus lourd). */
  forcedOpening: Tile | null
  /**
   * Contrainte d'ouverture par plafond (manches « tournantes ») : si non-null
   * et forcedOpening null, l'ouvreur doit poser un domino de total ≤ ce nombre
   * (à défaut, son domino le plus léger).
   */
  openingMaxPips: number | null
  /**
   * Dernière pose (pour la reprise) : tant que le joueur suivant n'a pas agi,
   * son auteur peut reprendre son domino. Remis à null par toute passe ou reprise.
   */
  lastPlay: { playerIndex: number; end: End } | null
}

export type Role = 'player' | 'spectator'

/** Joueur tel que vu de l'extérieur : la main n'est présente que pour les spectateurs. */
export interface PublicPlayer {
  id: string
  tileCount: number
  hand?: Tile[]
  /** Dominos gelés par passe libre (révélés avec la main). */
  frozen?: Tile[]
}

export interface GameView {
  players: PublicPlayer[]
  line: PlacedTile[]
  ends: { left: number; right: number } | null
  currentPlayerId: string | null
  status: 'playing' | 'finished' | 'redeal'
  result: RoundResult | null
  sleepingCount: number
  /** Présent uniquement pour un joueur : sa main et ses coups légaux. */
  you: { id: string; hand: Tile[]; legalMoves: Move[]; frozen: Tile[] } | null
  /** Le spectateur/joueur peut-il reprendre son dernier domino posé ? */
  canUndo: boolean
  /** Donnes annulées pour excès de doubles (visibles par tous). */
  redeals: RedealInfo[]
}
