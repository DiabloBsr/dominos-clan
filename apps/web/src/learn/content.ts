/**
 * Contenu de la section « Apprendre » : leçons, puzzles et quiz.
 * Tout est statique et hors-ligne — aucun salon ni serveur nécessaire.
 *
 * ⚠️ Les puzzles sont VÉRIFIÉS par scripts/check-puzzles.ts (chess.js rejoue
 * chaque solution et confirme le mat) : ne jamais en ajouter sans relancer
 * `npm run check:puzzles -w @dominos-clan/web`.
 */

import { GENERATED_PUZZLES } from './puzzles.generated'

export type LearnGame = 'chess' | 'dominos' | 'ludo'

export interface Lesson {
  id: string
  game: LearnGame
  title: string
  /** Paragraphes (le premier sert de résumé dans la liste). */
  body: string[]
  /** Position à afficher en exemple (facultatif, échecs uniquement). */
  fen?: string
}

export interface Puzzle {
  id: string
  /** Position de départ. */
  fen: string
  /** Camp au trait, déduit du FEN mais rappelé pour l'affichage. */
  side: 'w' | 'b'
  /** 1 = mat en un coup, 2 = mat forcé en deux coups. */
  level: 1 | 2
  /** Coup solution en notation algébrique (ex. « Dh5# »). */
  solutionSan: string
  /** Coup solution en cases (utilisé pour valider le clic du joueur). */
  from: string
  to: string
  promotion?: string
  title: string
  hint: string
}

export interface QuizQuestion {
  id: string
  game: LearnGame
  question: string
  options: string[]
  /** Index de la bonne réponse dans `options`. */
  answer: number
  explanation: string
}

/* ─── Leçons ─────────────────────────────────────────────────────────── */

export const LESSONS: Lesson[] = [
  {
    id: 'chess-pieces',
    game: 'chess',
    title: '♟️ Comment bougent les pièces',
    body: [
      'Chaque pièce a sa façon de se déplacer, et c’est tout le jeu.',
      'Le PION avance d’une case tout droit (deux cases à son premier coup), mais il capture en diagonale — c’est la seule pièce qui ne prend pas comme elle avance.',
      'La TOUR va tout droit, en ligne ou en colonne, aussi loin qu’elle veut. Le FOU fait pareil en diagonale, et reste donc toujours sur sa couleur de case.',
      'La DAME cumule les deux : lignes, colonnes et diagonales. C’est la pièce la plus puissante.',
      'Le CAVALIER saute en « L » (deux cases puis une perpendiculaire) et c’est le seul à passer par-dessus les autres pièces.',
      'Le ROI ne bouge que d’une case à la fois, dans toutes les directions. Il ne peut jamais aller sur une case attaquée.',
    ],
  },
  {
    id: 'chess-castling',
    game: 'chess',
    title: '🏰 Le roque',
    body: [
      'Le roque déplace le roi ET une tour en un seul coup : c’est la meilleure façon de mettre son roi à l’abri.',
      'Le roi se décale de deux cases vers la tour, et la tour saute par-dessus lui pour se placer juste à côté.',
      'Quatre conditions : ni le roi ni cette tour n’ont déjà bougé, aucune pièce entre eux, le roi n’est pas en échec, et il ne traverse ni ne termine sur une case attaquée.',
      'Petit roque (côté roi) ou grand roque (côté dame) — dans le jeu, il suffit de déplacer le roi de deux cases, la tour suit toute seule.',
    ],
  },
  {
    id: 'chess-special',
    game: 'chess',
    title: '✨ Prise en passant et promotion',
    body: [
      'Deux règles que beaucoup de joueurs occasionnels ignorent.',
      'PRISE EN PASSANT : si un pion adverse avance de deux cases et vient se placer juste à côté de ton pion, tu peux le capturer comme s’il n’avait avancé que d’une case — mais uniquement au coup suivant, sinon le droit est perdu.',
      'PROMOTION : un pion qui atteint la dernière rangée se transforme immédiatement en dame, tour, fou ou cavalier (au choix). On prend presque toujours la dame, mais le cavalier peut être plus fort s’il donne échec et mat.',
    ],
  },
  {
    id: 'chess-end',
    game: 'chess',
    title: '👑 Mat, pat et les cinq nulles',
    body: [
      'Gagner, c’est faire échec et mat : le roi adverse est attaqué et aucun coup légal ne peut le sauver.',
      'Attention au PAT : si l’adversaire n’est PAS en échec mais n’a plus aucun coup légal, la partie est nulle. C’est le piège classique quand on a un gros avantage.',
      'Il y a cinq façons de faire nulle : le pat, l’accord mutuel, la triple répétition de la position, la règle des 50 coups (sans prise ni coup de pion), et le matériel insuffisant (roi seul, roi + fou ou roi + cavalier ne peuvent pas mater).',
      'Une subtilité utile en blitz : si ta pendule tombe mais que l’adversaire n’a pas de quoi mater, ce n’est pas une défaite — c’est nulle.',
    ],
  },
  {
    id: 'chess-values',
    game: 'chess',
    title: '⚖️ La valeur des pièces',
    body: [
      'Pour savoir si un échange est bon, on compte en « pions ».',
      'Pion = 1, cavalier = 3, fou = 3, tour = 5, dame = 9. Le roi n’a pas de valeur : il est inestimable.',
      'Échanger un cavalier (3) contre une tour (5) est un bon marché : on gagne « la qualité ».',
      'Mais la position compte autant que le matériel : un cavalier bien placé au centre vaut souvent mieux qu’une tour enfermée.',
    ],
  },
  {
    id: 'chess-opening',
    game: 'chess',
    title: '🎯 Les 3 principes de l’ouverture',
    body: [
      'Les vingt premiers coups décident souvent de la partie. Trois règles suffisent pour bien démarrer.',
      '1. Occupe le CENTRE avec tes pions (e4, d4 ou e5, d5) : les pièces au centre contrôlent plus de cases.',
      '2. DÉVELOPPE tes pièces (cavaliers puis fous) au lieu de rejouer dix fois la même. Une pièce qui dort ne sert à rien.',
      '3. METS TON ROI À L’ABRI en roquant tôt, et évite de sortir la dame trop vite — elle se fait chasser et tu perds du temps.',
    ],
  },
  {
    id: 'dominos-house',
    game: 'dominos',
    title: '🁫 Les règles maison du Clan',
    body: [
      'Notre dominos suit les règles classiques, avec nos ajouts de table.',
      'GEL : si tu passes librement alors que tu pouvais jouer, les dominos jouables à cet instant sont gelés — impossible de les poser jusqu’à la fin de la manche (mais leurs points comptent).',
      'DOUBLES À LA DONNE : 4 ou 5 doubles dans une main annulent la donne (le chef redistribue) ; 6 ou 7 doubles gagnent la manche immédiatement.',
      'VICTOIRE ÉCLAIR : si tu cumules le seuil configuré alors que tous les autres sont encore à zéro, tu remportes le match sur-le-champ.',
      'TABLE STÉRILE : si personne n’ouvre son compteur au bout de 3 manches, toute la table saute et la file prend les places.',
    ],
  },
  {
    id: 'ludo-house',
    game: 'ludo',
    title: '🎲 Le Ludo du Clan',
    body: [
      'Sortir de prison demande un 6. Il faut arriver exactement sur la case finale.',
      'CAPTURE : atterrir sur un pion adverse le renvoie en prison — et seul le bouclier 🛡 peut annuler une prise, même les cases étoile ne protègent pas.',
      'ON REJOUE après un 6, après une capture, et quand un pion atteint l’objectif.',
      'BONUS : chaque case affiche son logo — deuxième lancer 🎲, saut 🚀, prison 🚔, bouclier 🛡️, échange 🔁, téléport étoile 🌟, et les cases mystère ❓. Un bonus ramassé se replace ailleurs au hasard.',
      'La prison 🚔 atteint aussi le couloir coloré : seuls les pions déjà arrivés sont intouchables.',
    ],
  },
]

