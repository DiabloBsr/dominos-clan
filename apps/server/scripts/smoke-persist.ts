/**
 * Preuve de la MÉMOIRE des salons — en deux actes, avec un VRAI kill du
 * serveur entre les deux (orchestré par le script bash appelant) :
 *
 *  ACTE save    : 3 joueurs, mode match, une manche jouée jusqu'au bout →
 *                 scores réels. On écrit l'instantané chiffré + les sessions
 *                 dans un fichier, comme le localStorage d'un joueur.
 *  ACTE resume  : sur un serveur NEUF (mémoire vide), chaque joueur revient
 *                 avec son instantané → le salon doit être restauré à
 *                 L'IDENTIQUE : scores, palmarès, sièges, statut, réglages.
 *
 * Usage : MODE=save|resume SERVER_URL=... tsx scripts/smoke-persist.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { io, type Socket } from 'socket.io-client'
import type { GameView, RoomView } from '@dominos-clan/engine'

const URL = process.env.SERVER_URL ?? 'http://localhost:4001'
const MODE = process.env.MODE ?? 'save'
const FILE = 'scratch-persist-state.json'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Client {
  name: string
  socket: Socket
  selfId: string
  resumeKey: string
  game: GameView | null
  room: RoomView | null
  snapshot: string | null
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
  const client: Client = { name, socket, selfId: '', resumeKey: '', game: null, room: null, snapshot: null }
  socket.on('game:state', (v: GameView | null) => (client.game = v))
  socket.on('room:state', (v: RoomView) => (client.room = v))
  socket.on('room:snapshot', (p: { blob: string }) => (client.snapshot = p.blob))
  return client
}

async function playOneRound(clients: Client[]): Promise<void> {
  let moves = 0
  while (moves < 250) {
    await sleep(25)
    if (clients.some((c) => c.game?.status === 'finished')) return
    const current = clients.find((c) => (c.game?.you?.legalMoves.length ?? 0) > 0)
    if (!current) continue
    const legal = current.game!.you!.legalMoves
    const move = legal.find((m) => m.type === 'play') ?? legal[0]!
    await emitAck(current.socket, 'game:move', { move })
    moves++
  }
  throw new Error('manche interminable')
}

async function save(): Promise<void> {
  const a = await connect('Aina')
  const created = await emitAck(a.socket, 'room:create', { pseudo: 'Aina' })
  a.selfId = created.selfId as string
  a.resumeKey = created.resumeKey as string
  const code = created.code as string
  const b = await connect('Bema')
  const jb = await emitAck(b.socket, 'room:join', { code, pseudo: 'Bema' })
  b.selfId = jb.selfId as string
  b.resumeKey = jb.resumeKey as string
  const c = await connect('Coco')
  const jc = await emitAck(c.socket, 'room:join', { code, pseudo: 'Coco' })
  c.selfId = jc.selfId as string
  c.resumeKey = jc.resumeKey as string

  // Mode match : les scores s'accumulent — c'est EUX qu'on doit retrouver.
  await emitAck(a.socket, 'room:rules', {
    targetScore: 500,
    openThreshold: 0,
    instantWinScore: null,
    maxSeats: 3,
  })
  await sleep(150)
  await emitAck(a.socket, 'game:start', {})
  await sleep(150)
  let redeals = 0
  while (a.game?.status === 'redeal' && redeals++ < 10) {
    await emitAck(a.socket, 'game:redeal', {})
    await sleep(150)
  }
  await playOneRound([a, b, c])
  await sleep(400) // le broadcast de fin de manche apporte l'instantané final

  const room = a.room!
  if (!a.snapshot) throw new Error('aucun instantané reçu')
  writeFileSync(
    FILE,
    JSON.stringify({
      code,
      snapshot: a.snapshot,
      sessions: [a, b, c].map((x) => ({ memberId: x.selfId, resumeKey: x.resumeKey, name: x.name })),
      attendu: {
        scores: room.scores,
        standings: room.standings,
        seats: room.seats,
        status: room.status,
        rules: room.rules,
      },
    }),
  )
  console.log(
    `ACTE 1 OK ✔ salon ${code} — scores ${JSON.stringify(room.scores)} | statut ${room.status} | instantané ${a.snapshot.length} o`,
  )
  ;[a, b, c].forEach((x) => x.socket.close())
}

async function resume(): Promise<void> {
  const saved = JSON.parse(readFileSync(FILE, 'utf8')) as {
    code: string
    snapshot: string
    sessions: Array<{ memberId: string; resumeKey: string; name: string }>
    attendu: { scores: Record<string, number>; standings: Record<string, unknown>; seats: string[]; status: string; rules: Record<string, unknown> }
  }

  // Contrôle : sur ce serveur NEUF, le salon n'existe pas sans instantané.
  const probe = await connect('Sonde')
  const failed = await new Promise<boolean>((resolve) => {
    probe.socket.emit(
      'room:resume',
      { code: saved.code, memberId: saved.sessions[0]!.memberId, resumeKey: saved.sessions[0]!.resumeKey },
      (res: { ok: boolean }) => resolve(!res.ok),
    )
  })
  probe.socket.close()
  if (!failed) throw new Error('le salon existait déjà — le kill du serveur a raté')
  console.log('serveur neuf confirmé : salon inconnu sans instantané ✔')

  // Le premier joueur revient AVEC l'instantané → restauration.
  const a = await connect(saved.sessions[0]!.name)
  const res = await emitAck(a.socket, 'room:resume', {
    code: saved.code,
    memberId: saved.sessions[0]!.memberId,
    resumeKey: saved.sessions[0]!.resumeKey,
    snapshot: saved.snapshot,
  })
  if (res.restored !== true) throw new Error('restored=false : restauration non signalée')
  await sleep(250)
  const room = a.room!

  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
  if (!eq(room.scores, saved.attendu.scores)) {
    throw new Error(`SCORES ≠ attendu ${JSON.stringify(saved.attendu.scores)}, reçu ${JSON.stringify(room.scores)}`)
  }
  if (!eq(room.standings, saved.attendu.standings)) throw new Error('PALMARÈS différent')
  if (!eq(room.seats, saved.attendu.seats)) throw new Error('SIÈGES différents')
  if (room.status !== saved.attendu.status) throw new Error(`statut ${room.status} ≠ ${saved.attendu.status}`)
  if (!eq(room.rules, saved.attendu.rules)) throw new Error('RÈGLES différentes')

  // Les DEUX autres reviennent par la voie normale (salon déjà restauré).
  for (const s of saved.sessions.slice(1)) {
    const cl = await connect(s.name)
    await emitAck(cl.socket, 'room:resume', {
      code: saved.code,
      memberId: s.memberId,
      resumeKey: s.resumeKey,
      snapshot: saved.snapshot,
    })
    cl.socket.close()
  }
  await sleep(200)
  console.log(
    `ACTE 2 OK ✔ salon RESTAURÉ à l'identique après kill : scores ${JSON.stringify(room.scores)}, palmarès, sièges, règles, statut ${room.status} — les 3 joueurs sont revenus`,
  )
  a.socket.close()
}

/** ACTE save-mid : on arrête la partie EN PLEINE MANCHE (6 coups joués). */
async function saveMid(): Promise<void> {
  const a = await connect('Aina')
  const created = await emitAck(a.socket, 'room:create', { pseudo: 'Aina' })
  a.selfId = created.selfId as string
  a.resumeKey = created.resumeKey as string
  const code = created.code as string
  const b = await connect('Bema')
  const jb = await emitAck(b.socket, 'room:join', { code, pseudo: 'Bema' })
  b.selfId = jb.selfId as string
  b.resumeKey = jb.resumeKey as string
  const c = await connect('Coco')
  const jc = await emitAck(c.socket, 'room:join', { code, pseudo: 'Coco' })
  c.selfId = jc.selfId as string
  c.resumeKey = jc.resumeKey as string
  await emitAck(a.socket, 'game:start', {})
  await sleep(150)
  let redeals = 0
  while (a.game?.status === 'redeal' && redeals++ < 10) {
    await emitAck(a.socket, 'game:redeal', {})
    await sleep(150)
  }
  // Exactement 6 coups, puis on fige : la manche est EN COURS.
  const clients = [a, b, c]
  let moves = 0
  while (moves < 6) {
    await sleep(25)
    const current = clients.find((x) => (x.game?.you?.legalMoves.length ?? 0) > 0)
    if (!current) continue
    const legal = current.game!.you!.legalMoves
    await emitAck(current.socket, 'game:move', { move: legal.find((m) => m.type === 'play') ?? legal[0]! })
    moves++
  }
  await sleep(300)
  if (a.room!.status !== 'playing') throw new Error(`statut ${a.room!.status} ≠ playing`)
  if (!a.snapshot) throw new Error('aucun instantané')
  // Photo EXACTE de la main de chaque joueur au moment du kill.
  const mains: Record<string, unknown> = {}
  for (const x of clients) mains[x.selfId] = x.game?.you?.hand ?? null
  writeFileSync(
    FILE,
    JSON.stringify({
      code,
      snapshot: a.snapshot,
      sessions: clients.map((x) => ({ memberId: x.selfId, resumeKey: x.resumeKey, name: x.name })),
      attendu: { status: 'playing' },
      mains,
      table: a.game?.line ?? null,
    }),
  )
  console.log(
    `ACTE save-mid OK ✔ salon ${code} figé EN PLEINE MANCHE après 6 coups — mains photographiées : ${clients
      .map((x) => `${x.name}=${(x.game?.you?.hand ?? []).length} dominos`)
      .join(', ')}`,
  )
  clients.forEach((x) => x.socket.close())
}

