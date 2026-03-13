FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build:next

# Entrypoint tools (prisma CLI, tsx, bcryptjs + all transitive deps)
# Builds in parallel with the builder stage
FROM base AS tools
WORKDIR /tools
RUN npm init -y && npm install prisma@6.19.2 tsx bcryptjs

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# External packages needed at runtime (serverComponentsExternalPackages)
COPY --from=builder /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder /app/node_modules/mammoth ./node_modules/mammoth
COPY --from=builder /app/node_modules/xlsx ./node_modules/xlsx
COPY --from=builder /app/node_modules/papaparse ./node_modules/papaparse
COPY --from=builder /app/node_modules/docx ./node_modules/docx
# Entrypoint tools: prisma CLI, tsx, bcryptjs (merges into node_modules)
COPY --from=tools /tools/node_modules ./node_modules
# Scripts and entrypoint
COPY --from=builder /app/scripts ./scripts
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Document storage directory
RUN mkdir -p /data/documents && chown nextjs:nodejs /data/documents

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./entrypoint.sh"]
