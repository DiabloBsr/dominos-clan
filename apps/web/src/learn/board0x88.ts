/**
 * Moteur d'échecs MAISON — représentation 0x88, sans dépendance.
 *
 * Pourquoi ne pas garder chess.js ? Sa génération de coups recalcule la
 * notation algébrique de chaque coup (make/unmake caché) : une simple
 * position d'ouverture demandait 143 s à analyser. Ici, la génération est
 * brute (entiers, zéro allocation d'objet) — c'est ce qui rend possible une
 * IA qui joue en moins d'une seconde et un coach qui commente en direct.
 *
 * Convention 0x88 : case = rang * 16 + colonne, a1 = 0, h8 = 119.
 * Une case est hors échiquier si (case & 0x88) !== 0 — d'où le nom.
 * Correction prouvée par perft (scripts/perft.ts) sur les 5 positions de
 * référence de la communauté échiquéenne.
 */

export const EMPTY = 0
export const PAWN = 1
export const KNIGHT = 2
export const BISHOP = 3
export const ROOK = 4
export const QUEEN = 5
export const KING = 6

export const WHITE = 1
export const BLACK = -1

/** Droits de roque (bits). */
export const CASTLE_WK = 1
export const CASTLE_WQ = 2
export const CASTLE_BK = 4
export const CASTLE_BQ = 8

/** Drapeaux de coup. */
export const FLAG_NORMAL = 0
export const FLAG_DOUBLE = 1
export const FLAG_EP = 2
export const FLAG_CASTLE_K = 3
export const FLAG_CASTLE_Q = 4
export const FLAG_PROMO = 5

/* Un coup tient dans un entier : from | to<<8 | flag<<16 | promo<<20 | capt<<24 */
export const encodeMove = (from: number, to: number, flag = 0, promo = 0, capt = 0): number =>
  from | (to << 8) | (flag << 16) | (promo << 20) | (capt << 24)
export const moveFrom = (m: number): number => m & 0xff
export const moveTo = (m: number): number => (m >> 8) & 0xff
export const moveFlag = (m: number): number => (m >> 16) & 0xf
export const movePromo = (m: number): number => (m >> 20) & 0xf
export const moveCapt = (m: number): number => (m >> 24) & 0xf

const KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33]
const BISHOP_DIRS = [-17, -15, 15, 17]
const ROOK_DIRS = [-16, -1, 1, 16]
const KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17]

export const fileOf = (sq: number): number => sq & 7
export const rankOf = (sq: number): number => sq >> 4
export const onBoard = (sq: number): boolean => (sq & 0x88) === 0

const FILE_CHARS = 'abcdefgh'
export const squareName = (sq: number): string => `${FILE_CHARS[fileOf(sq)]}${rankOf(sq) + 1}`
export const nameToSquare = (name: string): number =>
  FILE_CHARS.indexOf(name[0]!) + (Number(name[1]) - 1) * 16

const PIECE_CHARS: Record<number, string> = {
  [PAWN]: 'p',
  [KNIGHT]: 'n',
  [BISHOP]: 'b',
  [ROOK]: 'r',
  [QUEEN]: 'q',
  [KING]: 'k',
}
const CHAR_PIECES: Record<string, number> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
}

interface Undo {
  captured: number
  capturedSquare: number
  castling: number
  ep: number
  halfmove: number
  kingSquare: number
}

export class Board {
  /** Pièce par case : positif = blanc, négatif = noir, 0 = vide. */
  squares = new Int8Array(128)
  side: number = WHITE
  castling = 0
  /** Case de prise en passant, -1 si aucune. */
  ep = -1
  halfmove = 0
  fullmove = 1
  kings: Record<number, number> = { [WHITE]: -1, [BLACK]: -1 }
  private history: Undo[] = []

  constructor(fen?: string) {
    if (fen) this.loadFen(fen)
  }

