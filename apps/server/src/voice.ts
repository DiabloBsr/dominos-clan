import { AccessToken } from 'livekit-server-sdk'
import { RoomError } from './rooms'

/**
 * Chat vocal via LiveKit (SFU). Le serveur ne fait que délivrer des tokens :
 * l'audio passe directement entre les clients et le serveur LiveKit.
 * Un token n'est délivré qu'à un membre effectif du salon (vérifié en amont),
 * pour la room LiveKit dédiée `dc-<code>` uniquement.
 */
export function voiceEnabled(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  )
}

export async function createVoiceToken(
  code: string,
  memberId: string,
  pseudo: string,
): Promise<{ url: string; token: string }> {
  if (!voiceEnabled()) {
    throw new RoomError('Chat vocal non configuré sur ce serveur')
  }
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: memberId,
    name: pseudo,
    ttl: '3h',
  })
  at.addGrant({
    roomJoin: true,
    room: `dc-${code}`,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  })
  return { url: process.env.LIVEKIT_URL!, token: await at.toJwt() }
}
