# DDF — Railway deployment

- Project: `successful-vibrancy`
- Service: `DDF Control Room`
- Source branch: `codex/ddf-foundation`
- Runtime: Railway production
- Start command: `npm run start`
- Healthcheck: `/`
- Database reference: `${{Postgres.DATABASE_URL}}`

The legacy DDF service remains untouched during validation. The Control Room
must pass build, healthcheck and route smoke tests before it replaces any
existing service.
