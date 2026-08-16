# CrossTecch — Next.js app image.
#
# Not using `output: "standalone"` on purpose: this app loads better-sqlite3
# (a native addon) via a runtime require() in src/lib/server/db.ts, and
# standalone's dependency tracer is unreliable with native modules. Shipping
# full node_modules costs some image size but is the version of this that
# actually starts reliably.
FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 needs a C++ toolchain if no prebuilt binary matches the
# platform — install it so `npm ci` can compile from source as a fallback.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
