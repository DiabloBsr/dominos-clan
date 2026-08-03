/**
 * Diagnostic : force des donnes jusqu'à obtenir une donne annulée (4-5 doubles),
 * puis affiche exactement ce que reçoit l'hôte (statuts, redeals, isHost) et
 * vérifie que game:redeal relance bien la partie.
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
    socket.once('connect_error', (e) => reject(new Error(e.message)))
  })
  const client: Client = { name, socket, selfId: '', game: null, room: null }
  socket.on('game:state', (v: GameView | null) => (client.game = v))
  socket.on('room:state', (v: RoomView) => (client.room = v))
  return client
}

async function main(): Promise<void> {
  const alice = await connect('Alice')
  const created = await emitAck(alice.socket, 'room:create', { pseudo: 'Alice' })
  alice.selfId = created.selfId as string
  const code = created.code as string
  const bob = await connect('Bob')
  bob.selfId = (await emitAck(bob.socket, 'room:join', { code, pseudo: 'Bob' })).selfId as string
  const carol = await connect('Carol')
  carol.selfId = (await emitAck(carol.socket, 'room:join', { code, pseudo: 'Carol' })).selfId as string

  let attempts = 0
  while (attempts++ < 500) {
    await emitAck(alice.socket, 'game:start', {})
    await sleep(60)
    if (alice.game?.status === 'redeal') break
    await emitAck(alice.socket, 'room:restart', {})
    await sleep(40)
  }

  if (alice.game?.status !== 'redeal') {
    throw new Error(`aucune donne annulée en ${attempts} essais — improbable, à creuser`)
  }

  console.log(`donne annulée obtenue après ${attempts} donnes`)
  console.log(`room.status (hôte) : ${alice.room?.status}`)
  console.log(`game.status (hôte) : ${alice.game.status}`)
  console.log(`redeals reçus : ${JSON.stringify(alice.game.redeals.map((r) => ({ c: r.culpritId, n: r.doublesCount, mains: r.hands.length })))}`)
  const selfMember = alice.room?.members.find((m) => m.id === alice.selfId)
  console.log(`hôte vu par le client : isHost=${selfMember?.isHost} (selfId=${alice.selfId})`)
  console.log(`condition bouton (status==='redeal' && isHost) : ${alice.game.status === 'redeal' && selfMember?.isHost === true}`)
  console.log(`côté Bob : status=${bob.game?.status}, isHost=${bob.room?.members.find((m) => m.id === bob.selfId)?.isHost}`)

  await emitAck(alice.socket, 'game:redeal', {})
  await sleep(150)
  console.log(`après game:redeal : room.status=${alice.room?.status}, game.status=${alice.game?.status}, redeals=${alice.game?.redeals.length}`)
  ;[alice, bob, carol].forEach((c) => c.socket.close())
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('PROBE FAIL ✘', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
