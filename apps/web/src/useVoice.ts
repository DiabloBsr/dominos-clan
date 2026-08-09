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

  const teardown = useCallback(() => {
    const room = voiceRef.current
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
    if (voiceRef.current) {
      // Déjà connecté à CE salon : rien à faire. Mais s'il reste une
      // connexion d'un ANCIEN salon (Disconnected pas encore arrivé), c'était
      // le fameux « micro bugué en arrivant dans une partie » — le garde
      // muet refusait de se reconnecter et il fallait couper/rallumer le
      // service à la main. On évacue la connexion périmée et on continue.
      if (joinedCode.current === roomCode) return
      const stale = voiceRef.current
      voiceRef.current = null
      joinedCode.current = null
      void stale.disconnect()
    }
    if (auto && noVoiceServer.current) return
    setState((s) => ({ ...s, status: 'connecting' }))

    const attempt = (retry: boolean) => {
    socket.emit(
      'voice:token',
      { retry },
      (res: { ok: true; url: string; token: string } | { ok: false; error: string }) => {
        void (async () => {
          if (!res.ok) {
            const unavailable = res.error.includes('non configuré')
            if (unavailable) noVoiceServer.current = true
            setState((s) => ({ ...s, status: unavailable ? 'unavailable' : 'off' }))
            // Connexion AUTOMATIQUE : silencieuse — pas de toast d'erreur à
            // chaque entrée de salon sur un serveur sans voix (ex. en local).
            if (!auto) onError(res.error)
            return
          }
          const { Room, RoomEvent, Track, AudioPresets } = await import('livekit-client')
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
            .on(RoomEvent.Disconnected, () => {
              document.querySelectorAll('[data-voice="dominos-clan"]').forEach((el) => el.remove())
              audioEls.current.clear()
              voiceRef.current = null
              joinedCode.current = null
              setState(INITIAL)
            })

          try {
            await room.connect(res.url, res.token)
            joinedCode.current = roomCode
            await room.localParticipant.setAttributes({ target: 'all' })
            // Le micro rate parfois sa PREMIÈRE capture (périphérique encore
            // occupé après un changement de salon/onglet) : une deuxième
            // tentative suffit presque toujours — l'autre visage du bug.
            try {
              await room.localParticipant.setMicrophoneEnabled(true)
            } catch {
              await new Promise((r) => setTimeout(r, 450))
              await room.localParticipant.setMicrophoneEnabled(true)
            }
            await room.startAudio()
            setState((s) => ({ ...s, status: 'on', muted: false, audience: 'all' }))
            refreshRoster(room)
          } catch (err) {
            voiceRef.current = null
            joinedCode.current = null
            void room.disconnect()
            if (!retry) {
              // Échec de connexion (quota du projet ?) : le serveur bascule le
              // salon vers le projet LiveKit suivant du pool, et on retente.
              attempt(true)
              return
            }
            setState((s) => ({ ...s, status: 'off' }))
            onError(
              err instanceof Error && err.name === 'NotAllowedError'
                ? 'Micro refusé par le navigateur — autorise-le pour parler'
                : `Connexion voix impossible : ${err instanceof Error ? err.message : 'erreur'}`,
            )
          }
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

  return { state, join, toggleMute, setAudience, leave: teardown }
}
