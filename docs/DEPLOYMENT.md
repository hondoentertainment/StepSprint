# Schafer Shufflers Deployment Guide

## Production Checklist

- [ ] Use **PostgreSQL** (not SQLite) for production
- [ ] Set strong `JWT_SECRET` (32+ chars)
- [ ] Configure `APP_ORIGIN` to your frontend URL
- [ ] Enable HTTPS
- [ ] Run database migrations
- [ ] Set `NODE_ENV=production`

---

## Database: PostgreSQL

SQLite is fine for development. For production, use PostgreSQL.

### 1. Create a PostgreSQL database

```bash
createdb stepsprint
```

### 2. Set DATABASE_URL

```env
DATABASE_URL="postgresql://user:password@host:5432/stepsprint?schema=public"
```

### 3. Use the PostgreSQL Prisma schema

Copy `server/prisma/schema.postgresql.prisma` over `server/prisma/schema.prisma` (or rename), then:

```bash
cd server
npx prisma migrate deploy
npx prisma db seed
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | For PostgreSQL | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Min 16 chars; use a long random string |
| `APP_ORIGIN` | No | `http://localhost:5173` | Frontend origin for CORS |
| `PORT` | No | `3001` | API server port |
| `NODE_ENV` | No | — | Set to `production` in prod |

**Client (build-time):**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | When API is on different origin | — | Full API base URL (e.g. `https://api.example.com`) |

---

## Build & Run

### API server

```bash
cd server
npm install
npm run build
npm run db:migrate   # or: npx prisma migrate deploy
npm run db:seed      # optional
npm start
```

### Frontend

```bash
cd client
npm install
npm run build
```

Serve the `client/dist` folder with a static file server (nginx, Cloudflare Pages, Vercel, etc.). Point the client to your API URL via `VITE_API_URL`.

---

## Client deploy

The client is deployed via Vercel, configured in `vercel.json` at the repo
root. Production deploys run automatically on push to `main`, using the
Vercel GitHub integration — there's no separate GitHub Actions workflow
required for Vercel.

A GitHub Pages workflow (`.github/workflows/deploy-pages.yml`) also exists
as a fallback / preview target; see the "GitHub Pages" section below.

Client-specific build-time env vars (set in the Vercel project):

- `VITE_API_URL` — API base URL (required when the API is on a different origin)
- `VITE_SENTRY_DSN` — optional; enables Sentry error reporting in the browser
- `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` — optional; enables PostHog analytics

---

## Server deploy (Render)

`render.yaml` at the repo root defines a blueprint with:
- `stepsprint-api` — Docker web service built from `server/Dockerfile`
- `stepsprint-db` — managed Postgres (free tier)

**Steps:**

1. Push the branch to GitHub.
2. In Render: **New** → **Blueprint** → select the repo. Render reads `render.yaml`.
3. Set the non-synced env vars in the Render dashboard:
   - `SENTRY_DSN` (optional)
   - `APP_ORIGIN` — your client origin (e.g. `https://stepsprint.vercel.app`)
   - SMTP vars if password reset email is needed
4. `JWT_SECRET` is auto-generated; `DATABASE_URL` is wired from `stepsprint-db`.
5. On each deploy, the container runs `prisma migrate deploy && node dist/index.js` — migrations apply before serving.

The `server/Dockerfile` is a multi-stage build targeting Postgres in prod. For local dev, keep using `npm run dev` (SQLite).

---

## GitHub Pages (Frontend)

The frontend deploys to GitHub Pages on push to `main`/`master` via `.github/workflows/deploy-pages.yml`.

### Setup

1. **Push to GitHub**  
   Ensure the repo is on GitHub with the workflow committed.

2. **Enable GitHub Pages**  
   Repo → **Settings** → **Pages** → Source: **GitHub Actions**.

3. **Optional: API URL**  
   If your API runs elsewhere, add a repository variable:  
   **Settings** → **Secrets and variables** → **Actions** → **Variables** → `VITE_API_URL` = `https://your-api.example.com`

4. **Deploy**  
   Push to `main`/`master` or run the workflow manually. The site will be at `https://<username>.github.io/<repo>/`.

---

## Vercel (Frontend)

### Setup

1. **Connect repo**  
   Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → Import your GitHub repo.

2. **Configure**  
   `vercel.json` is preconfigured with `rootDirectory: client`, Vite build, and SPA rewrites.

3. **Environment variables**  
   In Vercel → Project → **Settings** → **Environment Variables**, add:
   - `VITE_API_URL` = `https://your-api.example.com` (Production/Preview)

4. **Deploy**  
   Deployments run automatically on push. Production branch is typically `main`.

**Note:** The API must be hosted separately (Railway, Render, Fly.io, etc.). Set `APP_ORIGIN` on the API to your Vercel URL (e.g. `https://your-app.vercel.app`) for CORS and cookies.

---

## Docker (optional)

Example `Dockerfile` for the API:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server server/
RUN cd server && npm run build && npx prisma generate
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
```

---

## Security Notes

- **Rate limiting**: The API includes basic rate limiting in production (see `server/src/middleware/rateLimit.ts`).
- **CORS**: Ensure `APP_ORIGIN` matches your frontend URL.
- **Cookies**: Session cookies are HTTP-only. Configure `sameSite` and `secure` for HTTPS.

---

