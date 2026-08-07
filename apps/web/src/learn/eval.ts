/**
 * Évaluation positionnelle — ce que l'IA « comprend » d'une position sans
 * calculer un seul coup.
 *
 * La version précédente ne connaissait que le matériel, les tables de cases et
 * trois règles de pions. Elle jouait donc des coups matériellement corrects
 * mais positionnellement naïfs : pièces enfermées, roi à découvert, tours
 * endormies. Ici on ajoute ce qui fait la différence au-delà de 1800 :
 *
 *  • MOBILITÉ — une pièce qui ne peut aller nulle part ne vaut presque rien ;
 *  • SÉCURITÉ DU ROI — bouclier de pions et pièces adverses qui rôdent ;
 *  • PIONS PASSÉS — leur valeur explose à mesure qu'ils avancent ;
 *  • TOURS — colonnes ouvertes et septième rangée ;
 *  • AVANT-POSTES — un cavalier soutenu et inattaquable vaut un fou ;
 *  • ÉVALUATION GLISSANTE — les mêmes facteurs ne pèsent pas pareil à
 *    l'ouverture et en finale, donc on interpole entre deux jeux de valeurs.
 */
import {
  BISHOP,
  BLACK,
  Board,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  onBoard,
  rankOf,
} from './board0x88'

export const VALUES: Record<number, number> = {
  [PAWN]: 100,
  [KNIGHT]: 320,
  [BISHOP]: 330,
  [ROOK]: 500,
  [QUEEN]: 900,
  [KING]: 20000,
}

/** Valeurs de finale : les pions montent, les cavaliers baissent un peu. */
const VALUES_EG: Record<number, number> = {
  [PAWN]: 120,
  [KNIGHT]: 310,
  [BISHOP]: 340,
  [ROOK]: 540,
  [QUEEN]: 960,
  [KING]: 20000,
}

/** Bonus de case, du point de vue des BLANCS, rangée 1 → 8. */
const PST: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0,
    20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50,
    50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10,
    5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10,
    0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0,
    0, 0, 0, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0,
    0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0,
    0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [KING]: [
    20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20,
    -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40,
    -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50,
    -40, -40, -30,
  ],
}

/** Roi actif en finale : on inverse la logique du roi caché. */
const KING_EG: number[] = [
  -50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20,
  -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20,
  30, 30, 20, -10, -30, -30, -20, -10, 0, 0, -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50,
]

/** En finale, pousser les pions vaut bien plus qu'occuper le centre. */
const PAWN_EG: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 15, 15, 15, 15, 15, 15,
  15, 15, 30, 30, 30, 30, 30, 30, 30, 30, 55, 55, 55, 55, 55, 55, 55, 55, 90, 90, 90, 90, 90, 90,
  90, 90, 0, 0, 0, 0, 0, 0, 0, 0,
]

const KNIGHT_DIRS = [33, 31, 18, 14, -33, -31, -18, -14]
const BISHOP_DIRS = [17, 15, -17, -15]
const ROOK_DIRS = [16, -16, 1, -1]
const KING_DIRS = [17, 16, 15, 1, -1, -15, -16, -17]

/** Mobilité : combien vaut une case accessible, par type de pièce. */
const MOBILITY_MG: Record<number, number> = { [KNIGHT]: 4, [BISHOP]: 5, [ROOK]: 2, [QUEEN]: 1 }
const MOBILITY_EG: Record<number, number> = { [KNIGHT]: 4, [BISHOP]: 5, [ROOK]: 4, [QUEEN]: 2 }

/** Bonus d'un pion passé selon la rangée atteinte (du point de vue du camp). */
const PASSED_MG = [0, 5, 10, 20, 35, 60, 100, 0]
const PASSED_EG = [0, 15, 25, 40, 70, 120, 180, 0]

/** Poids de l'attaque sur le roi, selon le nombre d'attaquants. */
const KING_ATTACK_WEIGHT = [0, 0, 40, 75, 100, 115, 125, 130, 130, 130]

const pstIndex = (sq: number, side: number): number => {
  const rank = rankOf(sq)
  const file = fileOf(sq)
  return side === WHITE ? rank * 8 + file : (7 - rank) * 8 + file
}

/** Phase de la partie : 24 = ouverture complète, 0 = finale nue. */
const PHASE_WEIGHT: Record<number, number> = {
  [KNIGHT]: 1,
  [BISHOP]: 1,
  [ROOK]: 2,
  [QUEEN]: 4,
}

/**
 * Évaluation statique en centipions, du point de vue du camp AU TRAIT.
 *
 * Un seul balayage du plateau rassemble tout : c'est la fonction la plus
 * appelée du moteur (des centaines de milliers de fois par coup), donc chaque
 * allocation évitée compte.
 */
