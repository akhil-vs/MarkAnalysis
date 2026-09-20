# Full-application E2E tests (user manuals)

Playwright browser workflows derived from:

- `docs/user-manuals/principal.md`
- `docs/user-manuals/coordinator.md`
- `docs/user-manuals/teacher.md`

## Suites

| Spec | Covers |
|---|---|
| `workflows/principal.spec.js` | Principal desk, school setup, marks ops (no entry), insights, HELP |
| `workflows/coordinator.spec.js` | Co-ordinator desk, mark entry + approve paths, setup, HELP |
| `workflows/teacher.spec.js` | Teacher desk, register/upload, class-teacher CML, limited insights, HELP |
| `workflows/marks-cycle.spec.js` | Cross-role late-entry/pending queue + public entry points + platform admin |

## Run

From repo root (Postgres seeded, `server/.env` with `DATABASE_URL`):

```bash
npm run test:e2e
```

Report: `reports/playwright-html/index.html`