/* ─── Puzzles (tous prouvés par chess.js) ────────────────────────────── */

/** Positions composées à la main, aux motifs classiques et nommés. */
const HANDMADE_PUZZLES: Puzzle[] = [
  {
    id: 'p1',
    fen: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',
    side: 'w',
    level: 1,
    solutionSan: 'Ra8#',
    from: 'a1',
    to: 'a8',
    title: 'La tour sur la dernière rangée',
    hint: 'Le roi noir est enfermé par ses propres pions : une seule pièce suffit.',
  },
  {
    id: 'p2',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    side: 'w',
    level: 1,
    solutionSan: 'Qxf7#',
    from: 'f3',
    to: 'f7',
    title: 'Le mat du berger',
    hint: 'La case la plus faible au début de partie n’est défendue que par le roi.',
  },
  {
    id: 'p3',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
    side: 'w',
    level: 1,
    solutionSan: 'Qd8#',
    from: 'd1',
    to: 'd8',
    title: 'La dame au fond du couloir',
    hint: 'Les trois pions du roi noir sont sa propre prison.',
  },
  {
    id: 'p4',
    fen: '3qk3/8/8/8/8/8/5PPP/6K1 b - - 0 1',
    side: 'b',
    level: 1,
    solutionSan: 'Qd1#',
    from: 'd8',
    to: 'd1',
    title: 'Aux noirs de jouer',
    hint: 'La dame plonge sur la dernière rangée blanche — le roi n’a plus une seule case.',
  },
  {
    id: 'p5',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    side: 'w',
    level: 1,
    solutionSan: 'Nf7#',
    from: 'g5',
    to: 'f7',
    title: 'Le mat étouffé',
    hint: 'Le roi noir est enterré sous ses propres pièces : une seule pièce saute par-dessus tout.',
  },
  {
    id: 'p6',
    fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1',
    side: 'w',
    level: 1,
    solutionSan: 'Ra8#',
    from: 'a1',
    to: 'a8',
    title: 'L’opposition des rois',
    hint: 'Ton roi contrôle déjà les cases de fuite : il ne reste qu’à amener la tour.',
  },
]

