import { AccessToken } from 'livekit-server-sdk'
import { RoomError } from './rooms'

/**
 * Chat vocal via LiveKit (SFU) — avec POOL de projets : plusieurs comptes
 * LiveKit configurés en variables d'environnement, répartis entre les salons
 * (round-robin) pour étaler la consommation des quotas gratuits.
 *
 * - Un salon est COLLÉ à son projet (voiceProjectIndex) : on ne change jamais
 *   de projet en pleine conversation.
 * - Si un client n'arrive pas à se connecter (quota épuisé, projet mort), il
 *   redemande un token avec `retry` → le salon bascule au projet suivant.
 *
 * Variables : LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (projet 1)
 * puis LIVEKIT_URL_2 / LIVEKIT_API_KEY_2 / LIVEKIT_API_SECRET_2, _3, … _6.
 */
interface VoiceProject {
  url: string
  key: string
  secret: string
  label: string
}

let cachedPool: VoiceProject[] | null = null

export function voicePool(): VoiceProject[] {
  if (cachedPool) return cachedPool
  const pool: VoiceProject[] = []
  const push = (url?: string, key?: string, secret?: string, label = '?') => {
    if (url && key && secret) pool.push({ url, key, secret, label })
  }
  push(process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, '1')
  for (let i = 2; i <= 6; i++) {
    push(
      process.env[`LIVEKIT_URL_${i}`],
      process.env[`LIVEKIT_API_KEY_${i}`],
      process.env[`LIVEKIT_API_SECRET_${i}`],
      String(i),
    )
  }
  cachedPool = pool
  return pool
}

export function voiceEnabled(): boolean {
  return voicePool().length > 0
}

export async function createVoiceToken(
  code: string,
  memberId: string,
  pseudo: string,
  projectIndex: number,
): Promise<{ url: string; token: string; project: string }> {
  const pool = voicePool()
  if (pool.length === 0) {
    throw new RoomError('Chat vocal non configuré sur ce serveur')
  }
  const project = pool[projectIndex % pool.length]!
  const at = new AccessToken(project.key, project.secret, {
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
    // Permet au client de publier son attribut `target`
    // (audience de son micro : tous / joueurs / spectateurs).
    canUpdateOwnMetadata: true,
  })
  return { url: project.url, token: await at.toJwt(), project: project.label }
}
