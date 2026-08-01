/**
 * Vérifie les identifiants LiveKit (LIVEKIT_URL / API_KEY / API_SECRET)
 * en appelant l'API d'administration : liste les rooms actives.
 * Usage : LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... npm run check:livekit -w @dominos-clan/server
 */
import { RoomServiceClient } from 'livekit-server-sdk'

const url = process.env.LIVEKIT_URL
const key = process.env.LIVEKIT_API_KEY
const secret = process.env.LIVEKIT_API_SECRET

if (!url || !key || !secret) {
  console.error('LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET manquants')
  process.exit(1)
}

const httpUrl = url.replace(/^wss?:\/\//, 'https://')
const svc = new RoomServiceClient(httpUrl, key, secret)

try {
  const rooms = await svc.listRooms()
  console.log(`LIVEKIT OK ✔ — identifiants valides sur ${httpUrl} (${rooms.length} room(s) actives)`)
} catch (err) {
  console.error(`LIVEKIT KO ✘ — ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
