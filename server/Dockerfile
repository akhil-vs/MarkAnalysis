FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY src/prisma ./src/prisma
COPY prisma ./prisma
RUN npm ci && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/prisma ./src/prisma
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db migrate --advance-ref db && node src/index.js"]
