#!/usr/bin/env bash
# Hourly (or faster) POST to trigger reminder evaluation on the API.
# Set REMINDER_USE_EXTERNAL_CRON=true on the server and configure the same REMINDER_CRON_SECRET.
set -euo pipefail

: "${API_PUBLIC_ORIGIN:?Set API_PUBLIC_ORIGIN to your API base URL (no trailing slash required)}"
: "${REMINDER_CRON_SECRET:?Set REMINDER_CRON_SECRET (min 16 chars) to match the API env}"

ORIGIN="${API_PUBLIC_ORIGIN%/}"
curl -fsS -X POST "${ORIGIN}/api/cron/reminder-sweep" \
  -H "Authorization: Bearer ${REMINDER_CRON_SECRET}"
