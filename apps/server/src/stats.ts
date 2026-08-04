/**
 * Statistiques ADMIN — zéro base de données : chaque événement est ajouté à
 * data/stats.jsonl (rejoué au démarrage pour reconstruire l'historique) et
 * agrégé en mémoire. Dashboard servi sur /admin (clé : ADMIN_KEY, défaut
 * « clan-admin » — à changer via variable d'environnement avant toute prod).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Room } from './rooms'

interface StatEvent {
  type: 'user' | 'room' | 'join' | 'game_start' | 'game_end'
  at: number
  [key: string]: unknown
}

const dataDir =
  process.env.STATS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const dataFile = join(dataDir, 'stats.jsonl')

const events: StatEvent[] = []

export function initStats(): void {
  try {
    if (!existsSync(dataFile)) return
    for (const line of readFileSync(dataFile, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line) as StatEvent)
      } catch {
        // ligne corrompue : ignorée
      }
    }
    console.log(`[stats] ${events.length} événements rechargés depuis ${dataFile}`)
  } catch {
    // stats indisponibles : le jeu fonctionne sans
  }
}

function log(event: Omit<StatEvent, 'at'>): void {
  const full = { at: Date.now(), ...event } as StatEvent
  events.push(full)
  try {
    mkdirSync(dataDir, { recursive: true })
    appendFileSync(dataFile, `${JSON.stringify(full)}\n`)
  } catch {
    // disque indisponible : on garde au moins la mémoire
  }
}

/* ─── Hooks ──────────────────────────────────────────────────────────── */

/** « Inscription » = première apparition d'un userId (ou pseudo changé). */
const seenUsers = new Map<string, string>()

export function statUserSeen(userId: string | null, pseudo: string, avatar: string): void {
  if (!userId) return
  if (seenUsers.get(userId) === pseudo) return
  seenUsers.set(userId, pseudo)
  const known = events.some((e) => e.type === 'user' && e.userId === userId && e.pseudo === pseudo)
  if (!known) log({ type: 'user', userId, pseudo, avatar })
}

export function statRoomCreated(room: Room, hostPseudo: string): void {
  log({ type: 'room', code: room.code, hostPseudo })
}

export function statMemberJoined(room: Room, pseudo: string, userId: string | null): void {
  log({ type: 'join', code: room.code, pseudo, userId })
}

/** Détection de transitions à chaque broadcast : début et fin de partie. */
const liveGames = new Map<
  string,
  { gameType: string; startedAt: number; players: Array<{ userId: string | null; pseudo: string }> }
>()

export function statTrackRoom(room: Room): void {
  const live = liveGames.get(room.code)
  if (!live && (room.status === 'playing' || room.status === 'redeal')) {
    const players = room.seats.map((id) => {
      const m = room.members.get(id)
      return { userId: m?.userId ?? null, pseudo: m?.pseudo ?? '?' }
    })
    liveGames.set(room.code, { gameType: room.rules.gameType, startedAt: Date.now(), players })
    log({ type: 'game_start', code: room.code, gameType: room.rules.gameType, players })
    return
  }
  if (live && room.status !== 'playing' && room.status !== 'redeal') {
    liveGames.delete(room.code)
    const winnerId =
      room.rules.gameType === 'ludo'
        ? room.ludoGame?.winnerId ?? null
        : room.rules.gameType === 'chess'
          ? room.chessGame?.result?.winnerId ?? null
          : room.matchWinnerId ?? room.lastWinnerId
    const winner = winnerId ? room.members.get(winnerId)?.pseudo ?? null : null
    log({
      type: 'game_end',
      code: room.code,
      gameType: live.gameType,
      players: live.players,
      winner,
      durationMs: Date.now() - live.startedAt,
      end: room.status,
    })
  }
}

/** Un salon détruit en pleine partie compte comme partie terminée (abandon). */
export function statRoomClosed(code: string): void {
  const live = liveGames.get(code)
  if (!live) return
  liveGames.delete(code)
  log({
    type: 'game_end',
    code,
    gameType: live.gameType,
    players: live.players,
    winner: null,
    durationMs: Date.now() - live.startedAt,
    end: 'abandon',
  })
}

/* ─── Agrégats pour le dashboard ─────────────────────────────────────── */

export function adminStats(liveRooms: Array<Record<string, unknown>>): Record<string, unknown> {
  const users = new Map<
    string,
    { pseudo: string; avatar: string; firstSeen: number; lastSeen: number; games: number; playMs: number }
  >()
  const games: Array<Record<string, unknown>> = []
  let totalPlayMs = 0

  for (const e of events) {
    if (e.type === 'user') {
      const id = String(e.userId)
      const known = users.get(id)
      if (!known) {
        users.set(id, {
          pseudo: String(e.pseudo),
          avatar: String(e.avatar ?? ''),
          firstSeen: e.at,
          lastSeen: e.at,
          games: 0,
          playMs: 0,
        })
      } else {
        known.pseudo = String(e.pseudo)
        known.lastSeen = e.at
      }
    }
    if (e.type === 'game_end') {
      const duration = Number(e.durationMs) || 0
      totalPlayMs += duration
      games.push({
        at: e.at,
        gameType: e.gameType,
        code: e.code,
        players: (e.players as Array<{ userId: string | null; pseudo: string }>).map((p) => p.pseudo),
        winner: e.winner,
        durationMs: duration,
        end: e.end,
      })
      for (const p of e.players as Array<{ userId: string | null; pseudo: string }>) {
        if (p.userId && users.has(p.userId)) {
          const u = users.get(p.userId)!
          u.games += 1
          u.playMs += duration
          u.lastSeen = Math.max(u.lastSeen, e.at)
        }
      }
    }
  }

  const byType: Record<string, number> = {}
  for (const g of games) byType[String(g.gameType)] = (byType[String(g.gameType)] ?? 0) + 1

  return {
    generatedAt: Date.now(),
    summary: {
      uniqueUsers: users.size,
      gamesPlayed: games.length,
      totalPlayMinutes: Math.round(totalPlayMs / 60_000),
      byType,
      roomsCreated: events.filter((e) => e.type === 'room').length,
    },
    users: [...users.entries()]
      .map(([userId, u]) => ({ userId, ...u }))
      .sort((a, b) => b.lastSeen - a.lastSeen),
    games: games.slice(-150).reverse(),
    liveRooms,
  }
}

