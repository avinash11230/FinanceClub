# Single-image deploy: builds the React client and runs the Express server,
# which serves both the API and the built site. Works on Railway, Render, Fly.io.
FROM node:22-slim

WORKDIR /app

# Install server deps (production only)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Install client deps (incl. dev — needed to build) and build the site
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

# Server source
COPY server ./server

ENV NODE_ENV=production
# SQLite database file — mount a persistent volume at /data on your host.
ENV DB_PATH=/data/arena.db
# Auto-seed admin + companies + Round 1 on first boot (set to 0 to disable)
ENV AUTO_SEED=1

# The host provides PORT; the app reads process.env.PORT (defaults to 4000).
EXPOSE 4000

CMD ["node", "--experimental-sqlite", "server/src/index.js"]
