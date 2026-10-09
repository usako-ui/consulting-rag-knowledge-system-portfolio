#!/usr/bin/env bash
# Phase 5.2 再取り込み動作確認（PM 指示 7 項目）
#
# 事前条件：
#   - dev サーバーが http://localhost:3000 で稼働
#   - .env に EVAL_ADMIN_EMAIL / EVAL_ADMIN_PASSWORD / EVAL_HR_EMAIL / EVAL_HR_PASSWORD 設定済
#   - 失敗ログの INSERT・DELETE は tsx スクリプト経由（SQL 直打ちしない）

set -u
BASE="http://localhost:3000"
COOKIE_UN=/tmp/cookies_unauth.txt
COOKIE_HR=/tmp/cookies_hr.txt
COOKIE_ADMIN=/tmp/cookies_admin.txt
: > "$COOKIE_UN"; : > "$COOKIE_HR"; : > "$COOKIE_ADMIN"

load_env() {
  node -e "require('dotenv').config();process.stdout.write(process.env.$1 || '')"
}
ADMIN_EMAIL="$(load_env EVAL_ADMIN_EMAIL)"
ADMIN_PASSWORD="$(load_env EVAL_ADMIN_PASSWORD)"
HR_EMAIL="$(load_env EVAL_HR_EMAIL)"
HR_PASSWORD="$(load_env EVAL_HR_PASSWORD)"

pass=0; fail=0
report=()
check() {
  local name="$1" expected="$2" actual="$3" note="${4:-}"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1)); report+=("PASS | $name | expected=$expected actual=$actual $note")
  else
    fail=$((fail+1)); report+=("FAIL | $name | expected=$expected actual=$actual $note")
  fi
}

echo "=== 準備: ログイン ==="
curl -sS -c "$COOKIE_HR"    -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$HR_EMAIL\",\"password\":\"$HR_PASSWORD\"}" -o /dev/null
curl -sS -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" -o /dev/null

echo "=== 準備: 失敗データ INSERT ==="
TEST_LOG_ID=$(npx tsx scripts/_insert-test-ingestion.ts 2>&1 | tail -1)

if [ -z "$TEST_LOG_ID" ] || [ ${#TEST_LOG_ID} -ne 36 ]; then
  echo "FAIL: 失敗データ INSERT 失敗"; exit 1
fi
echo "inserted test log id: $TEST_LOG_ID"

# -------- P2: /admin/ingestion の failed 行で再取り込みボタンが出ること（API 一覧 fetch で確認） --------
echo -e "\n=== P2: ingestion 一覧に failed 行が含まれる（HTML 取得・サーバー描画確認） ==="
HTML=$(curl -sS -b "$COOKIE_ADMIN" "$BASE/admin/ingestion?status=failed")
if echo "$HTML" | grep -q "test-phase5-"; then
  check "P2 failed 行表示" "yes" "yes" "test-phase5-* が HTML に含まれる"
else
  check "P2 failed 行表示" "yes" "no" "HTML に test-phase5-* が見つからない"
fi
if echo "$HTML" | grep -q "再取り込み"; then
  check "P2 再取り込みボタンラベル" "yes" "yes"
else
  check "P2 再取り込みボタンラベル" "yes" "no"
fi

# -------- P3: ボタン押下相当の API 呼び出しで retrying に遷移・成功レスポンス --------
echo -e "\n=== P3: POST /api/admin/ingestion/[id]/retry ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p3.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/$TEST_LOG_ID/retry")
BODY=$(cat /tmp/p3.json)
check "P3 status" "200" "$STATUS" "body=$BODY"
NEW_STATUS=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.newStatus||'')}catch{console.log('')}})")
check "P3 newStatus" "retrying" "$NEW_STATUS"
RETRY_COUNT=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(String(j.retryCount??''))}catch{console.log('')}})")
check "P3 retryCount リセット" "0" "$RETRY_COUNT" "A: 手動再取り込み時に retry_count を 0 にリセット"
PREV_RETRY=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(String(j.previousRetryCount??''))}catch{console.log('')}})")
check "P3 previousRetryCount" "3" "$PREV_RETRY" "リセット前の値（INSERT 時の retry_count=3）"

# -------- P4: 連打（2 回目は 409） --------
echo -e "\n=== P4: 同じ ID をもう一度叩く → 409（failed 状態でなくなっているため） ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p4.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/$TEST_LOG_ID/retry")
check "P4 連打拒否" "409" "$STATUS" "body=$(cat /tmp/p4.json)"

# -------- P5: 一般ユーザー・未認証で 403・401 --------
echo -e "\n=== P5a: 一般ユーザー（hr）→ 403 ==="
STATUS=$(curl -sS -b "$COOKIE_HR" -o /tmp/p5a.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/$TEST_LOG_ID/retry")
check "P5a hr → 403" "403" "$STATUS" "body=$(cat /tmp/p5a.json)"

echo -e "\n=== P5b: 未認証 → 401 ==="
STATUS=$(curl -sS -b "$COOKIE_UN" -o /tmp/p5b.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/$TEST_LOG_ID/retry")
check "P5b 未認証 → 401" "401" "$STATUS" "body=$(cat /tmp/p5b.json)"

# -------- P6: 存在しないID・不正なUUID --------
echo -e "\n=== P6a: 存在しない UUID → 404 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p6a.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/00000000-0000-0000-0000-000000000000/retry")
check "P6a 存在しない ID → 404" "404" "$STATUS" "body=$(cat /tmp/p6a.json)"

echo -e "\n=== P6b: 不正な UUID → 400 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p6b.json -w "%{http_code}" -X POST "$BASE/api/admin/ingestion/not-a-uuid/retry")
check "P6b 不正 UUID → 400" "400" "$STATUS" "body=$(cat /tmp/p6b.json)"

# -------- P8: processing・retrying の行にボタンが出ない（HTML 確認） --------
echo -e "\n=== P8: retrying 状態の行は再取り込みボタンではなく「予約済」表示 ==="
# P3 で TEST_LOG_ID は retrying に遷移済み・HTML を取得して確認
HTML=$(curl -sS -b "$COOKIE_ADMIN" "$BASE/admin/ingestion?status=retrying")
# 対象行が「予約済」表示になっているか
if echo "$HTML" | grep -q "予約済"; then
  check "P8 retrying 行は予約済表示" "yes" "yes"
else
  check "P8 retrying 行は予約済表示" "yes" "no"
fi

# 対象 ID を /tmp に書き出し（監査ログ検証 + 削除用）
echo "$TEST_LOG_ID" > /tmp/test_log_id.txt

# サマリー
echo -e "\n\n========================================"
echo "  PASS: $pass / FAIL: $fail"
echo "========================================"
for line in "${report[@]}"; do echo "$line"; done
