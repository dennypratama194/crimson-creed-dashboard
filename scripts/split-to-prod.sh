#!/usr/bin/env bash
#
# One-shot: point the Vercel deployment at a FRESH, separate Supabase project
# that holds only the catalogue (Items + suppliers + price book) and one real
# Super Admin. Your local dev database is never touched.
#
# Run ONCE, from the repo root, after:
#   1. Creating a new (empty) Supabase project in the dashboard.
#   2. cp .env.prod.local.example .env.prod.local  &&  fill it in.
#
#   ./scripts/split-to-prod.sh
#
# Safe to re-run if a step fails partway — every step is idempotent (migrations
# only apply what's missing, the catalogue upserts, create-admin skips an
# existing username, vercel env uses --force).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env.prod.local"
DEV_REF="$(cat supabase/.temp/project-ref 2>/dev/null || echo pmrqzxvadtzzqrvosicw)"

# ── load + validate .env.prod.local ─────────────────────────────────────────
[ -f "$ENV_FILE" ] || {
  echo "Missing $ENV_FILE — copy .env.prod.local.example and fill it in."
  exit 1
}
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

MISSING=0
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY SUPABASE_PROJECT_ID SUPABASE_DB_PASSWORD \
  SUPABASE_ENV ADMIN_USERNAME ADMIN_NAME ADMIN_PASSWORD; do
  if [ -z "${!v:-}" ]; then
    echo "  $ENV_FILE is missing: $v"
    MISSING=1
  fi
done
[ "$MISSING" = 0 ] || {
  echo "Fill the missing values and re-run."
  exit 1
}

if [ "$SUPABASE_ENV" != "production" ]; then
  echo "Refusing to run: SUPABASE_ENV is \"$SUPABASE_ENV\", not \"production\"."
  exit 1
fi
case "${NEXT_PUBLIC_SUPABASE_URL}${SUPABASE_PROJECT_ID}" in
*"$DEV_REF"*)
  echo "Refusing to run: $ENV_FILE still points at the DEV project ($DEV_REF)."
  exit 1
  ;;
esac

echo "Production Supabase project  : $SUPABASE_PROJECT_ID"
echo "Dev project (re-linked after): $DEV_REF"
echo "Super Admin to create        : $ADMIN_USERNAME (${ADMIN_RANK:-BOSS})"
echo
read -r -p "Proceed? This repoints the live Vercel deployment. [y/N] " ok
case "$ok" in
y | Y) ;;
*)
  echo "Aborted."
  exit 1
  ;;
esac

relink_dev() {
  echo
  echo "→ re-linking the Supabase CLI to dev ($DEV_REF)"
  npx --yes supabase link --project-ref "$DEV_REF" >/dev/null 2>&1 || true
}
trap relink_dev EXIT

step() {
  echo
  echo "━━ $* ━━"
}

step "1/6  Link the CLI to the production project"
npx --yes supabase link \
  --project-ref "$SUPABASE_PROJECT_ID" --password "$SUPABASE_DB_PASSWORD"

step "2/6  Push every migration to production"
npx --yes supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --yes

step "3/6  Load the catalogue (items + suppliers + price book)"
npx --yes tsx --env-file="$ENV_FILE" supabase/import-catalogue.ts

step "4/6  Upload catalogue thumbnails"
npx --yes tsx --env-file="$ENV_FILE" supabase/backfill-item-images.ts ||
  echo "  thumbnails failed — non-fatal, re-run later: npx tsx --env-file=$ENV_FILE supabase/backfill-item-images.ts"

step "5/6  Create the Super Admin"
npx --yes tsx --env-file="$ENV_FILE" supabase/create-admin.ts \
  --username "$ADMIN_USERNAME" --name "$ADMIN_NAME" --rank "${ADMIN_RANK:-BOSS}" ||
  echo "  (create-admin returned non-zero — likely the username already exists; continuing)"

step "6/6  Repoint Vercel (production) and redeploy"
# Production only. Preview deployments keep whatever they had (usually the dev
# project) — repoint those in the Vercel dashboard if you want them on prod too.
set_var() {
  local name="$1" value="$2"
  shift 2
  npx --yes vercel env add "$name" production --force --value "$value" "$@" >/dev/null
  echo "   set $name → production"
}
set_var NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
set_var NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
set_var SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY" --sensitive

echo "   triggering a production redeploy…"
npx --yes vercel --prod --yes

echo
echo "Done."
echo "Verify:"
echo "  • https://crimson-creed-dashboard.vercel.app — dashboard KPIs near zero,"
echo "    sign in with username \"$ADMIN_USERNAME\", Items populated, Members/Orders empty."
echo "  • localhost still shows the dummy data (unchanged)."
echo
echo "Now delete $ENV_FILE — it holds the prod DB password and the admin password."
