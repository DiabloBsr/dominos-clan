import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { ChessColor, ChessView, RoomView } from '@dominos-clan/engine'
import { ChessPiece, type PieceType } from './ChessPieces'
import { ConfirmBox, type ConfirmRequest } from './ConfirmBox'
import { playCheck, playChessCapture, playChessMove, playMate } from '../sounds'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const INITIAL_COUNTS: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const CAPTURE_ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p']

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
}

const REASONS: Record<string, string> = {
  checkmate: 'échec et mat !',
  timeout: 'gagne au temps ⏱',
  'timeout-material': 'temps écoulé, mais mat impossible — nulle (règle FIDE)',
  resign: 'gagne par abandon 🏳',
  stalemate: 'pat — partie nulle',
  draw: 'partie nulle',
  agreement: 'nulle par accord mutuel 🤝',
  threefold: 'nulle — triple répétition de la position',
  fifty: 'nulle — 50 coups sans prise ni poussée de pion',
  material: 'nulle — matériel insuffisant pour mater',
  abandon: 'gagne par abandon',
}

/** Échiquier STATIQUE (lobby) : position de départ, aucune interaction. */
export function ChessLobbyBoard() {
  const BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  const cells = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece: { type: PieceType; color: 'w' | 'b' } | null =
        r === 0
          ? { type: BACK[c]!, color: 'b' }
          : r === 1
            ? { type: 'p', color: 'b' }
            : r === 6
              ? { type: 'p', color: 'w' }
              : r === 7
                ? { type: BACK[c]!, color: 'w' }
                : null
      cells.push(
        <span key={`${r}-${c}`} className={`sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`}>
          {piece && (
            <span className="pc">
              <ChessPiece type={piece.type} color={piece.color} />
            </span>
          )}
        </span>,
      )
    }
  }
  return (
    <div className="chess-board lobby-static" aria-hidden="true">
      {cells}
    </div>
  )
}

