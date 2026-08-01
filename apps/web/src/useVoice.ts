import { useCallback, useEffect, useRef, useState } from 'react'
// Type-only : la lib livekit-client (~140 kB gzip) n'est chargée
// dynamiquement qu'au moment où on rejoint la voix.
import type { Room as VoiceRoom, RemoteTrack, Participant } from 'livekit-client'
import { socket } from './socket'

export interface VoiceState {
  /** off = pas connecté ; on = mic actif ; unavailable = serveur sans config LiveKit */
  status: 'off' | 'connecting' | 'on' | 'unavailable'
  muted: boolean
  /** memberIds présents dans le salon vocal. */
  inVoice: string[]
  /** memberIds en train de parler (détection LiveKit). */
  speaking: string[]
}

export interface VoiceControls {
  state: VoiceState
  join: () => void
  toggleMute: () => void
  leave: () => void
}

const INITIAL: VoiceState = { status: 'off', muted: false, inVoice: [], speaking: [] }

/**
 * Voix du salon via LiveKit : un salon de jeu = une room `dc-<code>`.
 * Le token est délivré par notre serveur (voice:token) qui vérifie
 * l'appartenance au salon ; l'audio passe ensuite en direct par le SFU.
 */
export function useVoice(roomCode: string | null, onError: (message: string) => void): VoiceControls {
  const voiceRef = useRef<VoiceRoom | null>(null)
  const [state, setState] = useState<VoiceState>(INITIAL)

  const teardown = useCallback(() => {
    const room = voiceRef.current
    voiceRef.current = null
    if (room) void room.disconnect()
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
            .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
              if (track.kind === Track.Kind.Audio) {
                const el = track.attach()
                el.dataset.voice = 'dominos-clan'
                document.body.appendChild(el)
              }
            })
            .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
              track.detach().forEach((el) => el.remove())
            })
            .on(RoomEvent.ParticipantConnected, () => refreshRoster(room))
            .on(RoomEvent.ParticipantDisconnected, () => refreshRoster(room))
            .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
              setState((s) => ({ ...s, speaking: speakers.map((p) => p.identity) }))
            })
            .on(RoomEvent.Disconnected, () => {
              document.querySelectorAll('[data-voice="dominos-clan"]').forEach((el) => el.remove())
              voiceRef.current = null
              setState(INITIAL)
            })

          try {
            await room.connect(res.url, res.token)
            await room.localParticipant.setMicrophoneEnabled(true)
            await room.startAudio()
            setState((s) => ({ ...s, status: 'on', muted: false }))
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
  }, [roomCode, onError, refreshRoster])

  const toggleMute = useCallback(() => {
    const room = voiceRef.current
    if (!room) return
    const nextEnabled = !room.localParticipant.isMicrophoneEnabled
    void room.localParticipant.setMicrophoneEnabled(nextEnabled)
    setState((s) => ({ ...s, muted: !nextEnabled }))
  }, [])

  return { state, join, toggleMute, leave: teardown }
}
