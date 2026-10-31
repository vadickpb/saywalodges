# Saywa Direct

[![CI](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml/badge.svg)](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml)

Multi-tenant SaaS for **direct bookings** at independent lodgings in Peru: a branded website, rates and
seasons, a quote/booking link, calendar sync with Airbnb and Booking.com, and built-in bookkeeping —
with no per-booking commission.

It started as the website of **Saywa Lodges**, a real lodge in the Sacred Valley (Urubamba), which is now
the platform's first tenant. Live example: [saywalodges.vercel.app](https://saywalodges.vercel.app).

> Documentation is in Spanish (the product's market); this page is the English overview.
> Spanish README: [`README.es.md`](README.es.md) · Architecture: [`docs/architecture.md`](docs/architecture.md)
> · Roadmap: [`docs/roadmap.md`](docs/roadmap.md) · Decisions: [`docs/adr/`](docs/adr/)

## Highlights

- **Tenant isolation enforced by the database.** Every business table carries an `org_id` and has Postgres
  Row Level Security; policies are covered by pgTAP tests that prove one organization cannot read or write
  another's data ([ADR 0002](docs/adr/0002-rls-and-dal.md)).
- **Double bookings are impossible by construction.** An exclusion constraint on `calendar_blocks` rejects
  overlapping stays at the database level, verified with concurrency tests
  ([ADR 0003](docs/adr/0003-double-booking-exclusion-constraint.md)).
- **The server owns the money.** Prices are computed by a pure, unit-tested pricing engine
  (`lib/domain/pricing.ts`); amounts are integers in cents plus a currency, and the client never sends a price
  ([ADR 0005](docs/adr/0005-pricing-schema.md), [0006](docs/adr/0006-pricing-engine.md)).
- **One data-access layer.** All reads and writes go through `lib/dal` (server-only), which checks session
  and membership; the service-role key is limited to cron jobs, webhooks and RPCs.
- **Atomic multi-table operations** run as Postgres RPCs (`security definer`, fixed `search_path`), e.g.
  creating a guest, a booking and its calendar hold in one transaction.
- **Multi-tenant routing by host** in a single Next.js app, with `proxy.ts` limited to rewriting
  ([ADR 0001](docs/adr/0001-multi-tenant-by-host.md)).
- **iCal sync** with Airbnb/Booking: per-channel export feeds and a hardened import engine with scheduled
  sync and conflict alerts.
- **Bookkeeping module**: income/expense ledger, monthly and yearly reports, recurring expenses, and an
  Excel export for the accountant ([ADR 0007](docs/adr/0007-finance-ledger.md)).
- **Security and operations**: structured logging without PII, timing-safe cron authentication, hardened
  uploads and iCal import, and regular dependency security updates.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui · Supabase
(Postgres + RLS, Auth, Storage) · Zod · Vitest · pgTAP · GitHub Actions · Vercel.

## Quality gates

Every change goes through a pull request with:

- `lint`, `typecheck`, unit tests with coverage and a production `build`;
- `supabase db reset` + the full pgTAP suite against a fresh database;
- an automated code review and, for anything touching auth, data access, migrations or public endpoints, a
  separate security review;
- Conventional Commits and squash merges, one ticket per PR.

Database migrations reach production through a dedicated workflow that waits for a human approval
([`docs/workflow.md`](docs/workflow.md)).

## How this project is built

Development is agent-assisted ([Claude Code](https://claude.com/claude-code) and Codex) under explicit,
versioned rules: tickets with acceptance criteria in the roadmap, architecture decision records, review
subagents, and permissions that keep production data out of any agent's reach. The process lives in the
repository so it is reviewable like the code: see [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) and
[`docs/workflow.md`](docs/workflow.md).

## Status

In active development, ticket by ticket. *Merged* means the code is in `main`; the acceptance criteria of each
ticket are tracked in [`docs/roadmap.md`](docs/roadmap.md).

| Area | State |
|---|---|
| Multi-tenant foundation: organizations, RLS, auth, host routing, dashboard | Merged |
| Content, bookable units, seasons, rates and pricing engine | Merged |
| Customizable public site template and appearance editor | Merged |
| Calendar with overlap protection, iCal import/export, public availability | Merged |
| Bookkeeping: ledger, reports, recurring expenses, Excel export | Merged |
| Booking schema and hold expiration job | Merged |
| Quote builder, booking-link checkout, manual payment | Next |
| Online payments (Mercado Pago), guest CRM, custom domains | Planned |

## Run it locally

Requirements: Node.js ≥ 24 and Docker (used by the Supabase CLI to run Postgres locally).

```bash
npm install
cp .env.example .env.local     # fill in the local Supabase credentials
npx supabase start             # Postgres + Auth + Storage + Studio in Docker
npx supabase db reset          # apply migrations and seed data
npm run dev
```

`supabase start` prints the local `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`; use them in `.env.local`.
Never point a development environment at production.

Then open:

- `http://saywa-lodges.localhost:3000/es` — the first tenant's public site (`/en` for English)
- `http://demo.localhost:3000/es` — a second tenant, to see the isolation
- `http://app.localhost:3000/login` — the owner dashboard

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:pricing` | Pricing/finance domain tests with a 90 % per-file coverage floor |
| `npx supabase test db` | pgTAP: RLS, RPCs and constraints |
| `npm run where` | Current branch, PR, CI state and what to do next |

## Repository map

```
app/sites/[host]/[lang]   public site of each tenant
app/app/                  owner dashboard (login required)
lib/dal/                  the only way to read/write data (session + membership checks)
lib/domain/               pure business logic: pricing, dates, availability, finance
supabase/migrations/      versioned schema with RLS      supabase/tests/   pgTAP
docs/                     architecture, ADRs, roadmap, workflow
```