/**
 * Puzzles composés à la main + positions GÉNÉRÉES et prouvées par le moteur
 * (mat forcé au niveau annoncé, premier coup unique).
 */
export const PUZZLES: Puzzle[] = [...HANDMADE_PUZZLES, ...GENERATED_PUZZLES]

export const PUZZLES_BY_LEVEL = (level: 1 | 2): Puzzle[] =>
  PUZZLES.filter((p) => p.level === level)

/* ─── Quiz ───────────────────────────────────────────────────────────── */

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    game: 'chess',
    question: 'Le roi adverse n’est PAS en échec, mais il n’a plus aucun coup légal. Que se passe-t-il ?',
    options: ['Tu gagnes par échec et mat', 'La partie est nulle (pat)', 'Il passe son tour', 'Il perd sa dame'],
    answer: 1,
    explanation: 'C’est le pat : sans échec et sans coup légal, la partie est nulle — le piège classique quand on domine.',
  },
  {
    id: 'q2',
    game: 'chess',
    question: 'Quelle pièce peut sauter par-dessus les autres ?',
    options: ['Le fou', 'La tour', 'Le cavalier', 'La dame'],
    answer: 2,
    explanation: 'Le cavalier est le seul à sauter : il se déplace en « L » sans se soucier des pièces sur son chemin.',
  },
  {
    id: 'q3',
    game: 'chess',
    question: 'Combien vaut une tour, en pions ?',
    options: ['3', '5', '9', '1'],
    answer: 1,
    explanation: 'Pion 1, cavalier et fou 3, tour 5, dame 9. Gagner une tour contre un fou, c’est gagner « la qualité ».',
  },
  {
    id: 'q4',
    game: 'chess',
    question: 'Ta pendule tombe, mais ton adversaire n’a plus que son roi. Résultat ?',
    options: ['Tu perds au temps', 'Partie nulle', 'Tu gagnes', 'On rejoue'],
    answer: 1,
    explanation: 'Règle FIDE 6.9 : si l’adversaire ne peut pas mater même en jouant au mieux, le temps écoulé donne une nulle.',
  },
  {
    id: 'q5',
    game: 'chess',
    question: 'Après combien de coups sans prise ni mouvement de pion peut-on réclamer la nulle ?',
    options: ['20', '30', '50', '100'],
    answer: 2,
    explanation: 'La règle des 50 coups (par joueur). À 75 coups, la nulle devient même automatique.',
  },
  {
    id: 'q6',
    game: 'chess',
    question: 'Un pion atteint la dernière rangée. Que peut-il devenir ?',
    options: ['Une dame uniquement', 'Une dame ou une tour', 'N’importe quelle pièce sauf le roi', 'Il reste un pion'],
    answer: 2,
    explanation: 'Dame, tour, fou ou cavalier — jamais un roi. Le cavalier est parfois plus fort s’il mate tout de suite.',
  },
  {
    id: 'q7',
    game: 'chess',
    question: 'Peut-on roquer si le roi doit traverser une case attaquée ?',
    options: ['Oui, seule la case d’arrivée compte', 'Non, jamais', 'Oui si on n’est pas en échec', 'Seulement du côté dame'],
    answer: 1,
    explanation: 'Le roi ne peut ni être en échec, ni traverser, ni arriver sur une case attaquée.',
  },
  {
    id: 'q8',
    game: 'dominos',
    question: 'Aux dominos du Clan, que se passe-t-il si tu passes alors que tu pouvais jouer ?',
    options: [
      'Rien de spécial',
      'Tu perds un point',
      'Tes dominos jouables sont gelés pour la manche',
      'Tu rejoues aussitôt',
    ],
    answer: 2,
    explanation: 'La passe libre gèle les dominos que tu pouvais poser : ils restent en main et comptent dans tes points.',
  },
  {
    id: 'q9',
    game: 'dominos',
    question: 'Combien de doubles dans une main font gagner la manche immédiatement ?',
    options: ['3', '4 ou 5', '6 ou 7', 'Jamais'],
    answer: 2,
    explanation: '4 ou 5 doubles annulent la donne (redistribution) ; 6 ou 7 gagnent la manche sur-le-champ.',
  },
  {
    id: 'q10',
    game: 'ludo',
    question: 'Au Ludo du Clan, qu’est-ce qui protège d’une capture ?',
    options: ['Les cases étoile', 'Le couloir coloré', 'Uniquement le bouclier 🛡', 'Rien du tout'],
    answer: 2,
    explanation: 'Chez nous, seul le bouclier annule une prise — les étoiles ne sont que des repères visuels.',
  },
  {
    id: 'q11',
    game: 'ludo',
    question: 'Dans quels cas rejoue-t-on immédiatement ?',
    options: [
      'Seulement après un 6',
      'Après un 6, une capture, ou un pion arrivé',
      'Jamais',
      'Quand on est le chef',
    ],
    answer: 1,
    explanation: 'Trois façons de garder la main : le 6, la capture d’un pion adverse, et un pion qui atteint l’objectif.',
  },
]
