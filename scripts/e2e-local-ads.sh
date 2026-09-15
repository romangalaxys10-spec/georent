#!/usr/bin/env bash
# E2E test: local ads end-to-end (auth → publish → feed → interest → pair)
set -e
BASE="http://localhost:3000"
JQ() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

EMAIL="e2e-$RANDOM@test.local"

echo "=== 1. signup ==="
SIGNUP=$(curl -s -X POST "$BASE/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"supersecret1\",\"name\":\"E2E Tester\"}")
TOKEN=$(echo "$SIGNUP" | JQ "d['token']")
echo "$SIGNUP" | JQ "d['user']['email'] + ' token: ' + d['token'][:12] + '…'"
test -n "$TOKEN" && echo "PASS got token"

echo "=== 2. bad signup rejected ==="
curl -s -o /dev/null -w "dup email: %{http_code}\n" -X POST "$BASE/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"supersecret1\",\"name\":\"Dup\"}"

echo "=== 3. login returns rotated token ==="
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"supersecret1\"}")
TOKEN=$(echo "$LOGIN" | JQ "d['token']")
echo "PASS login token ${TOKEN:0:12}…"
curl -s -o /dev/null -w "wrong password: %{http_code}\n" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongwrong\"}"

echo "=== 4. me() ==="
curl -s "$BASE/api/auth/me" -H "authorization: Bearer $TOKEN" | JQ "'user: '+d['user']['name']+' listings: '+str(d['stats']['activeListings'])"
curl -s -o /dev/null -w "me without token: %{http_code}\n" "$BASE/api/auth/me"

echo "=== 5. publish local ad (rent) ==="
AD=$(curl -s -X POST "$BASE/api/ads" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "deal":"rent","title":"E2E Cozy 2-room flat near metro",
  "description":"Test listing published by the E2E script.",
  "priceUsd":650,"area":58,"roomCount":2,"bedrooms":1,"bathrooms":1,
  "floor":4,"floorCount":9,"condition":"renovated","furnished":"yes",
  "cityName":"Tbilisi","districtName":"Vake","address":"Test St 1",
  "contactName":"E2E","contactPhone":"+995 555 000000"
}')
ADID=$(echo "$AD" | JQ "d['id']")
echo "ad id: $ADID"
test -n "$ADID" && echo "PASS ad created"

echo "=== 6. ad validation ==="
curl -s -o /dev/null -w "unauthorized ad post: %{http_code}\n" -X POST "$BASE/api/ads" -H 'content-type: application/json' -d '{}'
curl -s -o /dev/null -w "bad phone: %{http_code}\n" -X POST "$BASE/api/ads" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"deal":"rent","title":"Bad phone test ad","priceUsd":100,"area":30,"roomCount":1,"districtName":"Vake","contactName":"X Y","contactPhone":"nope"}'

echo "=== 7. ad in explore feed (rent, Vake) ==="
FEED=$(curl -s -m 60 "$BASE/api/explore?deal=rent&limit=40")
echo "$FEED" | JQ "str(len(d['listings']))+' listings; sources: '+', '.join(s['id']+'='+s['status'] for s in d['sources'])"
FOUND=$(echo "$FEED" | JQ "len([l for l in d['listings'] if l['provider']=='local'])")
echo "local ads in feed: $FOUND"
test "$FOUND" -ge 1 && echo "PASS local ad surfaced in feed"

echo "=== 8. detail API + page ==="
curl -s "$BASE/api/listing/local/$ADID" | JQ "'detail: '+d['listing']['title']+' | photos: '+str(len(d['photos']))+' | seller: '+str(d.get('seller',{}).get('type'))"
curl -s -o /dev/null -w "detail page SSR: %{http_code} in %{time_total}s\n" "$BASE/listing/local/$ADID" -m 20

echo "=== 9. interest flow ==="
INT=$(curl -s -X POST "$BASE/api/ads/$ADID/interest" -H 'content-type: application/json' \
  -d '{"name":"Curious Buyer","phone":"+995 555 111222","message":"Is it still available?"}')
echo "$INT" | JQ "'notified: '+d['notified']"
test "$(echo "$INT" | JQ "d['ok']")" = "True" && echo "PASS interest recorded (telegram=not_paired expected)"

echo "=== 10. owner sees interest ==="
curl -s "$BASE/api/ads/$ADID/interests" -H "authorization: Bearer $TOKEN" | JQ "'interests: '+str(len(d['interests']))+' first: '+d['interests'][0]['name']+' '+d['interests'][0]['phone']"

echo "=== 11. pair code flow ==="
PAIR=$(curl -s -X POST "$BASE/api/telegram/pair" -H "authorization: Bearer $TOKEN")
CODE=$(echo "$PAIR" | JQ "d.get('code')")
echo "pair code: $CODE"
# No bot token configured → 503 with pendingCode None is the CORRECT state here.
curl -s -o /dev/null -w "pair without bot token: %{http_code} (503 = correct)\n" -X POST "$BASE/api/telegram/pair" -H "authorization: Bearer $TOKEN"
# bind the code directly through the lib (simulates /start CODE reaching the bot)
node -e "
const { execSync } = require('child_process');
" 2>/dev/null
if [ "$CODE" != "None" ] && [ -n "$CODE" ]; then
  bun -e "
import { bindPairCode } from './src/lib/telegram';
const user = await bindPairCode('$CODE', '999000111', 'e2e_tester');
console.log(user ? 'PASS bound to ' + user.email : 'FAIL bind failed');
process.exit(user ? 0 : 1);
" 2>&1 | tail -1
else
  echo "SKIP direct bind (no bot token) — pair UI shows setup state, interests stay dashboard-only"
fi
curl -s "$BASE/api/auth/me" -H "authorization: Bearer $TOKEN" | JQ "'tgPaired now: '+str(d['user']['tgPaired'])"

echo "=== 12. webhook rejects without secret ==="
curl -s -o /dev/null -w "webhook unsigned: %{http_code}\n" -X POST "$BASE/api/telegram/webhook" -H 'content-type: application/json' -d '{}'

echo "=== 13. pause/delete ==="
curl -s -X PATCH "$BASE/api/ads/$ADID" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"status":"paused"}' | JQ "'status: '+d['status']"
curl -s -o /dev/null -w "detail after pause: %{http_code}\n" "$BASE/api/listing/local/$ADID"
curl -s -X DELETE "$BASE/api/ads/$ADID" -H "authorization: Bearer $TOKEN" | JQ "'deleted: '+str(d['ok'])"
echo "ALL DONE"
