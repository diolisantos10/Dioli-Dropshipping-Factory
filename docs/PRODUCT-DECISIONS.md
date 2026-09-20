# DDF — Product Decisions

This document records product-level decisions that guide implementation.

## PD-001 — Initial approval owner

- Status: accepted
- Decision: the project owner is the initial approver for all operational approval gates.
- Consequence: the first authorization model may support one primary approver, but roles and permissions must remain extensible for future delegation.

## PD-002 — Factory-first delivery

- Status: accepted
- Decision: build the internal factory, interface, and operational experience before selecting specific suppliers, sales channels, or external providers.
- Initial scope:
  - information architecture and navigation;
  - interface and design system;
  - raw candidate shelf and manual intake;
  - triage and explicit approval gates;
  - product factory and universal master product;
  - media workflow;
  - available-products catalog;
  - pricing and margin-protection experience;
  - audit trail, operational states, errors, and reprocessing;
  - controlled fixtures and simulated adapters for end-to-end validation.
- Deferred scope:
  - selection of the first supplier;
  - selection of the first sales channel;
  - provider-specific credentials and production integrations;
  - brand/channel assignments.

## PD-003 — Connector boundary

- Status: accepted
- Decision: suppliers, channels, AI services, and media providers are replaceable adapters. They must not define the core domain or the primary UX.
- Consequence: the factory will be testable end to end with controlled data before any production connector is selected.
