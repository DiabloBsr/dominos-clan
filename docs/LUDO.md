# 🎲 Ludo — spécification V1

Troisième jeu de la plateforme (avec Dominos et Échecs). **Toujours au mic** — c'est la base.

## Règles de base

- **2 à 4 joueurs**, 4 pions chacun, plateau classique : piste commune de 52 cases,
  couloir d'arrivée de 5 cases + case finale (arrivée **exacte** obligatoire).
- **Sortie de base sur un 6** ; un 6 fait **rejouer**.
- **6 successifs configurables** : par défaut 3 maximum (le 3ᵉ 6 annule le tour),
  réglable **2, 3 ou 4** dans les règles du salon — comme demandé.
- **Captures** : atterrir sur un pion adverse le renvoie en prison (sa base),
  sauf **cases sûres** (les 4 cases de départ + les 4 étoiles).
- Aucun coup possible → le tour passe.
- **Victoire** : premier joueur avec ses 4 pions arrivés. Le gagnant reste,
  la file monte (rotation habituelle de la plateforme).

## Deux types de partie

1. **Simple** : les règles ci-dessus, rien d'autre.
2. **Avec bonus** 🎁 : 8 cases bonus fixes sur la piste. S'y arrêter fait tirer
   une carte bonus au hasard :

| Bonus | Effet |
|-------|-------|
| 🎲 **Deuxième lancer** | Tu relances immédiatement le dé |
| 🍀 **Boost 1-6** | Le pion avance en plus d'un tirage aléatoire entre 1 et 6 |
| 🚔 **Prison** | Tu choisis **n'importe quel pion adverse** à l'écran → retour en prison |
| 🛡 **Bouclier** | Ta prochaine capture subie est annulée (une fois) |
| ↔️ **Échange** | Ton pion échange sa place avec un pion adverse de ton choix |
| 🌟 **Téléport étoile** | Ton pion file à la prochaine case étoile |

(Liste extensible — d'autres idées bienvenues.)

## Architecture (comme les autres jeux)

- Moteur pur et testé dans `packages/engine/src/ludo.ts` (dé lancé côté serveur,
  information complète : tout le monde voit tout).
- Serveur : événements `ludo:roll`, `ludo:play` (choix du pion), `ludo:target`
  (cible d'un bonus prison/échange) ; `gameType: 'ludo'` dans les règles.
- Client : plateau en grille 15×15 classique, pions colorés, dé animé,
  sélection du pion à jouer, choix de cible pour les bonus.
