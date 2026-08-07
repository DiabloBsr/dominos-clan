/**
 * Combinaisons et schémas de mat — le cœur de l'académie.
 *
 * Chaque motif est une position + une ligne complète (coups du solveur ET
 * réponses adverses) + ce que la ligne doit prouver.
 *
 * ⚠️ scripts/check-book.ts rejoue chaque ligne sur le moteur maison : tout
 * coup illégal, tout mat annoncé qui n'en est pas un, tout gain de matériel
 * surestimé fait échouer le script. Ne jamais ajouter un motif sans relancer
 * `npm run check:book -w @dominos-clan/web`.
 */

export type MotifFamily = 'tactique' | 'mat' | 'technique'

export interface Motif {
  id: string
  family: MotifFamily
  title: string
  /** Le nom du motif, en un mot, pour l'apprendre par cœur. */
  keyword: string
  /** L'idée expliquée simplement. */
  idea: string
  /** Comment le repérer dans tes propres parties. */
  spot: string
  fen: string
  /** Ligne complète en SAN anglais. */
  line: string[]
  /** Ce que la ligne doit prouver (vérifié par le script). */
  expect: { kind: 'mate' } | { kind: 'win'; gain: number }
  /** Commentaires par demi-coup. */
  notes: Record<number, string>
}

export const MOTIF_FAMILY_LABELS: Record<MotifFamily, string> = {
  tactique: '⚡ Combinaisons',
  mat: '👑 Schémas de mat',
  technique: '🎯 Mats techniques (à savoir par cœur)',
}

