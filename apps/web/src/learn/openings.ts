/**
 * Bibliothèque d'ouvertures — tous les grands styles de jeu.
 *
 * Les coups sont stockés en SAN ANGLAIS (N, B, R, Q, K) parce que c'est ce que
 * comprend le moteur maison ; l'affichage les traduit en français via `frSan`.
 *
 * ⚠️ Chaque ligne est REJOUÉE par scripts/check-book.ts : si un coup est
 * illégal le script échoue. Ne jamais ajouter une ouverture sans relancer
 * `npm run check:book -w @dominos-clan/web`.
 */

export type OpeningFamily = 'ouverte' | 'semi-ouverte' | 'fermee' | 'indienne' | 'flanc' | 'piege'

export interface Opening {
  id: string
  name: string
  /** Code ECO, pour ceux qui veulent creuser ailleurs. */
  eco: string
  family: OpeningFamily
  /** L'esprit de l'ouverture en une phrase. */
  idea: string
  /** À qui elle va bien. */
  style: string
  /** Coups en SAN anglais, dans l'ordre. */
  moves: string[]
  /** Commentaire sur certains demi-coups, indexé sur la position dans `moves`. */
  notes: Record<number, string>
}

export const FAMILY_LABELS: Record<OpeningFamily, string> = {
  ouverte: '⚔️ Ouvertures ouvertes (1.e4 e5)',
  'semi-ouverte': '🗡️ Semi-ouvertes (1.e4 autre)',
  fermee: '🏰 Fermées (1.d4 d5)',
  indienne: '🐘 Défenses indiennes (1.d4 Cf6)',
  flanc: '🌊 Ouvertures de flanc',
  piege: '🪤 Pièges célèbres',
}

/** Traduit un coup SAN anglais en notation française pour l'affichage. */
const FR_PIECES: Record<string, string> = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' }
export const frSan = (san: string): string =>
  san
    .replace(/^[NBRQK]/, (c) => FR_PIECES[c] ?? c)
    .replace(/=([NBRQ])/, (_, c: string) => `=${FR_PIECES[c] ?? c}`)

