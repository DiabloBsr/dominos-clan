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
  /**
   * Ce que la ligne doit prouver (vérifié par le script).
   * `advantage` sert aux attaques qui ne gagnent pas de matériel tout de
   * suite mais laissent une position gagnante — les annoncer comme un mat
   * forcé serait un mensonge.
   */
  expect: { kind: 'mate' } | { kind: 'win'; gain: number } | { kind: 'advantage'; cp: number }
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
    spot: 'Avant chaque poussée de pion, regarde les DEUX cases en diagonale devant lui — et vérifie que la case d’arrivée n’est pas défendue. Contre un FOU, la fourchette de pion ne marche jamais : le fou défend toujours la case d’où on l’attaque.',
    fen: '4k3/8/2n1n3/8/3P4/8/8/4K3 w - - 0 1',
    line: ['d5', 'Ncd8', 'dxe6'],
    expect: { kind: 'win', gain: 3 },
    notes: {
      0: 'd5 attaque les deux cavaliers en même temps. Aucun des deux ne défend d5 — c’est ce qui rend la fourchette valable.',
      2: 'dxe6 : le pion rentre avec une pièce en poche.',
    },
  },
  {
    id: 'clouage',
    family: 'tactique',
    title: 'Le clouage',
    keyword: 'Clouage',
    idea: 'Une pièce ne peut plus bouger sans exposer une pièce plus chère derrière elle. Elle devient une statue — alors on la tape.',
    spot: 'Aligne fou/tour/dame avec une pièce adverse ET le ROI derrière : là, la pièce clouée ne peut même pas bouger, c’est illégal. Ensuite on l’attaque une fois de plus qu’elle n’est défendue.',
    fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1',
    line: ['d5', 'Ke7', 'dxc6'],
    expect: { kind: 'win', gain: 3 },
    notes: {
      0: 'd5 attaque le cavalier c6, qui est cloué ABSOLUMENT : le bouger exposerait le roi e8 au fou b5. Il est donc condamné à rester.',
      1: 'Le roi sort de la ligne pour libérer son cavalier… trop tard, c’est déjà le tour des blancs.',
      2: 'dxc6 : un cavalier gratuit. Un clouage absolu, c’est une pièce en moins pour l’adversaire.',
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
    line: ['Nxc6+', 'Kf7'],
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
    fen: '3r2k1/1P6/8/8/8/8/6PP/2R3K1 w - - 0 1',
    line: ['Rc8', 'Rf8', 'Rxf8+', 'Kxf8', 'b8=Q+'],
    expect: { kind: 'win', gain: 8 },
    notes: {
      0: 'La tour d8 a UN seul travail : tenir la case b8 pour empêcher la promotion. Tc8 ! On vient se coller à elle sur la 8e rangée.',
      1: 'Elle esquive… mais en s’écartant elle abandonne la 8e rangée.',
      2: 'Txf8+ : on échange les tours, le roi doit reprendre.',
      4: 'b8=D+ : la voie est libre. Un pion vient de devenir une dame.',
    },
  },
  {
    id: 'sacrifice-grec',
    family: 'tactique',
    title: 'Le sacrifice grec (Fxh7+)',
    keyword: 'Sacrifice grec',
    idea: 'Le fou se donne sur h7 pour attirer le roi dehors, le cavalier arrive en g5, la dame en h5 : mat.',
    spot: 'Il faut trois choses : fou en d3, cavalier en f3, et une dame qui peut rejoindre l’aile roi. Et surtout : AUCUN cavalier noir en f6, sinon il défend h5 et tout s’écroule.',
    fen: 'rn3rk1/ppp2ppp/1q2p3/8/3P4/2NB1N2/PPP2PPP/R2QR1K1 w - - 0 1',
    line: [
      'Bxh7+', 'Kxh7', 'Qd3+', 'Kg8', 'Ng5', 'Rd8', 'Qh7+', 'Kf8', 'Qh8+', 'Ke7', 'Qxg7',
    ],
    expect: { kind: 'advantage', cp: 150 },
    notes: {
      0: 'Fxh7+ !! On donne un fou pour un pion. Ce n’est pas un cadeau : c’est un billet d’entrée.',
      1: 'Le roi prend — sinon il est juste un pion en moins pour rien.',
      2: 'Dd3+ : la dame arrive AVEC échec. Le roi doit rentrer.',
      4: 'Cg5 : le cavalier rejoint l’attaque et menace Dh7 mat.',
      6: 'Dh7+ chasse le roi hors de son abri…',
      10: 'Dxg7 : le roi noir est nu au milieu de l’échiquier. Ce n’est pas un mat forcé, c’est une position gagnante — et c’est déjà énorme.',
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
    fen: '1R6/8/8/8/8/R7/3k4/7K w - - 0 1',
    line: ['Rb2+', 'Kc1', 'Raa2', 'Kd1', 'Ra1#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Tb2+ : la tour a3 interdit déjà la 3e rangée, celle-ci pousse le roi sur la première.',
      2: 'Taa2 : les deux tours se rangent côte à côte sur la 2e. Le roi n’a plus qu’une rangée.',
      4: 'Ta1# : une tour couvre la 1re, l’autre la 2e. C’est toute la méthode, et elle marche depuis n’importe quelle position.',
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
    spot: 'Il faut un cavalier qui contrôle g8 et deux tours, ET que le roi n’ait pas de fuite en f7 ou f8 — sinon il sort du filet et tout tombe à l’eau.',
    fen: '5rk1/5ppp/8/3N3R/8/8/8/1K1R4 w - - 0 1',
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
    fen: '2kr4/pp1n4/2n5/8/Q4B2/3B4/8/6K1 w - - 0 1',
    line: ['Qxc6+', 'bxc6', 'Ba6#'],
    expect: { kind: 'mate' },
    notes: {
      0: 'Dxc6+ !! La dame se sacrifie uniquement pour forcer le pion b7 à bouger.',
      1: 'bxc6 — obligé : c’est la SEULE reprise. S’il y avait un pion en d7, il reprendrait de l’autre côté, b7 resterait en place et tout le sacrifice tomberait à l’eau.',
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
