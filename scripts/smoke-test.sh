#!/usr/bin/env bash
# End-to-end check of the published compose file against a locally built image.
set -euo pipefail

IMAGE="${GIFTY_IMAGE:-gifty:dev}"
WORK="$(mktemp -d)"
PORT="${SMOKE_PORT:-3999}"
BASE="http://127.0.0.1:${PORT}"
JAR="$WORK/cookies.txt"
trap 'docker compose -p gifty-smoke -f "$WORK/docker-compose.yml" down -v >/dev/null 2>&1 || true; rm -rf "$WORK" 2>/dev/null || true' EXIT

sed "s#ghcr.io/fjmerc/gifty:\${GIFTY_VERSION:-latest}#${IMAGE}#" docker-compose.yml > "$WORK/docker-compose.yml"
printf 'GIFTY_URL=http://127.0.0.1:%s\nTZ=UTC\nGIFTY_PORT=%s\n' "$PORT" "$PORT" > "$WORK/.env"
# Hosts without AVX can't run Mongo 5+: MONGO_IMAGE=mongo:4.4 ./scripts/smoke-test.sh
[ -n "${MONGO_IMAGE:-}" ] && echo "MONGO_IMAGE=$MONGO_IMAGE" >> "$WORK/.env"
cd "$WORK"

docker compose -p gifty-smoke up -d
echo "Waiting for health…"
for i in $(seq 1 60); do
  if curl -fs "$BASE/api/health" >/dev/null; then break; fi
  sleep 2
  [ "$i" = 60 ] && { docker compose -p gifty-smoke logs gifty; exit 1; }
done

echo "1. health + version"
curl -fs "$BASE/api/health" | grep -q '"status":"ok"'
curl -fs "$BASE/api/health" | grep -qE '"version":"[0-9a-z][^"]*"' || { echo "health reports no version"; exit 1; }

echo "1b. money-model and text-repair migration markers written on a fresh database, without a backup"
# (a regex, not \$in: the string passes through two shells)
MARKER_JS="db.migrations.countDocuments({_id:/^(money-model|decode-encoded-text)-2026-10\$/})"
MARKERS=$(docker compose -p gifty-smoke exec -T mongo sh -c "mongosh --quiet gifty --eval \"$MARKER_JS\" 2>/dev/null || mongo --quiet gifty --eval \"$MARKER_JS\"" | tr -d '[:space:]')
[ "$MARKERS" = "2" ] || { echo "migration markers missing (got '$MARKERS' of 2)"; exit 1; }
# Nothing to migrate on a fresh database → no pre-migration backup (step 6 makes the first one)
[ -z "$(docker compose -p gifty-smoke exec -T gifty sh -c 'ls "${BACKUP_DIR:-$DATA_DIR/backups}" 2>/dev/null | grep "^gifty-backup-" || true')" ] \
  || { echo "unexpected backup before step 6"; exit 1; }

echo "2. UI served, no upgrade-insecure-requests over http"
curl -fsi "$BASE/recipients" | tee "$WORK/ui.txt" | grep -q '<div id="root">'
! grep -qi 'upgrade-insecure-requests' "$WORK/ui.txt"

echo "3. node process runs as non-root user 'node'"
# exec bypasses the entrypoint, so inspect the running server process instead of `id -u`
[ "$(docker compose -p gifty-smoke exec -T gifty ps -o user=,comm= | awk '$2=="node"{print $1; exit}')" = "node" ]

echo "4a. fresh instance asks for the first-run setup code"
curl -fs "$BASE/api/instance" | grep -q '"setupRequired":true'
# Never printed: read from the data folder, as the owner would
SETUP_CODE=$(docker compose -p gifty-smoke exec -T gifty sh -c 'sed -n "s/^Setup code: //p" "$DATA_DIR/setup-code.txt"' | tr -d '[:space:]')
[ -n "$SETUP_CODE" ] || { echo "setup code file missing"; exit 1; }
# Without the code the first registration is refused
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d '{"username":"smoke","email":"smoke@example.com","password":"Sm0ke!pass","firstName":"Smoke","lastName":"Test"}' \
  "$BASE/api/users/register")" = "400" ] || { echo "first registration without a setup code was not refused"; exit 1; }

echo "4. register + login over plain http (cookie must not be Secure)"
curl -fs -c "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d '{"username":"smoke","email":"smoke@example.com","password":"Sm0ke!pass","firstName":"Smoke","lastName":"Test","setupCode":"'"$SETUP_CODE"'"}' \
  "$BASE/api/users/register" >/dev/null
