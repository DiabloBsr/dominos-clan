# Domino's Clan — image tout-en-un pour Hugging Face Space (Docker)
FROM node:22-alpine

WORKDIR /app

# Manifestes d'abord pour profiter du cache de layers
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .

# Config publique Firebase (inlinée par Vite au build). Render passe les
# variables d'environnement du service en build args Docker, mais SEULEMENT
# si le Dockerfile les déclare en ARG — sans ces lignes, le bundle sort sans
# la config et le bouton Google reste masqué.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN npm run build -w @dominos-clan/web

ENV PORT=7860
ENV STATIC_DIR=/app/apps/web/dist
EXPOSE 7860

CMD ["npm", "run", "start", "-w", "@dominos-clan/server"]
