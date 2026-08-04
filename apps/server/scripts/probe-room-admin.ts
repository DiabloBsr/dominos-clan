/**
 * Probe des nouveautés « administration de salon » contre un serveur DÉJÀ démarré :
 *  - soundboard : sound:send → sound:played reçu par tout le salon (+ throttle) ;
 *  - room:reconfigure en pleine manche → retour lobby, scores vidés, règles neuves ;
 *  - room:transfer-host → l'étoile change de tête, l'ancien chef perd la main.
 */
import { io, type Socket } from 'socket.io-client'
import type { RoomView } from '@dominos-clan/engine'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: { ok: boolean; error?: string } & Record<string, unknown>) => {
      if (res.ok) resolve(res)
      else reject(new Error(`${event} → ${res.error}`))
    })
  })
}

async function connect(): Promise<Socket> {
  const socket = io(URL, { transports: ['websocket'] })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (e) => reject(new Error(`Connexion impossible à ${URL} : ${e.message}`)))
  })
  return socket
}

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const a = await connect()
  const b = await connect()
  let roomA: RoomView | null = null
  let roomB: RoomView | null = null
  const soundsB: string[] = []
  a.on('room:state', (v: RoomView) => (roomA = v))
  b.on('room:state', (v: RoomView) => (roomB = v))
  b.on('sound:played', (s: { kind: string }) => soundsB.push(s.kind))

  const created = await emitAck(a, 'room:create', { pseudo: 'Chef', avatar: '😎', userId: 'u-chef' })
  const code = created.code as string
  const chefId = created.selfId as string
  const joined = await emitAck(b, 'room:join', { code, pseudo: 'Pote', avatar: '🦊', userId: 'u-pote' })
  const poteId = joined.selfId as string
  await emitAck(a, 'room:rules', { gameType: 'dominos', maxSeats: 2, targetScore: 80, instantWinScore: 40 })
  await sleep(150)

  // 1) Soundboard : le pote entend le pet du chef, le spam est étouffé.
  await emitAck(a, 'sound:send', { kind: 'pet' })
  await emitAck(a, 'sound:send', { kind: 'rire' }) // throttlé (1,5 s), ne doit PAS arriver
  await sleep(200)
  if (soundsB.length !== 1 || soundsB[0] !== 'pet') fail(`soundboard : attendu ['pet'], reçu ${JSON.stringify(soundsB)}`)
  // Un son inconnu est ignoré silencieusement (comme les réactions) : jamais diffusé.
  await sleep(1600) // laisse passer le throttle pour tester la validation seule
  await emitAck(a, 'sound:send', { kind: 'nimportequoi' })
  await sleep(200)
  if (soundsB.length !== 1) fail(`soundboard : un son inconnu a été diffusé (${JSON.stringify(soundsB)})`)
  console.log('✅ soundboard : diffusion + throttle + validation')

  // 2) Reconfigure en pleine manche : lancer, vérifier playing, reconfigurer.
  await emitAck(a, 'game:start', {})
  await sleep(150)
  if (roomA?.status !== 'playing') fail(`attendu status playing, reçu ${roomA?.status}`)
  let restartedFlag: { reconfigured?: boolean } | null = null
  b.once('room:restarted', (r: { reconfigured?: boolean }) => (restartedFlag = r))
  await emitAck(a, 'room:reconfigure', {
    gameType: 'dominos',
    maxSeats: 2,
    targetScore: 120,
    openThreshold: 0,
    instantWinScore: null,
    openingMaxPips: null,
    freePass: true,
  })
  await sleep(200)
  if (roomB?.status !== 'lobby') fail(`reconfigure : attendu lobby, reçu ${roomB?.status}`)
  if (roomB?.rules.targetScore !== 120 || roomB?.rules.freePass !== true) {
    fail(`reconfigure : règles non appliquées (${JSON.stringify(roomB?.rules)})`)
  }
  if (Object.values(roomB?.scores ?? {}).some((s) => s !== 0)) fail('reconfigure : scores non remis à zéro')
  if (!restartedFlag || !(restartedFlag as { reconfigured?: boolean }).reconfigured) {
    fail('reconfigure : room:restarted {reconfigured:true} non reçu')
  }
  console.log('✅ reconfigure : partie annulée, règles neuves, scores à zéro')

  // 3) Transfert de chef : interdit au non-chef, puis l'étoile passe au pote.
  try {
    await emitAck(b, 'room:transfer-host', { toId: poteId })
    fail('transfer-host : un non-chef a pu se nommer chef')
  } catch {
    /* attendu */
  }
  await emitAck(a, 'room:transfer-host', { toId: poteId })
  await sleep(200)
  const hostNow = roomB && (roomB as RoomView).members.find((m) => m.isHost)
  if (!hostNow || hostNow.id !== poteId) fail(`transfer-host : chef attendu ${poteId}, trouvé ${hostNow?.id}`)
  // L'ancien chef ne peut plus régler le salon…
  try {
    await emitAck(a, 'room:rules', { gameType: 'dominos', maxSeats: 2 })
    fail('transfer-host : l’ancien chef peut encore changer les règles')
  } catch {
    /* attendu */
  }
  // …et le nouveau chef, si.
  await emitAck(b, 'room:rules', { gameType: 'dominos', maxSeats: 2, targetScore: null })
  console.log('✅ transfer-host : étoile transmise, droits basculés')

  // 4) Échange assis ↔ file, puis retrait d'un membre par le chef.
  const c = await connect()
  const joinedC = await emitAck(c, 'room:join', { code, pseudo: 'Rempla', avatar: '🦈', userId: 'u-rempla' })
  const remplaId = joinedC.selfId as string
  await sleep(200)
  if (!roomB || !(roomB as RoomView).queue.includes(remplaId)) fail('swap : Rempla aurait dû arriver en file')
  await emitAck(b, 'room:swap', { seatId: chefId, withId: remplaId })
  await sleep(200)
  let vb = roomB as RoomView
  if (!vb.seats.includes(remplaId) || !vb.queue.includes(chefId)) {
    fail(`swap : attendu Rempla à table et Chef en file (seats=${vb.seats}, queue=${vb.queue})`)
  }
  console.log('✅ swap : joueur assis échangé avec un joueur de la file')

  let kicked = false
  a.on('room:kicked', () => (kicked = true))
  try {
    await emitAck(a, 'room:kick', { memberId: remplaId })
    fail('kick : un non-chef a pu retirer quelqu’un')
  } catch {
    /* attendu */
  }
  await emitAck(b, 'room:kick', { memberId: chefId })
  await sleep(200)
  vb = roomB as RoomView
  if (!kicked) fail('kick : le retiré n’a pas reçu room:kicked')
  if (vb.members.some((m) => m.id === chefId)) fail('kick : le membre retiré est toujours dans le salon')
  console.log('✅ kick : membre retiré, notifié, salon nettoyé')

  console.log(`\n🎉 PROBE ADMIN OK (salon ${code})`)
  a.close()
  b.close()
  c.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
