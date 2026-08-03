/**
 * Smoke-test de bout en bout contre un serveur DÉJÀ démarré (npm run dev -w @dominos-clan/server).
 *
 * Scénario : 3 joueurs + 1 spectateur, une manche complète jouée coup par coup.
 * Vérifie à chaque état reçu :
 *  - qu'un joueur ne reçoit jamais les mains adverses (anti-triche réseau) ;
 *  - qu'un spectateur les reçoit toutes ;
 *  - que la manche se termine avec un gagnant et que la rotation a eu lieu.
 */
import { io, type Socket } from 'socket.io-client'
import type { GameView, RoomView } from '@dominos-clan/engine'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Client {
  name: string
  socket: Socket
  selfId: string
  game: GameView | null
  room: RoomView | null
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & Record<string, unknown>) => {
      if (res.ok) resolve(res)
      else reject(new Error(`${event} → ${res.error}`))
    })
  })
}

async function connect(name: string): Promise<Client> {
  const socket = io(URL, { transports: ['websocket'] })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (e) => reject(new Error(`Connexion impossible à ${URL} : ${e.message}`)))
  })
  const client: Client = { name, socket, selfId: '', game: null, room: null }
  socket.on('game:state', (view: GameView | null) => {
    client.game = view
    if (view) assertNoLeak(client, view)
  })
  socket.on('room:state', (view: RoomView) => {
    client.room = view
  })
  return client
}

function assertNoLeak(client: Client, view: GameView): void {
  const isPlayer = view.you !== null
  // Manche terminée : les mains sont révélées à tout le monde, c'est voulu.
  if (view.status === 'finished') {
    for (const p of view.players) {
      if (!Array.isArray(p.hand)) {
        throw new Error(`${client.name} devrait voir la main de ${p.id} (manche terminée)`)
      }
    }
    return
  }
  for (const p of view.players) {
    if (isPlayer && 'hand' in p) {
      throw new Error(`FUITE : ${client.name} (joueur) a reçu la main de ${p.id} en pleine manche`)
    }
    if (!isPlayer && !Array.isArray(p.hand)) {
      throw new Error(`${client.name} (spectateur) devrait voir la main de ${p.id}`)
    }
  }
}

