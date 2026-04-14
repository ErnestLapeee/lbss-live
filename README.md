# LBSS - Latvijas Beisbola Softbola Savienība

Official platform for the Latvian Baseball and Softball Federation.

## Overview

LBSS is a unified platform combining:

- **Federation website** — Public-facing Next.js site with news, standings, schedules, and statistics
- **Statistics platform** — Event-sourced game data with computed leaderboards and standings
- **Admin management system** — Full CRUD for seasons, leagues, teams, players, games, articles, and users

Built as a TypeScript monorepo with shared types and validators across frontend and backend.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15 | Public website (SSR) |
| React | 19 | UI framework |
| Vite | 6 | Admin panel build tool |
| Fastify | 5 | API server |
| PostgreSQL | 16 | Primary database |
| Drizzle ORM | 0.39 | Schema & migrations |
| Tailwind CSS | 4 | Styling |
| Socket.io | — | Phase 2: real-time updates |
| Turborepo | — | Monorepo orchestration |
| pnpm | 10 | Package manager |

## Project Structure

```
lbss/
├── apps/
│   ├── web/          # Public website (Next.js 15)
│   └── admin/        # Admin panel (Vite + React)
├── packages/
│   ├── api/          # API server (Fastify)
│   └── shared/       # Shared types, validators, game engine
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd lbss

# Install dependencies
pnpm install

# Start database services
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Seed the database
pnpm db:seed

# Start all services in development mode
pnpm dev
```

### Services

| Service | URL | Description |
|---------|-----|-------------|
| Public Website | http://localhost:3000 | Next.js SSR public site |
| Admin Panel | http://localhost:3001 | React admin dashboard |
| API Server | http://localhost:3002 | Fastify REST API |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Session store & pub/sub |

### Default Admin Login

- **Email:** admin@lbss.lv  
- **Password:** admin123

## Database

- Schema defined with Drizzle ORM in `packages/api/src/db/schema/`
- Migrations generated to `packages/api/src/db/migrations/`
- Commands:
  - `pnpm db:generate` — Generate migrations from schema changes
  - `pnpm db:migrate` — Run migrations
  - `pnpm db:seed` — Seed development data
  - `pnpm db:studio` — Open Drizzle Studio

## API Routes

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

### Public API (`/api/public`)

| Resource | Endpoints | Description |
|----------|-----------|-------------|
| Seasons | GET `/seasons`, GET `/seasons/:id` | List and fetch seasons |
| Leagues | GET `/leagues`, GET `/leagues/:id` | List and fetch leagues |
| Teams | GET `/teams`, GET `/teams/:id` | List and fetch teams |
| Players | GET `/players`, GET `/players/:id` | List and fetch players |
| Games | GET `/games`, GET `/games/:id` | List and fetch games (filters: leagueId, status, from, to) |
| Standings | GET `/standings` | League standings |
| Leaderboards | GET `/leaderboards` | Batting and pitching stats |
| Articles | GET `/articles`, GET `/articles/:slug` | News and articles |

### Admin API (`/api/admin`)

| Resource | Endpoints | Description |
|----------|-----------|-------------|
| Auth | POST `/auth/login`, POST `/auth/logout`, GET `/auth/me` | Session-based auth |
| Seasons | GET, POST, PUT, DELETE `/seasons`, `/seasons/:id` | Season CRUD |
| Leagues | GET, POST, PUT, DELETE `/leagues`, `/leagues/:id` | League CRUD |
| Teams | GET, POST, PUT, DELETE `/teams`, `/teams/:id` | Team CRUD |
| Players | GET, POST, PUT, DELETE `/players`, `/players/:id` | Player CRUD |
| Games | GET, POST, PUT, DELETE `/games`, `/games/:id` | Game CRUD |
| Articles | GET, POST, PUT, DELETE `/articles`, `/articles/:id` | Article CRUD |
| Users | GET, POST, PUT, DELETE `/users`, `/users/:id` | User management |

Admin routes (except auth) require a valid session cookie.

## Architecture Decisions

- **Event-Sourced Stats** — Game events are the single source of truth for all statistics
- **Hybrid Aggregation** — Stats computed from events on game finalize, stored in summary tables for query performance
- **Monorepo** — Shared types ensure type safety across frontend and backend
- **Session-Based Auth** — Secure httpOnly cookies, no JWT token management needed

## Phases

| Phase | Status | Scope |
|-------|--------|-------|
| **Phase 1** | Current | Core database, public site, admin panel, basic CRUD |
| **Phase 2** | Planned | Live scoring engine, WebSocket real-time updates, license management |
| **Phase 3** | Future | Payment integration, advanced sabermetrics, mobile PWA |

## Deploying to Railway

If the **web app** is deployed on Railway, you must set **`NEXT_PUBLIC_API_URL`** on the *web* service to your API’s public URL (e.g. `https://your-api.railway.app`). Otherwise the site will show no teams, no seasons, and no statistics because API calls default to `localhost:3002` and fail. See **[docs/DEPLOYMENT_RAILWAY.md](docs/DEPLOYMENT_RAILWAY.md)** for step-by-step instructions.

## License

Private — Latvijas Beisbola Softbola Savienība

<!-- deploy-trigger: 2026-04-14 21:03:59 +03:00 -->

<!-- deploy-trigger: 2026-04-14 22:03:50 +03:00 -->
