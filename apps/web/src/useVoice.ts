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
  join: () => void
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

  const join = useCallback(() => {
    if (voiceRef.current || !roomCode) return
    setState((s) => ({ ...s, status: 'connecting' }))

    socket.emit(
      'voice:token',
      {},
      (res: { ok: true; url: string; token: string } | { ok: false; error: string }) => {
        void (async () => {
          if (!res.ok) {
            const unavailable = res.error.includes('non configuré')
            setState((s) => ({ ...s, status: unavailable ? 'unavailable' : 'off' }))
            onError(res.error)
            return
          }
          const { Room, RoomEvent, Track } = await import('livekit-client')
          const room = new Room()
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
              setState(INITIAL)
            })

          try {
            await room.connect(res.url, res.token)
            await room.localParticipant.setAttributes({ target: 'all' })
            await room.localParticipant.setMicrophoneEnabled(true)
            await room.startAudio()
            setState((s) => ({ ...s, status: 'on', muted: false, audience: 'all' }))
            refreshRoster(room)
          } catch (err) {
            voiceRef.current = null
            void room.disconnect()
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
  }, [roomCode, onError, refreshRoster, applyFilterFor])

  const toggleMute = useCallback(() => {
    const room = voiceRef.current
    if (!room) return
    const nextEnabled = !room.localParticipant.isMicrophoneEnabled
    void room.localParticipant.setMicrophoneEnabled(nextEnabled)
    setState((s) => ({ ...s, muted: !nextEnabled }))
  }, [])

  const setAudience = useCallback((audience: VoiceAudience) => {
    const room = voiceRef.current
    if (!room) return
    void room.localParticipant.setAttributes({ target: audience })
    setState((s) => ({ ...s, audience }))
  }, [])

  return { state, join, toggleMute, setAudience, leave: teardown }
}