export function evaluate(board: Board): number {
  let mg = 0
  let eg = 0
  let phase = 0

  // Colonnes des pions, par camp — sert aux pions doublés/isolés/passés.
  const pawnsByFile: Record<number, number[]> = {
    [WHITE]: [0, 0, 0, 0, 0, 0, 0, 0],
    [BLACK]: [0, 0, 0, 0, 0, 0, 0, 0],
  }
  // Masque des rangées occupées par un pion, colonne par colonne. Un simple
  // « pion le plus avancé » ne suffit pas : pour savoir si un pion est passé
  // il faut pouvoir demander « y a-t-il UN pion adverse au-dessus ? ».
  const pawnRanks: Record<number, number[]> = {
    [WHITE]: [0, 0, 0, 0, 0, 0, 0, 0],
    [BLACK]: [0, 0, 0, 0, 0, 0, 0, 0],
  }
  const bishops: Record<number, number> = { [WHITE]: 0, [BLACK]: 0 }
  const kingSquare: Record<number, number> = {
    [WHITE]: board.kings[WHITE]!,
    [BLACK]: board.kings[BLACK]!,
  }
  const kingAttackers: Record<number, number> = { [WHITE]: 0, [BLACK]: 0 }
  const kingAttackScore: Record<number, number> = { [WHITE]: 0, [BLACK]: 0 }

  const occupied: number[] = []
  for (let sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) !== 0) {
      sq += 7
      continue
    }
    const piece = board.squares[sq]!
    if (piece === 0) continue
    occupied.push(sq)
    const type = Math.abs(piece)
    const side = piece > 0 ? WHITE : BLACK
    if (type !== KING && type !== PAWN) phase += PHASE_WEIGHT[type] ?? 0
    if (type === BISHOP) bishops[side] = bishops[side]! + 1
    if (type === PAWN) {
      const file = fileOf(sq)
      pawnsByFile[side]![file] = pawnsByFile[side]![file]! + 1
      pawnRanks[side]![file] = pawnRanks[side]![file]! | (1 << rankOf(sq))
    }
  }

  /** Y a-t-il un pion de `side` STRICTEMENT devant la rangée `rank` ? */
  const pawnAhead = (side: number, file: number, rank: number): boolean => {
    if (file < 0 || file > 7) return false
    const mask = pawnRanks[side]![file]!
    // « Devant » dépend du camp : vers le haut pour les blancs, vers le bas
    // pour les noirs.
    const ahead = side === WHITE ? ~((1 << (rank + 1)) - 1) : (1 << rank) - 1
    return (mask & ahead) !== 0
  }

  // Zone du roi : les 8 cases autour, pour compter qui l'attaque.
  const kingZone: Record<number, Set<number>> = { [WHITE]: new Set(), [BLACK]: new Set() }
  for (const side of [WHITE, BLACK]) {
    const ks = kingSquare[side]!
    if (ks < 0) continue
    kingZone[side]!.add(ks)
    for (const dir of KING_DIRS) {
      const target = ks + dir
      if (onBoard(target)) kingZone[side]!.add(target)
    }
  }

  for (const sq of occupied) {
    const piece = board.squares[sq]!
    const type = Math.abs(piece)
    const side = piece > 0 ? WHITE : BLACK
    const enemy = -side
    const sign = side === WHITE ? 1 : -1
    const index = pstIndex(sq, side)

    let pieceMg = VALUES[type]! + (type === KING ? PST[KING]![index]! : PST[type]![index]!)
    let pieceEg =
      VALUES_EG[type]! +
      (type === KING ? KING_EG[index]! : type === PAWN ? PAWN_EG[index]! : PST[type]![index]!)

    if (type === KNIGHT || type === BISHOP || type === ROOK || type === QUEEN) {
      // Mobilité + pression sur le roi adverse, dans le même balayage.
      let moves = 0
      let attacksKing = 0
      const sliding = type !== KNIGHT
      const dirs =
        type === KNIGHT
          ? KNIGHT_DIRS
          : type === BISHOP
            ? BISHOP_DIRS
            : type === ROOK
              ? ROOK_DIRS
              : KING_DIRS
      for (const dir of dirs) {
        let target = sq + dir
        while (onBoard(target)) {
          const occupant = board.squares[target]!
          if (kingZone[enemy]!.has(target)) attacksKing++
          if (occupant === 0) {
            moves++
          } else {
            // Une case occupée par l'adversaire compte : on peut y aller.
            if ((occupant > 0 ? WHITE : BLACK) !== side) moves++
            break
          }
          if (!sliding) break
          target += dir
        }
      }
      pieceMg += moves * (MOBILITY_MG[type] ?? 0)
      pieceEg += moves * (MOBILITY_EG[type] ?? 0)
      if (attacksKing > 0) {
        kingAttackers[enemy] = kingAttackers[enemy]! + 1
        kingAttackScore[enemy] =
          kingAttackScore[enemy]! + attacksKing * (type === QUEEN ? 4 : type === ROOK ? 3 : 2)
      }

      if (type === ROOK) {
        const file = fileOf(sq)
        const own = pawnsByFile[side]![file]!
        const theirs = pawnsByFile[enemy]![file]!
        // Colonne ouverte = aucune pièce de pion ; semi-ouverte = plus des nôtres.
        if (own === 0 && theirs === 0) {
          pieceMg += 25
          pieceEg += 15
        } else if (own === 0) {
          pieceMg += 12
          pieceEg += 8
        }
        // Septième rangée : la tour coupe le roi et mange les pions.
        const seventh = side === WHITE ? 6 : 1
        if (rankOf(sq) === seventh) {
          pieceMg += 20
          pieceEg += 30
        }
      }

      if (type === KNIGHT) {
        // Avant-poste : cavalier avancé, défendu par un pion, qu'aucun pion
        // adverse ne peut jamais chasser.
        const rank = rankOf(sq)
        const file = fileOf(sq)
        const advanced = side === WHITE ? rank >= 3 && rank <= 5 : rank >= 2 && rank <= 4
        if (advanced) {
          const behind = side === WHITE ? sq - 16 : sq + 16
          const defended =
            (onBoard(behind - 1) && board.squares[behind - 1] === side * PAWN) ||
            (onBoard(behind + 1) && board.squares[behind + 1] === side * PAWN)
          // Inattaquable : aucun pion adverse ne pourra jamais venir le chasser.
          const safe = !pawnAhead(enemy, file - 1, rank) && !pawnAhead(enemy, file + 1, rank)
          if (defended && safe) {
            pieceMg += 28
            pieceEg += 18
          }
        }
      }
    }

    if (type === PAWN) {
      const file = fileOf(sq)
      const rank = rankOf(sq)
      // Pion passé : aucun pion adverse devant lui ni sur les colonnes voisines.
      const passed =
        !pawnAhead(enemy, file - 1, rank) &&
        !pawnAhead(enemy, file, rank) &&
        !pawnAhead(enemy, file + 1, rank)
      if (passed) {
        const step = side === WHITE ? rank : 7 - rank
        pieceMg += PASSED_MG[step]!
        pieceEg += PASSED_EG[step]!
      }
    }

    mg += sign * pieceMg
    eg += sign * pieceEg
  }

  for (const side of [WHITE, BLACK]) {
    const sign = side === WHITE ? 1 : -1
    const files = pawnsByFile[side]!
    for (let file = 0; file < 8; file++) {
      const count = files[file]!
      if (count === 0) continue
      // Pions doublés : ils se gênent et n'en défendent qu'un seul.
      if (count > 1) {
        mg -= sign * 18 * (count - 1)
        eg -= sign * 28 * (count - 1)
      }
      // Pion isolé : personne pour le défendre, à vie.
      const left = file > 0 ? files[file - 1]! : 0
      const right = file < 7 ? files[file + 1]! : 0
      if (left === 0 && right === 0) {
        mg -= sign * 15
        eg -= sign * 22
      }
    }
    // Paire de fous : un avantage durable, surtout quand ça s'ouvre.
    if (bishops[side]! >= 2) {
      mg += sign * 30
      eg += sign * 45
    }

    // Bouclier de pions devant le roi : trois pions en place valent une pièce
    // en défense. Un roi nu se fait mater, quelle que soit sa matière.
    const ks = kingSquare[side]!
    if (ks >= 0) {
      const kingFile = fileOf(ks)
      const kingRank = rankOf(ks)
      const home = side === WHITE ? kingRank <= 1 : kingRank >= 6
      if (home) {
        let shield = 0
        for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
          if (files[f]! > 0) shield++
        }
        mg += sign * (shield * 12 - 24)
      }
    }

    // Pression adverse sur notre roi : plusieurs attaquants coûtent très cher.
    const attackers = Math.min(kingAttackers[side]!, KING_ATTACK_WEIGHT.length - 1)
    if (attackers >= 2) {
      mg -= sign * Math.round((kingAttackScore[side]! * KING_ATTACK_WEIGHT[attackers]!) / 100)
    }
  }

  // Interpolation ouverture ↔ finale.
  const clamped = Math.min(24, phase)
  const score = Math.round((mg * clamped + eg * (24 - clamped)) / 24)
  return board.side === WHITE ? score : -score
}