export const MOTIFS: Motif[] = [
  /* ─── Combinaisons ─────────────────────────────────────────────────── */
  {
    id: 'fourchette-cavalier',
    family: 'tactique',
    title: 'La fourchette du cavalier',
    keyword: 'Fourchette',
    idea: 'Une pièce attaque deux cibles à la fois. L’adversaire n’en sauve qu’une.',
    spot: 'Cherche les cases d’où un cavalier toucherait le roi ET une tour/dame. Le cavalier est le roi de la fourchette parce que personne ne peut s’interposer.',
    fen: '2r3k1/5ppp/8/3N4/1B6/8/8/4K3 w - - 0 1',
    line: ['Ne7+', 'Kf8', 'Nxc8'],
    expect: { kind: 'win', gain: 5 },
    notes: {
      0: 'Ce7+ touche le roi en g8 et la tour en c8. Et le fou b4 défend le cavalier : le roi ne peut pas le manger.',
      1: 'Le roi doit parer l’échec. La tour, elle, est condamnée.',
      2: 'Cxc8 : une tour gagnée pour rien. C’est ça, une fourchette.',
    },
  },
  {
    id: 'fourchette-pion',
    family: 'tactique',
    title: 'La fourchette de pion',
    keyword: 'Fourchette',
    idea: 'Le pion est la pièce la moins chère : quand il fourche deux pièces, tu gagnes forcément.',
    spot: 'Avant chaque poussée de pion, regarde les DEUX cases en diagonale devant lui.',
    fen: '4k3/8/2n1b3/8/3P4/8/8/4K3 w - - 0 1',
    line: ['d5', 'Nd8', 'dxe6'],
    expect: { kind: 'win', gain: 3 },
    notes: {
      0: 'd5 attaque le cavalier c6 et le fou e6 en même temps. Un pion contre deux pièces.',
      2: 'dxe6 : le pion rentre avec une pièce en poche.',
    },
  },
  {
    id: 'clouage',
    family: 'tactique',
    title: 'Le clouage',
    keyword: 'Clouage',
    idea: 'Une pièce ne peut plus bouger sans exposer une pièce plus chère derrière elle. Elle devient une statue — alors on la tape.',
    spot: 'Aligne fou/tour/dame avec une pièce adverse ET quelque chose de gros derrière. Puis attaque la statue avec un pion.',
    fen: '3qkb1r/ppp2ppp/5n2/6B1/4P3/8/PPP2PPP/4K2R w Kk - 0 1',
    line: ['e5', 'Nd5', 'Bxd8', 'Kxd8'],
    expect: { kind: 'win', gain: 6 },
    notes: {
      0: 'e5 attaque le cavalier f6… qui est cloué sur la dame d8 par le fou g5.',
      1: 'Le cavalier fuit, mais il découvre la dame. C’est un clouage RELATIF : bouger est légal, juste ruineux.',
      2: 'Fxd8 ramasse la dame.',
      3: 'Le roi reprend le fou : dame contre fou, +6 pour les blancs.',
    },
  },
  {
    id: 'enfilade',
    family: 'tactique',
    title: 'L’enfilade (le clouage à l’envers)',
    keyword: 'Enfilade',
    idea: 'Le clouage met la grosse pièce derrière. L’enfilade la met devant : elle bouge, et on prend ce qui était caché.',
    spot: 'Roi et dame sur la même ligne = enfilade. C’est LA raison de ne jamais aligner son roi et sa dame.',
    fen: '4q3/8/8/4k3/8/8/8/3R2K1 w - - 0 1',
    line: ['Re1+', 'Kd6', 'Rxe8'],
    expect: { kind: 'win', gain: 9 },
    notes: {
      0: 'Te1+ : le roi et la dame sont sur la colonne e. Échec au roi.',
      1: 'Le roi doit quitter la colonne…',
      2: '…et la dame reste toute seule. Txe8.',
    },
  },
  {
    id: 'decouverte',
    family: 'tactique',
    title: 'L’attaque à la découverte',
    keyword: 'Découverte',
    idea: 'Une pièce s’écarte et libère la ligne d’une autre. Deux attaques pour un seul coup.',
    spot: 'Regarde tes fous et tours bloqués par TES propres pièces : si la pièce bloquante peut partir en menaçant quelque chose, c’est une découverte.',
    fen: '8/6k1/2q5/8/3N4/8/1B6/6K1 w - - 0 1',
    line: ['Nxc6', 'Kf7'],
    expect: { kind: 'win', gain: 9 },
    notes: {
      0: 'Cxc6 prend la dame ET découvre l’échec du fou b2 sur le roi g7.',
      1: 'Les noirs doivent parer l’échec — pas le temps de reprendre le cavalier. Dame gagnée.',
    },
  },
  {
    id: 'echec-double',
    family: 'tactique',
    title: 'L’échec double',
    keyword: 'Échec double',
    idea: 'Deux pièces donnent échec en même temps. On ne peut ni capturer ni s’interposer : LE ROI DOIT BOUGER. Toujours.',
    spot: 'C’est le coup le plus violent des échecs. Une seule pièce défendue ne sauve rien contre un double échec.',
    fen: '4k3/3N4/5r2/1B6/8/8/8/6K1 w - - 0 1',
    line: ['Nxf6+', 'Kd8'],
    expect: { kind: 'win', gain: 5 },
    notes: {
      0: 'Cxf6+ : le cavalier donne échec depuis f6 ET libère le fou b5 sur e8. Double échec.',
      1: 'Aucune capture, aucune interposition n’est légale : le roi bouge, et la tour est déjà dans la poche.',
    },
  },
  {
    id: 'deviation',
    family: 'tactique',
    title: 'La déviation',
    keyword: 'Déviation',
    idea: 'Une pièce adverse fait un travail vital. On la force à aller ailleurs — même si ça coûte du matériel.',
    spot: 'Demande-toi : « quelle pièce l’empêche de perdre ? ». Puis : « comment je l’oblige à bouger ? ».',
    fen: 'r5k1/1P6/8/8/8/8/6PP/2R3K1 w - - 0 1',
    line: ['Rc8+', 'Rxc8', 'bxc8=Q+', 'Kh7'],
    expect: { kind: 'win', gain: 8 },
    notes: {
      0: 'La tour a8 empêche b8=D. Tc8+ ! On lui offre la tour : elle ne peut pas refuser (c’est un échec).',
      1: 'Txc8 — la tour a quitté la case a8. Son travail est fini.',
      2: 'bxc8=D+ : le pion promeut EN PRENANT. Une dame pour une tour.',
    },
  },
  {
    id: 'sacrifice-grec',
    family: 'tactique',
    title: 'Le sacrifice grec (Fxh7+)',
    keyword: 'Sacrifice grec',
    idea: 'Le fou se donne sur h7 pour attirer le roi dehors, le cavalier arrive en g5, la dame en h5 : mat.',
    spot: 'Il faut trois choses : fou en d3, cavalier en f3, et la dame qui peut atteindre h5. Si le roi noir a roqué et qu’aucune pièce ne garde h7, vise.',
    fen: 'r4rk1/ppp2ppp/2n1p3/q7/3P4/2NB1N2/PPP2PPP/R2Q1RK1 w - - 0 1',
    line: ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5', 'Qxc3', 'Qh7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Fxh7+ !! On donne un fou pour un pion. Ce n’est pas un cadeau : c’est un billet d’entrée.',
      1: 'Le roi prend — sinon il est juste un pion en moins pour rien.',
      2: 'Cg5+ ! Le cavalier arrive avec échec, le roi doit reculer.',
      4: 'Dh5 : la menace est Dh7 mat. Il n’y a presque jamais de défense.',
      5: 'Les noirs prennent une pièce à l’autre bout… trop tard.',
      6: 'Dh7# : la dame est protégée par le cavalier g5, et le roi est enterré par ses propres pions.',
    },
  },
  {
    id: 'moulinet',
    family: 'tactique',
    title: 'Le moulinet',
    keyword: 'Moulinet',
    idea: 'Une découverte en boucle : échec, le roi revient, échec à la découverte, on rafle un pion, et on recommence.',
    spot: 'Il faut un fou qui vise le roi à travers une case, et une tour qui occupe cette case. Chaque aller-retour mange une pièce.',
    fen: '5rk1/pp3ppp/2p2B2/4P3/8/8/PP5P/6RK w - - 0 1',
    line: [
      'Rxg7+', 'Kh8', 'Rxf7+', 'Kg8', 'Rg7+', 'Kh8', 'Rxb7+', 'Kg8',
      'Rg7+', 'Kh8', 'Rxa7+', 'Kg8', 'Rg7+', 'Kh8', 'Rd7+', 'Kg8',
    ],
    expect: { kind: 'win', gain: 4 },
    notes: {
      0: 'Txg7+ ! La tour est imprenable : le fou f6 la défend.',
      2: 'Txf7+ : la tour s’écarte et le fou f6 donne échec. Le roi doit revenir en g8.',
      4: 'Tg7+ et on recommence. À chaque tour de manivelle, un pion tombe.',
      6: 'Txb7+ : troisième pion.',
      10: 'Txa7+ : quatrième. Quatre pions gratuits pour zéro risque.',
      14: 'Td7+ : la tour se retire enfin, riche.',
    },
  },
  {
    id: 'sous-promotion',
    family: 'tactique',
    title: 'La sous-promotion',
    keyword: 'Sous-promotion',
    idea: 'La dame est la meilleure pièce… sauf quand un cavalier donne échec et fourche dans la foulée.',
    spot: 'Quand tu promeus, demande-toi TOUJOURS si un cavalier ne ferait pas échec. C’est rare, mais ça décide des parties.',
    fen: '8/3P4/2q1k3/8/8/8/8/4K3 w - - 0 1',
    line: ['d8=N+', 'Kd6', 'Nxc6', 'Kxc6'],
    expect: { kind: 'win', gain: 8 },
    notes: {
      0: 'd8=C+ ! Une dame ne donnerait pas échec ici — le cavalier si, et il fourche le roi et la dame.',
      1: 'Le roi bouge, obligé.',
      2: 'Cxc6 ramasse la dame. Un pion valait neuf points aujourd’hui.',
    },
  },

  /* ─── Schémas de mat ───────────────────────────────────────────────── */
  {
    id: 'mat-couloir',
    family: 'mat',
    title: 'Le mat du couloir',
    keyword: 'Couloir',
    idea: 'Le roi a roqué, ses trois pions ne bougent pas : il est dans un couloir. Une tour sur la dernière rangée = mat.',
    spot: 'Dès qu’un roi adverse a f7-g7-h7 intacts, compte ses défenseurs de la 8e rangée. S’il y en a un seul, cherche à l’éliminer.',
    fen: '3rr1k1/5ppp/8/8/Q7/8/5PPP/4R1K1 w - - 0 1',
    line: ['Qxe8+', 'Rxe8', 'Rxe8#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dxe8+ !! On donne la dame pour supprimer un défenseur. Il en reste un — c’est exactement le compte.',
      1: 'Reprise forcée.',
      2: 'Txe8# : le roi est prisonnier de ses propres pions. Fais-toi une « fenêtre » (h6 ou g6) avant qu’il soit trop tard.',
    },
  },
  {
    id: 'mat-escalier',
    family: 'mat',
    title: 'Le mat de l’escalier',
    keyword: 'Escalier',
    idea: 'Deux tours qui alternent : une coupe le roi, l’autre le pousse. Rangée par rangée jusqu’au bord.',
    spot: 'Avec deux tours (ou tour + dame), tu n’as jamais besoin de calculer : applique la méthode.',
    fen: '8/8/R7/4k3/8/8/8/1R5K w - - 0 1',
    line: ['Rb5+', 'Ke4', 'Ra4+', 'Ke3', 'Rb3+', 'Ke2', 'Ra2+', 'Ke1', 'Rb1#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Tb5+ : la tour a6 interdit déjà la 6e rangée, celle-ci pousse le roi vers le bas.',
      2: 'Ta4+ : l’autre tour prend le relais. Elles ne se gênent jamais.',
      8: 'Tb1# : le roi est au bord, les deux dernières rangées sont couvertes. Mat.',
    },
  },
  {
    id: 'mat-etouffe',
    family: 'mat',
    title: 'Le mat étouffé (Philidor)',
    keyword: 'Étouffé',
    idea: 'Le plus beau mat du jeu : on sacrifie la dame pour que le roi soit enterré par ses PROPRES pièces, et le cavalier achève.',
    spot: 'Roi en g8/h8, pions g7-h7 en place, une tour en f8, et ta dame qui vise g8 : la combinaison est là.',
    fen: '5rk1/6pp/8/6N1/8/8/8/3Q2K1 w - - 0 1',
    line: ['Qb3+', 'Kh8', 'Nf7+', 'Kg8', 'Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Db3+ : la dame prend la diagonale a2-g8. Le roi va en h8.',
      2: 'Cf7+ : échec. Le roi doit revenir en g8 (h8 est occupé par lui-même… non, il en vient).',
      4: 'Ch6+ ! ÉCHEC DOUBLE : cavalier + dame. Le roi ne peut que reculer en h8.',
      6: 'Dg8+ !!! Le sacrifice de dame. La tour est OBLIGÉE de prendre.',
      7: 'Txg8 : et voilà, la tour a bouché la seule case de fuite du roi.',
      8: 'Cf7# : étouffé. Le roi est mort entouré de ses amis.',
    },
  },
  {
    id: 'mat-arabe',
    family: 'mat',
    title: 'Le mat arabe',
    keyword: 'Arabe',
    idea: 'Tour et cavalier dans le coin : la tour donne échec, le cavalier la protège ET couvre la fuite.',
    spot: 'Cavalier en f6 (ou f3/c6/c3) + roi adverse dans le coin = cherche la tour sur la 7e.',
    fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1',
    line: ['Rh7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Th7# : le cavalier f6 défend la tour ET contrôle g8. Deux pièces, un mat. C’est le plus vieux mat connu — il date du IXe siècle.',
    },
  },
  {
    id: 'mat-anastasie',
    family: 'mat',
    title: 'Le mat d’Anastasie',
    keyword: 'Anastasie',
    idea: 'Le cavalier en e7 enferme le roi, on sacrifie une tour sur h7 pour l’attirer, et la deuxième tour mate sur la colonne h.',
    spot: 'Il faut un cavalier qui contrôle g8 et deux tours. Vise la colonne h.',
    fen: 'r5k1/6pp/8/3N3R/8/8/8/1K1R4 w - - 0 1',
    line: ['Ne7+', 'Kh8', 'Rxh7+', 'Kxh7', 'Rh1#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Ce7+ : le cavalier prend g8 et g6 sous contrôle. Le roi part en h8.',
      2: 'Txh7+ !! On donne une tour entière pour tirer le roi sur la colonne h.',
      3: 'La prise est forcée.',
      4: 'Th1# : la deuxième tour arrive. g8 et g6 sont au cavalier, la colonne h est à la tour.',
    },
  },
  {
    id: 'mat-boden',
    family: 'mat',
    title: 'Le mat de Boden',
    keyword: 'Boden',
    idea: 'Deux fous sur des diagonales croisées piègent un roi qui a roqué du grand côté.',
    spot: 'Roi en c8, pion b7 : si tu peux dégager b7 par un sacrifice, les deux fous font le reste.',
    fen: '2kr4/pp1p4/2n5/8/Q4B2/3B4/8/6K1 w - - 0 1',
    line: ['Qxc6+', 'bxc6', 'Ba6#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dxc6+ !! La dame se sacrifie uniquement pour forcer le pion b7 à bouger.',
      1: 'bxc6 — obligé, et la diagonale a6-c8 vient de s’ouvrir.',
      2: 'Fa6# : un fou tient a6-c8, l’autre tient f4-b8. Le roi est pris en croix.',
    },
  },
  {
    id: 'mat-epaulette',
    family: 'mat',
    title: 'Le mat de l’épaulette',
    keyword: 'Épaulette',
    idea: 'Le roi est coincé entre ses deux tours — ses « épaulettes ». Une dame à distance suffit.',
    spot: 'Un roi entouré de ses propres tours n’a que trois cases. Si tu les couvres toutes, c’est mat sans même toucher au roi.',
    fen: '5rkr/8/8/8/8/3Q4/8/6K1 w - - 0 1',
    line: ['Qg6#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dg6# : f8 et h8 sont bloquées par les tours noires, f7, g7 et h7 sont à la dame. Elle n’est même pas défendue — elle n’en a pas besoin, le roi ne peut pas l’atteindre.',
    },
  },
  {
    id: 'mat-baiser',
    family: 'mat',
    title: 'Le baiser de la mort',
    keyword: 'Baiser',
    idea: 'La dame se colle au roi. Elle est protégée, donc imprenable, et couvre tout autour d’elle.',
    spot: 'Dame + fou sur la même grande diagonale = mat en g7/b2 quasi automatique quand le roi a roqué.',
    fen: '6k1/8/8/8/8/2Q5/1B6/6K1 w - - 0 1',
    line: ['Qg7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dg7# : la dame embrasse le roi, le fou b2 la protège à travers toute la diagonale. Rien à faire.',
    },
  },
  {
    id: 'mat-damiano',
    family: 'mat',
    title: 'Le mat de Damiano',
    keyword: 'Damiano',
    idea: 'Même idée que le baiser, mais c’est un simple pion qui protège la dame.',
    spot: 'Un pion en f6 (ou f3 pour les noirs) vaut une pièce entière dans une attaque : il soutient la case g7.',
    fen: '6k1/3Q4/5P2/8/8/8/8/6K1 w - - 0 1',
    line: ['Qg7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dg7# : le pion f6 protège la dame. Un pion, une dame, et c’est fini.',
    },
  },

  /* ─── Mats techniques ──────────────────────────────────────────────── */
  {
    id: 'technique-dame',
    family: 'technique',
    title: 'Roi + dame contre roi',
    keyword: 'Technique',
    idea: 'Pousse le roi adverse vers le bord avec la dame, amène TON roi, puis colle la dame.',
    spot: 'Attention au pat : si le roi adverse n’a plus aucune case et n’est pas en échec, la partie est nulle. Vérifie à chaque coup.',
    fen: '4k3/8/4K3/8/8/Q7/8/8 w - - 0 1',
    line: ['Qe7#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'De7# : la dame se colle, le roi blanc la protège. La règle : les deux rois se font face, la dame vient devant.',
    },
  },
  {
    id: 'technique-tour',
    family: 'technique',
    title: 'Roi + tour contre roi',
    keyword: 'Technique',
    idea: 'La tour coupe le roi sur une rangée, ton roi le pousse, et on referme.',
    spot: 'C’est le mat qu’il faut savoir faire les yeux fermés : il tombe dans une partie sur cinq.',
    fen: '4k3/8/4K3/8/8/8/8/R7 w - - 0 1',
    line: ['Ra8#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Ta8# : les rois « s’opposent » (face à face avec une case entre eux), la tour arrive derrière. Toujours la même figure.',
    },
  },
  {
    id: 'technique-deux-fous',
    family: 'technique',
    title: 'Roi + deux fous contre roi',
    keyword: 'Technique',
    idea: 'Les deux fous forment un mur infranchissable qu’on avance case par case jusqu’au coin.',
    spot: 'Ça se mate TOUJOURS, mais seulement dans un coin. Choisis-en un et pousse le roi dedans.',
    fen: '7k/5K2/8/8/8/8/8/1B4B1 w - - 0 1',
    line: ['Bd4#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Fd4# : un fou donne échec sur la grande diagonale, l’autre couvre h7, et le roi tient g7 et g8. Il faut TOUJOURS les trois pièces.',
    },
  },
]

export const MOTIFS_BY_FAMILY = (family: MotifFamily): Motif[] =>
  MOTIFS.filter((m) => m.family === family)