export function ChessBoard({
  view,
  room,
  selfId,
  isHost,
  onMove,
  onResign,
  onDraw,
  onStart,
  voiceIds,
  speaking,
}: {
  view: ChessView
  room: RoomView
  selfId: string
  isHost: boolean
  onMove: (from: string, to: string, promotion?: string) => void
  onResign: () => void
  onDraw: (action: 'offer' | 'accept' | 'decline') => void
  onStart: () => void
  voiceIds: string[]
  speaking: string[]
}) {
  const engine = useMemo(() => new Chess(view.fen), [view.fen])

  // Sons : le dernier coup de l'historique dit s'il y a eu prise (x), échec
  // (+) ou mat (#) — on ne joue qu'à l'arrivée d'un NOUVEAU coup.
  const lastPlayed = view.history.length
  const prevPlayed = useRef(lastPlayed)
  useEffect(() => {
    if (lastPlayed === prevPlayed.current) return
    const isNew = lastPlayed > prevPlayed.current
    prevPlayed.current = lastPlayed
    if (!isNew) return
    const san = view.history[lastPlayed - 1] ?? ''
    if (san.includes('#')) playMate()
    else if (san.includes('+')) playCheck()
    else if (san.includes('x')) playChessCapture()
    else playChessMove()
  }, [lastPlayed, view.history])
  const myColor: ChessColor | null =
    selfId === view.whiteId ? 'w' : selfId === view.blackId ? 'b' : null
  const flipped = myColor === 'b'
  const myTurn = myColor !== null && view.turn === myColor && view.status === 'playing'
  const [selected, setSelected] = useState<Square | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  /** Promotion en attente du choix de pièce (dame/tour/fou/cavalier). */
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)

  useEffect(() => setSelected(null), [view.fen])

  const targets = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(engine.moves({ square: selected, verbose: true }).map((m) => m.to))
  }, [engine, selected])

  // Pendule active : décompte local depuis la réception de l'état serveur.
  const receivedAt = useMemo(() => Date.now(), [view])
  const [, tick] = useState(0)
  useEffect(() => {
    if (view.status !== 'playing') return
    const timer = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [view])

  const msOf = (color: ChessColor): number => {
    const base = color === 'w' ? view.whiteMs : view.blackMs
    // Pendules gelées tant que chaque joueur n'a pas joué son premier coup.
    if (view.status !== 'playing' || !view.clockRunning || view.turn !== color) return base
    return Math.max(0, base - (Date.now() - receivedAt))
  }

  const fmt = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
  }

  const clickSquare = (sq: Square): void => {
    if (!myTurn) return
    if (selected && targets.has(sq)) {
      const move = engine.moves({ square: selected, verbose: true }).find((m) => m.to === sq)
      if (move?.promotion) {
        // Promotion : le joueur CHOISIT sa pièce (pas dame automatique).
        setPromo({ from: selected, to: sq })
        setSelected(null)
        return
      }
      onMove(selected, sq, undefined)
      setSelected(null)
      return
    }
    const piece = engine.get(sq)
    setSelected(piece && piece.color === myColor ? sq : null)
  }

  // Case du roi en échec (pour la surbrillance).
  const checkedSquare = useMemo(() => {
    if (!view.check) return null
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = engine.board()[r]![c]
        if (piece && piece.type === 'k' && piece.color === view.turn) {
          return `${FILES[c]}${8 - r}`
        }
      }
    }
    return null
  }, [engine, view.check, view.turn])

  const topId = flipped ? view.whiteId : view.blackId
  const bottomId = flipped ? view.blackId : view.whiteId
  const topColor: ChessColor = flipped ? 'w' : 'b'
  const bottomColor: ChessColor = flipped ? 'b' : 'w'

  // Pièces manquantes de chaque couleur = capturées par l'adversaire.
  const missing = useMemo(() => {
    const counts: Record<ChessColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    }
    for (const row of engine.board()) {
      for (const piece of row) {
        if (piece) counts[piece.color][piece.type as PieceType]++
      }
    }
    const missingOf = (color: ChessColor): PieceType[] =>
      CAPTURE_ORDER.flatMap((t) =>
        Array<PieceType>(Math.max(0, INITIAL_COUNTS[t] - counts[color][t])).fill(t),
      )
    return { w: missingOf('w'), b: missingOf('b') }
  }, [engine])

  const valueOf = (list: PieceType[]) => list.reduce((s, t) => s + PIECE_VALUES[t], 0)
  // > 0 : avantage matériel des blancs.
  const materialDiff = valueOf(missing.b) - valueOf(missing.w)

  const playerRow = (id: string, color: ChessColor) => (
    <div className={`chess-side ${speaking.includes(id) ? 'speaking' : ''}`}>
      <span className={`chess-color-dot ${color === 'w' ? 'white' : 'black'}`} />
      <span className="chess-name">
        {avatarOf(room, id)} {pseudoOf(room, id)}
        {voiceIds.includes(id) ? ' 🎙' : ''}
        {id === selfId ? ' (toi)' : ''}
      </span>
      <span className="captured-row" title="Pièces capturées">
        {(color === 'w' ? missing.b : missing.w).map((t, i) => (
          <span key={i} className="captured-pc">
            <ChessPiece type={t} color={color === 'w' ? 'b' : 'w'} />
          </span>
        ))}
        {color === 'w' && materialDiff > 0 && <b className="mat-adv">+{materialDiff}</b>}
        {color === 'b' && materialDiff < 0 && <b className="mat-adv">+{-materialDiff}</b>}
      </span>
      <span
        className={`chess-clock ${view.status === 'playing' && view.turn === color ? 'active' : ''} ${
          msOf(color) < 30_000 ? 'low' : ''
        }`}
      >
        {fmt(msOf(color))}
      </span>
    </div>
  )

  const cells = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rankIndex = flipped ? 7 - r : r
      const fileIndex = flipped ? 7 - c : c
      const sq = `${FILES[fileIndex]}${8 - rankIndex}` as Square
      const piece = engine.board()[rankIndex]![fileIndex]
      // Case de PRISE : cible occupée par l'adversaire → anneau rouge (≠ point).
      const capture = targets.has(sq) && piece !== null
      cells.push(
        <button
          key={sq}
          className={`sq ${(r + c) % 2 === 0 ? 'light' : 'dark'} ${selected === sq ? 'sel' : ''} ${
            targets.has(sq) ? (capture ? 'tgt cap' : 'tgt') : ''
          } ${view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq) ? 'last' : ''} ${
            checkedSquare === sq ? 'chk' : ''
          }`}
          onClick={() => clickSquare(sq)}
        >
          {c === 0 && <span className="coord rank">{8 - rankIndex}</span>}
          {r === 7 && <span className="coord file">{FILES[fileIndex]}</span>}
          {piece && (
            <span className="pc">
              <ChessPiece type={piece.type as PieceType} color={piece.color} />
            </span>
          )}
        </button>,
      )
    }
  }

  const mate = view.status === 'finished' && view.result?.reason === 'checkmate'

  return (
    <section className="game chess-game">
      {playerRow(topId, topColor)}

      <div className={`chess-board ${mate ? 'mate-shake' : ''}`} role="grid" aria-label="Échiquier">
        {cells}
      </div>

      {mate && <div className="mate-fx">♛ ÉCHEC ET MAT&nbsp;!</div>}

      {promo && myColor && (
        <>
          <div className="panel-veil" onClick={() => setPromo(null)} />
          <div className="game-modal card promo-box">
            <p className="confirm-msg">Ton pion se transforme en :</p>
            <div className="promo-choices">
              {(['q', 'r', 'b', 'n'] as const).map((t) => (
                <button
                  key={t}
                  className="promo-pick"
                  title={{ q: 'Dame', r: 'Tour', b: 'Fou', n: 'Cavalier' }[t]}
                  onClick={() => {
                    onMove(promo.from, promo.to, t)
                    setPromo(null)
                  }}
                >
                  <ChessPiece type={t} color={myColor} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {playerRow(bottomId, bottomColor)}

      {view.status === 'finished' && view.result && (
        <div className="banner">
          <h2>
            {view.result.winnerId === null
              ? `🤝 ${REASONS[view.result.reason]}`
              : `👑 ${pseudoOf(room, view.result.winnerId)} — ${REASONS[view.result.reason]}`}
          </h2>
          <p className="rotation-note">
            {view.result.winnerId === null
              ? 'Nulle : on rejoue à l’identique.'
              : 'Le gagnant reste — la file monte au prochain lancement.'}
          </p>
          {/* Revanche en un clic : les DEUX joueurs peuvent relancer, plus
              seulement le chef du salon. */}
          {(isHost || myColor !== null) && (
            <button className="btn" onClick={onStart}>
              ⚔️ Revanche
            </button>
          )}
        </div>
      )}

      {view.status === 'playing' && myColor && (
        <div className="chess-actions">
          <p className={`turn-hint ${myTurn ? 'live' : ''}`}>
            {myTurn ? 'À toi de jouer !' : 'L’adversaire réfléchit…'}
            {view.check ? ' — échec !' : ''}
          </p>
          {/* Proposition de nulle : l'adversaire répond, moi je peux retirer. */}
          {view.drawOffer && view.drawOffer !== myColor ? (
            <span className="draw-offer">
              🤝 Nulle proposée
              <button className="btn sm" onClick={() => onDraw('accept')}>
                Accepter
              </button>
              <button className="btn ghost sm" onClick={() => onDraw('decline')}>
                Refuser
              </button>
            </span>
          ) : view.drawOffer === myColor ? (
            <button className="btn ghost sm" onClick={() => onDraw('decline')}>
              🤝 Nulle proposée — retirer
            </button>
          ) : (
            <button className="btn ghost sm" onClick={() => onDraw('offer')}>
              🤝 Proposer nulle
            </button>
          )}
          <button
            className="btn ghost sm"
            onClick={() =>
              setConfirmReq({
                message: 'Abandonner la partie ? Ton adversaire gagnera.',
                yesLabel: '🏳 Abandonner',
                onYes: onResign,
              })
            }
          >
            🏳 Abandonner
          </button>
        </div>
      )}

      {view.status === 'playing' && !myColor && (
        <p className="turn-hint">👀 Spectateur — trait aux {view.turn === 'w' ? 'blancs' : 'noirs'}</p>
      )}

      <ConfirmBox req={confirmReq} onClose={() => setConfirmReq(null)} />
    </section>
  )
}
