# Postgres backup and restore drill

Use this as a **quarterly or pre-launch** exercise. Replace host-specific details with your Render (or other) environment.

## Preconditions

- You have admin access to the database provider (Vercel Marketplace Neon dashboard, or whichever Postgres host you've wired into `DATABASE_URL`).
- You can run `psql` (local install or a temporary container) that can reach the **staging** database URL for tests — never run destructive drills against production without explicit approval.

## 1. Capture current state (optional but useful)

- Note approximate row counts for `User`, `Challenge`, `StepSubmission` from a read-only query or admin UI.
- Record the current app release / git SHA deployed on the API.

## 2. Create a manual backup snapshot

- In the Neon dashboard (via the Vercel Marketplace integration or directly): create a manual branch from `main` (Neon's branches are zero-copy snapshots that act as a point-in-time restore source). Other providers: use their "backup now" control.
- Confirm the snapshot/branch appears in the retention list with a timestamp.

## 3. Restore to a non-production target

Goal: prove you can turn a backup file into a working database, without touching production data.

- Create a **new Neon branch** from the snapshot branch (or restore to a separate Postgres instance for non-Neon hosts).
- Point a Vercel Preview deploy at the restored URL (`DATABASE_URL` + `DIRECT_URL` env override on a non-prod project) and confirm `GET /api/health` returns `"db": "up"`. The build will run `prisma migrate deploy` against the restored branch — verify it's a no-op (no missing migrations).

## 4. Validate application-level integrity

- Run a subset of smoke checks: login with a known seeded or test account (if credentials still apply), open leaderboards, confirm submissions display as expected for the restored date range.

## 5. Document results

Record **date**, **who ran the drill**, **RTO** (wall-clock from “decide to restore” to “health OK”), and **RPO** (acceptable data loss window given your backup frequency). Update internal runbooks if steps differ from this checklist.

## References

- [DEPLOYMENT.md](DEPLOYMENT.md) — env vars and platform layout
- [PRODUCTION.md](PRODUCTION.md) — RTO/RPO expectations for launch reviews