/* ─── Page /admin (autonome, aucune dépendance) ──────────────────────── */

export function adminPage(): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Domino's Clan — Admin</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b1712; color: #f2ede2; padding: 1.2rem; }
  h1 { font-size: 1.3rem; margin: 0 0 1rem; } h1 b { color: #ffb648; }
  h2 { font-size: 1rem; margin: 1.6rem 0 0.5rem; color: #9db3a6; text-transform: uppercase; letter-spacing: 0.06em; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 0.7rem; }
  .card { background: #142a1f; border: 1px solid rgba(247,242,231,0.1); border-radius: 12px; padding: 0.8rem 1rem; }
  .card b { display: block; font-size: 1.6rem; color: #ffb648; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid rgba(247,242,231,0.08); white-space: nowrap; }
  th { color: #9db3a6; font-weight: 600; }
  .muted { color: #9db3a6; } .win { color: #7ee0a3; font-weight: 700; }
  .wrap { overflow-x: auto; }
  #err { color: #ff6b5e; font-weight: 700; }
</style></head><body>
<h1>🁫 Domino's <b>Clan</b> — Admin <span id="live" class="muted"></span></h1>
<div id="err"></div>
<div class="cards" id="cards"></div>
<h2>Salons en vie</h2><div class="wrap"><table id="rooms"></table></div>
<h2>Parties récentes</h2><div class="wrap"><table id="games"></table></div>
<h2>Joueurs</h2><div class="wrap"><table id="users"></table></div>
<script>
const key = localStorage.getItem('adminKey') || prompt('Clé admin :') || '';
localStorage.setItem('adminKey', key);
const fmtDur = (ms) => { const m = Math.floor(ms/60000), s = Math.round(ms%60000/1000); return m ? m+' min '+s+' s' : s+' s'; };
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
const TYPE = { dominos:'🁫 Dominos', chess:'♟️ Échecs', ludo:'🎲 Ludo' };
async function refresh() {
  try {
    const r = await fetch('/admin/stats.json?key=' + encodeURIComponent(key));
    if (r.status === 403) { document.getElementById('err').textContent = 'Clé refusée — recharge et ressaisis.'; localStorage.removeItem('adminKey'); return; }
    const d = await r.json();
    document.getElementById('err').textContent = '';
    document.getElementById('live').textContent = '· maj ' + fmtDate(d.generatedAt);
    const s = d.summary;
    document.getElementById('cards').innerHTML =
      '<div class="card">Joueurs uniques<b>' + s.uniqueUsers + '</b></div>' +
      '<div class="card">Parties jouées<b>' + s.gamesPlayed + '</b></div>' +
      '<div class="card">Minutes de jeu<b>' + s.totalPlayMinutes + '</b></div>' +
      '<div class="card">Salons créés<b>' + s.roomsCreated + '</b></div>' +
      Object.entries(s.byType).map(([t,n]) => '<div class="card">' + (TYPE[t]||t) + '<b>' + n + '</b></div>').join('');
    document.getElementById('rooms').innerHTML =
      '<tr><th>Salon</th><th>Jeu</th><th>Statut</th><th>Membres</th><th>À table</th></tr>' +
      (d.liveRooms.length ? d.liveRooms.map(r =>
        '<tr><td>' + r.code + '</td><td>' + (TYPE[r.gameType]||r.gameType) + '</td><td>' + r.status + '</td><td>' + r.members + '</td><td>' + r.seated.join(', ') + '</td></tr>'
      ).join('') : '<tr><td colspan="5" class="muted">aucun</td></tr>');
    document.getElementById('games').innerHTML =
      '<tr><th>Quand</th><th>Jeu</th><th>Joueurs</th><th>Vainqueur</th><th>Durée</th><th>Fin</th></tr>' +
      (d.games.length ? d.games.map(g =>
        '<tr><td>' + fmtDate(g.at) + '</td><td>' + (TYPE[g.gameType]||g.gameType) + '</td><td>' + g.players.join(', ') + '</td><td class="win">' + (g.winner || '—') + '</td><td>' + fmtDur(g.durationMs) + '</td><td class="muted">' + g.end + '</td></tr>'
      ).join('') : '<tr><td colspan="6" class="muted">aucune</td></tr>');
    document.getElementById('users').innerHTML =
      '<tr><th>Joueur</th><th>Code ami</th><th>1re visite</th><th>Dernière</th><th>Parties</th><th>Temps de jeu</th></tr>' +
      (d.users.length ? d.users.map(u =>
        '<tr><td>' + u.avatar + ' ' + u.pseudo + '</td><td class="muted">' + u.userId + '</td><td>' + fmtDate(u.firstSeen) + '</td><td>' + fmtDate(u.lastSeen) + '</td><td>' + u.games + '</td><td>' + fmtDur(u.playMs) + '</td></tr>'
      ).join('') : '<tr><td colspan="6" class="muted">personne</td></tr>');
  } catch (e) { document.getElementById('err').textContent = 'Erreur : ' + e.message; }
}
refresh();
setInterval(refresh, 10000);
</script></body></html>`
}
