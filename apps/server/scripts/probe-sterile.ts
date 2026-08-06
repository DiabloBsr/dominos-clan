/**
 * Probe « table stérile » contre un serveur DÉJÀ démarré : match aux points
 * avec un seuil d'ouverture inatteignable (200) → aucun joueur ne peut
 * marquer. Au bout de 3 manches, la table entière doit être renouvelée par
 * la file, scores et compteur de manches remis à zéro.
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
    socket.once('connect_error', (e) => reject(new Error(`Connexion impossible : ${e.message}`)))
  })
  const client: Client = { name, socket, selfId: '', game: null, room: null }
  socket.on('game:state', (v: GameView | null) => (client.game = v))
  socket.on('room:state', (v: RoomView) => (client.room = v))
  return client
}

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

/** Joue la manche en cours jusqu'à son terme (la passe est automatique). */
async function playRound(players: Client[]): Promise<void> {
  for (let step = 0; step < 400; step++) {
    const mover = players.find((p) => p.game?.you && p.game.you.legalMoves.length > 0)
    if (!mover) {
      await sleep(60)
      if (players.some((p) => p.game?.status === 'finished')) return
      continue
    }
    const move = mover.game!.you!.legalMoves.find((m) => m.type === 'play') ?? mover.game!.you!.legalMoves[0]!
    try {
      await emitAck(mover.socket, 'game:move', { move })
    } catch {
      // coup périmé (état déjà avancé) : on relit et on retente
    }
    await sleep(45)
    if (players.some((p) => p.game?.status === 'finished')) return
  }
  fail('la manche ne s’est jamais terminée')
}

async function main(): Promise<void> {
  const a = await connect('Un')
  const b = await connect('Deux')
  const c = await connect('Trois')
  const x = await connect('Rempla1')
  const y = await connect('Rempla2')
  const z = await connect('Rempla3')

  let sterileEvents = 0
  for (const cl of [a, b, c, x, y, z]) cl.socket.on('game:sterile', () => (sterileEvents += 1))

  const created = await emitAck(a.socket, 'room:create', { pseudo: a.name, avatar: '😎', userId: 'u-un' })
  const code = created.code as string
  a.selfId = created.selfId as string
  for (const [cl, uid] of [
    [b, 'u-deux'],
    [c, 'u-trois'],
    [x, 'u-x'],
    [y, 'u-y'],
    [z, 'u-z'],
  ] as const) {
    const res = await emitAck(cl.socket, 'room:join', { code, pseudo: cl.name, avatar: '🦊', userId: uid })
    cl.selfId = res.selfId as string
  }

  // Match aux points avec un seuil d'ouverture INATTEIGNABLE : personne ne
  // pourra jamais ouvrir son compteur.
  await emitAck(a.socket, 'room:rules', {
    gameType: 'dominos',
    maxSeats: 3,
    targetScore: 80,
    openThreshold: 200,
    instantWinScore: null,
    openingMaxPips: null,
    freePass: false,
    swapCount: 1,
  })
  await sleep(200)

  const seatsBefore = [...(a.room?.seats ?? [])]
  if (seatsBefore.length !== 3) fail(`attendu 3 assis, reçu ${seatsBefore.length}`)
  const queueBefore = [...(a.room?.queue ?? [])]
  console.log(`table de départ : ${seatsBefore.length} assis, ${queueBefore.length} en file`)

  const players = [a, b, c, x, y, z]
  for (let round = 1; round <= 3; round++) {
    await emitAck(a.socket, 'game:start', {})
    await sleep(150)
    // Une donne peut être annulée (4-5 doubles) : l'hôte redistribue.
    for (let guard = 0; guard < 10 && a.room?.status === 'redeal'; guard++) {
      await emitAck(a.socket, 'game:redeal', {})
      await sleep(150)
    }
    await playRound(players)
    await sleep(250)
    const scores = Object.values(a.room?.scores ?? {})
    console.log(`manche ${round} jouée — scores : ${JSON.stringify(scores)}`)
    if (scores.some((s) => s > 0)) fail('un joueur a marqué alors que le seuil est inatteignable')
  }

  await sleep(300)
  const seatsAfter = a.room?.seats ?? []
  if (sterileEvents === 0) fail('aucun événement game:sterile reçu')
  const renewed = seatsAfter.filter((id) => !seatsBefore.includes(id)).length
  if (renewed !== 3) {
    fail(`table non renouvelée : ${renewed}/3 nouveaux assis (seats=${seatsAfter.join(',')})`)
  }
  if (Object.values(a.room?.scores ?? {}).some((s) => s !== 0)) fail('scores non remis à zéro')
  for (const old of seatsBefore) {
    if (!(a.room?.queue ?? []).includes(old)) fail(`le sortant ${old} n’est pas reparti en file`)
  }
  console.log('✅ table stérile : 3 manches sans marque → table entièrement renouvelée')
  console.log(`\n🎉 PROBE STÉRILE OK (salon ${code}, ${sterileEvents} annonce(s))`)
  for (const cl of players) cl.socket.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
