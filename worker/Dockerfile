FROM node:20-alpine
WORKDIR /app
COPY prisma/ ./prisma/
COPY worker/package.json worker/package-lock.json ./
RUN npm ci && npx prisma generate
COPY src/lib/ ./src/lib/
COPY worker/src/ ./worker-src/
COPY worker/tsconfig.json ./
RUN npx tsc -p tsconfig.json
CMD ["node", "dist/index.js"]
