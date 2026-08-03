/**
 * Smoke-test du LUDO contre un serveur déjà démarré.
 *
 * Salon en mode Ludo (bonus activés), 2 joueurs + réglage 6-successifs.
 * Le dé étant tiré côté serveur, on joue une session bornée : à chaque état,
 * le joueur au tour lance ou joue le premier pion légal, et on vérifie les
 * invariants (4 pions par joueur, événements servis, aucune erreur serveur).
 */
import { io, type Socket } from 'socket.io-client'
import { ludoLegalPawns, type LudoState, type RoomView } from '@dominos-clan/engine'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Client {
  name: string
  socket: Socket
  selfId: string
  ludo: LudoState | null
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
  const client: Client = { name, socket, selfId: '', ludo: null, room: null }
  socket.on('ludo:state', (v: LudoState | null) => (client.ludo = v))
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
  const clients = [alice, bob]

  await emitAck(alice.socket, 'room:rules', { gameType: 'ludo', ludoSixes: 4, ludoBonus: true })
  await sleep(120)
  if (alice.room?.rules.gameType !== 'ludo' || alice.room.rules.ludoSixes !== 4) {
    throw new Error('règles ludo non appliquées')
  }
  await emitAck(alice.socket, 'game:start', {})
  await sleep(150)
  if (alice.ludo?.status !== 'playing' || alice.ludo.players.length !== 2) {
    throw new Error('partie ludo non lancée')
  }
  console.log('ludo lancé : 2 joueurs, 6-successifs=4, bonus ✔')

  let actions = 0
  let escaped = false
  while (actions < 160 && alice.ludo && alice.ludo.status === 'playing') {
    const state = alice.ludo
    const current = clients.find((c) => c.selfId === state.players[state.turn]!.id)!

    if (state.pendingBonus) {
      // Cible du bonus : premier pion adverse sur la piste.
      const owner = clients.find((c) => c.selfId === state.players[state.pendingBonus!.playerIndex]!.id)!
      let done = false
      for (let pi = 0; pi < state.players.length && !done; pi++) {
        if (pi === state.pendingBonus.playerIndex) continue
        for (let pw = 0; pw < 4 && !done; pw++) {
          if (state.players[pi]!.pawns[pw]!.zone === 'track') {
            await emitAck(owner.socket, 'ludo:target', { player: pi, pawn: pw })
            done = true
          }
        }
      }
      if (!done) throw new Error('bonus en attente sans cible disponible')
    } else if (state.dice === null) {
      await emitAck(current.socket, 'ludo:roll', {})
    } else {
      const myIndex = state.players.findIndex((p) => p.id === current.selfId)
      const legal = ludoLegalPawns(state, myIndex)
      if (legal.length === 0) throw new Error('dé posé mais aucun coup légal (incohérent)')
      await emitAck(current.socket, 'ludo:play', { pawn: legal[0]! })
    }

    actions++
    await sleep(25)

    // Invariants à chaque état.
    const s = alice.ludo
    if (s) {
      for (const p of s.players) {
        if (p.pawns.length !== 4) throw new Error('un joueur n’a plus 4 pions !')
      }
      if (s.players.some((p) => p.pawns.some((pw) => pw.zone !== 'base'))) escaped = true
    }
  }

  if (!escaped) throw new Error('aucun pion sorti de prison en 160 actions (improbable)')
  console.log(
    `SMOKE LUDO OK ✔ — ${actions} actions sans erreur, pions sortis et en mouvement${
      alice.ludo?.status === 'finished' ? `, partie gagnée par ${alice.ludo.winnerId}` : ''
    }`,
  )
  clients.forEach((c) => c.socket.close())
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('SMOKE LUDO FAIL ✘', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
