# Postgres backup and restore drill

Use this as a **quarterly or pre-launch** exercise. Replace host-specific details with your Render (or other) environment.

## Preconditions

- You have admin access to the database provider (for example Render Dashboard for `stepsprint-db`).
- You can run `psql` (local install or a temporary container) that can reach the **staging** database URL for tests — never run destructive drills against production without explicit approval.

## 1. Capture current state (optional but useful)

- Note approximate row counts for `User`, `Challenge`, `StepSubmission` from a read-only query or admin UI.
- Record the current app release / git SHA deployed on the API.

## 2. Create a manual backup snapshot

- In Render: **Database → Manual snapshot** (or use the provider’s “backup now” control).
- Confirm the backup appears in the retention list with a timestamp.

## 3. Restore to a non-production target

Goal: prove you can turn a backup file into a working database, without touching production data.

- Provision a **separate** Postgres instance or use Render **restore to new database** when available.
- Apply the same **migrations** the API expects (`prisma migrate deploy` against `DATABASE_URL` for that instance), or restore a physical backup per host docs; confirm `GET /api/health` against an API pointed at the restored DB returns `"db": "up"`.

## 4. Validate application-level integrity

- Run a subset of smoke checks: login with a known seeded or test account (if credentials still apply), open leaderboards, confirm submissions display as expected for the restored date range.

## 5. Document results

Record **date**, **who ran the drill**, **RTO** (wall-clock from “decide to restore” to “health OK”), and **RPO** (acceptable data loss window given your backup frequency). Update internal runbooks if steps differ from this checklist.

## References

- [DEPLOYMENT.md](DEPLOYMENT.md) — env vars and platform layout
- [PRODUCTION.md](PRODUCTION.md) — RTO/RPO expectations for launch reviews
