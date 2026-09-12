This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

FinCoach

FinCoach is a Next.js financial dashboard with a MySQL-backed API for users, accounts, transactions, goals, and dashboard summaries.

## Local setup

Requirements: Node.js 20+, MySQL 8+.

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, a random `AUTH_SECRET` of at least 32 characters, and `GEMINI_API_KEY` for Gemini-powered FinX answers. Keep the Gemini key server-side and never commit it.
2. Install dependencies:

```bash
npm install
```

3. Create the schema and demo data:

```bash
npm run db:setup
npm run db:seed
npm run db:check
```

4. Start the app:

```bash
npm run dev
```

Open http://localhost:3000. The demo account is `demo@fincoach.app` with password `FincoachDemo123!`.

## API

- `GET /api/health` checks MySQL connectivity.
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` manage cookie sessions.
- `GET|POST /api/accounts` manages financial accounts.
- `GET|POST /api/transactions` manages validated transactions and rejects duplicate fingerprints.
- `GET|POST /api/goals` manages financial goals.
- `GET /api/dashboard` returns the authenticated financial snapshot, spending, and goals.
- `GET /api/market?trending=true` returns live quotes for the curated stock watchlist.
- `POST /api/chat` uses Gemini when `GEMINI_API_KEY` is configured and falls back to local guidance if Gemini is unavailable.

All API routes require the HttpOnly session cookie except `/api/health` and authentication endpoints. Amounts are stored as MySQL `DECIMAL`, and database credentials are read only from environment variables.

## Production

Set `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL` in the deployment provider, then run:

```bash
npm run build
npm start
```

Run `npm run db:setup` against the production database once before serving traffic. Do not commit `.env.local` or real credentials.
