# Saywa Direct

[![CI](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml/badge.svg)](https://github.com/vadickpb/saywalodges/actions/workflows/ci.yml)

A **direct-booking system** for independent lodgings in Peru, installed per client: a branded website, rates and
seasons, a quote/booking link, calendar sync with Airbnb and Booking.com, and built-in bookkeeping —
with no per-booking commission. Each lodging gets its own isolated installation, with a 3-month warranty and
monthly maintenance ([ADR 0010](docs/adr/0010-installation-per-client.md)).

It started as the website of **Saywa Lodges**, a real lodge in the Sacred Valley (Urubamba), which is now
its first installation. Live example: [saywalodges.vercel.app](https://saywalodges.vercel.app).

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
| Online payments (Mercado Pago), guest CRM | Planned |
| Per-client installation tooling, shared demo, WhatsApp Business API automation | Planned |

## Run it locally

Requirements: Node.js ≥ 24 and Docker (used by the Supabase CLI to run Postgres locally).

```bash
npm install
npm run local                  # Supabase in Docker + .env.local + dev server, in one command
```

`npm run local` starts the local Supabase stack, fills the four Supabase variables of `.env.local` (and refuses to touch the file if it
points to a hosted project: never point a development environment at production) and runs `npm run dev`. Add `-- --reset` to rebuild the
local database from the migrations and sample data (**erases local data**), or `-- --no-dev` to prepare everything without starting the server.
`npm run local:booking` creates a test booking with a payment voucher so you can try the owner screens
(`-- --sin-comprobante` leaves it waiting for the guest's payment).

Supabase CLI commands are pinned to the version CI uses: run them as `npx supabase@2.122.0 <command>`. A bare `npx supabase` resolves to
the latest release, which may not ship a binary for your machine (v3.0.0 had none for macOS arm64).

Then open:

- `http://saywa-lodges.localhost:3000/es` — the first tenant's public site (`/en` for English)
- `http://demo.localhost:3000/es` — a second organization, to see the isolation enforced by RLS (local only)
- `http://app.localhost:3000/login` — the owner dashboard

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:pricing` | Pricing/finance domain tests with a 90 % per-file coverage floor |
| `npm run local` · `npm run local:booking` | Whole local environment in one command · a test booking with a voucher |
| `npx supabase@2.122.0 test db` | pgTAP: RLS, RPCs and constraints (run `db reset` first: it assumes a fresh database) |
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
