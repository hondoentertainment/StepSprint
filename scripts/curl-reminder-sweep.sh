#!/usr/bin/env bash
# Hourly (or faster) call to trigger reminder evaluation on the API.
# On Vercel, you do NOT need this script — vercel.json's `crons` entry pings
# /api/cron/reminder-sweep automatically with `Authorization: Bearer ${CRON_SECRET}`.
#
# Use this from any external scheduler (GitHub Actions, Uptime Robot, a VPS
# crontab) when the API runs somewhere without native cron.
#
# Required env:
#   API_PUBLIC_ORIGIN        — public base URL of the API (no trailing slash needed)
#   CRON_SECRET              — bearer secret (min 16 chars). Legacy
#                              REMINDER_CRON_SECRET is also accepted.
set -euo pipefail

: "${API_PUBLIC_ORIGIN:?Set API_PUBLIC_ORIGIN to your API base URL (no trailing slash required)}"
SECRET="${CRON_SECRET:-${REMINDER_CRON_SECRET:-}}"
if [[ -z "${SECRET}" ]]; then
  echo "Set CRON_SECRET (min 16 chars) to match the API env. REMINDER_CRON_SECRET also accepted." >&2
  exit 1
fi

ORIGIN="${API_PUBLIC_ORIGIN%/}"
curl -fsS -X POST "${ORIGIN}/api/cron/reminder-sweep" \
  -H "Authorization: Bearer ${SECRET}"
