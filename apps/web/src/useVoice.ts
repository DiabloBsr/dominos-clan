import { useCallback, useEffect, useRef, useState } from 'react'
// Type-only : la lib livekit-client (~140 kB gzip) n'est chargée
// dynamiquement qu'au moment où on rejoint la voix.
import type { Room as VoiceRoom, RemoteTrack, Participant } from 'livekit-client'
import { socket } from './socket'

/** Qui entend mon micro : tout le salon, seulement les joueurs, ou seulement les spectateurs. */
export type VoiceAudience = 'all' | 'players' | 'spectators'

export interface VoiceState {
  /** off = pas connecté ; on = mic actif ; unavailable = serveur sans config LiveKit */
  status: 'off' | 'connecting' | 'on' | 'unavailable'
  muted: boolean
  audience: VoiceAudience
  /** memberIds présents dans le salon vocal. */
  inVoice: string[]
  /** memberIds en train de parler (détection LiveKit). */
  speaking: string[]
}

export interface VoiceControls {
  state: VoiceState
  /** `auto: true` = connexion silencieuse à l'entrée du salon (pas de toast). */
  join: (opts?: { auto?: boolean }) => void
  toggleMute: () => void
  setAudience: (audience: VoiceAudience) => void
  leave: () => void
}

const INITIAL: VoiceState = { status: 'off', muted: false, audience: 'all', inVoice: [], speaking: [] }

/**
 * Voix du salon via LiveKit : un salon de jeu = une room `dc-<code>`.
 * Le token est délivré par notre serveur (voice:token) qui vérifie
 * l'appartenance au salon ; l'audio passe ensuite en direct par le SFU.
 *
 * Ciblage : chaque participant publie un attribut `target` (all/players/
 * spectators) ; côté écoute, on coupe (mute) les éléments audio des
 * participants dont l'audience ne nous inclut pas. V1 : filtrage à la
 * lecture — le flux transite mais n'est pas audible.
 */