/** ACTE resume-play : serveur neuf → restauration → on FINIT la manche. */
async function resumePlay(): Promise<void> {
  const saved = JSON.parse(readFileSync(FILE, 'utf8')) as {
    code: string
    snapshot: string
    sessions: Array<{ memberId: string; resumeKey: string; name: string }>
    mains?: Record<string, unknown>
    table?: unknown
  }
  const clients: Client[] = []
  for (const s of saved.sessions) {
    const cl = await connect(s.name)
    cl.selfId = s.memberId
    const res = await emitAck(cl.socket, 'room:resume', {
      code: saved.code,
      memberId: s.memberId,
      resumeKey: s.resumeKey,
      snapshot: saved.snapshot,
    })
    if (clients.length === 0 && res.restored !== true) throw new Error('restauration non signalée')
    clients.push(cl)
  }
  await sleep(300)
  if (clients[0]!.room!.status !== 'playing') {
    throw new Error(`statut ${clients[0]!.room!.status} ≠ playing après restauration`)
  }
  // LES MAINS : chaque joueur doit retrouver EXACTEMENT ses dominos —
  // mêmes pièces, même ordre — et la table posée doit être identique.
  if (saved.mains) {
    for (const cl of clients) {
      const avant = JSON.stringify(saved.mains[cl.selfId] ?? null)
      const apres = JSON.stringify(cl.game?.you?.hand ?? null)
      if (avant !== apres) {
        throw new Error(`MAIN de ${cl.name} différente !\n  avant : ${avant}\n  après : ${apres}`)
      }
    }
    const tableAvant = JSON.stringify(saved.table ?? null)
    const tableApres = JSON.stringify(clients[0]!.game?.line ?? null)
    if (tableAvant !== tableApres) throw new Error('TABLE posée différente après restauration')
    console.log(
      `mains vérifiées domino par domino ✔ (${clients
        .map((cl) => `${cl.name}=${(cl.game?.you?.hand as unknown[] | undefined)?.length ?? 0}`)
        .join(', ')}) + table posée identique ✔`,
    )
  }
  // LE test : la manche restaurée se JOUE jusqu'au bout, coup par coup.
  await playOneRound(clients)
  await sleep(300)
  const result = clients[0]!.game?.result
  if (!result) throw new Error('pas de résultat de manche après reprise')
  console.log(
    `ACTE resume-play OK ✔ manche REPRISE en plein milieu et finie : ${
      result.winnerId === null ? 'manche nulle' : `gagnant ${result.winnerId} (+${result.gain})`
    } — le match continue comme si le serveur n'était jamais mort`,
  )
  clients.forEach((x) => x.socket.close())
}

const MODES: Record<string, () => Promise<void>> = {
  save,
  resume,
  'save-mid': saveMid,
  'resume-play': resumePlay,
}

;(MODES[MODE] ?? save)().then(
  () => process.exit(0),
  (err) => {
    console.error(`SMOKE PERSIST ${MODE} FAIL ✘`, err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
