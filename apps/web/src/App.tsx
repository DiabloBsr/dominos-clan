import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameRules, GameView, Move, RoomView } from '@dominos-clan/engine'
import { socket, type Ack } from './socket'
import { useVoice } from './useVoice'
import {
  loadFriends,
  loadProfile,
  saveFriends,
  saveProfile,
  type Friend,
  type FriendStatus,
  type Profile,
} from './profile'
import { playSlam } from './sounds'
import { Home } from './components/Home'
import { Room } from './components/Room'

export interface FloatingReaction {
  key: number
  memberId: string
  pseudo: string
  emoji: string
}

export interface ChatMessage {
  key: number
  memberId: string
  pseudo: string
  text: string
}

export default function App() {
  const [selfId, setSelfId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [game, setGame] = useState<GameView | null>(null)
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [friends, setFriends] = useState<Friend[]>(() => loadFriends())
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({})
  const [invite, setInvite] = useState<{ fromPseudo: string; fromAvatar: string; code: string } | null>(
    null,
  )
  const [slamFx, setSlamFx] = useState<{ key: number; pseudo: string } | null>(null)
  const reactionKey = useRef(0)
  const chatKey = useRef(0)
  const slamKey = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  // « Joueurs » au sens voix/rôles : ceux de la manche en cours, sinon les assis.
  const playerIds =
    game && game.status === 'playing' ? game.players.map((p) => p.id) : (room?.seats ?? [])

  const voice = useVoice(room?.code ?? null, selfId, playerIds, showNotice)

  // Micro actif par défaut : on rejoint la voix dès l'entrée dans le salon
  // (une seule tentative par salon ; l'utilisateur gère ensuite muet/parler).
  const voiceAttempt = useRef<string | null>(null)
  useEffect(() => {
    if (!room) {
      voiceAttempt.current = null
      return
    }
    if (voice.state.status === 'off' && voiceAttempt.current !== room.code) {
      voiceAttempt.current = room.code
      voice.join()
    }
  }, [room, voice])

  // Présence : s'annoncer + suivre les amis (rejoué à chaque reconnexion
  // et à chaque changement de profil ou de liste d'amis).
  useEffect(() => {
    const register = () => {
      socket.emit('presence:hello', {
        userId: profile.id,
        pseudo: profile.pseudo || 'joueur',
        avatar: profile.avatar,
      })
      socket.emit(
        'presence:watch',
        { ids: friends.map((f) => f.id) },
        (res: {
          ok: boolean
          friends?: Array<{ userId: string; pseudo: string; avatar: string; status: FriendStatus }>
        }) => {
          if (res.ok && Array.isArray(res.friends)) {
            setFriendStatuses(Object.fromEntries(res.friends.map((f) => [f.userId, f.status])))
            // Rafraîchit le pseudo/avatar en cache dès le snapshot : la liste
            // affiche le vrai pseudo, pas « joueur » ni le code ami.
            setFriends((prev) => {
              let changed = false
              const next = prev.map((fr) => {
                const live = res.friends!.find((x) => x.userId === fr.id)
                if (live?.pseudo && (fr.pseudo !== live.pseudo || fr.avatar !== live.avatar)) {
                  changed = true
                  return { ...fr, pseudo: live.pseudo, avatar: live.avatar }
                }
                return fr
              })
              if (changed) saveFriends(next)
              return changed ? next : prev
            })
          }
        },
      )
    }
    register()
    socket.on('connect', register)
    return () => {
      socket.off('connect', register)
    }
  }, [profile, friends])

  useEffect(() => {
    const onRoomState = (view: RoomView) => setRoom(view)
    const onGameState = (view: GameView | null) => setGame(view)
    const onReaction = (r: { memberId: string; pseudo: string; emoji: string }) => {
      const key = ++reactionKey.current
      setReactions((prev) => [...prev.slice(-11), { key, ...r }])
      setTimeout(() => setReactions((prev) => prev.filter((fr) => fr.key !== key)), 2600)
    }
    const onChatMessage = (m: { memberId: string; pseudo: string; text: string }) => {
      const key = ++chatKey.current
      setChatMessages((prev) => [...prev.slice(-149), { key, ...m }])
    }
    const onPresence = (u: { userId: string; pseudo: string; avatar: string; status: FriendStatus }) => {
      setFriendStatuses((prev) => ({ ...prev, [u.userId]: u.status }))
      // Met à jour le pseudo/avatar caché de l'ami dès qu'on le voit en ligne.
      if (u.pseudo) {
        setFriends((prev) => {
          const i = prev.findIndex((f) => f.id === u.userId)
          if (i < 0 || (prev[i]!.pseudo === u.pseudo && prev[i]!.avatar === u.avatar)) return prev
          const next = [...prev]
          next[i] = { ...next[i]!, pseudo: u.pseudo, avatar: u.avatar }
          saveFriends(next)
          return next
        })
      }
    }
    const onInvited = (inv: { fromPseudo: string; fromAvatar: string; code: string }) =>
      setInvite(inv)
    const onSlam = (s: { pseudo: string }) => {
      playSlam()
      const key = ++slamKey.current
      setSlamFx({ key, pseudo: s.pseudo })
      setTimeout(() => setSlamFx((prev) => (prev?.key === key ? null : prev)), 1000)
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
    socket.on('chat:message', onChatMessage)
    socket.on('presence:update', onPresence)
    socket.on('friend:invited', onInvited)
    socket.on('game:slam', onSlam)
    socket.on('game:aborted', onAborted)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('room:state', onRoomState)
      socket.off('game:state', onGameState)
      socket.off('reaction', onReaction)
      socket.off('chat:message', onChatMessage)
      socket.off('presence:update', onPresence)
      socket.off('friend:invited', onInvited)
      socket.off('game:slam', onSlam)
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

  const identity = {
    pseudo: profile.pseudo.trim() || 'joueur',
    userId: profile.id,
    avatar: profile.avatar,
  }

  const leaveRoomLocal = () => {
    voice.leave()
    simpleEmit('room:leave')
    setRoom(null)
    setGame(null)
    setSelfId(null)
    setChatMessages([])
  }

  const acceptInvite = () => {
    if (!invite) return
    const code = invite.code
    setInvite(null)
    if (room) leaveRoomLocal()
    enterRoom('room:join', { code, ...identity })
  }

  const handlers = {
    onCreate: () => enterRoom('room:create', { ...identity }),
    onJoin: (code: string) => enterRoom('room:join', { code, ...identity }),
    onProfile: (p: Profile) => {
      saveProfile(p)
      setProfile(p)
    },
    onAddFriend: (rawCode: string) => {
      const code = rawCode.toLowerCase()
      if (!/^[a-z0-9_-]{6,24}$/.test(code)) return showNotice('Code ami invalide')
      if (code === profile.id) return showNotice('C’est ton propre code 😄')
      if (friends.some((f) => f.id === code)) return showNotice('Déjà dans tes amis')
      const next = [...friends, { id: code, pseudo: '', avatar: '❔' }]
      saveFriends(next)
      setFriends(next)
    },
    onRemoveFriend: (id: string) => {
      const next = friends.filter((f) => f.id !== id)
      saveFriends(next)
      setFriends(next)
    },
    onInvite: (toUserId: string) =>
      socket.emit('friend:invite', { toUserId }, (res: Ack) =>
        showNotice(res.ok ? 'Invitation envoyée ✔' : res.error),
      ),
    onSit: () => simpleEmit('seat:take'),
    onStand: () => simpleEmit('seat:leave'),
    onStart: () => simpleEmit('game:start'),
    onMove: (move: Move, slam?: boolean) => simpleEmit('game:move', { move, slam: slam === true }),
    onReact: (emoji: string) => socket.emit('reaction', { emoji }),
    onChat: (text: string) => simpleEmit('chat:send', { text }),
    onRules: (rules: GameRules) => simpleEmit('room:rules', { ...rules }),
    onUndo: () => simpleEmit('game:undo'),
    onLeave: leaveRoomLocal,
  }

  return (
    <div className="app">
      {notice && <div className="toast">{notice}</div>}
      {invite && (
        <div className="invite-toast">
          <span>
            {invite.fromAvatar} <b>{invite.fromPseudo}</b> t’invite dans le salon{' '}
            <b>{invite.code}</b>
          </span>
          <button className="btn sm" onClick={acceptInvite}>
            Rejoindre
          </button>
          <button className="btn ghost sm" onClick={() => setInvite(null)}>
            Ignorer
          </button>
        </div>
      )}
      {room && selfId ? (
        <Room
          room={room}
          game={game}
          selfId={selfId}
          reactions={reactions}
          chat={chatMessages}
          voice={voice}
          friends={friends}
          friendStatuses={friendStatuses}
          slamFx={slamFx}
          {...handlers}
        />
      ) : (
        <Home
          profile={profile}
          friends={friends}
          statuses={friendStatuses}
          onProfile={handlers.onProfile}
          onAddFriend={handlers.onAddFriend}
          onRemoveFriend={handlers.onRemoveFriend}
          onCreate={handlers.onCreate}
          onJoin={handlers.onJoin}
        />
      )}
    </div>
  )
}
