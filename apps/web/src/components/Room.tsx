import { useEffect, useRef, useState } from 'react'
import type { ChessView, GameRules, GameView, LudoState, Move, RoomView } from '@dominos-clan/engine'
import { LudoBoard, LudoLobbyBoard } from './LudoBoard'
import { ConfirmBox, type ConfirmRequest } from './ConfirmBox'
import { preloadBoardSamples } from '../sounds'
import {
  IconCheck,
  IconChat,
  IconClock,
  IconCopy,
  IconLogOut,
  IconMegaphone,
  IconMenu,
  IconMic,
  IconMicOff,
  IconPower,
  IconRefresh,
  IconSliders,
  IconUsers,
  IconVolume,
} from './Icons'
import type { ChatMessage, FloatingReaction } from '../App'
import type { VoiceAudience, VoiceControls } from '../useVoice'
import {
  STATUS_LABELS,
  friendAvatar,
  friendLabel,
  type Friend,
  type FriendStatus,
} from '../profile'
import { ChessBoard, ChessLobbyBoard } from './ChessBoard'
import { Game } from './Game'

const REACTIONS = ['😂', '🔥', '👏', '😮', '😭', '😈', '🤝', '💀']

/** Cris de passe (dominos) — l'index est tiré par le serveur, tout le salon
 *  voit donc le même cri au même instant. */
const PASS_CRIES = ['Manaraky ao e!.😂', 'Mbo tsy mahefa lahy e!🤣', 'PAIKY😂']

/** Cadences d'échecs standard (minutes + incrément en secondes par coup). */
const CHESS_PRESETS = [
  { label: '⚡ Bullet 1+0', min: 1, inc: 0 },
  { label: '⚡ Bullet 2+1', min: 2, inc: 1 },
  { label: '🔥 Blitz 3+2', min: 3, inc: 2 },
  { label: '🔥 Blitz 5+0', min: 5, inc: 0 },
  { label: '🕐 Rapide 10+0', min: 10, inc: 0 },
  { label: '🕐 Rapide 15+10', min: 15, inc: 10 },
]

/** Soundboard : sons de chambrage joués chez TOUT le salon. */
const SOUNDS: Array<{ kind: string; emoji: string; label: string }> = [
  { kind: 'pet', emoji: '💨', label: 'Prout' },
  { kind: 'rire', emoji: '😂', label: 'Rire' },
  { kind: 'fou-rire', emoji: '🤣', label: 'Fou rire' },
  { kind: 'colere', emoji: '😡', label: 'Grrr' },
  { kind: 'bravo', emoji: '👏', label: 'Bravo' },
  { kind: 'tromblon', emoji: '📯', label: 'Womp womp' },
  { kind: 'bisou', emoji: '😘', label: 'Bisou' },
]

function pseudoOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.pseudo ?? '???'
}

function avatarOf(room: RoomView, id: string): string {
  return room.members.find((m) => m.id === id)?.avatar ?? ''
}

/**
 * Contrôles de règles du salon — utilisés en direct dans la barre du lobby
 * (onChange = envoi serveur) et en brouillon dans la modale « refaire les
 * réglages » (onChange = état local, appliqué d'un bloc).
 */