export function useVoice(
  roomCode: string | null,
  selfId: string | null,
  playerIds: string[],
  onError: (message: string) => void,
): VoiceControls {
  const voiceRef = useRef<VoiceRoom | null>(null)
  const audioEls = useRef(new Map<string, HTMLMediaElement[]>())
  const [state, setState] = useState<VoiceState>(INITIAL)

  // Rôles toujours frais dans les callbacks LiveKit (rotation, arrivées…).
  const rolesRef = useRef({ selfId, playerIds })
  rolesRef.current = { selfId, playerIds }

  const shouldHear = useCallback((participant: Participant): boolean => {
    const target = (participant.attributes?.target as VoiceAudience | undefined) ?? 'all'
    if (target === 'all') return true
    const { selfId: me, playerIds: players } = rolesRef.current
    const iAmPlayer = !!me && players.includes(me)
    return target === 'players' ? iAmPlayer : !iAmPlayer
  }, [])

  const applyFilterFor = useCallback(
    (participant: Participant) => {
      const els = audioEls.current.get(participant.identity) ?? []
      const audible = shouldHear(participant)
      for (const el of els) el.muted = !audible
    },
    [shouldHear],
  )

  const applyFilterAll = useCallback(() => {
    voiceRef.current?.remoteParticipants.forEach((p) => applyFilterFor(p))
  }, [applyFilterFor])

  // Les rôles changent (rotation gagnant-reste, sièges) → recalculer qui j'entends.
  const playerKey = playerIds.join(',')
  useEffect(() => {
    applyFilterAll()
  }, [playerKey, applyFilterAll])

  /**
   * Numéro de la TENTATIVE de connexion courante. Toute continuation
   * asynchrone (réponse token, import, connect…) d'une tentative dépassée
   * vérifie ce numéro et s'arrête net : c'est ce qui rend join/teardown
   * réentrants sans course (StrictMode, re-rendus pendant `connecting`,
   * réponse token arrivée après un changement de salon…).
   */
  const joinSeq = useRef(0)
  /** Salon pour lequel une connexion est EN VOL (anti double-join). */
  const pendingCode = useRef<string | null>(null)
  /** Reprises automatiques restantes après une coupure inattendue. */
  const rejoinLeft = useRef(3)
  const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const teardown = useCallback(() => {
    joinSeq.current += 1
    pendingCode.current = null
    if (rejoinTimer.current) {
      clearTimeout(rejoinTimer.current)
      rejoinTimer.current = null
    }
    const room = voiceRef.current
    // voiceRef est vidé AVANT le disconnect : le gestionnaire Disconnected de
    // cette room (scopé sur elle-même) verra qu'elle n'est plus la connexion
    // courante et ne déclenchera NI nettoyage global NI reprise automatique.
    voiceRef.current = null
    if (room) void room.disconnect()
    document.querySelectorAll('[data-voice="dominos-clan"]').forEach((el) => el.remove())
    audioEls.current.clear()
    setState((s) => ({ ...INITIAL, status: s.status === 'unavailable' ? 'unavailable' : 'off' }))
  }, [])

  // Quitter la voix quand on change/quitte de salon ou qu'on démonte.
  useEffect(() => teardown, [roomCode, teardown])

  const refreshRoster = useCallback((room: VoiceRoom) => {
    const ids = [
      room.localParticipant.identity,
      ...[...room.remoteParticipants.values()].map((p) => p.identity),
    ]
    setState((s) => ({ ...s, inVoice: ids }))
  }, [])

  /** Code du salon RÉELLEMENT connecté — détecte les connexions fantômes. */
  const joinedCode = useRef<string | null>(null)
  /** Le serveur a répondu « pas de voix » : on ne re-tente pas en auto. */
  const noVoiceServer = useRef(false)

  const join = useCallback((opts?: { auto?: boolean }) => {
    const auto = opts?.auto ?? false
    if (!roomCode) return
    // Déjà connecté à CE salon, ou tentative DÉJÀ EN VOL pour lui (double
    // montage StrictMode, re-rendu pendant `connecting` quand un participant
    // entre…) : on ne relance rien — c'était l'auto-cannibalisation qui
    // faisait « rater » le micro à l'arrivée d'un nouveau membre.
    if (voiceRef.current && joinedCode.current === roomCode) return
    if (pendingCode.current === roomCode) return
    if (voiceRef.current) {
      // Connexion fantôme d'un ANCIEN salon (Disconnected pas encore arrivé) :
      // on l'évacue — voiceRef vidé d'abord, son Disconnected ne touchera rien.
      const stale = voiceRef.current
      voiceRef.current = null
      joinedCode.current = null
      void stale.disconnect()
    }
    if (auto && noVoiceServer.current) return
    const seq = ++joinSeq.current
    pendingCode.current = roomCode
    const donePending = () => {
      if (joinSeq.current === seq) pendingCode.current = null
    }
    setState((s) => ({ ...s, status: 'connecting' }))

    const attempt = (retry: boolean) => {
    socket.emit(
      'voice:token',
      { retry },
      (res: { ok: true; url: string; token: string } | { ok: false; error: string }) => {
        void (async () => {
          if (joinSeq.current !== seq) return // tentative dépassée (salon quitté…)
          if (!res.ok) {
            donePending()
            const unavailable = res.error.includes('non configuré')
            if (unavailable) noVoiceServer.current = true
            setState((s) => ({ ...s, status: unavailable ? 'unavailable' : 'off' }))
            // Connexion AUTOMATIQUE : silencieuse — pas de toast d'erreur à
            // chaque entrée de salon sur un serveur sans voix (ex. en local).
            if (!auto) onError(res.error)
            return
          }
          const { Room, RoomEvent, Track, AudioPresets } = await import('livekit-client')
          if (joinSeq.current !== seq) return
          /**
           * Réglages ÉCONOMES EN DATA — beaucoup de joueurs sont en forfait
           * mobile compté. Mesuré avant/après sur de la parole continue :
           *
           *  • `speech` (Opus 24 kbit/s mono) au lieu du préréglage par défaut
           *    `music` (48 kbit/s) : moitié moins de data, et Opus à 24 kbit/s
           *    reste excellent pour de la voix — c'est un codec pensé pour ça.
           *  • `red: false` : la redondance RED double chaque paquet audio
           *    pour résister aux pertes ; trop cher pour du chat entre potes.
           *  • `dtx: true` : pendant les silences, quasi zéro octet.
           *  • `stopMicTrackOnMute` : micro coupé = flux ARRÊTÉ (vraiment
           *    zéro data), au lieu d'envoyer du silence encodé.
           */
          const room = new Room({
            publishDefaults: {
              audioPreset: AudioPresets.speech,
              dtx: true,
              red: false,
              stopMicTrackOnMute: true,
            },
          })
          voiceRef.current = room

          room
            .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
              if (track.kind === Track.Kind.Audio) {
                const el = track.attach()
                el.dataset.voice = 'dominos-clan'
                document.body.appendChild(el)
                const els = audioEls.current.get(participant.identity) ?? []
                els.push(el)
                audioEls.current.set(participant.identity, els)
                applyFilterFor(participant)
              }
            })
            .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
              const detached = track.detach()
              detached.forEach((el) => el.remove())
              const els = (audioEls.current.get(participant.identity) ?? []).filter(
                (el) => !detached.includes(el),
              )
              audioEls.current.set(participant.identity, els)
            })
            .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
              applyFilterFor(participant)
            })
            .on(RoomEvent.ParticipantConnected, () => refreshRoster(room))
            .on(RoomEvent.ParticipantDisconnected, (participant) => {
              audioEls.current.delete(participant.identity)
              refreshRoster(room)
            })
            .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
              setState((s) => ({ ...s, speaking: speakers.map((p) => p.identity) }))
            })
            // LiveKit se reconnecte TOUT SEUL après une coupure courte : on
            // reflète honnêtement cet état dans l'interface au lieu de
            // prétendre que tout va bien (ou de croire le micro mort).
            .on(RoomEvent.Reconnecting, () => {
              if (voiceRef.current !== room) return
              setState((s) => ({ ...s, status: 'connecting' }))
            })
            .on(RoomEvent.Reconnected, () => {
              if (voiceRef.current !== room) return
              setState((s) => ({ ...s, status: 'on' }))
              refreshRoster(room)
            })
            .on(RoomEvent.MediaDevicesError, () => {
              if (voiceRef.current !== room) return
              onError('Problème de micro — vérifie tes périphériques audio')
            })
            // Lecture bloquée par le navigateur (arrivée sans clic) : on la
            // débloque au premier geste, à CHAQUE fois que ça se produit.
            .on(RoomEvent.AudioPlaybackStatusChanged, () => {
              if (voiceRef.current !== room) return
              if (!room.canPlaybackAudio) {
                const unlock = () => void room.startAudio()
                window.addEventListener('pointerdown', unlock, { once: true })
              }
            })
            .on(RoomEvent.Disconnected, () => {
              // SCOPÉ : si cette room n'est plus la connexion courante
              // (évacuée, remplacée, teardown), on ne touche à RIEN — avant,
              // ce gestionnaire écrasait les refs de la NOUVELLE connexion :
              // interface « off » avec un micro fantôme encore actif.
              if (voiceRef.current !== room) return
              document.querySelectorAll('[data-voice="dominos-clan"]').forEach((el) => el.remove())
              audioEls.current.clear()
              voiceRef.current = null
              joinedCode.current = null
              setState((s) => ({ ...INITIAL, status: s.status === 'unavailable' ? 'unavailable' : 'off' }))
              // Coupure INATTENDUE (une sortie voulue passe par teardown, qui
              // nous aurait détachés) : le micro revient tout seul.
              if (rejoinLeft.current > 0) {
                rejoinLeft.current -= 1
                rejoinTimer.current = setTimeout(() => join({ auto: true }), 1500)
              }
            })

          try {
            await room.connect(res.url, res.token)
          } catch (err) {
            // SEUL l'échec de la CONNEXION déclenche la bascule de projet du
            // pool. Avant, un simple raté de micro ou d'autoplay arrivait ici
            // et faisait basculer tout le salon — split garanti.
            if (voiceRef.current === room) voiceRef.current = null
            joinedCode.current = null
            void room.disconnect()
            if (joinSeq.current !== seq) return
            if (!retry) {
              attempt(true)
              return
            }
            donePending()
            setState((s) => ({ ...s, status: 'off' }))
            onError(`Connexion voix impossible : ${err instanceof Error ? err.message : 'erreur'}`)
            return
          }
          if (joinSeq.current !== seq) {
            // Le salon a été quitté pendant le connect : on repart proprement.
            if (voiceRef.current === room) voiceRef.current = null
            void room.disconnect()
            return
          }
          joinedCode.current = roomCode
          donePending()
          rejoinLeft.current = 3 // connexion saine → recharge les reprises auto

          // Tout ce qui suit est NON-FATAL : la connexion tient même si le
          // micro ou les haut-parleurs demandent un second essai.
          try {
            await room.localParticipant.setAttributes({ target: 'all' })
          } catch {
            // L'audience retombera sur « tous » côté écoute : sans gravité.
          }
          // Le micro rate parfois sa PREMIÈRE capture (périphérique encore
          // occupé après un changement de salon/onglet) : deuxième tentative,
          // et en cas d'échec on reste connecté en ÉCOUTE (mute affiché).
          let micOk = true
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
          } catch {
            try {
              await new Promise((r) => setTimeout(r, 450))
              await room.localParticipant.setMicrophoneEnabled(true)
            } catch {
              micOk = false
            }
          }
          // Arrivée SANS geste utilisateur (reprise de session) : le
          // navigateur peut bloquer la lecture — on réessaie au premier clic.
          try {
            await room.startAudio()
          } catch {
            const unlock = () => void room.startAudio()
            window.addEventListener('pointerdown', unlock, { once: true })
          }
          setState((s) => ({ ...s, status: 'on', muted: !micOk, audience: 'all' }))
          if (!micOk) onError('Micro indisponible — « Réactiver le micro » dans le menu ☰')
          refreshRoster(room)
        })()
      },
    )
    }
    attempt(false)
  }, [roomCode, onError, refreshRoster, applyFilterFor])

  /**
   * MUTE simple — c'est LE geste du quotidien : la connexion voix, elle,
   * reste en permanence (on ne quitte jamais le service, on coupe le micro).
   * Avec stopMicTrackOnMute, réactiver = re-capturer le périphérique : ça
   * peut rater une fois, donc on retente avant de rendre les armes.
   */
  const toggleMute = useCallback(() => {
    const room = voiceRef.current
    if (!room) return
    const nextEnabled = !room.localParticipant.isMicrophoneEnabled
    setState((s) => ({ ...s, muted: !nextEnabled }))
    void (async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(nextEnabled)
      } catch {
        try {
          await new Promise((r) => setTimeout(r, 450))
          await room.localParticipant.setMicrophoneEnabled(nextEnabled)
        } catch {
          // L'état affiché doit dire la VÉRITÉ du micro, pas l'intention.
          setState((s) => ({ ...s, muted: !room.localParticipant.isMicrophoneEnabled }))
          onError('Micro indisponible — réessaie dans un instant')
        }
      }
    })()
  }, [onError])

  const setAudience = useCallback((audience: VoiceAudience) => {
    const room = voiceRef.current
    if (!room) return
    void room.localParticipant.setAttributes({ target: audience })
    setState((s) => ({ ...s, audience }))
  }, [])

  /**
   * CHIEN DE GARDE : toutes les 8 s, l'état AFFICHÉ est comparé à l'état
   * RÉEL de LiveKit. Toute désynchronisation résiduelle — le cas qu'on n'a
   * pas prévu — se répare d'elle-même. C'est le filet sous tous les
   * correctifs : quoi qu'il arrive, le micro finit par revenir.
   */
  useEffect(() => {
    if (!roomCode) return
    const timer = setInterval(() => {
      const room = voiceRef.current
      if (room && String(room.state) === 'disconnected') {
        voiceRef.current = null
        joinedCode.current = null
        join({ auto: true })
      }
    }, 8000)
    return () => clearInterval(timer)
  }, [roomCode, join])

  /**
   * Le salon a BASCULÉ de projet LiveKit (un membre n'arrivait pas à se
   * connecter → le serveur avance dans le pool et prévient tout le monde).
   * Sans cette migration collective, les membres déjà connectés restaient
   * sur l'ANCIEN projet : deux groupes « connectés » incapables de
   * s'entendre — le pire des bugs micro à l'arrivée d'un participant.
   */
  useEffect(() => {
    const onMoved = () => {
      if (!voiceRef.current && pendingCode.current === null) return
      joinSeq.current += 1
      pendingCode.current = null
      const room = voiceRef.current
      voiceRef.current = null
      joinedCode.current = null
      if (room) void room.disconnect()
      join({ auto: true })
    }
    socket.on('voice:moved', onMoved)
    return () => {
      socket.off('voice:moved', onMoved)
    }
  }, [join])

  return { state, join, toggleMute, setAudience, leave: teardown }
}
