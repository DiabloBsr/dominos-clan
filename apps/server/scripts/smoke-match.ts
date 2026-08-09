/**
 * Smoke-test du MODE MATCH contre un serveur déjà démarré.
 *
 * Scénario : 3 membres — 2 à table, 1 en file. Règles : victoire éclair à 1
 * point → la première manche gagnée remporte le match. On vérifie que la
 * table reste fixe pendant le match et que l'échange avec la file se fait
 * À LA VICTOIRE : le vainqueur reste, la file monte, le perdant part en file.
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
  })
  socket.on('room:state', (view: RoomView) => {
    client.room = view
  })
  return client
}

async function playOneRound(clients: Client[]): Promise<void> {
  let moves = 0
  while (moves < 200) {
    await sleep(30)
    if (clients.some((c) => c.game?.status === 'finished')) return
    const current = clients.find((c) => (c.game?.you?.legalMoves.length ?? 0) > 0)
    if (!current) continue
    // On évite la passe libre pour finir vite : priorité aux poses.
    const legal = current.game!.you!.legalMoves
    const move = legal.find((m) => m.type === 'play') ?? legal[0]!
    await emitAck(current.socket, 'game:move', { move })
    moves++
  }
  throw new Error('la manche ne s’est pas terminée en 200 coups')
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

  // Carol passe en file : table à 2, une personne attend.
  await emitAck(carol.socket, 'seat:leave', {})
  // Victoire éclair à 1 pt : toute manche gagnée (non nulle) remporte le match.
  await emitAck(alice.socket, 'room:rules', {
    targetScore: 500,
    openThreshold: 0,
    freePass: false,
    openingMaxPips: null,
    instantWinScore: 1,
    maxSeats: 3,
  })
  await sleep(120)

  const seatsBefore = [...alice.room!.seats]
  const queueBefore = [...alice.room!.queue]
  if (seatsBefore.length !== 2 || queueBefore.join(',') !== carol.selfId) {
    throw new Error(`mise en place cassée : sièges=${seatsBefore.join(',')} file=${queueBefore.join(',')}`)
  }

  await emitAck(alice.socket, 'game:start', {})
  await sleep(150)
  let redealCount = 0
  while (alice.game?.status === 'redeal' && redealCount++ < 10) {
    console.log('donne annulée (doubles) → l’hôte redistribue 🔀')
    await emitAck(alice.socket, 'game:redeal', {})
    await sleep(150)
  }
  await playOneRound(clients)
  await sleep(200)

  const result = alice.game?.result
  const room = alice.room!
  if (!result) throw new Error('pas de résultat de manche')

  if (result.winnerId === null) {
    // Manche nulle : personne ne bouge, on valide juste ce comportement.
    if (room.seats.join(',') !== seatsBefore.join(',') || room.queue.join(',') !== carol.selfId) {
      throw new Error('manche nulle : la table n’aurait pas dû bouger')
    }
    console.log('SMOKE MATCH OK ✔ (manche nulle : table et file inchangées)')
  } else {
    const winner = result.winnerId
    const loser = seatsBefore.find((id) => id !== winner)!
    // Le gagnant reste, Carol prend le siège du plus petit score (le perdant),
    // le perdant part en fin de file.
    if (room.matchWinnerId !== winner) throw new Error('le match aurait dû être remporté (éclair à 1 pt)')
    if (!room.seats.includes(winner)) throw new Error('le gagnant a été évincé !')
    if (!room.seats.includes(carol.selfId)) throw new Error('Carol aurait dû entrer à la victoire')
    if (room.queue.join(',') !== loser) {
      throw new Error(`le perdant ${loser} devrait être seul en file (file=${room.queue.join(',')})`)
    }
    const winnerScore = room.scores[winner] ?? 0
    if (winnerScore !== result.gain) {
      throw new Error(`score du gagnant attendu ${result.gain}, reçu ${winnerScore}`)
    }
    // L'hôte ajoute le perdant (en file) à la table en plein match → table à 3.
    await emitAck(alice.socket, 'seat:promote', { memberId: loser })
    await sleep(120)
    if (alice.room!.seats.length !== 3 || alice.room!.queue.length !== 0) {
      throw new Error(
        `seat:promote cassé : sièges=${alice.room!.seats.join(',')} file=${alice.room!.queue.join(',')}`,
      )
    }
    // Remise à zéro par l'hôte : retour lobby, scores effacés.
    await emitAck(alice.socket, 'room:restart', {})
    // PALMARÈS : le vainqueur doit avoir 1 victoire et 1 manche, les deux
    // joueurs de la table 1 partie jouée, et le spectateur rien du tout.
    const standings = alice.room!.standings ?? {}
    const winnerRow = standings[winner]
    const loserRow = standings[loser]
    if (!winnerRow || winnerRow.wins !== 1 || winnerRow.rounds !== 1) {
      throw new Error(`palmarès du gagnant faux : ${JSON.stringify(winnerRow)}`)
    }
    if (winnerRow.points !== result.gain) {
      throw new Error(`points au palmarès : attendu ${result.gain}, reçu ${winnerRow.points}`)
    }
    if (!loserRow || loserRow.wins !== 0 || loserRow.played !== 1) {
      throw new Error(`palmarès du perdant faux : ${JSON.stringify(loserRow)}`)
    }
    if (standings[carol.selfId]) {
      throw new Error('le spectateur ne doit pas apparaître au palmarès')
    }
    console.log(
      `palmarès ✔ gagnant ${winnerRow.wins}V/${winnerRow.rounds}M/${winnerRow.points}pts · perdant ${loserRow.wins}V/${loserRow.played} jouée(s) · spectateur absent`,
    )

    await sleep(120)
    if (alice.room!.status !== 'lobby' || Object.keys(alice.room!.scores).length !== 0) {
      throw new Error(
        `room:restart cassé : status=${alice.room!.status} scores=${JSON.stringify(alice.room!.scores)}`,
      )
    }
    console.log(
      `SMOKE MATCH OK ✔ match remporté par ${winner} (+${result.gain} pts) → échange à la victoire : Carol à table, perdant en file ✔, ajout à la table ✔, remise à zéro ✔`,
    )
  }
  clients.forEach((c) => c.socket.close())
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('SMOKE MATCH FAIL ✘', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
