/**
 * Smoke-test des ÉCHECS contre un serveur déjà démarré.
 *
 * Scénario : salon en mode échecs (pendule 10 min), 2 joueurs + 1 spectateur.
 * Partie 1 : mat du berger → vainqueur = blancs, rotation (gagnant reste,
 * spectateur monte, perdant en file). Partie 2 : abandon → l'autre gagne.
 */
import { io, type Socket } from 'socket.io-client'
import type { ChessView, RoomView } from '@dominos-clan/engine'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Client {
  name: string
  socket: Socket
  selfId: string
  chess: ChessView | null
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
  const client: Client = { name, socket, selfId: '', chess: null, room: null }
  socket.on('chess:state', (v: ChessView | null) => (client.chess = v))
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
  const clients = [alice, bob, carol]
  const byId = (id: string) => clients.find((c) => c.selfId === id)!

  // Passage en mode échecs : la table se borne à 2 → Carol part en file.
  await emitAck(alice.socket, 'room:rules', { gameType: 'chess', chessMinutes: 10, chessIncrement: 0 })
  await sleep(120)
  if (alice.room?.rules.gameType !== 'chess' || alice.room.seats.length !== 2) {
    throw new Error(`règles échecs : sièges=${alice.room?.seats.length}, file=${alice.room?.queue.join(',')}`)
  }
  if (alice.room.queue.join(',') !== carol.selfId) {
    throw new Error('Carol aurait dû être renvoyée en file au passage en mode échecs')
  }
  console.log('mode échecs : table bornée à 2, Carol en file ✔')

  await emitAck(alice.socket, 'game:start', {})
  await sleep(150)
  const view = alice.chess
  if (!view || view.status !== 'playing') throw new Error('partie échecs non lancée')
  if (view.whiteMs !== 600_000 || view.blackMs !== 600_000) {
    throw new Error(`pendules attendues à 600000 ms, reçu ${view.whiteMs}/${view.blackMs}`)
  }
  const white = byId(view.whiteId)
  const black = byId(view.blackId)
  console.log(`partie lancée : blancs=${white.name}, noirs=${black.name}, pendules 10:00 ✔`)

  // Mat du berger : 1.e4 e5 2.Fc4 Cc6 3.Dh5 Cf6 4.Dxf7#
  const moves: Array<[Client, string, string]> = [
    [white, 'e2', 'e4'],
    [black, 'e7', 'e5'],
    [white, 'f1', 'c4'],
    [black, 'b8', 'c6'],
    [white, 'd1', 'h5'],
    [black, 'g8', 'f6'],
    [white, 'h5', 'f7'],
  ]
  for (const [player, from, to] of moves) {
    await emitAck(player.socket, 'chess:move', { from, to })
    await sleep(60)
  }

  const done = alice.chess
  if (done?.status !== 'finished' || done.result?.reason !== 'checkmate') {
    throw new Error(`mat attendu, reçu ${JSON.stringify(done?.result)}`)
  }
  if (done.result.winnerId !== white.selfId) throw new Error('les blancs auraient dû gagner')
  await sleep(120)
  const seats = alice.room!.seats
  if (!seats.includes(white.selfId) || !seats.includes(carol.selfId)) {
    throw new Error(`rotation cassée : sièges=${seats.join(',')}`)
  }
  if (alice.room!.queue.join(',') !== black.selfId) {
    throw new Error('le perdant aurait dû partir en file')
  }
  console.log(`mat du berger ✔ — ${white.name} gagne, Carol monte, ${black.name} en file ✔`)

  // Partie 2 : les noirs abandonnent (l'hôte relance ; couleurs retirées au sort).
  await emitAck(alice.socket, 'game:start', {})
  await sleep(150)
  const v2 = alice.chess!
  const resigner = byId(v2.blackId)
  await emitAck(resigner.socket, 'chess:resign', {})
  await sleep(120)
  const d2 = alice.chess
  if (d2?.result?.reason !== 'resign' || d2.result.winnerId !== v2.whiteId) {
    throw new Error(`abandon attendu, reçu ${JSON.stringify(d2?.result)}`)
  }
  console.log('abandon ✔ — l’adversaire gagne')

  console.log('SMOKE CHESS OK ✔')
  clients.forEach((c) => c.socket.close())
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('SMOKE CHESS FAIL ✘', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
