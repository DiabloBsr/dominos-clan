/**
 * Sonde la voix d'un serveur dominos-clan EN MARCHE : crée un salon jetable,
 * demande un token vocal, puis repart. Codes de sortie :
 *  0 = voix active (token délivré) · 2 = voix non configurée · 1 = erreur.
 * Usage : SERVER_URL=https://dominos-clan.onrender.com npm run probe:voice -w @dominos-clan/server
 */
import { io } from 'socket.io-client'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const socket = io(URL, { transports: ['websocket', 'polling'], timeout: 15000 })

function done(code: number, message: string): void {
  console.log(message)
  socket.close()
  process.exit(code)
}

setTimeout(() => done(1, 'PROBE TIMEOUT ✘ (20 s sans réponse)'), 20000)

socket.on('connect_error', (e) => done(1, `PROBE KO ✘ connexion impossible : ${e.message}`))

socket.on('connect', () => {
  socket.emit('room:create', { pseudo: 'ProbeVoix' }, (res: { ok: boolean; error?: string }) => {
    if (!res.ok) return done(1, `PROBE KO ✘ room:create : ${res.error}`)
    socket.emit(
      'voice:token',
      {},
      (v: { ok: true; url: string; token: string } | { ok: false; error: string }) => {
        if (v.ok && v.token.split('.').length === 3) {
          socket.emit('room:leave', {}, () => done(0, `VOICE OK ✔ token délivré pour ${v.url}`))
        } else {
          done(2, `VOICE INACTIVE — ${v.ok ? 'token invalide' : v.error}`)
        }
      },
    )
  })
})