export const OPENINGS: Opening[] = [
  /* ─── Ouvertures ouvertes ──────────────────────────────────────────── */
  {
    id: 'italienne',
    name: 'La Partie italienne',
    eco: 'C50',
    family: 'ouverte',
    idea: 'Sortir vite, viser f7, et occuper le centre avec c3-d4.',
    style: 'Parfaite pour débuter : chaque coup fait exactement ce qu’on attend de lui.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O'],
    notes: {
      0: 'e4 libère la dame et le fou : le coup le plus naturel du jeu.',
      2: 'Cf3 attaque e5 et développe. On développe cavaliers avant fous.',
      4: 'Fc4 pointe sur f7 — la case la plus faible du camp noir au début.',
      6: 'c3 prépare d4 : on veut deux pions au centre, pas un.',
      10: 'Le roque avant tout. Roi en sécurité, tour activée.',
    },
  },
  {
    id: 'espagnole',
    name: 'L’Espagnole (Ruy Lopez)',
    eco: 'C65',
    family: 'ouverte',
    idea: 'Harceler le cavalier c6 qui défend e5, puis étouffer lentement les noirs.',
    style: 'L’ouverture des champions du monde. Lente, profonde, écrasante.',
    moves: [
      'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7',
      'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O',
    ],
    notes: {
      4: 'Fb5 cloue indirectement le défenseur de e5. Pas une menace immédiate, une pression.',
      5: 'a6 (« coup Morphy ») demande au fou de se décider.',
      6: 'Fa4 garde la diagonale. Fxc6 existe aussi : c’est l’Échange.',
      10: 'Te1 surprotège e4 avant tout autre plan.',
      14: 'c3 prépare d4 et offre une case de repli en c2 au fou.',
    },
  },
  {
    id: 'ecossaise',
    name: 'L’Écossaise',
    eco: 'C45',
    family: 'ouverte',
    idea: 'Ouvrir le centre tout de suite avec d4 pour éviter la théorie de l’Espagnole.',
    style: 'Direct, clair, très jouable sans réviser pendant des heures.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5', 'Be3', 'Qf6', 'c3', 'Nge7'],
    notes: {
      4: 'd4 casse le centre au coup 3 : le jeu s’ouvre immédiatement.',
      8: 'Fe3 soutient le cavalier d4 qui était attaqué par le fou c5.',
      9: 'Df6 attaque à nouveau le cavalier : les noirs jouent avec du tempo.',
    },
  },
  {
    id: 'deux-cavaliers',
    name: 'La Défense des deux cavaliers',
    eco: 'C57',
    family: 'ouverte',
    idea: 'Les noirs ignorent la menace sur f7 et jouent le contre-jeu.',
    style: 'Pour les bagarreurs : ça part en vrille dès le coup 4.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6'],
    notes: {
      5: 'Cf6 attaque e4 au lieu de défendre f7. Culotté.',
      6: 'Cg5 attaque f7 à deux reprises. Coup « moche » mais fort.',
      7: 'd5 ! On rend un pion pour dégager le centre et gagner du temps.',
      9: 'Ca5 chasse le fou c4, la pièce la plus dangereuse des blancs.',
    },
  },
  {
    id: 'gambit-roi',
    name: 'Le Gambit du Roi',
    eco: 'C33',
    family: 'ouverte',
    idea: 'Offrir un pion dès le coup 2 pour arracher le centre et la colonne f.',
    style: 'Romantique, sauvage. Tu gagnes vite ou tu perds vite.',
    moves: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'Bc4', 'Bg7', 'O-O', 'd6'],
    notes: {
      2: 'f4 !? Un pion contre l’initiative. Les vieux maîtres adoraient.',
      4: 'Cf3 empêche Dh4+ qui embêterait le roi blanc.',
      5: 'g5 accroche le pion en plus. Les noirs doivent savoir se défendre.',
      8: 'Le roque blanc ouvre la colonne f vers f7. Toute l’idée du gambit.',
    },
  },
  {
    id: 'gambit-evans',
    name: 'Le Gambit Evans',
    eco: 'C52',
    family: 'ouverte',
    idea: 'Donner le pion b pour construire un centre de pions énorme avec c3 et d4.',
    style: 'L’italienne sous stéroïdes. Kasparov l’a ressortie pour écraser du monde.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4', 'O-O'],
    notes: {
      6: 'b4 !? Le fou noir est attiré loin du centre.',
      8: 'c3 gagne un tempo sur le fou tout en préparant d4.',
      10: 'd4 : voilà le centre. Le pion sacrifié est déjà rentabilisé.',
    },
  },
  {
    id: 'petroff',
    name: 'La Défense russe (Petroff)',
    eco: 'C42',
    family: 'ouverte',
    idea: 'Répondre à la symétrie par la symétrie : tu attaques e5, j’attaque e4.',
    style: 'Solide à en pleurer. L’arme des joueurs qui veulent la nulle avec les noirs.',
    moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4', 'd5', 'Bd3', 'Nc6', 'O-O', 'Be7'],
    notes: {
      3: 'Cf6 ne défend pas e5, il contre-attaque e4.',
      5: 'd6 ! Surtout pas Cxe4 tout de suite : Dе2 gagnerait une pièce.',
      8: 'd4 soutient le futur retour du cavalier et ouvre le fou c1.',
    },
  },
  {
    id: 'philidor',
    name: 'La Défense Philidor',
    eco: 'C41',
    family: 'ouverte',
    idea: 'Soutenir e5 avec un pion plutôt qu’avec une pièce. Compact mais passif.',
    style: 'Petit espace, aucune faiblesse : un hérisson qui attend son heure.',
    moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Nf6', 'Nc3', 'Nbd7', 'Bc4', 'Be7', 'O-O', 'O-O'],
    notes: {
      3: 'd6 tient e5 mais enferme le fou f8 : c’est le prix.',
      7: 'Cbd7 et pas Cc6 : le cavalier soutient e5 sans bloquer le pion c.',
    },
  },
  {
    id: 'viennoise',
    name: 'La Viennoise',
    eco: 'C25',
    family: 'ouverte',
    idea: 'Développer Cc3 d’abord, puis lancer f4 avec le cavalier déjà en place.',
    style: 'Le gambit du roi en version prudente. Piégeuse.',
    moves: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Nf3', 'Be7'],
    notes: {
      2: 'Cc3 développe sans engager. Beaucoup de blancs jouent f4 ensuite.',
      5: 'd5 ! La seule bonne réponse : contrer au centre, pas prendre en f4.',
    },
  },

  /* ─── Semi-ouvertes ────────────────────────────────────────────────── */
  {
    id: 'sicilienne-najdorf',
    name: 'La Sicilienne — Najdorf',
    eco: 'B90',
    family: 'semi-ouverte',
    idea: 'Échanger le pion c contre le pion d : les noirs obtiennent la colonne c et un centre asymétrique.',
    style: 'La défense la plus combative du jeu. Fischer et Kasparov en ont vécu.',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6'],
    notes: {
      1: 'c5 refuse la symétrie : dès le coup 1 la partie sera déséquilibrée.',
      5: 'cxd4 : les noirs troquent un pion de flanc contre un pion central. Bonne affaire.',
      9: 'a6, le coup Najdorf. Il enlève b5 aux pièces blanches — minuscule et immense.',
      11: 'e5 chasse le cavalier et prend de l’espace, au prix d’un trou en d5.',
    },
  },
  {
    id: 'sicilienne-dragon',
    name: 'La Sicilienne — Dragon',
    eco: 'B76',
    family: 'semi-ouverte',
    idea: 'Fianchetto en g7 : le fou tire sur la grande diagonale jusqu’à a1.',
    style: 'Course aux rois : les blancs attaquent à droite, les noirs à gauche. Sang garanti.',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3', 'O-O'],
    notes: {
      9: 'g6 dessine le « dragon » : la structure de pions ressemble à la constellation.',
      11: 'Fg7 est le dragon lui-même. Il vise c3 et a1 pour toute la partie.',
      12: 'f3 protège e4 et prépare Dd2 puis le roque long : l’attaque va venir de h4-h5.',
    },
  },
  {
    id: 'sicilienne-fermee',
    name: 'La Sicilienne fermée',
    eco: 'B23',
    family: 'semi-ouverte',
    idea: 'Refuser d’ouvrir le centre : on joue une attaque à l’aile roi à l’ancienne.',
    style: 'Zéro théorie à réviser. Idéal si tu détestes apprendre 20 coups par cœur.',
    moves: ['e4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'd3', 'd6', 'f4', 'Nf6'],
    notes: {
      2: 'Cc3 au lieu de Cf3 : pas de d4, pas d’échange, pas de théorie.',
      10: 'f4 puis Cf3 et g4 : le plan est toujours le même quelle que soit la réponse.',
    },
  },
  {
    id: 'francaise-winawer',
    name: 'La Française — Winawer',
    eco: 'C18',
    family: 'semi-ouverte',
    idea: 'Bloquer le centre, clouer le cavalier c3, puis cogner sur la chaîne de pions blanche.',
    style: 'Structurel. Tu joues des plans, pas des coups.',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'],
    notes: {
      1: 'e6 prépare d5 sans se faire prendre le pion. Le prix : le fou c8 est enfermé.',
      5: 'Fb4 cloue le défenseur de e4.',
      7: 'c5 attaque la base de la chaîne d4. C’est LE plan de la Française.',
      10: 'bxc3 donne aux blancs un centre massif mais des pions doublés à vie.',
    },
  },
  {
    id: 'francaise-tarrasch',
    name: 'La Française — Tarrasch',
    eco: 'C06',
    family: 'semi-ouverte',
    idea: 'Cd2 au lieu de Cc3 : les blancs évitent le clouage Fb4 et gardent une structure saine.',
    style: 'La version « sans casse » pour les blancs.',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nd2', 'Nf6', 'e5', 'Nfd7', 'Bd3', 'c5', 'c3', 'Nc6'],
    notes: {
      4: 'Cd2 est passif mais interdit définitivement Fb4.',
      7: 'Cfd7 : le cavalier recule pour laisser passer f6, le coup de rupture noir.',
    },
  },
  {
    id: 'caro-kann',
    name: 'La Caro-Kann classique',
    eco: 'B18',
    family: 'semi-ouverte',
    idea: 'Comme la Française, mais on sort le fou c8 AVANT de fermer le centre.',
    style: 'Solide sans être passive. Zéro faiblesse structurelle.',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7'],
    notes: {
      1: 'c6 prépare d5 avec le pion c — le fou c8 reste libre, contrairement à la Française.',
      7: 'Ff5 ! Voilà toute la différence : le « mauvais fou » est déjà dehors.',
      10: 'h4 harcèle le fou. Les noirs répondent h6 pour lui garder une case.',
    },
  },
  {
    id: 'scandinave',
    name: 'La Scandinave',
    eco: 'B01',
    family: 'semi-ouverte',
    idea: 'Casser le centre blanc immédiatement, quitte à sortir la dame trop tôt.',
    style: 'Ultra simple à apprendre : une seule structure à connaître.',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'c6', 'Bc4', 'Bf5'],
    notes: {
      1: 'd5 au coup 1 : le pion e4 doit se décider tout de suite.',
      5: 'Da5 met la dame à l’abri sur une case où elle cloue le cavalier c3.',
      9: 'c6 donne une case de retraite à la dame en c7. Prudence obligatoire.',
    },
  },
  {
    id: 'pirc',
    name: 'La Défense Pirc',
    eco: 'B07',
    family: 'semi-ouverte',
    idea: 'Laisser les blancs prendre tout le centre… puis le dynamiter depuis les flancs.',
    style: 'Hypermoderne. Tu joues contre le centre adverse au lieu d’en construire un.',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3', 'Bg7', 'Be2', 'O-O', 'O-O', 'Bg4'],
    notes: {
      3: 'Cf6 attaque e4 avant même d’avoir un pion au centre.',
      5: 'g6 prépare le fianchetto : le fou g7 pilonnera d4 et e5 toute la partie.',
      11: 'Fg4 attaque le défenseur de d4. La rupture e5 ou c5 arrive ensuite.',
    },
  },
  {
    id: 'alekhine',
    name: 'La Défense Alekhine',
    eco: 'B04',
    family: 'semi-ouverte',
    idea: 'Provoquer les pions blancs pour qu’ils avancent trop, puis les attaquer.',
    style: 'Provocatrice. Le cavalier se fait chasser 4 fois — et c’était le plan.',
    moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'Nf3', 'Bg4', 'Be2', 'e6', 'O-O', 'Be7'],
    notes: {
      1: 'Cf6 !? Le cavalier s’offre comme cible dès le premier coup.',
      4: 'd4 : les blancs ont deux pions avancés. Sont-ils forts ou faibles ? Toute la partie tourne là-dessus.',
      7: 'Fg4 attaque le soutien de e5. Le pion avancé devient une cible.',
    },
  },

  /* ─── Fermées ──────────────────────────────────────────────────────── */
  {
    id: 'gambit-dame-refuse',
    name: 'Le Gambit dame refusé',
    eco: 'D37',
    family: 'fermee',
    idea: 'Les noirs tiennent d5 avec e6 et acceptent d’enfermer un fou pour rester solides.',
    style: 'Le grand classique des matchs de championnat du monde.',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6'],
    notes: {
      2: 'c4 n’est pas un vrai gambit : après dxc4 les blancs récupèrent le pion avec e3 et Fxc4.',
      3: 'e6 tient d5, mais le fou c8 va souffrir pendant 20 coups.',
      6: 'Fg5 cloue le cavalier f6, le défenseur de d5.',
      13: 'b6 prépare Fb7 : les noirs résolvent enfin le problème du fou.',
    },
  },
  {
    id: 'gambit-dame-accepte',
    name: 'Le Gambit dame accepté',
    eco: 'D20',
    family: 'fermee',
    idea: 'Prendre le pion c4, ne pas essayer de le garder, et jouer c5 pour libérer le jeu.',
    style: 'Dynamique et honnête. Le fou c8 sort, contrairement au GDR.',
    moves: ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3', 'e6', 'Bxc4', 'c5', 'O-O', 'a6'],
    notes: {
      3: 'dxc4 accepte. Erreur classique : essayer de garder le pion avec b5 — ça se punit.',
      9: 'c5 attaque d4 et libère tout le camp noir. C’est le coup à retenir.',
    },
  },
  {
    id: 'slave',
    name: 'La Défense slave',
    eco: 'D15',
    family: 'fermee',
    idea: 'Tenir d5 avec c6 au lieu de e6 : le fou c8 reste libre.',
    style: 'Le meilleur des deux mondes : solide ET le fou respire.',
    moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5', 'e3', 'e6'],
    notes: {
      3: 'c6 tient d5 sans enfermer personne.',
      7: 'dxc4 maintenant que Ff5 est possible : les noirs prennent le pion avec un plan.',
      8: 'a4 empêche b5 qui protégerait le pion c4.',
    },
  },
  {
    id: 'londres',
    name: 'Le Système de Londres',
    eco: 'D02',
    family: 'fermee',
    idea: 'Le même dispositif contre presque tout : d4, Cf3, Ff4, e3, Fd3, c3, Cbd2.',
    style: 'Zéro théorie, structure béton. L’ouverture des gens pressés.',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6', 'Bg3', 'O-O', 'Bd3', 'c5'],
    notes: {
      4: 'Ff4 SORT LE FOU AVANT e3. C’est la règle d’or du Londres : jamais l’enfermer.',
      8: 'Fg3 garde le fou en vie plutôt que d’échanger. Il gardera h2-b8 à l’œil.',
    },
  },

  /* ─── Défenses indiennes ───────────────────────────────────────────── */
  {
    id: 'est-indienne',
    name: 'La Défense est-indienne',
    eco: 'E97',
    family: 'indienne',
    idea: 'Laisser le centre aux blancs, puis tout casser avec f5 et attaquer le roi.',
    style: 'Explosive. Tu perds du terrain pendant 15 coups puis tu mates.',
    moves: [
      'd4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O',
      'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7',
    ],
    notes: {
      5: 'Fg7 : le fou tire sur la grande diagonale. Il ne bougera plus.',
      11: 'e5 défie le centre. Les blancs doivent choisir : fermer, échanger ou tenir.',
      14: 'd5 ferme le centre. Signal de départ : les noirs jouent Ce7, Cd7 puis f5 !',
      15: 'Ce7 dégage la case f5 pour le pion. Toute l’attaque noire passe par là.',
    },
  },
  {
    id: 'nimzo-indienne',
    name: 'La Nimzo-indienne',
    eco: 'E46',
    family: 'indienne',
    idea: 'Clouer Cc3 et l’échanger : les blancs héritent de pions doublés à vie.',
    style: 'Intellectuelle. On joue la structure, pas les pièces.',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5', 'Nf3', 'c5'],
    notes: {
      5: 'Fb4 est LE coup : il empêche e4 en clouant le cavalier qui le soutient.',
      9: 'd5 et c5 : les noirs frappent au centre pendant que le clouage tient.',
    },
  },
  {
    id: 'ouest-indienne',
    name: 'La Défense ouest-indienne',
    eco: 'E15',
    family: 'indienne',
    idea: 'Fianchetto en b7 pour contrôler e4 à distance, sans jamais y mettre un pion.',
    style: 'Ultra solide. Presque impossible à battre si tu ne fais pas d’erreur.',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7', 'Bg2', 'Be7', 'O-O', 'O-O'],
    notes: {
      5: 'b6 prépare Fb7 : la case e4 sera surveillée par un fou, pas par un pion.',
      6: 'g3 : les blancs répondent par le même fianchetto. Duel de grandes diagonales.',
    },
  },
  {
    id: 'grunfeld',
    name: 'La Défense Grünfeld',
    eco: 'D85',
    family: 'indienne',
    idea: 'Offrir le centre aux blancs pour l’attaquer ensuite avec c5 et Fg7.',
    style: 'Hypermoderne pure. Le centre blanc devient une cible géante.',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3', 'Bg7', 'Nf3', 'c5'],
    notes: {
      5: 'd5 ! Contrairement à l’est-indienne, on frappe au centre tout de suite.',
      8: 'e4 : les blancs ont un centre de rêve. Les noirs vont passer la partie à le démolir.',
      13: 'c5 attaque d4, la base du centre. Fg7 et Dа5 suivront.',
    },
  },
  {
    id: 'benoni',
    name: 'La Benoni moderne',
    eco: 'A61',
    family: 'indienne',
    idea: 'Structure asymétrique : les noirs ont la majorité à l’aile dame et la colonne e.',
    style: 'Déséquilibrée et risquée. Tal l’adorait.',
    moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6', 'e4', 'g6', 'Nf3', 'Bg7'],
    notes: {
      3: 'c5 refuse d’occuper le centre et provoque d5.',
      9: 'La structure Benoni est née : pions noirs c5-d6, colonne e ouverte, fou en g7.',
      11: 'g6 : encore le fianchetto. Le fou g7 vise le pion d4… qui n’existe plus. Il vise b2.',
    },
  },
  {
    id: 'hollandaise',
    name: 'La Défense hollandaise',
    eco: 'A88',
    family: 'indienne',
    idea: 'f5 dès le coup 1 : les noirs prennent e4 et attaqueront le roque blanc.',
    style: 'Agressive avec les noirs, ce qui est rare. Attention à la case e6 affaiblie.',
    moves: ['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'g6', 'Nf3', 'Bg7', 'O-O', 'O-O', 'c4', 'd6'],
    notes: {
      1: 'f5 contrôle e4 mais ouvre la diagonale vers le roi. Assumé.',
      11: 'La variante Léningrad : fou en g7 + pion f5. Le plan est e5 puis f4.',
    },
  },
  {
    id: 'catalane',
    name: 'La Catalane',
    eco: 'E06',
    family: 'indienne',
    idea: 'Combiner le centre du gambit dame et le fou fianchetto : pression éternelle sur d5.',
    style: 'Étouffante. Beaucoup de nulles… et beaucoup de victoires lentes.',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O', 'dxc4'],
    notes: {
      4: 'g3 : le fou catalan va en g2 et tirera sur a8 pendant toute la partie.',
      11: 'dxc4 : les noirs prennent le pion. Les blancs le récupèrent souvent avec Da4 ou Ce5.',
    },
  },

  /* ─── Flanc ────────────────────────────────────────────────────────── */
  {
    id: 'anglaise',
    name: 'L’Anglaise',
    eco: 'A29',
    family: 'flanc',
    idea: 'Une sicilienne avec les blancs, donc avec un temps de plus.',
    style: 'Souple : elle peut transposer dans presque tout.',
    moves: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Nb6', 'Nf3', 'Nc6'],
    notes: {
      0: 'c4 contrôle d5 sans engager les pions du roi.',
      4: 'g3 et Fg2 : la structure la plus courante de l’Anglaise.',
    },
  },
  {
    id: 'reti',
    name: 'L’Ouverture Réti',
    eco: 'A09',
    family: 'flanc',
    idea: 'Attaquer d5 depuis les flancs (c4 + Fg2) sans jamais mettre de pion au centre.',
    style: 'Le manifeste hypermoderne. Beaucoup de finesse, peu de chocs.',
    moves: ['Nf3', 'd5', 'c4', 'e6', 'g3', 'Nf6', 'Bg2', 'Be7', 'O-O', 'O-O', 'd3', 'c5'],
    notes: {
      0: 'Cf3 contrôle e5 et n’annonce rien. On voit d’abord ce que fait l’adversaire.',
      10: 'd3 puis Cbd2 et e4 : le centre viendra plus tard, et d’un coup.',
    },
  },
  {
    id: 'larsen',
    name: 'L’Attaque Larsen',
    eco: 'A01',
    family: 'flanc',
    idea: 'Fianchetto dame immédiat : le fou b2 tire sur e5 et g7 dès le coup 2.',
    style: 'Hors des sentiers battus. Ton adversaire sera hors théorie au coup 2.',
    moves: ['b3', 'e5', 'Bb2', 'Nc6', 'e3', 'Nf6', 'Bb5', 'Bd6', 'Na3', 'O-O'],
    notes: {
      0: 'b3 ne prend aucun espace mais prépare le fou le plus long du jeu.',
      6: 'Fb5 cloue le défenseur de e5, le pion que le fou b2 vise.',
    },
  },

  /* ─── Pièges ───────────────────────────────────────────────────────── */
  {
    id: 'piege-berger',
    name: 'Le Mat du berger',
    eco: 'C20',
    family: 'piege',
    idea: 'Dame + fou tapent ensemble sur f7, la case que seul le roi défend.',
    style: 'À connaître pour ne JAMAIS le subir. Un adversaire qui sait le parer gagne un temps.',
    moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
    notes: {
      4: 'Dh5 attaque f7 (avec le fou) et e5. Deux menaces d’un coup.',
      5: 'Cf6 ?? Le coup naturel qui perd. Il fallait g6 ou De7 pour tenir f7.',
      6: 'Dxf7# : la dame est protégée par le fou c4. Mat en 4 coups.',
    },
  },
  {
    id: 'piege-sot',
    name: 'Le Mat du sot',
    eco: 'A00',
    family: 'piege',
    idea: 'Le mat le plus rapide possible : deux coups. Uniquement si les blancs se sabordent.',
    style: 'Une curiosité — mais elle montre pourquoi f3 et g4 sont des coups criminels.',
    moves: ['f3', 'e5', 'g4', 'Qh4#'],
    notes: {
      0: 'f3 ?? ouvre la diagonale e1-h4 vers le roi. Jamais.',
      2: 'g4 ?? bouche la fuite en g2. Le mat est déjà là.',
      3: 'Dh4# : le roi blanc n’a aucune case et rien ne peut s’interposer.',
    },
  },
  {
    id: 'piege-legal',
    name: 'Le Mat de Legal',
    eco: 'C41',
    family: 'piege',
    idea: 'Sacrifier la dame parce que le clouage du cavalier n’était qu’une illusion.',
    style: 'Le plus beau piège d’ouverture qui existe. À placer une fois dans sa vie.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd6', 'Nc3', 'Bg4', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'],
    notes: {
      7: 'Fg4 cloue le cavalier f3 sur la dame. Les noirs pensent que Cxe5 est impossible.',
      8: 'Cxe5 !! Les blancs offrent la dame. Si les noirs prennent, c’est mat.',
      9: 'Fxd1 ?? La gourmandise. Il fallait Cxe5 et les noirs sont juste bien.',
      12: 'Cd5# : fou f7, cavaliers e5 et d5, le roi e7 est enfermé par ses propres pièces.',
    },
  },
  {
    id: 'piege-blackburne',
    name: 'Le Piège Blackburne',
    eco: 'C50',
    family: 'piege',
    idea: 'Offrir un pion « gratuit » en e5 pour mater en 7 coups.',
    style: 'Le piège favori des joueurs en ligne. Il rapporte plus d’un point sur trois.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#'],
    notes: {
      5: 'Cd4 !? Les noirs laissent e5 en prise. C’est l’appât.',
      6: 'Cxe5 ? Gourmand. Il fallait Cxd4 et les blancs sont mieux.',
      7: 'Dg5 attaque le cavalier ET g2 en même temps.',
      13: 'Cf3# : le roi blanc est enfermé par sa tour f1 et son fou e2. Étouffé.',
    },
  },
  {
    id: 'piege-fried-liver',
    name: 'L’Attaque du foie frit',
    eco: 'C57',
    family: 'piege',
    idea: 'Sacrifier un cavalier sur f7 pour traîner le roi noir en plein centre.',
    style: 'Terrifiant à subir. Les noirs survivent en théorie, mais il faut le savoir.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3'],
    notes: {
      9: 'Cxd5 ? Le coup naturel qui tombe dans le piège. Ca5 ! était correct.',
      10: 'Cxf7 !! Le roi est attiré au centre de l’échiquier au coup 6.',
      12: 'Df3+ : le roi ne peut pas rentrer, il doit avancer.',
      14: 'Cc3 amène la dernière pièce. Les noirs peuvent tenir, mais c’est l’enfer.',
    },
  },
  {
    id: 'piege-arche-noe',
    name: 'Le Piège de l’Arche de Noé',
    eco: 'C70',
    family: 'piege',
    idea: 'Attraper le fou espagnol dans une cage de pions a-b-c.',
    style: 'La revanche des noirs contre l’Espagnole. Trois pions suffisent.',
    moves: [
      'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'd6', 'd4', 'b5',
      'Bb3', 'Nxd4', 'Nxd4', 'exd4', 'Qxd4', 'c5', 'Qd5', 'Be6', 'Qc6+', 'Bd7', 'Qd5', 'c4',
    ],
    notes: {
      9: 'b5 chasse le fou vers b3, là où la cage va se refermer.',
      15: 'c5 ! Le premier barreau. Le fou n’a déjà plus que a2 et c2… surveillées.',
      21: 'c4 : le fou b3 est mort. Les pions a6-b5-c4 forment l’arche.',
    },
  },
]

export const OPENINGS_BY_FAMILY = (family: OpeningFamily): Opening[] =>
  OPENINGS.filter((o) => o.family === family)
