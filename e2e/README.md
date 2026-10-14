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
| `workflows/portal.spec.js` | Parent / student portal guest (access code form, invalid code, public entry links) |
| `workflows/marks-cycle.spec.js` | Cross-role late-entry/pending queue + public entry points + platform admin |

## Run

From repo root (Postgres seeded, `server/.env` with `DATABASE_URL`):

```bash
npm run test:e2e
```

Report: `reports/playwright-html/index.html`

### Full automated matrix (all user types + consolidated report)

```bash
# Postgres seeded (or PREPARE_DB=1 SEED=1 to wipe+seed first)
npm run test:full-report
```

Writes `reports/full-automated-test-report.{html,md,json}` covering server/client unit tests, API integration, role-manual automation, and Playwright E2E.