function RulesEditor({
  rules,
  editable,
  onChange,
}: {
  rules: GameRules
  editable: boolean
  onChange: (r: GameRules) => void
}) {
  return (
    <>
      <span className="game-badge" title="Jeu du salon (choisi à la création)">
        {rules.gameType === 'chess' ? '♟️ Échecs' : rules.gameType === 'ludo' ? '🎲 Ludo' : '🁫 Dominos'}
      </span>
      {rules.gameType === 'chess' && (
        <>
          {/* Cadences standard (bullet / blitz / rapide) en un clic. */}
          <select
            className="voice-audience"
            disabled={!editable}
            title="Cadence de la partie"
            value={
              CHESS_PRESETS.some(
                (p) => p.min === rules.chessMinutes && p.inc === rules.chessIncrement,
              )
                ? `${rules.chessMinutes}+${rules.chessIncrement}`
                : 'perso'
            }
            onChange={(e) => {
              const preset = CHESS_PRESETS.find((p) => `${p.min}+${p.inc}` === e.target.value)
              if (preset) onChange({ ...rules, chessMinutes: preset.min, chessIncrement: preset.inc })
            }}
          >
            {CHESS_PRESETS.map((p) => (
              <option key={p.label} value={`${p.min}+${p.inc}`}>
                {p.label}
              </option>
            ))}
            <option value="perso">Perso…</option>
          </select>
          <label className="rules-num" title="Minutes à la pendule pour chaque joueur">
            pendule
            <input
              key={`cm-${rules.chessMinutes}`}
              type="number"
              min={1}
              max={60}
              disabled={!editable}
              defaultValue={rules.chessMinutes}
              onBlur={(e) =>
                onChange({
                  ...rules,
                  chessMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 10)),
                })
              }
            />
            min
          </label>
          <label className="rules-num" title="Secondes ajoutées à la pendule après chaque coup">
            +
            <input
              key={`ci-${rules.chessIncrement}`}
              type="number"
              min={0}
              max={30}
              disabled={!editable}
              defaultValue={rules.chessIncrement}
              onBlur={(e) =>
                onChange({
                  ...rules,
                  chessIncrement: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                })
              }
            />
            s/coup
          </label>
        </>
      )}
      {rules.gameType !== 'chess' && (
        <>
          <select
            className="voice-audience"
            disabled={!editable}
            value={String(rules.maxSeats)}
            title="Nombre de joueurs à table"
            onChange={(e) => onChange({ ...rules, maxSeats: Number(e.target.value) })}
          >
            <option value="2">Table à 2</option>
            <option value="3">Table à 3</option>
            <option value="4">Table à 4</option>
          </select>
          <select
            className="voice-audience"
            disabled={!editable}
            value={String(rules.swapCount)}
            title="Combien de joueurs de la file entrent à chaque victoire — les plus petits scores sortent (à égalité, celui à gauche du gagnant)"
            onChange={(e) => onChange({ ...rules, swapCount: Number(e.target.value) })}
          >
            <option value="1">File : 1 remplacé</option>
            <option value="2">File : 2 remplacés</option>
            <option value="3">File : 3 remplacés</option>
          </select>
        </>
      )}
      {rules.gameType === 'ludo' && (
        <>
          <select
            className="voice-audience"
            disabled={!editable}
            value={String(rules.ludoSixes)}
            title="Nombre de 6 successifs autorisés avant que le tour saute"
            onChange={(e) => onChange({ ...rules, ludoSixes: Number(e.target.value) })}
          >
            <option value="2">2 six max</option>
            <option value="3">3 six max</option>
            <option value="4">4 six max</option>
          </select>
          <label className="rules-check" title="Partie avec cases bonus 🎁 (sinon simple)">
            <input
              type="checkbox"
              disabled={!editable}
              checked={rules.ludoBonus}
              onChange={(e) => onChange({ ...rules, ludoBonus: e.target.checked })}
            />
            Bonus 🎁
          </label>
        </>
      )}
      {rules.gameType === 'dominos' && (
        <>
          <select
            className="voice-audience"
            disabled={!editable}
            value={rules.targetScore === null ? 'seche' : 'match'}
            onChange={(e) =>
              onChange({
                ...rules,
                targetScore: e.target.value === 'match' ? 80 : null,
                instantWinScore: e.target.value === 'match' ? 40 : null,
              })
            }
          >
            <option value="seche">Manche sèche</option>
            <option value="match">Match aux points</option>
          </select>
          {rules.targetScore !== null && (
            <>
              <label className="rules-num">
                cible
                <input
                  key={`t-${rules.targetScore}`}
                  type="number"
                  min={10}
                  max={1000}
                  disabled={!editable}
                  defaultValue={rules.targetScore}
                  onBlur={(e) =>
                    onChange({
                      ...rules,
                      targetScore: Math.max(10, Math.min(1000, Number(e.target.value) || 80)),
                    })
                  }
                />
                pts
              </label>
              <label
                className="rules-num"
                title="Si PERSONNE n'a encore marqué et que le premier gain de la rencontre atteint ce nombre, le match est gagné immédiatement (0 = désactivé)"
              >
                éclair ≥
                <input
                  key={`e-${rules.instantWinScore ?? 'off'}`}
                  type="number"
                  min={0}
                  max={1000}
                  disabled={!editable}
                  defaultValue={rules.instantWinScore ?? 0}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0
                    onChange({
                      ...rules,
                      instantWinScore: v <= 0 ? null : Math.min(1000, v),
                    })
                  }}
                />
              </label>
              <label
                className="rules-num"
                title="La première marque ne compte que si elle atteint ce seuil ; ensuite tout compte"
              >
                1re marque ≥
                <input
                  key={`s-${rules.openThreshold}`}
                  type="number"
                  min={0}
                  max={200}
                  disabled={!editable}
                  defaultValue={rules.openThreshold}
                  onBlur={(e) =>
                    onChange({
                      ...rules,
                      openThreshold: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                    })
                  }
                />
              </label>
            </>
          )}
          <select
            className="voice-audience"
            disabled={!editable}
            value={rules.openingMaxPips === null ? 'classic' : 'rotate'}
            title="Classique : le plus gros double ouvre chaque manche. Tournante : 1re manche au plus petit double (1-1 → 6-6), puis l'ouverture tourne autour de la table avec un plafond de points."
            onChange={(e) =>
              onChange({ ...rules, openingMaxPips: e.target.value === 'rotate' ? 6 : null })
            }
          >
            <option value="classic">Ouverture classique</option>
            <option value="rotate">Ouverture tournante</option>
          </select>
          {rules.openingMaxPips !== null && (
            <label
              className="rules-num"
              title="Dès la 2e manche, l'ouvreur doit poser un domino dont le total de points est ≤ ce nombre (à défaut, son plus léger)"
            >
              ouvrir ≤
              <input
                key={`o-${rules.openingMaxPips}`}
                type="number"
                min={0}
                max={12}
                disabled={!editable}
                defaultValue={rules.openingMaxPips}
                onBlur={(e) =>
                  onChange({
                    ...rules,
                    openingMaxPips: Math.max(0, Math.min(12, Number(e.target.value) || 6)),
                  })
                }
              />
              pts
            </label>
          )}
          <label className="rules-check" title="Autoriser de passer même avec un domino jouable">
            <input
              type="checkbox"
              disabled={!editable}
              checked={rules.freePass}
              onChange={(e) => onChange({ ...rules, freePass: e.target.checked })}
            />
            Passe libre
          </label>
        </>
      )}
    </>
  )
}

