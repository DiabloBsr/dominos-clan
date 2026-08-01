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
RUN npm run build -w @dominos-clan/web

ENV PORT=7860
ENV STATIC_DIR=/app/apps/web/dist
EXPOSE 7860

CMD ["npm", "run", "start", "-w", "@dominos-clan/server"]
