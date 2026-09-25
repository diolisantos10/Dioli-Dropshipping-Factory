# DDF — Railway deployment

- Project: `DDF - Dioli Dropshipping Factory`
- Public product: `DDF — Dioli Dropshipping Factory`
- Web service: `DDF Control Room` (`24680905-6574-44f0-bf77-7aaf84bb8fff`)
- Automation service: `DDF Automation` (cron)
- Source branch: `main`
- Start command (web): `npm run start`
- Healthcheck: `/health`
- Database reference: `${{Postgres.DATABASE_URL}}`

The legacy service `DDF - Dioli Dropshipping Factory` (branch `claude/dropshipping-product-factory-XMpOJ`)
remains untouched.

## Web service variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection (`${{Postgres.DATABASE_URL}}`). |
| `DDF_ADMIN_USER`, `DDF_ADMIN_PASSWORD`, `DDF_ADMIN_ROLE`, `DDF_ADMIN_ACCOUNTS` | Basic authentication and roles (ADMIN, APPROVER, OPERATOR, VIEWER). |
| `DDF_CREDENTIALS_KEY` | Key for the AES-256-GCM vault that stores integration credentials. |
| `DDF_PUBLIC_URL` | Public HTTPS origin used to build OAuth redirect URIs, e.g. `https://ddf-control-room-production.up.railway.app`. |
| `DDF_CRON_TOKEN` | Shared secret (≥ 32 chars) accepted only on `POST /api/jobs/run`, as `Authorization: Bearer`. |
| `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` | AliExpress Open Platform app used by “Conectar com AliExpress”. |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Optional: Shopify app used by “Conectar com Shopify”. They can also be set per integration. |

## Automation service (cron)

- Same repository and branch; start command `node scripts/cron.mjs`; no healthcheck; restart policy `NEVER`.
- Cron schedule: `*/15 * * * *` (UTC).
- Variables: `DDF_APP_URL` (public URL of the web service) and `DDF_CRON_TOKEN` (same value as the web service).
- Every run calls `POST /api/jobs/run` and exits. The web service executes, in isolation:
  1. `credentials` — refreshes AliExpress tokens (`/auth/token/refresh`) and Shopify client-credentials tokens that expire within 24 h;
  2. `outbox` — drains the transactional outbox;
  3. `supplierOffers` — refreshes cost, stock and lead time of AliExpress offers in the catalog (`aliexpress.ds.product.get`); prices are **not** re-propagated;
  4. `channelOrders` — imports paid Shopify orders for products published through the DDF (idempotent);
  5. `retention` — applies the order data retention policy.
- Runs are stored in `automation_runs` and audited as `AUTOMATION_RUN`. The panel in **Integrações → Automação** shows the history and lets an ADMIN run it on demand.

## Provider consoles

- AliExpress Open Platform → App → callback URL: `${DDF_PUBLIC_URL}/api/integrations/oauth/aliexpress/callback`.
  The app needs the Dropshipping API permissions (`aliexpress.ds.text.search`, `aliexpress.ds.product.get`).
- Shopify (Dev Dashboard app) → allowed redirection URL: `${DDF_PUBLIC_URL}/api/integrations/oauth/shopify/callback`;
  scopes `write_products,read_orders`.
