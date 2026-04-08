# Gharpayy — Room Booking & Token Collection

## Overview

Gharpayy is a multi-zone room booking and token collection platform for property managers and PG operators. Tenants receive payment links with 15-minute countdown timers; agents manage bookings from a clean admin dashboard.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/ghar-booking run dev` — run frontend locally

## Artifacts

- `artifacts/api-server` — Express backend, served at `/api`
- `artifacts/ghar-booking` — React frontend, served at `/`

## Features

### Booking Flows
1. **Admin Push** — Create quotation, activate offer, 15-min timer starts
2. **Tenant Self-Request** (`/request`) — Tenant fills form, admin sets price and activates
3. **Walk-in / Instant** — Toggle "Instant Booking" to activate on creation
4. **Urgency Reminder** — Auto-generate follow-up WhatsApp message adapting to time remaining

### Multi-zone / Multi-agent
- Zones (geographic areas)
- Teammates with roles: Superadmin, Zone Admin, Agent
- Each role sees only their zone's data
- Agents log in with phone + PIN

### Admin Notifications
- Dashboard shows "Viewed" badge when tenant opens payment link
- Admin detail shows exact time tenant viewed the offer

### Payment
- Tenant clicks "I've Paid — Confirm Payment" → API marks booking as `paid` immediately
- WhatsApp fallback option to notify admin manually
- Admin sees status updated in real time (10s polling)

### Settings
- Zones management (superadmin only)
- Teammates management with **PIN reset** inline per teammate
- Activate/deactivate teammates

### Insights (`/insights`)
- Funnel metrics: created → activated → paid
- Per-flow breakdown (Admin Push, Self-Request, Walk-in)
- At-risk list (pending > 24h, expired > 48h)

### Booking Notes
- Internal notes per booking, editable by admin team only

### Tenant History
- Look up all past bookings by phone number via `/api/bookings/history/:phone`

## Auth

JWT-like tokens (HMAC-SHA256), 7-day TTL. PIN hashed with scrypt.

## Routes

- `/` — Admin dashboard (requires login)
- `/bookings/new` — Create new quotation
- `/bookings/:id/admin` — Admin booking detail
- `/bookings/:id` — Tenant payment link (public)
- `/request` — Tenant self-request form (public, supports `?zone=slug`)
- `/insights` — Conversion analytics
- `/settings` — Team & zone settings

## API Routes

- `GET/POST /api/bookings` — list / create
- `GET/PATCH/DELETE /api/bookings/:id` — single booking
- `POST /api/bookings/:id/approve` — start 15-min timer
- `POST /api/bookings/:id/reactivate` — restart timer
- `POST /api/bookings/:id/claim-payment` — tenant self-reports payment (no auth)
- `GET /api/bookings/:id/whatsapp` — generate WhatsApp message
- `GET /api/bookings/:id/reminder` — generate follow-up message
- `GET /api/bookings/stats` — dashboard stats
- `GET /api/bookings/insights` — funnel analytics
- `GET /api/bookings/history/:phone` — tenant booking history
- `POST /api/booking-requests` — tenant self-request (no auth)
- `GET/POST/PATCH/DELETE /api/zones` — zone management
- `GET/POST/PATCH/DELETE /api/teammates` — teammate management
- `POST /api/auth/login` — PIN login
- `POST /api/auth/setup` — first-run superadmin setup
- `GET /api/auth/setup-needed` — check if setup required
- `GET /api/auth/me` — current user info
