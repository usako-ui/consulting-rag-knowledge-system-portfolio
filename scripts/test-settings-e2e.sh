#!/usr/bin/env bash
# Phase 5.3 + 6 動作確認（PM 指示 4 項目）
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

# ========================================================================
# セクション 1: 認可（gemini-check / api-budget / log-retention の 3 API）
# ========================================================================
echo -e "\n=== S1-a: 未認証で POST gemini-check → 401 ==="
STATUS=$(curl -sS -b "$COOKIE_UN" -o /tmp/s1a.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/gemini-check")
check "S1a 未認証 gemini-check" "401" "$STATUS"

echo -e "\n=== S1-b: 一般ユーザー gemini-check → 403 ==="
STATUS=$(curl -sS -b "$COOKIE_HR" -o /tmp/s1b.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/gemini-check")
check "S1b hr gemini-check" "403" "$STATUS"

echo -e "\n=== S1-c: 未認証 api-budget → 401 ==="
STATUS=$(curl -sS -b "$COOKIE_UN" -o /tmp/s1c.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/api-budget" -H "Content-Type: application/json" -d '{"newValueTokens":1}')
check "S1c 未認証 api-budget" "401" "$STATUS"

echo -e "\n=== S1-d: hr api-budget → 403 ==="
STATUS=$(curl -sS -b "$COOKIE_HR" -o /tmp/s1d.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/api-budget" -H "Content-Type: application/json" -d '{"newValueTokens":1}')
check "S1d hr api-budget" "403" "$STATUS"

echo -e "\n=== S1-e: hr log-retention → 403 ==="
STATUS=$(curl -sS -b "$COOKIE_HR" -o /tmp/s1e.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/log-retention" -H "Content-Type: application/json" -d '{"newValueDays":30}')
check "S1e hr log-retention" "403" "$STATUS"

# ========================================================================
# セクション 2: Gemini DB キャッシュ 10 連打実測（API 呼び出し 1 回のみ）
# ========================================================================
echo -e "\n=== S2: Gemini health check 10 連打実測 ==="
# 事前クリア：system_settings.gemini_last_check を削除（キャッシュリセット）
npx tsx scripts/_reset-gemini-check.ts 2>&1 | tail -2

# 直近の api_usage_log 件数を記録（before）
USAGE_BEFORE=$(npx tsx scripts/_count-api-usage.ts 2>/dev/null)
echo "api_usage_log count before: $USAGE_BEFORE"

# 10 連打
echo "連打 10 回..."
CACHED_COUNT=0
NEW_COUNT=0
for i in $(seq 1 10); do
  BODY=$(curl -sS -b "$COOKIE_ADMIN" -X POST "$BASE/api/admin/settings/gemini-check")
  CACHED=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(String(j.result?.cached??''))}catch{console.log('')}})")
  if [ "$CACHED" = "true" ]; then
    CACHED_COUNT=$((CACHED_COUNT+1))
  elif [ "$CACHED" = "false" ]; then
    NEW_COUNT=$((NEW_COUNT+1))
  fi
done

check "S2 新規 API 呼び出し回数" "1" "$NEW_COUNT" "初回のみ API を叩く"
check "S2 キャッシュヒット回数" "9" "$CACHED_COUNT" "2 回目以降は DB キャッシュ返却"

# api_usage_log 件数（after）
USAGE_AFTER=$(npx tsx scripts/_count-api-usage.ts 2>/dev/null)
echo "api_usage_log count after: $USAGE_AFTER"
USAGE_DIFF=$((USAGE_AFTER - USAGE_BEFORE))
check "S2 api_usage_log 増加数" "1" "$USAGE_DIFF" "新規実行 1 回分だけ記録"

# ========================================================================
# セクション 3: 月間 API 予算変更（50k 動作確認→戻す）+ 監査ログ
# ========================================================================
echo -e "\n=== S3: 月間 API 予算変更 ==="
# 現在値を取得
BUDGET_BEFORE=$(npx tsx scripts/_show-setting.ts monthly_api_budget_tokens 2>/dev/null)
echo "budget before: $BUDGET_BEFORE"

echo "→ 50,000 に変更"
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s3a.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/api-budget" -H "Content-Type: application/json" -d '{"newValueTokens":50000}')
check "S3a 50,000 に変更" "200" "$STATUS"

# 現在値確認
BUDGET_MID=$(npx tsx scripts/_show-setting.ts monthly_api_budget_tokens 2>/dev/null)
check "S3a 現在値=50000" "50000" "$BUDGET_MID"

echo "→ 元に戻す ($BUDGET_BEFORE)"
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s3b.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/api-budget" -H "Content-Type: application/json" -d "{\"newValueTokens\":$BUDGET_BEFORE}")
check "S3b 元の値に戻す" "200" "$STATUS"

# 監査ログを確認（直近 2 件が before/after を記録しているか）
echo "監査ログ確認..."
AUDIT_RESULT=$(npx tsx scripts/_verify-settings-audit.ts 2>/dev/null)
echo "audit: $AUDIT_RESULT"
HAS_BEFORE=$(echo "$AUDIT_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(String(j.hasBefore))})")
HAS_BUDGET=$(echo "$AUDIT_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(String(j.hasBudgetKey))})")
check "S3c 監査ログに before/after 記録" "true" "$HAS_BEFORE"
check "S3c 監査ログに budget key 記録" "true" "$HAS_BUDGET"

# ========================================================================
# セクション 4: ログ保存期間変更 + 削除対象件数プレビュー
# ========================================================================
echo -e "\n=== S4: 保存期間変更 + プレビュー ==="
# プレビュー API（30 日に短縮時の削除対象）
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s4a.json -w "%{http_code}" "$BASE/api/admin/settings/log-retention?days=30")
check "S4a プレビュー API 200" "200" "$STATUS"
TO_DELETE=$(cat /tmp/s4a.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(String(j.toDelete??''))}catch{console.log('')}})")
echo "削除対象件数（30 日短縮時）: $TO_DELETE"
# 件数が数字で取得できていれば PASS
if [[ "$TO_DELETE" =~ ^[0-9]+$ ]]; then
  check "S4a 削除対象件数が数値" "yes" "yes" "count=$TO_DELETE"
else
  check "S4a 削除対象件数が数値" "yes" "no" "received=$TO_DELETE"
fi

# 不正な days（10）→ 400
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s4b.json -w "%{http_code}" "$BASE/api/admin/settings/log-retention?days=10")
check "S4b 不正 days → 400" "400" "$STATUS"

# 現在値（記録のため）
RET_BEFORE=$(npx tsx scripts/_show-setting.ts log_retention_days 2>/dev/null)
echo "retention before: $RET_BEFORE"

# 変更 → 戻す
echo "→ 90 日に変更"
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s4c.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/log-retention" -H "Content-Type: application/json" -d '{"newValueDays":90}')
check "S4c 90 日に変更" "200" "$STATUS"

echo "→ 元の値 ($RET_BEFORE) に戻す"
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/s4d.json -w "%{http_code}" -X POST "$BASE/api/admin/settings/log-retention" -H "Content-Type: application/json" -d "{\"newValueDays\":$RET_BEFORE}")
check "S4d 元の値に戻す" "200" "$STATUS"

# サマリー
echo -e "\n\n========================================"
echo "  PASS: $pass / FAIL: $fail"
echo "========================================"
for line in "${report[@]}"; do echo "$line"; done
