# LiveTrack — Real-Time Package Tracker

Monitor live package telemetry, routes, and delivery progress.

## Local development

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a PostgreSQL connection string.
2. Install dependencies: `pnpm install`
3. Push the database schema: `pnpm --filter @workspace/db run push`
4. Start the API server: `pnpm run dev:api` (port 5000)
5. In another terminal, start the web app: `pnpm run dev:web` (port 5173)

The Vite dev server proxies `/api` requests to the API server automatically.

## Deploy to Netlify

1. Connect this repository to Netlify.
2. Netlify reads `netlify.toml` automatically — no extra build settings are required.
3. Set the **required** environment variable in Netlify:
   - `DATABASE_URL` — PostgreSQL connection string ([Neon](https://neon.tech), [Supabase](https://supabase.com), or [Netlify DB](https://docs.netlify.com/build/data-and-storage/netlify-db/) all work)
4. Deploy. Netlify builds the React frontend and runs the Express API as a serverless function at `/api/*`.

On first request, the API seeds demo packages if the database is empty.

## Stack

- pnpm workspaces, Node.js 22+, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS 4, TanStack Query, Leaflet
- API: Express 5 (Netlify Functions in production, standalone Node server locally)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, Orval codegen from OpenAPI

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev:web` | Run the tracker frontend |
| `pnpm run dev:api` | Run the API server locally |
| `pnpm run build:netlify` | Production build for Netlify |
| `pnpm run typecheck` | Typecheck all packages |
| `pnpm --filter @workspace/db run push` | Push DB schema (dev) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API client from OpenAPI |

## Architecture notes

- **Production (Netlify):** The API runs as a serverless function. Package positions are computed from route data on each request (no background worker). The frontend polls every 2 seconds instead of using SSE.
- **Local dev:** The API runs as a persistent Node process with background simulation and SSE live updates.

## Demo tracking IDs

- `LT-2024-881923` — Los Angeles → Chicago
- `LT-2024-443712` — New York → Richmond
- `LT-2024-991047` — Seattle → Sacramento