export function Room({
  room,
  game,
  chess,
  ludo,
  selfId,
  reactions,
  chat,
  voice,
  friends,
  friendStatuses,
  slamFx,
  passFx,
  ludoRollFx,
  onInvite,
  onSit,
  onPromote,
  onRestart,
  onStand,
  onStart,
  onMove,
  onReact,
  onSound,
  onChat,
  onReconfigure,
  onTransferHost,
  onKick,
  onSwap,
  onDemote,
  onSetTaunt,
  onUndo,
  onRedeal,
  onChessMove,
  onResign,
  onDraw,
  onLudoRoll,
  onLudoPlay,
  onLudoTarget,
  onLeave,
}: {
  room: RoomView
  game: GameView | null
  chess: ChessView | null
  ludo: LudoState | null
  selfId: string
  reactions: FloatingReaction[]
  chat: ChatMessage[]
  voice: VoiceControls
  friends: Friend[]
  friendStatuses: Record<string, FriendStatus>
  slamFx: { key: number; pseudo: string; taunt: string } | null
  passFx: { key: number; pseudo: string; cry: number } | null
  ludoRollFx: { player: number; value: number; key: number } | null
  onInvite: (toUserId: string) => void
  onSit: () => void
  onPromote: (memberId: string) => void
  onRestart: (promoteId?: string) => void
  onStand: () => void
  onStart: () => void
  onMove: (move: Move, slam?: boolean) => void
  onReact: (emoji: string) => void
  onSound: (kind: string) => void
  onChat: (text: string) => void
  onReconfigure: (rules: GameRules) => void
  onTransferHost: (toId: string) => void
  onKick: (memberId: string) => void
  onSwap: (seatId: string, withId: string) => void
  onDemote: (memberId: string) => void
  onSetTaunt: (taunt: string) => void
  onUndo: () => void
  onRedeal: () => void
  onChessMove: (from: string, to: string, promotion?: string) => void
  onResign: () => void
  onDraw: (action: 'offer' | 'accept' | 'decline') => void
  onLudoRoll: () => void
  onLudoPlay: (pawn: number) => void
  onLudoTarget: (player: number, pawn: number) => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  /** Menu ☰ du salon : micro, réglages, invitations, cri, remise à zéro. */
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatSeen, setChatSeen] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftRules, setDraftRules] = useState<GameRules>(room.rules)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const [memberMenu, setMemberMenu] = useState<string | null>(null)
  // Confirmation maison (popup centrée de l'app, plus de window.confirm natif).
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  /** Édition de MON cri de capture (accessible même en pleine partie). */
  const [tauntBox, setTauntBox] = useState<string | null>(null)

  /**
   * MICRO PERMANENT : on se connecte à la voix dès l'arrivée dans le salon,
   * et on n'en sort plus — le geste du quotidien c'est MUTE/unmute, pas
   * allumer/éteindre le service. (Auto = silencieux si le serveur n'a pas de
   * voix ; le vrai départ reste possible dans le menu ☰.)
   */
  useEffect(() => {
    voice.join({ auto: true })
  }, [voice.join])
  const ask = (message: string, yesLabel: string, onYes: () => void) =>
    setConfirmReq({ message, yesLabel, onYes })
  // Bannière de résultat réduite : on mémorise l'objet résultat écarté —
  // une nouvelle manche produit un nouvel objet, la bannière revient seule.
  const [dismissedResult, setDismissedResult] = useState<unknown>(null)
  /** Classement du salon : replié par défaut pour ne pas manger l'écran. */
  const [standingsOpen, setStandingsOpen] = useState(false)
  const [swapMode, setSwapMode] = useState(false)
  const msgsRef = useRef<HTMLDivElement | null>(null)

  const openSettings = () => {
    setDraftRules({ ...room.rules })
    setSettingsOpen(true)
  }

  const openMemberMenu = (id: string) => {
    setSwapMode(false)
    setMemberMenu(id)
  }

  useEffect(() => {
    if (chatOpen) {
      setChatSeen(chat.length)
      msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight })
    }
  }, [chatOpen, chat.length])

  const unread = Math.max(0, chat.length - chatSeen)

  const self = room.members.find((m) => m.id === selfId)
  const isHost = self?.isHost ?? false
  const seated = room.seats.includes(selfId)
  const playing = room.status === 'playing'
  const result = game?.status === 'finished' ? game.result : null

  const copyCode = () => {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="room">
      <header className="room-header">
        <span className="mini-mark">
          Domino’s <b>Clan</b>
        </span>
        <button className="code-chip" onClick={copyCode} title="Copier le code">
          salon <b>{room.code}</b> {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
        <div className="invite-wrap">
          {/* TOUT le pilotage du salon vit dans CE menu — micro, réglages,
              invitations, cri, remise à zéro : le header reste minuscule et
              la place va au jeu. L'icône du bouton reflète l'état du micro. */}
          <button
            className={`icon-btn ${menuOpen || (voice.state.status === 'on' && !voice.state.muted) ? 'live' : ''}`}
            title="Menu du salon (micro, réglages, amis…)"
            onClick={() => {
              setMenuOpen((v) => !v)
              setInviteOpen(false)
              setTauntBox(null)
            }}
          >
            {voice.state.status === 'on' ? (
              voice.state.muted ? (
                <IconMicOff />
              ) : (
                <IconMic />
              )
            ) : (
              <IconMenu />
            )}
          </button>
          {menuOpen && (
            <div className="invite-panel menu-panel">
              <div className="chat-head">Salon</div>
              {voice.state.status === 'on' && (
                <>
                  <button className="menu-item" onClick={() => voice.toggleMute()}>
                    {voice.state.muted ? <IconMic /> : <IconMicOff />}
                    {voice.state.muted ? 'Réactiver le micro' : 'Couper le micro'}
                  </button>
                  <label className="menu-item">
                    <IconVolume />
                    Qui m’entend
                    <select
                      className="voice-audience"
                      value={voice.state.audience}
                      onChange={(e) => voice.setAudience(e.target.value as VoiceAudience)}
                    >
                      <option value="all">Tous</option>
                      <option value="players">Joueurs</option>
                      <option value="spectators">Spectateurs</option>
                    </select>
                  </label>
                </>
              )}
              {voice.state.status === 'off' && (
                <button className="menu-item" onClick={() => voice.join()}>
                  <IconMic />
                  Activer le micro
                </button>
              )}
              {voice.state.status === 'connecting' && (
                <button className="menu-item" disabled>
                  <IconClock />
                  Connexion de la voix…
                </button>
              )}
              {voice.state.status === 'unavailable' && (
                <button className="menu-item" disabled>
                  <IconMicOff />
                  Voix indisponible sur ce serveur
                </button>
              )}
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  setInviteOpen(true)
                }}
              >
                <IconUsers />
                Inviter des amis
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  setTauntBox(room.members.find((m) => m.id === selfId)?.taunt ?? '')
                }}
              >
                <IconMegaphone />
                Mon cri de claque
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  openSettings()
                }}
              >
                <IconSliders />
                {isHost ? 'Réglages du salon' : 'Voir les réglages'}
              </button>
              {isHost && (
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setMenuOpen(false)
                    ask(
                      'Tout remettre à zéro ? La manche en cours et tous les scores du match seront perdus.',
                      '🔄 Tout remettre à zéro',
                      () => onRestart(),
                    )
                  }}
                >
                  <IconRefresh />
                  Tout remettre à zéro
                </button>
              )}
              {voice.state.status === 'on' && (
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setMenuOpen(false)
                    voice.leave()
                  }}
                >
                  <IconPower />
                  Se déconnecter de la voix
                </button>
              )}
            </div>
          )}
          {inviteOpen && (
            <div className="invite-panel">
              <div className="chat-head">👥 Inviter des amis</div>
              {friends.length === 0 && (
                <p className="empty">Ajoute des amis depuis l’accueil (codes amis).</p>
              )}
              {friends.map((f) => {
                const status = friendStatuses[f.id] ?? 'offline'
                return (
                  <div key={f.id} className="friend-row">
                    <span className="friend-name">
                      {friendAvatar(f)} {friendLabel(f)}
                    </span>
                    {/* st-… : la classe nue « room » = le conteneur du salon
                        (collision CSS qui écrasait le nom de l'ami à 0 px). */}
                    <span className={`friend-status st-${status}`}>{STATUS_LABELS[status]}</span>
                    <button
                      className="btn ghost sm"
                      disabled={status === 'offline'}
                      onClick={() => onInvite(f.id)}
                    >
                      Inviter
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="invite-wrap">
          {/* Mon cri de claque — s'ouvre depuis le menu ☰, éditable à tout
              moment même en plein match (envoyé au serveur : member:taunt). */}
          {tauntBox !== null && (
            <div className="invite-panel">
              <div className="chat-head">🗣 Mon cri de claque</div>
              <input
                className="input"
                value={tauntBox}
                maxLength={24}
                placeholder="ex. RENAO ! / ANY ZANY EEE"
                autoFocus
                onChange={(e) => setTauntBox(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSetTaunt(tauntBox)
                    setTauntBox(null)
                  }
                  if (e.key === 'Escape') setTauntBox(null)
                }}
              />
              <button
                className="btn sm"
                onClick={() => {
                  onSetTaunt(tauntBox)
                  setTauntBox(null)
                }}
              >
                Enregistrer
              </button>
            </div>
          )}
        </div>
        {/* Micro, réglages et remise à zéro vivent dans le menu ☰ : le
            header ne garde que l'essentiel — code, menu, sortie. */}
        <button
          className="btn ghost sm leave-btn"
          onClick={() =>
            ask(
              'Quitter le salon ? Tu perds ta place à table et le match en cours pour toi.',
              '🚪 Quitter',
              () => onLeave(),
            )
          }
        >
          <IconLogOut size={16} />
          <span className="leave-label"> Quitter</span>
        </button>
      </header>

      <div className="members-strip">
        <div className="member-group">
          <span className="group-label">🎯 À table</span>
          {room.seats.map((id, i) => (
            <span
              key={id}
              className={`chip ${id === selfId ? 'you' : ''} ${
                room.members.find((m) => m.id === id)?.connected === false ? 'off' : ''
              } ${voice.state.speaking.includes(id) ? 'speaking' : ''}`}
            >
              <span className="chip-n">{i + 1}</span>
              <span className="chip-avatar">{avatarOf(room, id)}</span>
              <span className="chip-name">{pseudoOf(room, id)}</span>
              {voice.state.inVoice.includes(id) && <span className="chip-ic">🎙</span>}
              {room.members.find((m) => m.id === id)?.isHost && <span className="chip-ic">⭐</span>}
              {room.lastWinnerId === id && <span className="chip-ic">👑</span>}
              {isHost && id !== selfId && (
                <button
                  className="chip-add"
                  title="Gérer ce joueur (chef, échange, retrait)"
                  onClick={() => openMemberMenu(id)}
                >
                  ⋯
                </button>
              )}
              {id === selfId && (
                <button
                  className="chip-add"
                  title="Ton cri de capture (Ludo) — modifiable même en pleine partie"
                  onClick={() =>
                    setTauntBox(room.members.find((m) => m.id === selfId)?.taunt ?? '')
                  }
                >
                  ✏️
                </button>
              )}
            </span>
          ))}
          {room.seats.length === 0 && <span className="empty">personne…</span>}
        </div>
        <div className="member-group">
          <span className="group-label">👀 File</span>
          {room.queue.map((id, i) => (
            <span
              key={id}
              className={`chip queue ${id === selfId ? 'you' : ''} ${
                voice.state.speaking.includes(id) ? 'speaking' : ''
              }`}
            >
              <span className="chip-n">{i + 1}</span>
              <span className="chip-avatar">{avatarOf(room, id)}</span>
              <span className="chip-name">{pseudoOf(room, id)}</span>
              {voice.state.inVoice.includes(id) && <span className="chip-ic">🎙</span>}
              {id === selfId && (
                <button
                  className="chip-add"
                  title="Ton cri de capture (Ludo) — modifiable même en pleine partie"
                  onClick={() =>
                    setTauntBox(room.members.find((m) => m.id === selfId)?.taunt ?? '')
                  }
                >
                  ✏️
                </button>
              )}
              {isHost && room.status !== 'playing' && room.seats.length < room.rules.maxSeats && (
                <button
                  className="chip-add"
                  title="Ajouter ce joueur à la table (manche suivante)"
                  onClick={() => onPromote(id)}
                >
                  ＋
                </button>
              )}
              {isHost && room.status === 'playing' && room.seats.length < room.rules.maxSeats && (
                <button
                  className="chip-add"
                  title="L’ajouter à la table et tout recommencer à zéro (manche et scores perdus)"
                  onClick={() =>
                    ask(
                      `Ajouter ${pseudoOf(room, id)} à la table et tout recommencer ? La manche en cours et tous les scores seront perdus.`,
                      '＋🔄 Ajouter et recommencer',
                      () => onRestart(id),
                    )
                  }
                >
                  ＋🔄
                </button>
              )}
              {isHost && id !== selfId && (
                <button
                  className="chip-add"
                  title="Gérer ce joueur (chef, retrait)"
                  onClick={() => openMemberMenu(id)}
                >
                  ⋯
                </button>
              )}
            </span>
          ))}
          {room.queue.length === 0 && <span className="empty">vide</span>}
        </div>
      </div>

      {settingsOpen && (
        <>
          <div className="panel-veil" onClick={() => setSettingsOpen(false)} />
          <div className="game-modal card settings-modal">
            <div className="panel-head">
              <h2 className="card-title">⚙️ Réglages du salon</h2>
              <button className="icon-btn tiny" onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </div>
            {isHost ? (
              <p className="hint warn">
                Appliquer efface la partie en cours et tous les scores — tout le monde repart de
                zéro.
              </p>
            ) : (
              <p className="hint">Réglé par le chef ⭐ — lecture seule.</p>
            )}
            <div className="rules-bar in-modal">
              <RulesEditor rules={draftRules} editable={isHost} onChange={setDraftRules} />
            </div>
            <div className="lobby-actions">
              <button className="btn ghost" onClick={() => setSettingsOpen(false)}>
                {isHost ? 'Annuler' : 'Fermer'}
              </button>
              {isHost && (
                <button
                  className="btn"
                  onClick={() => {
                    setSettingsOpen(false)
                    onReconfigure(draftRules)
                  }}
                >
                  Appliquer — on repart de zéro
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {memberMenu &&
        (() => {
          const target = room.members.find((m) => m.id === memberMenu)
          if (!target) return null
          const targetSeated = room.seats.includes(target.id)
          const close = () => setMemberMenu(null)
          return (
            <>
              <div className="panel-veil" onClick={close} />
              <div className="game-modal card member-menu">
                <div className="panel-head">
                  <h2 className="card-title">
                    {target.avatar} {target.pseudo}
                  </h2>
                  <button className="icon-btn tiny" onClick={close}>
                    ✕
                  </button>
                </div>
                {swapMode ? (
                  <>
                    <p className="hint">🔁 Échanger {target.pseudo} avec :</p>
                    {room.queue.length === 0 && <p className="empty">Personne en file…</p>}
                    {room.queue.map((qid) => (
                      <button
                        key={qid}
                        className="btn ghost"
                        onClick={() => {
                          onSwap(target.id, qid)
                          close()
                        }}
                      >
                        {avatarOf(room, qid)} {pseudoOf(room, qid)}
                      </button>
                    ))}
                    <button className="btn ghost sm" onClick={() => setSwapMode(false)}>
                      ← Retour
                    </button>
                  </>
                ) : (
                  <>
                    {targetSeated && room.queue.length > 0 && !playing && (
                      <button className="btn ghost" onClick={() => setSwapMode(true)}>
                        🔁 Échanger avec un joueur de la file
                      </button>
                    )}
                    {targetSeated && !playing && room.seats.length > 2 && (
                      <button
                        className="btn ghost"
                        onClick={() => {
                          onDemote(target.id)
                          close()
                        }}
                      >
                        👀 Le mettre en spectateur
                      </button>
                    )}
                    {!targetSeated &&
                      !playing &&
                      room.seats.length < room.rules.maxSeats && (
                        <button
                          className="btn ghost"
                          onClick={() => {
                            onPromote(target.id)
                            close()
                          }}
                        >
                          🎯 L’asseoir à table
                        </button>
                      )}
                    {targetSeated && playing && (
                      <p className="hint">Échange et spectateur se font entre deux manches.</p>
                    )}
                    <button
                      className="btn ghost"
                      onClick={() =>
                        ask(
                          `Passer le rôle de chef à ${target.pseudo} ? Tu ne pourras plus régler le salon.`,
                          '⭐ Le nommer chef',
                          () => {
                            onTransferHost(target.id)
                            close()
                          },
                        )
                      }
                    >
                      ⭐ Le nommer chef
                    </button>
                    <button
                      className="btn ghost danger"
                      onClick={() =>
                        ask(
                          targetSeated && playing
                            ? `Enlever ${target.pseudo} du salon ? La manche en cours sera annulée.`
                            : `Enlever ${target.pseudo} du salon ? Il devra re-rejoindre avec le code.`,
                          '🚪 Enlever',
                          () => {
                            onKick(target.id)
                            close()
                          },
                        )
                      }
                    >
                      🚪 Enlever du salon
                    </button>
                  </>
                )}
              </div>
            </>
          )
        })()}

      {room.rules.targetScore !== null && room.rules.gameType === 'dominos' && (
        <div className="scoreboard">
          <span className="group-label">
            🏁 Match en {room.rules.targetScore} pts
            {room.rules.openThreshold > 0 ? ` · 1re marque ≥ ${room.rules.openThreshold}` : ''}
          </span>
          {room.seats.map((id) => (
            <span key={id} className={`score-chip ${room.matchWinnerId === id ? 'winner' : ''}`}>
              {pseudoOf(room, id)} <b>{room.scores[id] ?? 0}</b>
            </span>
          ))}
        </div>
      )}

      {/* PALMARÈS du salon : la mémoire longue, tous jeux confondus. Il ne
          s'affiche qu'une fois qu'une partie a été jouée. */}
      {(() => {
        const rows = Object.entries(room.standings ?? {})
          .filter(([, s]) => s.played > 0)
          .sort((a, b) => b[1].wins - a[1].wins || b[1].rounds - a[1].rounds || b[1].points - a[1].points)
        if (rows.length === 0) return null
        const medals = ['🥇', '🥈', '🥉']
        return (
          <div className="standings">
            <button
              className="group-label standings-head"
              onClick={() => setStandingsOpen((v) => !v)}
              title="Classement du salon depuis son ouverture"
            >
              🏆 Classement du salon {standingsOpen ? '▲' : '▼'}
            </button>
            {standingsOpen && (
              <div className="standings-table">
                <div className="standings-row head">
                  <span>Joueur</span>
                  <span title="Parties gagnées">🏆</span>
                  <span title="Manches gagnées">🎯</span>
                  <span title="Points marqués">Pts</span>
                  <span title="Parties jouées">Jouées</span>
                </div>
                {rows.map(([id, s], i) => (
                  <div key={id} className={`standings-row ${id === selfId ? 'me' : ''}`}>
                    <span className="st-name">
                      {medals[i] ?? `${i + 1}.`} {pseudoOf(room, id)}
                    </span>
                    <span>
                      <b>{s.wins}</b>
                    </span>
                    <span>{s.rounds}</span>
                    <span>{s.points}</span>
                    <span>{s.played}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {result && result !== dismissedResult && (
        <div className="banner">
          <button
            className="icon-btn tiny banner-close"
            title="Réduire — le résultat reste accessible en bas de l'écran"
            onClick={() => setDismissedResult(result)}
          >
            ✕
          </button>
          {result.winnerId === null ? (
            <h2>🤝 Manche nulle — égalité au blocage, personne ne marque</h2>
          ) : room.matchWinnerId === result.winnerId ? (
            <h2>🏆 {pseudoOf(room, result.winnerId)} remporte le match !</h2>
          ) : (
            <h2>
              👑 {pseudoOf(room, result.winnerId)}{' '}
              {result.reason === 'domino'
                ? 'a fait domino !'
                : result.reason === 'doubles'
                  ? 'avait 6 doubles en main — victoire immédiate !'
                  : 'gagne — table bloquée'}
              {room.rules.targetScore !== null ? ` (+${result.gain} pts)` : ''}
            </h2>
          )}
          <div className="pips-table">
            {Object.entries(result.pips)
              .sort(([, a], [, b]) => a - b)
              .map(([id, pips]) => (
                <span key={id} className="pips-row">
                  {pseudoOf(room, id)} : <b>{pips} pts</b> restants
                </span>
              ))}
          </div>
          {result.winnerId !== null &&
            room.rules.targetScore !== null &&
            room.rules.openThreshold > 0 &&
            (room.scores[result.winnerId] ?? 0) === 0 && (
              <p className="rotation-note">
                Marque insuffisante pour ouvrir le compteur (il faut ≥ {room.rules.openThreshold}).
              </p>
            )}
          <p className="rotation-note">
            {result.winnerId === null
              ? 'On rejoue à l’identique, même table.'
              : room.matchWinnerId
                ? 'La table tourne pour le prochain match : le champion reste, la file monte.'
                : room.rules.targetScore !== null
                  ? 'Le match continue — même table jusqu’à la victoire (la file entrera au prochain match).'
                  : 'La table a tourné : le gagnant reste, la file monte.'}
          </p>
          {isHost && (
            <button className="btn" onClick={onStart} disabled={room.seats.length < 2}>
              {room.matchWinnerId
                ? 'Nouveau match'
                : result.winnerId === null
                  ? 'Rejouer'
                  : 'Manche suivante'}
            </button>
          )}
        </div>
      )}

      {result && result === dismissedResult && (
        <button className="banner-peek" onClick={() => setDismissedResult(null)}>
          👑 Résultat de la manche
        </button>
      )}

      {slamFx && (
        <div className="slam-fx" key={slamFx.key}>
          {/* Cri personnalisé du claqueur (« RENAO », « ANY ZANY EEE »…) —
              vide = le JOYAAAA historique. */}
          💥 {slamFx.taunt || 'JOYAAAA'}&nbsp;!
        </div>
      )}
      {passFx && (
        <div className="slam-fx pass-fx" key={passFx.key}>
          {PASS_CRIES[passFx.cry % PASS_CRIES.length]}
        </div>
      )}

      {room.rules.gameType === 'ludo' && ludo && room.status !== 'lobby' ? (
        <LudoBoard
          state={ludo}
          room={room}
          selfId={selfId}
          isHost={isHost}
          roll={ludoRollFx}
          onRoll={onLudoRoll}
          onPlay={onLudoPlay}
          onTarget={onLudoTarget}
          onStart={onStart}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
        />
      ) : room.rules.gameType === 'chess' && chess && room.status !== 'lobby' ? (
        <ChessBoard
          view={chess}
          room={room}
          selfId={selfId}
          isHost={isHost}
          onMove={onChessMove}
          onResign={onResign}
          onDraw={onDraw}
          onStart={onStart}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
        />
      ) : game && room.status !== 'lobby' ? (
        <Game
          game={game}
          room={room}
          selfId={selfId}
          onMove={onMove}
          onUndo={onUndo}
          onRedeal={onRedeal}
          voiceIds={voice.state.inVoice}
          speaking={voice.state.speaking}
          shaking={slamFx !== null}
        />
      ) : (
        <section className="lobby">
          {/* La table du LOBBY est celle du jeu : plateau Ludo, échiquier,
              ou feutre à dominos. */}
          {room.rules.gameType === 'ludo' ? (
            <div className="lobby-preview">
              <LudoLobbyBoard />
            </div>
          ) : room.rules.gameType === 'chess' ? (
            <div className="lobby-preview">
              <ChessLobbyBoard />
            </div>
          ) : (
            <div className="table-felt idle">
              <p className="felt-hint">
                🁫 La table est ouverte — {room.seats.length}/{room.rules.maxSeats} assis,{' '}
                {room.members.length}/24 dans le salon.
              </p>
            </div>
          )}
          {room.rules.gameType !== 'dominos' && (
            <p className="felt-hint lobby-count">
              {room.rules.gameType === 'chess' ? '♟️' : '🎲'} La table est ouverte —{' '}
              {room.seats.length}/{room.rules.maxSeats} assis, {room.members.length}/24 dans le
              salon.
            </p>
          )}
          <div className="lobby-actions">
            {!playing &&
              (seated ? (
                <button className="btn ghost" onClick={onStand}>
                  Se lever (spectateur)
                </button>
              ) : (
                <button className="btn ghost" onClick={onSit} disabled={room.seats.length >= 4}>
                  S’asseoir à table
                </button>
              ))}
            {isHost && (
              <button className="btn" onClick={onStart} disabled={room.seats.length < 2}>
                {room.rules.gameType === 'dominos' ? 'Lancer la manche' : 'Lancer la partie'} (
                {room.seats.length} joueur{room.seats.length > 1 ? 's' : ''})
              </button>
            )}
            {!isHost && <p className="hint">L’hôte ⭐ lance la manche.</p>}
          </div>
        </section>
      )}

      <footer className="reactions-bar">
        {soundsOpen
          ? SOUNDS.map((s) => (
              <button
                key={s.kind}
                className="react-btn sound"
                title={s.label}
                onClick={() => onSound(s.kind)}
              >
                {s.emoji}
              </button>
            ))
          : REACTIONS.map((emoji) => (
              <button key={emoji} className="react-btn" onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
        <button
          className={`react-btn toggle ${soundsOpen ? 'on' : ''}`}
          title={soundsOpen ? 'Revenir aux emojis' : 'Sons de chambrage (tout le salon entend)'}
          onClick={() => {
            // Ouvrir le soundboard précharge les vrais bruitages : le premier
            // appui joue l'échantillon, pas le synthé de secours.
            if (!soundsOpen) preloadBoardSamples()
            setSoundsOpen((v) => !v)
          }}
        >
          {soundsOpen ? '🙂' : '🔊'}
        </button>
      </footer>

      <div className="float-reactions" aria-live="polite">
        {reactions.map((r) => (
          <span key={r.key} className="float-r">
            <b>{r.pseudo}</b> {r.emoji}
          </span>
        ))}
      </div>

      <button
        className={`chat-fab ${chatOpen ? 'open' : ''}`}
        onClick={() => setChatOpen((v) => !v)}
        title="Chat du salon"
      >
        <IconChat />
        {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-head">💬 Chat du salon</div>
          <div className="chat-msgs" ref={msgsRef}>
            {chat.length === 0 && <p className="empty">Encore aucun message…</p>}
            {chat.map((m) => (
              <p key={m.key} className={`chat-msg ${m.memberId === selfId ? 'mine' : ''}`}>
                <b>{m.pseudo}</b> {m.text}
              </p>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              const text = chatText.trim()
              if (text) {
                onChat(text)
                setChatText('')
              }
            }}
          >
            <input
              className="input"
              value={chatText}
              maxLength={300}
              placeholder="Ton message…"
              onChange={(e) => setChatText(e.target.value)}
            />
            <button className="btn sm" type="submit" disabled={!chatText.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}

      {tauntBox !== null && (
        <>
          <div className="panel-veil" onClick={() => setTauntBox(null)} />
          <div className="game-modal card">
            <div className="panel-head">
              <h2 className="card-title">😤 Ton cri de capture</h2>
              <button className="icon-btn tiny" onClick={() => setTauntBox(null)}>
                ✕
              </button>
            </div>
            <p className="hint">
              Affiché en plein écran quand TU renvoies un pion en prison (Ludo). Vide = cris du
              clan. Modifiable même en pleine partie.
            </p>
            <input
              className="input"
              value={tauntBox}
              maxLength={24}
              placeholder="ex. RENAO ! / ANY ZANY EEE"
              onChange={(e) => setTauntBox(e.target.value)}
            />
            <div className="lobby-actions">
              <button className="btn ghost" onClick={() => setTauntBox(null)}>
                Annuler
              </button>
              <button
                className="btn"
                onClick={() => {
                  onSetTaunt(tauntBox)
                  setTauntBox(null)
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmBox req={confirmReq} onClose={() => setConfirmReq(null)} />
    </div>
  )
}
