FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY scripts ./scripts
COPY src ./src
COPY prisma ./prisma
COPY migrations ./migrations
RUN npm ci && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./dist
COPY --from=deps /app/package.json ./package.json
EXPOSE 4000
CMD ["sh", "-c", "cd dist && npx prisma db migrate --advance-ref db && node src/index.js"]