  loadFen(fen: string): void {
    this.squares.fill(0)
    const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/)
    let sq = 112 // a8
    for (const ch of placement!) {
      if (ch === '/') {
        sq -= 24 // début de la rangée du dessous
      } else if (ch >= '1' && ch <= '8') {
        sq += Number(ch)
      } else {
        const type = CHAR_PIECES[ch.toLowerCase()]!
        const piece = ch === ch.toUpperCase() ? type : -type
        this.squares[sq] = piece
        if (type === KING) this.kings[piece > 0 ? WHITE : BLACK] = sq
        sq += 1
      }
    }
    this.side = turn === 'b' ? BLACK : WHITE
    this.castling = 0
    if (castling?.includes('K')) this.castling |= CASTLE_WK
    if (castling?.includes('Q')) this.castling |= CASTLE_WQ
    if (castling?.includes('k')) this.castling |= CASTLE_BK
    if (castling?.includes('q')) this.castling |= CASTLE_BQ
    this.ep = ep && ep !== '-' ? nameToSquare(ep) : -1
    this.halfmove = Number(half ?? 0)
    this.fullmove = Number(full ?? 1)
    this.history = []
  }

  fen(): string {
    const rows: string[] = []
    for (let rank = 7; rank >= 0; rank--) {
      let row = ''
      let empty = 0
      for (let file = 0; file < 8; file++) {
        const piece = this.squares[rank * 16 + file]!
        if (piece === EMPTY) {
          empty++
          continue
        }
        if (empty) {
          row += empty
          empty = 0
        }
        const ch = PIECE_CHARS[Math.abs(piece)]!
        row += piece > 0 ? ch.toUpperCase() : ch
      }
      if (empty) row += empty
      rows.push(row)
    }
    let castle = ''
    if (this.castling & CASTLE_WK) castle += 'K'
    if (this.castling & CASTLE_WQ) castle += 'Q'
    if (this.castling & CASTLE_BK) castle += 'k'
    if (this.castling & CASTLE_BQ) castle += 'q'
    return `${rows.join('/')} ${this.side === WHITE ? 'w' : 'b'} ${castle || '-'} ${
      this.ep >= 0 ? squareName(this.ep) : '-'
    } ${this.halfmove} ${this.fullmove}`
  }

  /** La case est-elle attaquée par ce camp ? (base de toute la légalité) */
  attacked(square: number, bySide: number): boolean {
    // Pions : ils capturent en diagonale, dans leur sens de marche.
    const pawnDir = bySide === WHITE ? -16 : 16 // on remonte depuis la case visée
    for (const delta of [pawnDir - 1, pawnDir + 1]) {
      const from = square + delta
      if (onBoard(from) && this.squares[from] === bySide * PAWN) return true
    }
    for (const delta of KNIGHT_DIRS) {
      const from = square + delta
      if (onBoard(from) && this.squares[from] === bySide * KNIGHT) return true
    }
    for (const delta of KING_DIRS) {
      const from = square + delta
      if (onBoard(from) && this.squares[from] === bySide * KING) return true
    }
    for (const delta of BISHOP_DIRS) {
      for (let from = square + delta; onBoard(from); from += delta) {
        const piece = this.squares[from]!
        if (piece === EMPTY) continue
        if (piece === bySide * BISHOP || piece === bySide * QUEEN) return true
        break
      }
    }
    for (const delta of ROOK_DIRS) {
      for (let from = square + delta; onBoard(from); from += delta) {
        const piece = this.squares[from]!
        if (piece === EMPTY) continue
        if (piece === bySide * ROOK || piece === bySide * QUEEN) return true
        break
      }
    }
    return false
  }

  inCheck(side = this.side): boolean {
    return this.attacked(this.kings[side]!, -side)
  }

  /** Coups pseudo-légaux (la légalité est vérifiée dans generateMoves). */
  private pseudoMoves(out: number[], capturesOnly: boolean): void {
    const side = this.side
    for (let sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) {
        sq += 7 // on saute la moitié hors échiquier
        continue
      }
      const piece = this.squares[sq]!
      if (piece === EMPTY || Math.sign(piece) !== side) continue
      const type = Math.abs(piece)

      if (type === PAWN) {
        const dir = side === WHITE ? 16 : -16
        const startRank = side === WHITE ? 1 : 6
        const promoRank = side === WHITE ? 7 : 0
        const one = sq + dir
        if (!capturesOnly && onBoard(one) && this.squares[one] === EMPTY) {
          if (rankOf(one) === promoRank) {
            for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
              out.push(encodeMove(sq, one, FLAG_PROMO, promo))
            }
          } else {
            out.push(encodeMove(sq, one))
            const two = sq + dir * 2
            if (rankOf(sq) === startRank && this.squares[two] === EMPTY) {
              out.push(encodeMove(sq, two, FLAG_DOUBLE))
            }
          }
        }
        for (const side8 of [-1, 1]) {
          const target = sq + dir + side8
          if (!onBoard(target)) continue
          const victim = this.squares[target]!
          if (victim !== EMPTY && Math.sign(victim) !== side) {
            if (rankOf(target) === promoRank) {
              for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                out.push(encodeMove(sq, target, FLAG_PROMO, promo, Math.abs(victim)))
              }
            } else {
              out.push(encodeMove(sq, target, FLAG_NORMAL, 0, Math.abs(victim)))
            }
          } else if (target === this.ep) {
            out.push(encodeMove(sq, target, FLAG_EP, 0, PAWN))
          }
        }
        continue
      }

      const dirs =
        type === KNIGHT
          ? KNIGHT_DIRS
          : type === BISHOP
            ? BISHOP_DIRS
            : type === ROOK
              ? ROOK_DIRS
              : KING_DIRS
      const sliding = type === BISHOP || type === ROOK || type === QUEEN
      const allDirs = type === QUEEN ? KING_DIRS : dirs
      for (const delta of allDirs) {
        let target = sq + delta
        while (onBoard(target)) {
          const victim = this.squares[target]!
          if (victim === EMPTY) {
            if (!capturesOnly) out.push(encodeMove(sq, target))
          } else {
            if (Math.sign(victim) !== side) {
              out.push(encodeMove(sq, target, FLAG_NORMAL, 0, Math.abs(victim)))
            }
            break
          }
          if (!sliding) break
          target += delta
        }
      }

      if (type === KING && !capturesOnly) {
        const kingSide = side === WHITE ? CASTLE_WK : CASTLE_BK
        const queenSide = side === WHITE ? CASTLE_WQ : CASTLE_BQ
        const home = side === WHITE ? 4 : 116
        if (sq === home && !this.inCheck(side)) {
          if (
            this.castling & kingSide &&
            this.squares[home + 1] === EMPTY &&
            this.squares[home + 2] === EMPTY &&
            !this.attacked(home + 1, -side) &&
            !this.attacked(home + 2, -side)
          ) {
            out.push(encodeMove(sq, home + 2, FLAG_CASTLE_K))
          }
          if (
            this.castling & queenSide &&
            this.squares[home - 1] === EMPTY &&
            this.squares[home - 2] === EMPTY &&
            this.squares[home - 3] === EMPTY &&
            !this.attacked(home - 1, -side) &&
            !this.attacked(home - 2, -side)
          ) {
            out.push(encodeMove(sq, home - 2, FLAG_CASTLE_Q))
          }
        }
      }
    }
  }

  /** Coups LÉGAUX (le roi ne reste jamais en prise). */
  generateMoves(capturesOnly = false): number[] {
    const pseudo: number[] = []
    this.pseudoMoves(pseudo, capturesOnly)
    const legal: number[] = []
    for (const move of pseudo) {
      this.makeMove(move)
      // Après le coup, c'est à l'adversaire : on teste NOTRE roi.
      if (!this.attacked(this.kings[-this.side]!, this.side)) legal.push(move)
      this.undoMove(move)
    }
    return legal
  }

  makeMove(move: number): void {
    const from = moveFrom(move)
    const to = moveTo(move)
    const flag = moveFlag(move)
    const piece = this.squares[from]!
    const side = this.side

    let capturedSquare = to
    if (flag === FLAG_EP) capturedSquare = side === WHITE ? to - 16 : to + 16

    this.history.push({
      captured: this.squares[capturedSquare]!,
      capturedSquare,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      kingSquare: this.kings[side]!,
    })

    this.squares[capturedSquare] = EMPTY
    this.squares[from] = EMPTY
    this.squares[to] = flag === FLAG_PROMO ? side * movePromo(move) : piece
    if (Math.abs(piece) === KING) this.kings[side] = to

    if (flag === FLAG_CASTLE_K) {
      this.squares[to - 1] = this.squares[to + 1]!
      this.squares[to + 1] = EMPTY
    } else if (flag === FLAG_CASTLE_Q) {
      this.squares[to + 1] = this.squares[to - 2]!
      this.squares[to - 2] = EMPTY
    }

    // Droits de roque : perdus dès que le roi ou une tour bouge (ou est prise).
    if (Math.abs(piece) === KING) {
      this.castling &= side === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ)
    }
    for (const sq of [from, to]) {
      if (sq === 0) this.castling &= ~CASTLE_WQ
      else if (sq === 7) this.castling &= ~CASTLE_WK
      else if (sq === 112) this.castling &= ~CASTLE_BQ
      else if (sq === 119) this.castling &= ~CASTLE_BK
    }

    this.ep = flag === FLAG_DOUBLE ? (from + to) / 2 : -1
    this.halfmove = Math.abs(piece) === PAWN || moveCapt(move) ? 0 : this.halfmove + 1
    if (side === BLACK) this.fullmove += 1
    this.side = -side
  }

  undoMove(move: number): void {
    const from = moveFrom(move)
    const to = moveTo(move)
    const flag = moveFlag(move)
    const undo = this.history.pop()!
    const side = -this.side // le camp qui avait joué

    this.side = side
    if (side === BLACK) this.fullmove -= 1
    this.castling = undo.castling
    this.ep = undo.ep
    this.halfmove = undo.halfmove

    const moved = flag === FLAG_PROMO ? side * PAWN : this.squares[to]!
    this.squares[from] = moved
    this.squares[to] = EMPTY
    this.squares[undo.capturedSquare] = undo.captured
    if (Math.abs(moved) === KING) this.kings[side] = undo.kingSquare

    if (flag === FLAG_CASTLE_K) {
      this.squares[to + 1] = this.squares[to - 1]!
      this.squares[to - 1] = EMPTY
    } else if (flag === FLAG_CASTLE_Q) {
      this.squares[to - 2] = this.squares[to + 1]!
      this.squares[to + 1] = EMPTY
    }
  }

  /** Notation algébrique (SAN) d'un coup légal de la position courante. */
  san(move: number, legalMoves = this.generateMoves()): string {
    const from = moveFrom(move)
    const to = moveTo(move)
    const flag = moveFlag(move)
    if (flag === FLAG_CASTLE_K) return this.withCheckSuffix(move, 'O-O')
    if (flag === FLAG_CASTLE_Q) return this.withCheckSuffix(move, 'O-O-O')

    const piece = Math.abs(this.squares[from]!)
    const capture = moveCapt(move) !== 0
    let text = ''
    if (piece === PAWN) {
      text = capture ? `${FILE_CHARS[fileOf(from)]}x${squareName(to)}` : squareName(to)
      if (flag === FLAG_PROMO) text += `=${PIECE_CHARS[movePromo(move)]!.toUpperCase()}`
    } else {
      // Désambiguïsation : une autre pièce du même type peut-elle aller là ?
      const rivals = legalMoves.filter(
        (m) =>
          m !== move &&
          moveTo(m) === to &&
          Math.abs(this.squares[moveFrom(m)]!) === piece &&
          moveFrom(m) !== from,
      )
      let disambiguation = ''
      if (rivals.length > 0) {
        const sameFile = rivals.some((m) => fileOf(moveFrom(m)) === fileOf(from))
        const sameRank = rivals.some((m) => rankOf(moveFrom(m)) === rankOf(from))
        if (!sameFile) disambiguation = FILE_CHARS[fileOf(from)]!
        else if (!sameRank) disambiguation = String(rankOf(from) + 1)
        else disambiguation = squareName(from)
      }
      text = `${PIECE_CHARS[piece]!.toUpperCase()}${disambiguation}${capture ? 'x' : ''}${squareName(to)}`
    }
    return this.withCheckSuffix(move, text)
  }

  private withCheckSuffix(move: number, text: string): string {
    this.makeMove(move)
    const check = this.inCheck()
    const mate = check && this.generateMoves().length === 0
    this.undoMove(move)
    return `${text}${mate ? '#' : check ? '+' : ''}`
  }

  /** Retrouve un coup à partir de sa notation « e2e4 » ou de cases. */
  findMove(from: number, to: number, promo?: number): number | null {
    for (const move of this.generateMoves()) {
      if (moveFrom(move) !== from || moveTo(move) !== to) continue
      if (moveFlag(move) === FLAG_PROMO && promo && movePromo(move) !== promo) continue
      return move
    }
    return null
  }

  /** Retrouve un coup à partir de sa notation algébrique (pour les ouvertures). */
  findSan(san: string): number | null {
    const clean = san.replace(/[+#!?]/g, '')
    const moves = this.generateMoves()
    for (const move of moves) {
      if (this.san(move, moves).replace(/[+#!?]/g, '') === clean) return move
    }
    return null
  }

  isCheckmate(): boolean {
    return this.inCheck() && this.generateMoves().length === 0
  }

  isStalemate(): boolean {
    return !this.inCheck() && this.generateMoves().length === 0
  }

  /** Matériel insuffisant : roi seul, roi+fou ou roi+cavalier des deux côtés. */
  insufficientMaterial(): boolean {
    let minors = 0
    for (let sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) {
        sq += 7
        continue
      }
      const type = Math.abs(this.squares[sq]!)
      if (type === PAWN || type === ROOK || type === QUEEN) return false
      if (type === KNIGHT || type === BISHOP) minors++
    }
    return minors <= 1
  }
}