async function main(): Promise<void> {
  const alice = await connect('Alice')
  const created = await emitAck(alice.socket, 'room:create', { pseudo: 'Alice' })
  alice.selfId = created.selfId as string
  const code = created.code as string
  console.log(`salon créé : ${code}`)

  const clients = [alice]
  for (const name of ['Bob', 'Chloé', 'Diego']) {
    const c = await connect(name)
    const res = await emitAck(c.socket, 'room:join', { code, pseudo: name })
    c.selfId = res.selfId as string
    clients.push(c)
  }

  // Token vocal : selon la config du serveur, on attend un JWT ou un refus propre.
  const voiceRes = await new Promise<{ ok: boolean; token?: string; url?: string; error?: string }>(
    (resolve) => alice.socket.emit('voice:token', {}, resolve),
  )
  if (voiceRes.ok) {
    if (!voiceRes.url || (voiceRes.token ?? '').split('.').length !== 3) {
      throw new Error('voice:token ok mais token/url invalides')
    }
    console.log('voix : token JWT délivré ✔')
  } else {
    if (!voiceRes.error?.includes('non configuré')) {
      throw new Error(`voice:token refusé pour une mauvaise raison : ${voiceRes.error}`)
    }
    console.log('voix : non configurée sur ce serveur (refus propre) ✔')
  }

  // Chat texte : Bob envoie, Alice doit recevoir la diffusion.
  const bob = clients[1]!
  const chatReceived = new Promise<{ pseudo: string; text: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('chat:message jamais reçu')), 3000)
    alice.socket.once('chat:message', (m: { pseudo: string; text: string }) => {
      clearTimeout(timer)
      resolve(m)
    })
  })
  await emitAck(bob.socket, 'chat:send', { text: 'chambrage de test 🔥' })
  const chatMsg = await chatReceived
  if (chatMsg.text !== 'chambrage de test 🔥' || chatMsg.pseudo !== 'Bob') {
    throw new Error(`chat inattendu : ${JSON.stringify(chatMsg)}`)
  }
  console.log('chat : message diffusé à tout le salon ✔')

  // Présence + invitation directe : Alice (en salon) invite Diego par son code ami.
  const diego = clients[3]!
  await emitAck(alice.socket, 'presence:hello', {
    userId: 'alice0user1',
    pseudo: 'Alice',
    avatar: '😎',
  })
  await emitAck(diego.socket, 'presence:hello', {
    userId: 'diego0user9',
    pseudo: 'Diego',
    avatar: '🦊',
  })
  const watchRes = (await emitAck(diego.socket, 'presence:watch', { ids: ['alice0user1'] })) as {
    ok: boolean
    friends?: Array<{ userId: string; status: string }>
  }
  const aliceStatus = watchRes.friends?.[0]?.status
  if (!aliceStatus || aliceStatus === 'offline') {
    throw new Error(`présence cassée : Alice devrait être en ligne (reçu ${aliceStatus})`)
  }
  const invited = new Promise<{ fromPseudo: string; code: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('friend:invited jamais reçu')), 3000)
    diego.socket.once('friend:invited', (inv: { fromPseudo: string; code: string }) => {
      clearTimeout(timer)
      resolve(inv)
    })
  })
  await emitAck(alice.socket, 'friend:invite', { toUserId: 'diego0user9' })
  const inv = await invited
  if (inv.code !== code || inv.fromPseudo !== 'Alice') {
    throw new Error(`invitation inattendue : ${JSON.stringify(inv)}`)
  }
  console.log(`présence : Alice ${aliceStatus} ✔ — invitation relayée vers Diego (salon ${inv.code}) ✔`)

  // Diego se lève : il sera notre spectateur.
  await emitAck(diego.socket, 'seat:leave', {})
  await emitAck(alice.socket, 'game:start', {})
  await sleep(150)

  const seatedBefore = alice.room!.seats.join(',')
  console.log(`manche lancée, à table : ${seatedBefore} — spectateur : ${diego.selfId}`)

  // Le premier coup est envoyé en mode claquage : tout le salon doit recevoir le CLAC.
  const slamReceived = new Promise<{ pseudo: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game:slam jamais reçu')), 8000)
    diego.socket.once('game:slam', (s: { pseudo: string }) => {
      clearTimeout(timer)
      resolve(s)
    })
  })

  let moves = 0
  while (moves < 200) {
    await sleep(30)
    const finished = clients.find((c) => c.game?.status === 'finished')
    if (finished) break
    const current = clients.find((c) => (c.game?.you?.legalMoves.length ?? 0) > 0)
    if (!current) continue
    const move = current.game!.you!.legalMoves[0]!
    await emitAck(current.socket, 'game:move', { move, slam: moves === 0 })
    moves++
  }
  await slamReceived
  console.log('claquage : CLAC relayé à tout le salon ✔')

  await sleep(150)
  const final = alice.game
  if (final?.status !== 'finished' || !final.result) {
    throw new Error(`la manche ne s'est pas terminée après ${moves} coups`)
  }
  if (!diego.game || diego.game.you !== null) {
    throw new Error('Diego aurait dû recevoir une vue spectateur')
  }
  const winner = final.result.winnerId
  const seatsAfter = alice.room!.seats
  if (winner === null) {
    console.log(`manche terminée en ${moves} coups — NULLE (égalité au blocage), pas de rotation`)
  } else {
    if (seatsAfter[0] !== winner) {
      throw new Error(`rotation cassée : le gagnant ${winner} devrait être en tête des sièges (${seatsAfter.join(',')})`)
    }
    console.log(`manche terminée en ${moves} coups — gagnant : ${winner} (${final.result.reason}, +${final.result.gain} pts)`)
    console.log(`rotation OK, nouveaux sièges : ${seatsAfter.join(',')}`)
  }
  console.log('SMOKE OK ✔ (aucune fuite de main détectée sur tous les états reçus)')
  clients.forEach((c) => c.socket.close())
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('SMOKE FAIL ✘', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
