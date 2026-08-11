import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChessView, GameRules, GameView, LudoState, Move, RoomView } from '@dominos-clan/engine'
import { socket, type Ack } from './socket'
import { useVoice } from './useVoice'
import {
  clearSession,
  loadSnapshot,
  saveSnapshot,
  loadCrew,
  saveCrew,
  loadFriends,
  loadProfile,
  loadSession,
  saveFriends,
  saveProfile,
  saveSession,
  type Friend,
  type FriendStatus,
  type Profile,
} from './profile'
import {
  playBoardSound,
  playInvite,
  playMessage,
  playPass,
  playSlam,
  playVictory,
} from './sounds'
import {
  cloudEnabled,
  pullCloudSave,
  pushCloudSave,
  signInWithGoogle,
  signOutCloud,
  watchCloudAuth,
  type CloudUser,
} from './cloud'
import { Home } from './components/Home'
import { ChessHub } from './components/ChessHub'
import { Learn } from './components/Learn'
import { PuzzleGame } from './components/PuzzleGame'
import type { LearnGame } from './learn/content'
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
  const [chess, setChess] = useState<ChessView | null>(null)
  const [ludo, setLudo] = useState<LudoState | null>(null)
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [friends, setFriends] = useState<Friend[]>(() => loadFriends())
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({})
  const [invite, setInvite] = useState<{ fromPseudo: string; fromAvatar: string; code: string } | null>(
    null,
  )
  const [knock, setKnock] = useState<{ fromUserId: string; fromPseudo: string; fromAvatar: string } | null>(
    null,
  )
  /** Règles d'un jeu, ouvertes depuis son propre panneau (null = fermé). */
  const [learning, setLearning] = useState<LearnGame | null>(null)
  /** Coupure réseau en cours : on garde le salon à l'écran et on reprend. */
  const [reconnecting, setReconnecting] = useState(false)
  /** Identité toujours fraîche pour les callbacks socket (re-rejoin auto). */
  const identityRef = useRef({ pseudo: '', userId: '', avatar: '', taunt: '' })
  /** Une seule reprise de session en vol à la fois. */
  const resumingRef = useRef(false)
  /** Demande d'ami reçue (salon OU par code) — boîte accepter/refuser. */
  const [friendProposal, setFriendProposal] = useState<{
    fromMemberId?: string
    fromUserId?: string
    userId: string
    pseudo: string
    avatar: string
  } | null>(null)
  /** Demandes en attente déjà relancées pour cette apparition en ligne. */
  const proposedOnceRef = useRef(new Set<string>())

  /**
   * RÉVEIL de l'app (retour du premier plan, réseau retrouvé) : en arrière-
   * plan, le navigateur gèle les minuteries — socket.io peut mettre de
   * longues secondes à remarquer que sa connexion est morte, et le joueur
   * croyait devoir sortir/re-rentrer à la main. On force la reconnexion
   * IMMÉDIATEMENT ; la reprise de session fait le reste.
   */
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== 'visible') return
      if (socket.disconnected) socket.connect()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [])
  /** Écran de modes des Échecs (solo IA / coaché / avec un ami). */
  const [chessHub, setChessHub] = useState(false)
  /** 🧩 Puzzle solo (hors salon). */
  const [puzzleOpen, setPuzzleOpen] = useState(false)
  const [slamFx, setSlamFx] = useState<{ key: number; pseudo: string; taunt: string } | null>(null)
  const [passFx, setPassFx] = useState<{ key: number; pseudo: string; cry: number } | null>(null)
  const [ludoRollFx, setLudoRollFx] = useState<{ player: number; value: number; key: number } | null>(
    null,
  )
  const ludoRollKey = useRef(0)
  const reactionKey = useRef(0)
  const chatKey = useRef(0)
  const slamKey = useRef(0)
  const passKey = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Réfs pour les handlers socket (montés une fois) : qui je suis + statut
  // précédent de chaque jeu, pour ne jouer la fanfare qu'à la transition.
  const selfIdRef = useRef<string | null>(null)
  const prevDominoStatus = useRef<string | null>(null)
  const prevChessStatus = useRef<string | null>(null)
  const prevLudoStatus = useRef<string | null>(null)

  useEffect(() => {
    selfIdRef.current = selfId
  }, [selfId])

  // Réf stable vers la coupure voix, pour les handlers socket montés une fois.
  const voiceLeaveRef = useRef<() => void>(() => {})

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  // ─── Sauvegarde en ligne (Google) ────────────────────────────────────
  // Se connecter restaure le profil complet (code ami, pseudo, avatar, amis)
  // sur n'importe quel appareil ; ensuite chaque changement est repoussé.
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const profileRef = useRef(profile)
  const friendsRef = useRef(friends)
  useEffect(() => {
    profileRef.current = profile
    friendsRef.current = friends
  }, [profile, friends])

  useEffect(() => {
    if (!cloudEnabled()) return
    return watchCloudAuth((user) => {
      setCloudUser(user)
      if (!user) return
      const linkedUid = localStorage.getItem('dc:cloud-uid')
      if (linkedUid === user.uid) return // déjà lié : les pushes au fil de l'eau suffisent
      void (async () => {
        try {
          const save = await pullCloudSave(user.uid)
          if (save) {
            const local = profileRef.current
            const differentIdentity = save.profile.id !== local.id
            if (
              differentIdentity &&
              local.pseudo.trim() &&
              !window.confirm(
                `Restaurer le profil « ${save.profile.pseudo || save.profile.id} » depuis ton compte Google ? Le profil de cet appareil sera remplacé.`,
              )
            ) {
              await signOutCloud()
              return
            }
            saveProfile(save.profile)
            setProfile(save.profile)
            saveFriends(save.friends)
            setFriends(save.friends)
            showNotice('☁️ Profil et amis restaurés depuis ton compte Google ✔')
          } else {
            await pushCloudSave(user.uid, {
              profile: profileRef.current,
              friends: friendsRef.current,
            })
            showNotice('☁️ Profil sauvegardé sur ton compte Google ✔')
          }
          localStorage.setItem('dc:cloud-uid', user.uid)
        } catch {
          showNotice('☁️ Synchronisation impossible pour le moment')
        }
      })()
    })
  }, [showNotice])

  // Chaque changement de profil/amis est repoussé vers le cloud (débounce).
  useEffect(() => {
    if (!cloudUser || localStorage.getItem('dc:cloud-uid') !== cloudUser.uid) return
    const timer = setTimeout(() => {
      pushCloudSave(cloudUser.uid, { profile, friends }).catch(() => {
        // hors ligne : la prochaine modification retentera
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [cloudUser, profile, friends])

  // Écran « réveil du serveur » : l'hébergement gratuit s'endort sans trafic
  // (cold start jusqu'à ~1 min). On masque l'attente derrière un chargement
  // propre, affiché seulement après 600 ms pour éviter le flash quand le
  // serveur est déjà chaud.
  const [connected, setConnected] = useState(socket.connected)
  const [waking, setWaking] = useState(false)
  const [wakeSeconds, setWakeSeconds] = useState(0)
  // L'écran de réveil ne concerne QUE la première connexion (cold start) :
  // après, une coupure passagère n'affiche plus ce grand voile.
  const hasConnected = useRef(socket.connected)
  useEffect(() => {
    const onConnect = () => {
      hasConnected.current = true
      setConnected(true)
    }
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])
  useEffect(() => {
    if (connected) {
      setWaking(false)
      setWakeSeconds(0)
      return
    }
    const show = setTimeout(() => setWaking(true), 600)
    const tick = setInterval(() => setWakeSeconds((s) => s + 1), 1000)
    return () => {
      clearTimeout(show)
      clearInterval(tick)
    }
  }, [connected])

  // « Joueurs » au sens voix/rôles : ceux de la partie en cours, sinon les assis.
  const playerIds =
    chess && chess.status === 'playing'
      ? [chess.whiteId, chess.blackId]
      : ludo && ludo.status === 'playing'
        ? ludo.players.map((p) => p.id)
        : game && game.status === 'playing'
          ? game.players.map((p) => p.id)
          : (room?.seats ?? [])

  const voice = useVoice(room?.code ?? null, selfId, playerIds, showNotice)

  useEffect(() => {
    voiceLeaveRef.current = voice.leave
  }, [voice])

  // Bouton « retour » piégé : dans un salon, revenir en arrière ne quitte
  // plus la page par accident — on reste, et « Quitter » reste le seul chemin.
  const inRoom = room !== null
  useEffect(() => {
    if (!inRoom) return
    history.pushState({ dc: 'room' }, '')
    const onPop = () => {
      history.pushState({ dc: 'room' }, '')
      showNotice('Tu es toujours dans le salon — utilise « Quitter » pour sortir 😉')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [inRoom, showNotice])

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
        pseudo: profile.pseudo.trim() || 'joueur',
        avatar: (profile.avatar ?? '').trim() || '❔',
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
                const pseudo = (live?.pseudo ?? '').trim()
                const avatar = (live?.avatar ?? '').trim() || '❔'
                if (pseudo && (fr.pseudo !== pseudo || fr.avatar !== avatar)) {
                  changed = true
                  return { ...fr, pseudo, avatar }
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
    const onGameState = (view: GameView | null) => {
      const status = view?.status ?? null
      if (status === 'finished' && prevDominoStatus.current !== 'finished' && view?.result?.winnerId) {
        playVictory()
      }
      prevDominoStatus.current = status
      setGame(view)
    }
    const onChessState = (view: ChessView | null) => {
      const status = view?.status ?? null
      if (status === 'finished' && prevChessStatus.current !== 'finished' && view?.result?.winnerId) {
        playVictory()
      }
      prevChessStatus.current = status
      setChess(view)
    }
    const onLudoState = (view: LudoState | null) => {
      const status = view?.status ?? null
      if (status === 'finished' && prevLudoStatus.current !== 'finished' && view?.winnerId) {
        playVictory()
      }
      prevLudoStatus.current = status
      setLudo(view)
    }
    const onReaction = (r: { memberId: string; pseudo: string; emoji: string }) => {
      const key = ++reactionKey.current
      setReactions((prev) => [...prev.slice(-11), { key, ...r }])
      setTimeout(() => setReactions((prev) => prev.filter((fr) => fr.key !== key)), 2600)
    }
    const onChatMessage = (m: { memberId: string; pseudo: string; text: string }) => {
      const key = ++chatKey.current
      setChatMessages((prev) => [...prev.slice(-149), { key, ...m }])
      if (m.memberId !== selfIdRef.current) playMessage()
    }
    const onPresence = (u: { userId: string; pseudo: string; avatar: string; status: FriendStatus }) => {
      setFriendStatuses((prev) => ({ ...prev, [u.userId]: u.status }))
      // Met à jour le pseudo/avatar caché de l'ami dès qu'on le voit en ligne
      // (données nettoyées : jamais d'espace ni de blanc enregistré).
      const pseudo = (u.pseudo ?? '').trim()
      const avatar = (u.avatar ?? '').trim() || '❔'
      if (pseudo) {
        setFriends((prev) => {
          const i = prev.findIndex((f) => f.id === u.userId)
          if (i < 0 || (prev[i]!.pseudo === pseudo && prev[i]!.avatar === avatar)) return prev
          const next = [...prev]
          next[i] = { ...next[i]!, pseudo, avatar }
          saveFriends(next)
          return next
        })
      }
    }
    const onInvited = (inv: { fromPseudo: string; fromAvatar: string; code: string }) => {
      playInvite()
      setInvite(inv)
    }
    // 🤝 Demande d'ami reçue dans le salon → boîte accepter/refuser.
    const onFriendProposed = (p: {
      fromMemberId?: string
      fromUserId?: string
      userId: string
      pseudo: string
      avatar: string
    }) => {
      playInvite()
      setFriendProposal(p)
    }
    const onFriendAccepted = (f: { userId: string; pseudo: string; avatar: string }) => {
      // Ajoute — ou TRANSFORME l'entrée « ⏳ en attente » en ami confirmé.
      setFriends((prev) => {
        const entry = { id: f.userId, pseudo: f.pseudo, avatar: f.avatar }
        const next = prev.some((x) => x.id === f.userId)
          ? prev.map((x) => (x.id === f.userId ? entry : x))
          : [...prev, entry]
        saveFriends(next)
        return next
      })
      showNotice(`🤝 ${f.pseudo} a accepté — vous êtes amis !`)
    }
    const onFriendDeclined = (f: { userId?: string; pseudo: string }) => {
      // La demande en attente disparaît : refusé, on n'insiste pas.
      if (f.userId) {
        setFriends((prev) => {
          const next = prev.filter((x) => !(x.id === f.userId && x.pending))
          if (next.length !== prev.length) saveFriends(next)
          return next
        })
      }
      showNotice(`${f.pseudo} a décliné la demande d’ami`)
    }
    const onKnocked = (k: { fromUserId: string; fromPseudo: string; fromAvatar: string }) => {
      playInvite()
      setKnock(k)
    }
    const onRestarted = (r: { byPseudo: string; reconfigured?: boolean }) =>
      showNotice(
        r.reconfigured
          ? `⚙️ ${r.byPseudo} a refait les réglages — on repart de zéro !`
          : `🔄 ${r.byPseudo} a tout remis à zéro — nouvelle partie !`,
      )
    const onHostChanged = (h: { pseudo: string }) => showNotice(`⭐ ${h.pseudo} est le nouveau chef !`)
    const onKicked = (k: { byPseudo: string }) => {
      voiceLeaveRef.current()
      clearSession()
      setRoom(null)
      setGame(null)
      setChess(null)
      setLudo(null)
      setSelfId(null)
      setChatMessages([])
      showNotice(`🚪 ${k.byPseudo} t’a retiré du salon`)
    }
    const onMemberKicked = (m: { pseudo: string }) =>
      showNotice(`🚪 ${m.pseudo} a été retiré du salon par le chef`)
    const onSoundPlayed = (s: { memberId: string; pseudo: string; kind: string }) => {
      playBoardSound(s.kind)
      const emoji =
        { pet: '💨', rire: '😂', colere: '😡', bravo: '👏', tromblon: '📯', bisou: '😘' }[s.kind] ??
        '🔊'
      const key = ++reactionKey.current
      setReactions((prev) => [...prev.slice(-11), { key, memberId: s.memberId, pseudo: s.pseudo, emoji }])
      setTimeout(() => setReactions((prev) => prev.filter((fr) => fr.key !== key)), 2600)
    }
    const onSlam = (s: { pseudo: string; taunt?: string }) => {
      playSlam()
      const key = ++slamKey.current
      setSlamFx({ key, pseudo: s.pseudo, taunt: (s.taunt ?? '').trim() })
      setTimeout(() => setSlamFx((prev) => (prev?.key === key ? null : prev)), 1000)
    }
    const onPassed = (p: { pseudo: string; cry?: number }) => {
      playPass()
      const key = ++passKey.current
      setPassFx({ key, pseudo: p.pseudo, cry: p.cry ?? 0 })
      // Doit rester ALIGNÉ sur l'animation `cry-pop` (2,6 s) : avant, le
      // minuteur disait 2,1 s pendant que le CSS effaçait le cri dès 1 s —
      // impossible de lire « MANARAKY AO E ».
      setTimeout(() => setPassFx((prev) => (prev?.key === key ? null : prev)), 2700)
    }
    const onSterile = (s: { rounds: number }) =>
      showNotice(
        `🧹 ${s.rounds} manches sans la moindre marque — table renouvelée, la file prend les places !`,
      )
    const onLudoRolled = (r: { player: number; value: number }) =>
      setLudoRollFx({ ...r, key: ++ludoRollKey.current })
    const onAborted = () => showNotice('Un joueur a quitté : manche annulée')
    const onDisconnect = () => {
      // On NE VIDE PLUS le salon ici. Une coupure de quelques secondes
      // renvoyait le joueur à l'accueil, et sa partie continuait sans lui.
      // On garde tout à l'écran, on signale, et la reprise fait le reste.
      if (loadSession()) setReconnecting(true)
      else {
        setRoom(null)
        setGame(null)
        setSelfId(null)
        showNotice('Connexion perdue avec le serveur')
      }
    }

    // Mémoire de reprise : le dernier instantané chiffré du salon.
    const onSnapshot = (p: { code?: unknown; blob?: unknown }) => {
      if (typeof p?.code === 'string' && typeof p?.blob === 'string') saveSnapshot(p.code, p.blob)
    }
    socket.on('room:snapshot', onSnapshot)
    socket.on('room:state', onRoomState)
    socket.on('game:state', onGameState)
    socket.on('chess:state', onChessState)
    socket.on('ludo:state', onLudoState)
    socket.on('reaction', onReaction)
    socket.on('chat:message', onChatMessage)
    socket.on('presence:update', onPresence)
    socket.on('friend:invited', onInvited)
    socket.on('friend:proposed', onFriendProposed)
    socket.on('friend:accepted', onFriendAccepted)
    socket.on('friend:declined', onFriendDeclined)
    socket.on('friend:knocked', onKnocked)
    socket.on('room:restarted', onRestarted)
    socket.on('room:host-changed', onHostChanged)
    socket.on('room:kicked', onKicked)
    socket.on('room:member-kicked', onMemberKicked)
    socket.on('sound:played', onSoundPlayed)
    socket.on('game:slam', onSlam)
    socket.on('game:passed', onPassed)
    socket.on('game:sterile', onSterile)
    socket.on('ludo:rolled', onLudoRolled)
    socket.on('game:aborted', onAborted)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('room:snapshot', onSnapshot)
      socket.off('room:state', onRoomState)
      socket.off('game:state', onGameState)
      socket.off('chess:state', onChessState)
      socket.off('ludo:state', onLudoState)
      socket.off('reaction', onReaction)
      socket.off('chat:message', onChatMessage)
      socket.off('presence:update', onPresence)
      socket.off('friend:invited', onInvited)
      socket.off('friend:proposed', onFriendProposed)
      socket.off('friend:accepted', onFriendAccepted)
      socket.off('friend:declined', onFriendDeclined)
      socket.off('friend:knocked', onKnocked)
      socket.off('room:restarted', onRestarted)
      socket.off('room:host-changed', onHostChanged)
      socket.off('room:kicked', onKicked)
      socket.off('room:member-kicked', onMemberKicked)
      socket.off('sound:played', onSoundPlayed)
      socket.off('game:slam', onSlam)
      socket.off('game:passed', onPassed)
      socket.off('game:sterile', onSterile)
      socket.off('ludo:rolled', onLudoRolled)
      socket.off('game:aborted', onAborted)
      socket.off('disconnect', onDisconnect)
    }
  }, [showNotice])

  const enterRoom = useCallback(
    (event: 'room:create' | 'room:join', payload: Record<string, string>) => {
      socket.emit(event, payload, (res: Ack & { resumeKey?: string }) => {
        if (res.ok && res.selfId) {
          setSelfId(res.selfId)
          // Session persistante : un rechargement de page ramène dans le salon.
          if (res.code && res.resumeKey) {
            saveSession({ code: res.code, memberId: res.selfId, resumeKey: res.resumeKey })
          }
        } else if (!res.ok) showNotice(res.error)
      })
    },
    [showNotice],
  )

  /**
   * Renvoi AUTOMATIQUE des demandes d'ami en attente : dès que la cible
   * apparaît EN LIGNE dans les statuts, la demande repart (le serveur
   * re-délivre la boîte accepter/refuser). Une fois par apparition — le
   * throttle serveur absorbe le reste.
   */
  useEffect(() => {
    for (const f of friends) {
      if (!f.pending) continue
      const status = friendStatuses[f.id] ?? 'offline'
      if (status === 'offline') {
        proposedOnceRef.current.delete(f.id)
        continue
      }
      if (proposedOnceRef.current.has(f.id)) continue
      proposedOnceRef.current.add(f.id)
      socket.emit('friend:proposeByCode', { toUserId: f.id }, () => {})
    }
  }, [friendStatuses, friends])

  /**
   * LIEN D'INVITATION : dominos-clan.onrender.com/j/CODE — le pote clique
   * dans WhatsApp et atterrit DIRECTEMENT dans le salon, sans taper de code.
   * Un lien d'invitation prime sur une vieille session d'un autre salon.
   */
  useEffect(() => {
    const match = window.location.pathname.match(/^\/j\/([a-z0-9]{4})$/i)
    if (!match) return
    window.history.replaceState(null, '', '/')
    const code = match[1]!.toUpperCase()
    const session = loadSession()
    if (session?.code === code) return // la reprise de session s'en charge
    if (session) clearSession()
    socket.emit(
      'room:join',
      { code, ...identityRef.current },
      (res: Ack & { resumeKey?: string }) => {
        if (res.ok && res.selfId) {
          setSelfId(res.selfId)
          if (res.code && res.resumeKey) {
            saveSession({ code: res.code, memberId: res.selfId, resumeKey: res.resumeKey })
          }
        } else if (!res.ok && res.error !== 'Déjà dans un salon') {
          // (le doublon StrictMode n'est pas une erreur pour l'utilisateur)
          showNotice(res.error)
        }
      },
    )
  }, [showNotice])

  /**
   * Reprise de session, au chargement ET à CHAQUE reconnexion.
   *
   * L'ancienne version sortait si `selfId` était déjà rempli. Or dans un
   * gestionnaire socket, `selfId` est figé à l'inscription de l'écouteur :
   * après une coupure brève, socket.io se reconnectait avant que React n'ait
   * re-rendu, la reprise voyait l'ancien `selfId` et abandonnait. Résultat :
   * plus aucun état ne remontait, et revenir à la main créait un doublon.
   *
   * La seule source de vérité, c'est la SESSION STOCKÉE — pas l'état React.
   */
  useEffect(() => {
    const tryResume = () => {
      const session = loadSession()
      if (!session) return
      // SÉRIALISÉ : une seule reprise en vol (StrictMode monte les effets en
      // double — la 2e reprise recevait « Déjà dans un salon », que l'ancien
      // code prenait pour un vrai échec… jusqu'à éjecter le joueur).
      if (resumingRef.current) return
      resumingRef.current = true
      // L'instantané chiffré du salon part avec la demande : si le serveur a
      // redémarré entre-temps, il restaure la partie EXACTEMENT où elle en
      // était (scores, sièges, manche) au lieu de répondre « salon inconnu ».
      const snapshot = loadSnapshot(session.code)
      socket.emit(
        'room:resume',
        snapshot ? { ...session, snapshot } : session,
        (res: Ack & { restored?: boolean }) => {
          resumingRef.current = false
          if (res.ok && res.restored) {
            showNotice('💾 Partie restaurée — on reprend exactement où vous en étiez !')
          }
          setReconnecting(false)
          if (res.ok && res.selfId) {
            setSelfId(res.selfId)
            return
          }
          const reason = res.ok ? null : res.error
          // Doublon inoffensif (double émission, reprise déjà réussie) : on
          // ne touche à RIEN — surtout pas à la session.
          if (reason === 'Déjà dans un salon') return
          // Ma PLACE a expiré (app en arrière-plan trop longtemps) mais le
          // salon vit peut-être encore : on RE-REJOINT automatiquement avec
          // le code — fini le « sortir puis retaper le code à la main ».
          // (La déduplication par identité rend sa place au revenant.)
          socket.emit(
            'room:join',
            { code: session.code, ...identityRef.current },
            (jr: Ack & { resumeKey?: string }) => {
              if (jr.ok && jr.selfId) {
                setSelfId(jr.selfId)
                if (jr.code && jr.resumeKey) {
                  saveSession({ code: jr.code, memberId: jr.selfId, resumeKey: jr.resumeKey })
                }
                showNotice('↩️ Te revoilà dans le salon — ta place avait expiré entre-temps')
                return
              }
              // Le salon n'existe vraiment plus : nettoyage, retour accueil.
              clearSession()
              setRoom(null)
              setGame(null)
              setChess(null)
              setLudo(null)
              setSelfId(null)
              showNotice(reason ?? 'Session expirée — le salon n’existe plus')
            },
          )
        },
      )
    }
    tryResume()
    socket.on('connect', tryResume)
    return () => {
      socket.off('connect', tryResume)
    }
  }, [showNotice])

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
    taunt: (profile.taunt ?? '').trim(),
  }
  // Toujours FRAÎCHE dans les callbacks socket montés une seule fois.
  identityRef.current = identity

  // Mémorise la « bande » : les amis présents dans mon salon actuel.
  useEffect(() => {
    if (!room || !selfId) return
    const crew = room.members
      .filter((m) => m.id !== selfId && m.userId && friends.some((f) => f.id === m.userId))
      .map((m) => m.userId as string)
    if (crew.length > 0) saveCrew(crew)
  }, [room, selfId, friends])

  const leaveRoomLocal = () => {
    voice.leave()
    clearSession()
    simpleEmit('room:leave')
    setRoom(null)
    setGame(null)
    setChess(null)
    setLudo(null)
    setSelfId(null)
    setChatMessages([])
  }

  const acceptInvite = () => {
    if (!invite) return
    if (!profile.pseudo.trim()) {
      showNotice('Choisis d’abord ton pseudo pour rejoindre 😉')
      return
    }
    const code = invite.code
    setInvite(null)
    if (room) leaveRoomLocal()
    enterRoom('room:join', { code, ...identity })
  }

  const handlers = {
    // Depuis le hub : créer un salon directement sur le jeu choisi.
    onCreate: (gameType: GameRules['gameType'] = 'dominos') => {
      socket.emit('room:create', { ...identity }, (res: Ack & { resumeKey?: string }) => {
        if (res.ok && res.selfId) {
          setSelfId(res.selfId)
          if (res.code && res.resumeKey) {
            saveSession({ code: res.code, memberId: res.selfId, resumeKey: res.resumeKey })
          }
          if (gameType !== 'dominos') {
            socket.emit('room:rules', { gameType }, () => {})
          }
        } else if (!res.ok) showNotice(res.error)
      })
    },
    onJoin: (code: string) => enterRoom('room:join', { code, ...identity }),
    onProfile: (p: Profile) => {
      saveProfile(p)
      setProfile(p)
    },
    /**
     * Demande d'ami PAR CODE — même procédure d'acceptation que dans un
     * salon : l'autre reçoit une boîte accepter/refuser, et l'amitié n'existe
     * que si les DEUX sont d'accord. En attendant (ou s'il est hors ligne),
     * l'entrée reste « ⏳ demande envoyée » et repart toute seule dès qu'il
     * apparaît en ligne.
     */
    onAddFriend: (rawCode: string) => {
      const code = rawCode.toLowerCase()
      if (!/^[a-z0-9_-]{6,24}$/.test(code)) return showNotice('Code ami invalide')
      if (code === profile.id) return showNotice('C’est ton propre code 😄')
      if (friends.some((f) => f.id === code)) return showNotice('Déjà dans tes amis (ou demande en cours)')
      const next = [...friends, { id: code, pseudo: '', avatar: '⏳', pending: true }]
      saveFriends(next)
      setFriends(next)
      socket.emit('friend:proposeByCode', { toUserId: code }, (res: Ack) => {
        if (res.ok) showNotice('🤝 Demande d’ami envoyée !')
        else if (res.error === 'hors-ligne') {
          showNotice('⏳ Il est hors ligne — la demande partira dès qu’il se connectera')
        } else showNotice(res.error)
      })
    },
    /**
     * 🔥 Relancer la bande : recrée un salon et re-invite d'un coup tous les
     * amis qui étaient dans le DERNIER salon.
     */
    onRelaunchCrew: (gameType: GameRules['gameType']) => {
      const crew = loadCrew().filter((id) => friends.some((f) => f.id === id && !f.pending))
      socket.emit('room:create', { ...identity }, (res: Ack & { resumeKey?: string }) => {
        if (!res.ok || !res.selfId) {
          if (!res.ok) showNotice(res.error)
          return
        }
        setSelfId(res.selfId)
        if (res.code && res.resumeKey) {
          saveSession({ code: res.code, memberId: res.selfId, resumeKey: res.resumeKey })
        }
        if (gameType !== 'dominos') socket.emit('room:rules', { gameType }, () => {})
        for (const id of crew) socket.emit('friend:invite', { toUserId: id }, () => {})
        showNotice(`🔥 Salon relancé — ${crew.length} invitation${crew.length > 1 ? 's' : ''} envoyée${crew.length > 1 ? 's' : ''} !`)
      })
    },
    /** 🤝 Depuis le salon : proposer à un co-joueur de devenir amis. */
    onProposeFriend: (memberId: string) => {
      socket.emit('friend:propose', { memberId }, (res: Ack) => {
        showNotice(res.ok ? '🤝 Demande d’ami envoyée !' : res.error)
      })
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
    onKnock: (toUserId: string) =>
      socket.emit('friend:knock', { toUserId }, (res: Ack) =>
        showNotice(res.ok ? 'Demande envoyée — il peut t’inviter ✔' : res.error),
      ),
    onRestart: (promoteId?: string) =>
      simpleEmit('room:restart', promoteId ? { promoteId } : {}),
    onSit: () => simpleEmit('seat:take'),
    onPromote: (memberId: string) => simpleEmit('seat:promote', { memberId }),
    onStand: () => simpleEmit('seat:leave'),
    onStart: () => simpleEmit('game:start'),
    onMove: (move: Move, slam?: boolean) => simpleEmit('game:move', { move, slam: slam === true }),
    onReact: (emoji: string) => socket.emit('reaction', { emoji }),
    onSound: (kind: string) => socket.emit('sound:send', { kind }),
    onChat: (text: string) => simpleEmit('chat:send', { text }),
    onRules: (rules: GameRules) => simpleEmit('room:rules', { ...rules }),
    onReconfigure: (rules: GameRules) => simpleEmit('room:reconfigure', { ...rules }),
    onTransferHost: (toId: string) => simpleEmit('room:transfer-host', { toId }),
    onKick: (memberId: string) => simpleEmit('room:kick', { memberId }),
    onSwap: (seatId: string, withId: string) => simpleEmit('room:swap', { seatId, withId }),
    onDemote: (memberId: string) => simpleEmit('room:demote', { memberId }),
    onSetTaunt: (taunt: string) => {
      const clean = taunt.replace(/[\r\n<>]/g, '').trim().slice(0, 24)
      simpleEmit('member:taunt', { taunt: clean })
      const next = { ...profile, taunt: clean }
      saveProfile(next)
      setProfile(next)
    },
    onCloudSignIn: () => {
      signInWithGoogle().catch(() => showNotice('Connexion Google impossible — réessaie'))
    },
    onCloudSignOut: () => {
      localStorage.removeItem('dc:cloud-uid')
      signOutCloud().catch(() => {})
      showNotice('☁️ Déconnecté — le profil reste sur cet appareil')
    },
    onUndo: () => simpleEmit('game:undo'),
    onRedeal: () => simpleEmit('game:redeal'),
    onChessMove: (from: string, to: string, promotion?: string) =>
      simpleEmit('chess:move', { from, to, promotion }),
    onResign: () => simpleEmit('chess:resign'),
    onDraw: (action: 'offer' | 'accept' | 'decline') => simpleEmit('chess:draw', { action }),
    onLudoRoll: () => simpleEmit('ludo:roll'),
    onLudoPlay: (pawn: number) => simpleEmit('ludo:play', { pawn }),
    onLudoTarget: (player: number, pawn: number) => simpleEmit('ludo:target', { player, pawn }),
    onLeave: leaveRoomLocal,
  }

  const wakeMessage =
    room !== null
      ? 'Reconnexion au salon…'
      : wakeSeconds < 4
        ? 'Connexion…'
        : wakeSeconds < 12
          ? 'On réveille le serveur… ☕'
          : wakeSeconds < 35
            ? 'Le serveur s’endort quand personne ne joue — il se réveille, ~30 s la première fois.'
            : 'Presque prêt, promis 🙏'

  return (
    <div className="app">
      {waking && !connected && !hasConnected.current && (
        <div className="wake-veil" role="status">
          <h1 className="wordmark small">
            Domino’s <span>Clan</span>
          </h1>
          <div className="wake-tile" aria-hidden="true">
            <span className="wake-dot" />
            <span className="wake-dot" />
            <span className="wake-dot" />
          </div>
          <p className="wake-msg">{wakeMessage}</p>
          <div className="wake-bar">
            <span />
          </div>
          {wakeSeconds >= 4 && <p className="wake-elapsed">{wakeSeconds} s</p>}
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
      {/* Coupure réseau : on reste dans le salon, on prévient, on reprend. */}
      {reconnecting && (
        <div className="reconnect-banner" role="status">
          📡 Connexion perdue — on te remet dans la partie…
        </div>
      )}
      {/* 🤝 Demande d'ami reçue dans le salon : accepter remplit les DEUX
          carnets d'un coup (le serveur prévient l'autre côté). */}
      {friendProposal && (
        <div className="invite-toast">
          <span>
            {friendProposal.avatar} <b>{friendProposal.pseudo}</b> veut devenir ton ami
          </span>
          <button
            className="btn sm"
            onClick={() => {
              const p = friendProposal
              setFriendProposal(null)
              setFriends((prev) => {
                const entry = { id: p.userId, pseudo: p.pseudo, avatar: p.avatar }
                const next = prev.some((x) => x.id === p.userId)
                  ? prev.map((x) => (x.id === p.userId ? entry : x))
                  : [...prev, entry]
                saveFriends(next)
                return next
              })
              // La réponse suit le canal d'arrivée : salon ou code ami.
              if (p.fromMemberId) {
                socket.emit('friend:respond', { toMemberId: p.fromMemberId, accept: true }, () => {})
              } else if (p.fromUserId) {
                socket.emit('friend:respondByCode', { toUserId: p.fromUserId, accept: true }, () => {})
              }
              showNotice(`🤝 ${p.pseudo} et toi êtes maintenant amis !`)
            }}
          >
            🤝 Accepter
          </button>
          <button
            className="btn ghost sm"
            onClick={() => {
              const p = friendProposal
              setFriendProposal(null)
              if (p.fromMemberId) {
                socket.emit('friend:respond', { toMemberId: p.fromMemberId, accept: false }, () => {})
              } else if (p.fromUserId) {
                socket.emit('friend:respondByCode', { toUserId: p.fromUserId, accept: false }, () => {})
              }
            }}
          >
            Refuser
          </button>
        </div>
      )}
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
      {knock && (
        <div className="invite-toast">
          <span>
            🚪 {knock.fromAvatar} <b>{knock.fromPseudo}</b> veut rejoindre ta partie
          </span>
          <button
            className="btn sm"
            disabled={!room}
            onClick={() => {
              handlers.onInvite(knock.fromUserId)
              setKnock(null)
            }}
          >
            L’inviter
          </button>
          <button className="btn ghost sm" onClick={() => setKnock(null)}>
            Ignorer
          </button>
        </div>
      )}
      {puzzleOpen && !room ? (
        <PuzzleGame onBack={() => setPuzzleOpen(false)} />
      ) : learning && !room ? (
        <Learn game={learning} onBack={() => setLearning(null)} />
      ) : chessHub && !room ? (
        <ChessHub
          onBack={() => setChessHub(false)}
          onCreate={() => {
            setChessHub(false)
            handlers.onCreate('chess')
          }}
          onJoin={(code) => {
            setChessHub(false)
            handlers.onJoin(code)
          }}
        />
      ) : room && selfId ? (
        <Room
          room={room}
          game={game}
          chess={chess}
          ludo={ludo}
          selfId={selfId}
          reactions={reactions}
          chat={chatMessages}
          voice={voice}
          friends={friends}
          friendStatuses={friendStatuses}
          myUserId={profile.id}
          slamFx={slamFx}
          passFx={passFx}
          ludoRollFx={ludoRollFx}
          {...handlers}
        />
      ) : (
        <Home
          profile={profile}
          friends={friends}
          statuses={friendStatuses}
          cloudOn={cloudEnabled()}
          cloudUser={cloudUser}
          onCloudSignIn={handlers.onCloudSignIn}
          onCloudSignOut={handlers.onCloudSignOut}
          onProfile={handlers.onProfile}
          onAddFriend={handlers.onAddFriend}
          onRemoveFriend={handlers.onRemoveFriend}
          onKnock={handlers.onKnock}
          onCreate={handlers.onCreate}
          onJoin={handlers.onJoin}
          onLearn={(g) => setLearning(g)}
          onChessHub={() => setChessHub(true)}
          onPuzzle={() => setPuzzleOpen(true)}
          crewCount={loadCrew().filter((id) => friends.some((f) => f.id === id && !f.pending)).length}
          onRelaunchCrew={handlers.onRelaunchCrew}
        />
      )}
    </div>
  )
}
