# Contributing

## Setup

See the root [README.md](./README.md) for local Docker + Node setup.

## Checks before opening a PR

```bash
cd server && npm test
cd ../client && npm test && npm run build
# with Postgres available:
cd ../server && SEED=1 npm run db:prepare && npm run test:api
# from repo root:
npm run lint
npm run test:e2e   # optional but recommended for UI flows
```

## Conventions

- Prefer formal Prisma migrations over expanding `ensureSchema.js`.
- Use `hashPassword` / `validatePasswordPolicy` from `server/src/lib/password.js` for credentials.
- Keep tenant scoping (`runWithTenant` / Prisma tenant extension) on school data.
- User-facing role docs live under `docs/user-manuals/`; regenerate PDFs with `npm run docs:pdf`.

## Security

Do not commit secrets. Follow [SECURITY.md](./SECURITY.md) for vulnerability reports.
