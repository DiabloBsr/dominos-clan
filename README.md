# Domino's Clan 🁫

Jeu de dominos **chill entre amis**, jouable sur **web et mobile**.
L'idée : pas juste un jeu de dominos, mais un endroit où on traîne avec les potes — on parle au **mic**, on balance des **réactions**, on enchaîne les parties.

## 🎮 Modes de jeu

Parties en **chacun pour soi** (pas d'équipes), de 2 à 4 **joueurs actifs** :

| Mode | Joueurs actifs |
|------|----------------|
| 1v1 | 2 joueurs |
| 1v1v1 | 3 joueurs |
| 1v1v1v1 | 4 joueurs |

Le salon peut accueillir **plus de monde que la partie** — jusqu'à **10 personnes**, toutes au mic : ceux qui ne jouent pas sont **spectateurs**.
Exemple : 6 potes dans le salon, 3 jouent un 1v1v1, les 3 autres regardent (et chambrent au mic).

### 🔁 Rotation : le gagnant reste

À la fin d'une manche, le **gagnant garde sa place**. Les perdants rejoignent la file des spectateurs, et les premiers de la file prennent les sièges libérés pour la manche suivante. Sans spectateurs en attente, les mêmes joueurs rejouent.

## 👥 Rôles dans un salon

| | 🎯 Joueur | 👀 Spectateur |
|---|-----------|---------------|
| Contrôle du jeu (poser, passer) | ✅ | ❌ |
| Parole au mic | ✅ | ✅ |
| Réactions / emotes | ✅ | ✅ |
| Voir sa propre main | ✅ | — |
| Voir les mains des autres | ❌ jamais | ✅ toutes, s'il le souhaite |

⚠️ Conséquence architecture (implémentée) : le serveur envoie un **état filtré par rôle**. Un joueur ne reçoit *jamais* les mains adverses dans les données réseau — pas juste masquées à l'écran, absentes du payload — sinon on pourrait tricher en ouvrant la console. Les spectateurs reçoivent l'état complet. Les dominos non distribués (« dormants ») ne sont révélés à personne.

## 📐 Règles V1 (arbitrables)

- **Variante** : domino **bloqué** (block) double-six, 28 dominos, **7 par joueur**, pas de pioche — le reste « dort ».
- **Ouverture imposée** : le détenteur du plus gros double ouvre avec ; sans double distribué, le domino le plus lourd ouvre.
- **Fin de manche** : main vidée (« domino ! ») ou table bloquée (tout le monde passe) → la main la plus légère gagne. Égalité : le premier dans l'ordre du tour après le dernier poseur.
- **Score** : partie sèche — une manche, un gagnant, rotation immédiate.
- **Passer** n'est légal que sans coup jouable (anti-sandbagging).
- **Comptes** : pseudo simple, pas d'auth en V1.
- **Réactions** : 8 emotes fixes (😂 🔥 👏 😮 😭 😈 🤝 💀), throttle anti-spam 400 ms.
- **Chat texte** : panneau 💬 avec badge de non-lus, 300 caractères max, throttle 500 ms.
- **Micro ciblé** : chaque participant choisit qui l'entend — 🌍 tous, 🎯 joueurs seulement, 👀 spectateurs seulement (V1 : filtrage à la lecture côté client).
- **Vue spectateur** : mains masquées par défaut, bouton « Voir les mains ».

## 🧱 Stack (en place)

- **Monorepo npm workspaces** : `packages/engine` + `apps/server` + `apps/web`
- **Moteur** ([packages/engine/](packages/engine/)) : TypeScript pur, déterministe (PRNG seedé), immutable, zéro dépendance — 33 tests vitest dont 450 parties fuzzées
- **Serveur** ([apps/server/](apps/server/)) : Node + socket.io, autoritatif (valide chaque coup, distribue les vues filtrées), salons par code 4 lettres
- **Web** ([apps/web/](apps/web/)) : React 19 + Vite, thème « veillée tropicale » (feutre nocturne, os d'ivoire, ambre)
- **Mobile** : Capacitor (à venir — même codebase web)
- **Voix** : WebRTC via **LiveKit** (SFU open source, Apache 2.0 → logiciel gratuit) — **intégrée** :
  bouton « 🎙 Rejoindre la voix » dans le salon, coupure micro, indicateur vert « qui parle » sur les pseudos.
  Le serveur ne délivre que des tokens (réservés aux membres du salon, room `dc-<code>`) ; l'audio passe par le SFU.
  - Dev/bêta : LiveKit Cloud palier gratuit (5 000 min WebRTC/mois, sans CB) — renseigner
    `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (cf. [apps/server/.env.example](apps/server/.env.example)) ;
    sans ces variables la voix est simplement désactivée.
  - Prod : LiveKit **self-hosted** sur le même VPS que le serveur de jeu → zéro abonnement
  - Pourquoi pas de mesh P2P à 10 ? 9 flux montants par téléphone (~350 kbps) et le P2P casse souvent en CGNAT mobile ; avec le SFU, 1 seul flux sortant par client.

## 🚀 Lancer en local

```bash
npm install

# terminal 1 — serveur temps réel (port 4001)
npm run dev:server

# terminal 2 — client web (port 5173)
npm run dev:web
```

Ouvre plusieurs onglets sur http://localhost:5173 pour simuler les potes.

```bash
npm test                                  # tests du moteur (33)
npm run typecheck                         # tsc sur les 3 workspaces
npm run smoke -w @dominos-clan/server     # e2e : 3 joueurs + 1 spectateur, manche complète
                                          # (serveur à démarrer avant)
```

## ☁️ Déploiement — Render (gratuit)

Le repo est prêt pour **Render free** : le [Dockerfile](Dockerfile) build le client Vite puis
le serveur socket.io sert le jeu ET le temps réel sur un seul port ; [render.yaml](render.yaml)
décrit le service (plan free, healthcheck `/healthz`).

Mise en place (une fois) : render.com → *Sign up with GitHub* → **New → Blueprint** →
choisir ce repo → Deploy. Chaque `git push` redéploie ensuite automatiquement.

Notes free tier Render (2026) : 512 Mo RAM / 0.1 CPU, 100 Go de bande passante/mois ;
le service s'endort après 15 min **sans requête HTTP ni message WebSocket** — donc il reste
éveillé tant qu'on joue ; réveil ~1 min au premier accès. L'état des salons est en mémoire
(un redéploiement vide les salons — sans gravité).

Pourquoi pas Hugging Face ? Depuis 2026, les Docker/Gradio Spaces exigent un abonnement
PRO (9 $/mois) — seuls les Spaces statiques restent gratuits, insuffisant pour le socket.io.

## 🗺️ Roadmap

- **P1 — Moteur de jeu** ✅ règles, serveur autoritaire, tests, anti-fuite vérifié
- **P2 — Multijoueur** ✅ salons par code, sièges/file, rotation gagnant-reste, réactions live
- **P3 — Chill layer** ✅ mic LiveKit (icônes on/off, ciblage tous/joueurs/spectateurs) + chat texte 💬 + réactions live
- **P4 — Mobile** : packaging Capacitor Android
- **P5 — Polish** : sons, animations de pose, reconnexion en cours de manche (aujourd'hui un départ de joueur annule la manche)

## ❓ Reste à trancher

1. Rien de bloquant — les règles V1 ci-dessus sont des défauts raisonnables, dis-moi ce que tu veux changer.
