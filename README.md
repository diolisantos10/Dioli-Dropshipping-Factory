# DDF — Dioli Dropshipping Factory

Control Room for product discovery, triage, digital production, pricing, distribution, and operational intelligence.

## Product source of truth

The functional contract lives in [`DDF-BLUEPRINT/`](./DDF-BLUEPRINT/README.md). The new application is intentionally built independently from the legacy MVP.

Additional implementation decisions:

- [`docs/PRODUCT-DECISIONS.md`](./docs/PRODUCT-DECISIONS.md)
- [`docs/INFORMATION-ARCHITECTURE.md`](./docs/INFORMATION-ARCHITECTURE.md)

## Current stage

The project is building the internal factory first. Supplier, channel, brand, and external-provider integrations are deferred until the operational experience is validated with controlled data.

Implemented foundation:

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4;
- responsive Control Room shell;
- product-aligned navigation and module routes;
- overview dashboard with controlled fixtures;
- accessibility linting and reduced-motion support;
- zero known production dependency vulnerabilities at the current lockfile state.

## Local development

Requirements:

- Node.js 20.9 or newer;
- npm 10 or newer.

```bash
npm install
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`. The explicit hostname avoids network-interface discovery issues in restricted environments.

## Verification

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## Delivery principle

No premium processing, pricing propagation, publication, or fulfillment action may occur implicitly. Approval, provenance, economic risk, next action, and audit context must remain visible throughout the interface.
