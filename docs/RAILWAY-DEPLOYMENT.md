# DDF — Railway deployment

- Project: `successful-vibrancy`
- Public product: `DDF — Dioli Dropshipping Factory`
- Railway service ID: `24680905-6574-44f0-bf77-7aaf84bb8fff`
- Source branch: `codex/ddf-foundation`
- Runtime: Railway production
- Start command: `npm run start`
- Healthcheck: `/`
- Database reference: `${{Postgres.DATABASE_URL}}`

The legacy DDF service remains untouched during validation. The DDF application
must pass build, healthcheck and route smoke tests before it replaces any
existing service.