unset SETUP_CODE
curl -fs "$BASE/api/instance" | grep -q '"setupRequired":false'
[ -z "$(docker compose -p gifty-smoke exec -T gifty sh -c 'ls "$DATA_DIR/setup-code.txt" 2>/dev/null || true')" ] \
  || { echo "setup code file left behind after the first account"; exit 1; }
# Netscape jar columns: domain, subdomains, path, SECURE, expiry, name, value
[ -z "$(awk '$4=="TRUE" && $6=="access_token"' "$JAR")" ]
curl -fs -b "$JAR" "$BASE/api/users/profile" | grep -q smoke

echo "4b. the first account is the owner and an admin"
curl -fs -b "$JAR" "$BASE/api/users/profile" | grep -q '"role":"admin"' || { echo "first account is not an admin"; exit 1; }
curl -fs -b "$JAR" "$BASE/api/users/profile" | grep -q '"isOwner":true' || { echo "first account is not the owner"; exit 1; }
curl -fs -b "$JAR" "$BASE/api/admin/users" | grep -q '"isOwner":true' || { echo "admin users list failed"; exit 1; }

echo "4c. the wizard API: defaults, then setup is complete"
curl -fs -b "$JAR" "$BASE/api/instance" | grep -q '"setupComplete":false' || { echo "a fresh install is marked set up"; exit 1; }
curl -fs -b "$JAR" -X PATCH -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d '{"signupMode":"invite-only","defaultCountry":"DE","defaultCurrency":"EUR"}' "$BASE/api/admin/settings" | grep -q '"defaultCurrency":"EUR"' \
  || { echo "saving instance settings failed"; exit 1; }
curl -fs -b "$JAR" -X POST -H "Origin: $BASE" "$BASE/api/admin/setup-complete" >/dev/null
curl -fs "$BASE/api/instance" | grep -q '"setupComplete":true' || { echo "setup not marked complete"; exit 1; }

echo "4d. invite-only: refused without an invite, admitted with one"
SECOND='{"username":"second","email":"second@example.com","password":"Sec0nd!pass","firstName":"Sec","lastName":"Ond"'
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d "$SECOND}" "$BASE/api/users/register")" = "403" ] || { echo "registration without an invite was not refused"; exit 1; }
INVITE_TOKEN="$(curl -fs -b "$JAR" -X POST -H 'Content-Type: application/json' -H "Origin: $BASE" -d '{}' "$BASE/api/admin/invites" \
  | sed -n 's|.*/invite/\([A-Za-z0-9_-]*\)".*|\1|p')"
[ -n "$INVITE_TOKEN" ] || { echo "no invite link"; exit 1; }
curl -fs -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d "$SECOND,\"inviteToken\":\"$INVITE_TOKEN\"}" "$BASE/api/users/register" >/dev/null || { echo "registration with an invite failed"; exit 1; }
unset INVITE_TOKEN

echo "4e. a reset link from the server command works"
RESET_TOKEN="$(docker compose -p gifty-smoke exec -T gifty node scripts/reset-link.js second@example.com | sed -n 's|.*/reset/\([A-Za-z0-9_-]*\).*|\1|p')"
[ -n "$RESET_TOKEN" ] || { echo "reset-link.js printed no link"; exit 1; }
curl -fs -H 'Content-Type: application/json' -H "Origin: $BASE" -d '{"password":"N3w!second"}' "$BASE/api/password-reset/$RESET_TOKEN" >/dev/null \
  || { echo "using the reset link failed"; exit 1; }
unset RESET_TOKEN
curl -fs -H 'Content-Type: application/json' -H "Origin: $BASE" -d '{"email":"second@example.com","password":"N3w!second"}' "$BASE/api/users/login" >/dev/null \
  || { echo "login with the new password failed"; exit 1; }

echo "5. create recipient"
curl -fs -b "$JAR" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d '{"firstName":"Maya","lastName":"Rivera","relation":"Friend","relationship":"friendship","birthdate":"1990-05-01"}' \
  "$BASE/api/recipients" >/dev/null

echo "6. backup → wipe → restore"
NAME=$(curl -fs -b "$JAR" -X POST -H "Origin: $BASE" "$BASE/api/database/backup" | sed -E 's/.*"backupName":"([^"]+)".*/\1/')
docker compose -p gifty-smoke exec -T mongo sh -c "mongosh --quiet gifty --eval 'db.recipients.deleteMany({})' || mongo --quiet gifty --eval 'db.recipients.deleteMany({})'" >/dev/null
curl -fs -b "$JAR" -X POST -H "Origin: $BASE" "$BASE/api/database/restore/$NAME" >/dev/null
curl -fs -b "$JAR" "$BASE/api/recipients" | grep -q Maya

echo "SMOKE OK"
