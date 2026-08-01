import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameView, Move, RoomView } from '@dominos-clan/engine'
import { socket, type Ack } from './socket'
import { useVoice } from './useVoice'
import { Home } from './components/Home'
import { Room } from './components/Room'

export interface FloatingReaction {
  key: number
  memberId: string
  pseudo: string
  emoji: string
}

export default function App() {
  const [selfId, setSelfId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [game, setGame] = useState<GameView | null>(null)
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const reactionKey = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  const voice = useVoice(room?.code ?? null, showNotice)

  useEffect(() => {
    const onRoomState = (view: RoomView) => setRoom(view)
    const onGameState = (view: GameView | null) => setGame(view)
    const onReaction = (r: { memberId: string; pseudo: string; emoji: string }) => {
      const key = ++reactionKey.current
      setReactions((prev) => [...prev.slice(-11), { key, ...r }])
      setTimeout(() => setReactions((prev) => prev.filter((fr) => fr.key !== key)), 2600)
    }
    const onAborted = () => showNotice('Un joueur a quitté : manche annulée')
    const onDisconnect = () => {
      setRoom(null)
      setGame(null)
      setSelfId(null)
      showNotice('Connexion perdue avec le serveur')
    }

    socket.on('room:state', onRoomState)
    socket.on('game:state', onGameState)
    socket.on('reaction', onReaction)
    socket.on('game:aborted', onAborted)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('room:state', onRoomState)
      socket.off('game:state', onGameState)
      socket.off('reaction', onReaction)
      socket.off('game:aborted', onAborted)
      socket.off('disconnect', onDisconnect)
    }
  }, [showNotice])

  const enterRoom = useCallback(
    (event: 'room:create' | 'room:join', payload: Record<string, string>) => {
      socket.emit(event, payload, (res: Ack) => {
        if (res.ok && res.selfId) setSelfId(res.selfId)
        else if (!res.ok) showNotice(res.error)
      })
    },
    [showNotice],
  )

  const simpleEmit = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      socket.emit(event, payload, (res: Ack) => {
        if (!res.ok) showNotice(res.error)
      })
    },
    [showNotice],
  )

  const handlers = {
    onCreate: (pseudo: string) => enterRoom('room:create', { pseudo }),
    onJoin: (code: string, pseudo: string) => enterRoom('room:join', { code, pseudo }),
    onSit: () => simpleEmit('seat:take'),
    onStand: () => simpleEmit('seat:leave'),
    onStart: () => simpleEmit('game:start'),
    onMove: (move: Move) => simpleEmit('game:move', { move }),
    onReact: (emoji: string) => socket.emit('reaction', { emoji }),
    onLeave: () => {
      voice.leave()
      simpleEmit('room:leave')
      setRoom(null)
      setGame(null)
      setSelfId(null)
    },
  }

  return (
    <div className="app">
      {notice && <div className="toast">{notice}</div>}
      {room && selfId ? (
        <Room room={room} game={game} selfId={selfId} reactions={reactions} voice={voice} {...handlers} />
      ) : (
        <Home onCreate={handlers.onCreate} onJoin={handlers.onJoin} />
      )}
    </div>
  )
}
