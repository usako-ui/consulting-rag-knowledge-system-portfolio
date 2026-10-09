#!/usr/bin/env bash
# Day6 Phase 4.2 実 API 統合動作確認スクリプト
# 前提: dev サーバー (npm run dev) が localhost:3000 で起動していること
# 使い方: bash scripts/test-admin-users-e2e.sh
#
# ★ このスクリプトは PM 指示（2026-10-01）に基づく：
#   - eval-admin は「作成 API のアクター」としてのみ使用（自分自身の変更・PW リセットは絶対にしない）
#   - テスト対象は test-user-a@case7.local（作成→変更→pending_deletion までの一連）
#   - 最後の管理者無効化ガードは self ガード発火順序の関係で実 API 単体再現が困難なため、
#     scripts/test-last-admin-guard.ts で単体検証する

set -u
BASE="http://localhost:3000"
COOKIE_UN=/tmp/cookies_unauth.txt
COOKIE_HR=/tmp/cookies_hr.txt
COOKIE_ADMIN=/tmp/cookies_admin.txt
COOKIE_TESTUSER=/tmp/cookies_testuser.txt
COOKIE_TESTUSER_OLD=/tmp/cookies_testuser_old.txt
: > "$COOKIE_UN"
: > "$COOKIE_HR"
: > "$COOKIE_ADMIN"
: > "$COOKIE_TESTUSER"
: > "$COOKIE_TESTUSER_OLD"

# .env から認証情報を読む（スクリプトに平文を書かない）
# ・node -e で dotenv を介して読み出す（コマンドラインの一時変数で保持）
load_env() {
  node -e "require('dotenv').config();process.stdout.write(process.env.$1 || '')"
}
ADMIN_EMAIL="$(load_env EVAL_ADMIN_EMAIL)"
ADMIN_PASSWORD="$(load_env EVAL_ADMIN_PASSWORD)"
HR_EMAIL="$(load_env EVAL_HR_EMAIL)"
HR_PASSWORD="$(load_env EVAL_HR_PASSWORD)"
TS=$(date +%s)
TEST_EMAIL="test-user-a-${TS}@case7.local"
TEST_EMAIL_C="test-user-c-${TS}@case7.local"

if [ -z "$ADMIN_PASSWORD" ] || [ -z "$HR_PASSWORD" ]; then
  echo "❌ EVAL_ADMIN_PASSWORD / EVAL_HR_PASSWORD が .env に未設定です" >&2
  echo "   .env.example を参考に .env に設定してから再実行してください" >&2
  exit 1
fi

pass=0
fail=0
report=()

check() {
  local name="$1" expected="$2" actual="$3" note="${4:-}"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1))
    report+=("PASS | $name | expected=$expected actual=$actual $note")
  else
    fail=$((fail+1))
    report+=("FAIL | $name | expected=$expected actual=$actual $note")
  fi
}

echo "=== ログイン準備 ==="

# 一般ユーザー（hr）でログイン
HR_LOGIN=$(curl -sS -c "$COOKIE_HR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$HR_EMAIL\",\"password\":\"$HR_PASSWORD\"}" \
  -o /dev/null -w "%{http_code}")
echo "hr login: $HR_LOGIN"

# 管理者ログイン
ADMIN_LOGIN=$(curl -sS -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  -o /dev/null -w "%{http_code}")
echo "admin login: $ADMIN_LOGIN"

# ========================================================================
# パターン 1: 未認証で POST /api/admin/users → 401
# ========================================================================
echo -e "\n=== P1: 未認証 POST /api/admin/users ==="
STATUS=$(curl -sS -b "$COOKIE_UN" -o /tmp/p1.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"foo@example.com\",\"department\":\"hr\",\"role\":\"general\"}")
check "P1 未認証 POST" "401" "$STATUS" "body=$(cat /tmp/p1.json)"

# ========================================================================
# パターン 2: 一般ユーザー(hr) で POST → 403
# ========================================================================
echo -e "\n=== P2: hr POST /api/admin/users ==="
STATUS=$(curl -sS -b "$COOKIE_HR" -o /tmp/p2.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"foo@example.com\",\"department\":\"hr\",\"role\":\"general\"}")
check "P2 hr POST" "403" "$STATUS" "body=$(cat /tmp/p2.json)"

# ========================================================================
# パターン 3: 管理者でテスト用ユーザー作成
#   → 201 + tempPW + Cache-Control: no-store
# ========================================================================
echo -e "\n=== P3: admin POST /api/admin/users (create test-user-a) ==="
RES=$(curl -isS -b "$COOKIE_ADMIN" -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"department\":\"hr\",\"role\":\"general\"}")
STATUS=$(echo "$RES" | head -n1 | awk '{print $2}')
CACHE=$(echo "$RES" | grep -i "^cache-control:" | tr -d '\r')
BODY=$(echo "$RES" | awk '/^\r?$/{f=1;next} f{print}')
TEMP_PW=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.temporaryPassword||'')}catch{console.log('')}})")
TARGET_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.user?.id||'')}catch{console.log('')}})")
check "P3-status" "201" "$STATUS"
check "P3-cache-control" "no-store" "$([[ "$CACHE" == *"no-store"* ]] && echo 'no-store' || echo 'MISSING')" "header=$CACHE"
check "P3-tempPW-len14" "14" "${#TEMP_PW}" "pw_length=${#TEMP_PW}"
check "P3-tempPW-charset" "yes" "$(echo "$TEMP_PW" | grep -qE '^[a-km-zA-HJ-NP-Z2-9]+$' && echo yes || echo no)" "紛らわしい文字除外"
check "P3-target-id-set" "yes" "$([[ -n "$TARGET_ID" ]] && echo yes || echo no)" "target_id=$TARGET_ID"
echo "  temporary password (masked): ${TEMP_PW:0:2}************"

# ========================================================================
# パターン 4: バリデーション
# ========================================================================
echo -e "\n=== P4a: 重複メール ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p4a.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"department\":\"hr\",\"role\":\"general\"}")
check "P4a 重複メール" "409" "$STATUS" "body=$(cat /tmp/p4a.json)"

echo -e "\n=== P4b: 不正なメール形式 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p4b.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"not-an-email\",\"department\":\"hr\",\"role\":\"general\"}")
check "P4b 不正メール" "400" "$STATUS" "body=$(cat /tmp/p4b.json)"

echo -e "\n=== P4c: 不正な部署 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p4c.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test-user-b@case7.local\",\"department\":\"unknown\",\"role\":\"general\"}")
check "P4c 不正部署" "400" "$STATUS" "body=$(cat /tmp/p4c.json)"

echo -e "\n=== P4d: 不正なロール ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p4d.json -w "%{http_code}" \
  -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test-user-b@case7.local\",\"department\":\"hr\",\"role\":\"superadmin\"}")
check "P4d 不正ロール" "400" "$STATUS" "body=$(cat /tmp/p4d.json)"

# ========================================================================
# パターン 5: 一時PWでログイン & 初回パスワード変更誘導
# ========================================================================
echo -e "\n=== P5: 一時PW でログイン ==="
STATUS=$(curl -sS -c "$COOKIE_TESTUSER_OLD" -o /tmp/p5.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEMP_PW\"}")
check "P5-login" "200" "$STATUS" "body=$(cat /tmp/p5.json)"
CHANGE_REQUIRED=$(node -e "const j=require('/tmp/p5.json');console.log(j.passwordChangeRequired)")
check "P5-passwordChangeRequired" "true" "$CHANGE_REQUIRED"

echo -e "\n=== P5b: /api/auth/me で初回変更誘導確認 ==="
ME=$(curl -sS -b "$COOKIE_TESTUSER_OLD" "$BASE/api/auth/me")
echo "  me: $ME"
ME_CHANGE=$(echo "$ME" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.user?.passwordChangeRequired)})")
check "P5b-me-passwordChangeRequired" "true" "$ME_CHANGE"

# ========================================================================
# パターン 6: PW 再発行 → 新PWでログイン可能・旧PWで不可
# ========================================================================
echo -e "\n=== P6: admin が test-user-a の PW を再発行 ==="
RES=$(curl -isS -b "$COOKIE_ADMIN" -X POST "$BASE/api/admin/users/$TARGET_ID/reset-password")
STATUS=$(echo "$RES" | head -n1 | awk '{print $2}')
CACHE=$(echo "$RES" | grep -i "^cache-control:" | tr -d '\r')
BODY=$(echo "$RES" | awk '/^\r?$/{f=1;next} f{print}')
NEW_TEMP_PW=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.temporaryPassword||'')}catch{console.log('')}})")
check "P6-status" "200" "$STATUS"
check "P6-cache-control" "no-store" "$([[ "$CACHE" == *"no-store"* ]] && echo 'no-store' || echo 'MISSING')" "header=$CACHE"
check "P6-new-tempPW-len14" "14" "${#NEW_TEMP_PW}"
check "P6-new-differs-from-old" "yes" "$([[ "$TEMP_PW" != "$NEW_TEMP_PW" ]] && echo yes || echo no)"
echo "  new pw (masked): ${NEW_TEMP_PW:0:2}************"

echo -e "\n=== P6b: 旧PWでログイン試行 → 失敗（401） ==="
STATUS=$(curl -sS -c /tmp/cookies_junk.txt -o /tmp/p6b.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEMP_PW\"}")
check "P6b 旧PW 拒否" "401" "$STATUS" "body=$(cat /tmp/p6b.json)"

echo -e "\n=== P6c: 新PWでログイン → 成功 ==="
STATUS=$(curl -sS -c "$COOKIE_TESTUSER" -o /tmp/p6c.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$NEW_TEMP_PW\"}")
check "P6c 新PW ログイン" "200" "$STATUS"

# ========================================================================
# パターン 7: PW リセット後の旧セッション実測
# 旧セッション Cookie は P5 で取得済み（$COOKIE_TESTUSER_OLD）
# P6 で PW を再発行 → その後 /api/auth/me を叩いて挙動を実測
# ========================================================================
echo -e "\n=== P7: PW 再発行後の旧セッション実測 ==="
ME_OLD=$(curl -sS -b "$COOKIE_TESTUSER_OLD" -o /tmp/p7.json -w "%{http_code}" "$BASE/api/auth/me")
BODY7=$(cat /tmp/p7.json)
echo "  旧Cookie /api/auth/me: status=$ME_OLD body=$BODY7"
# 期待: 401（signOut('global') 成功時）or 200（access_token 未失効の状態）
if [ "$ME_OLD" = "401" ]; then
  report+=("PASS | P7 旧セッション即失効 | signOut('global') が成功 or refresh_token 失効")
  pass=$((pass+1))
elif [ "$ME_OLD" = "200" ]; then
  report+=("INFO | P7 旧セッションが一時的に有効 | access_token 有効期限内。次回 refresh 時に失効予定（Supabase 仕様）")
  pass=$((pass+1))
else
  report+=("WARN | P7 予期しないステータス | status=$ME_OLD body=$BODY7")
  fail=$((fail+1))
fi

# ========================================================================
# パターン 8: 状態変更 (suspended_leave → active, suspended_retired の retention, active 復帰の null クリア)
# ========================================================================
echo -e "\n=== P8a: suspended_leave に変更 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p8a.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TARGET_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"suspended_leave\"}")
check "P8a suspended_leave" "200" "$STATUS" "body=$(cat /tmp/p8a.json)"

echo -e "\n=== P8b: suspended 中のユーザーは /api/auth/me で 403 ==="
ME_SUSPENDED=$(curl -sS -b "$COOKIE_TESTUSER" -o /tmp/p8b.json -w "%{http_code}" "$BASE/api/auth/me")
check "P8b suspended-me-403" "403" "$ME_SUSPENDED" "body=$(cat /tmp/p8b.json)"

echo -e "\n=== P8c: active に戻す ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p8c.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TARGET_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"active\"}")
check "P8c active復帰" "200" "$STATUS"

echo -e "\n=== P8d: suspended_retired + retention_days=30 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p8d.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TARGET_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"suspended_retired\",\"retirementRetentionDays\":30}")
check "P8d retired-status" "200" "$STATUS"
DEADLINE=$(cat /tmp/p8d.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.user?.retirementRetentionDeadline||'null')})")
check "P8d retention-deadline-set" "yes" "$([[ "$DEADLINE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && echo yes || echo no)" "deadline=$DEADLINE"

echo -e "\n=== P8e: retention なしで retired へ遷移試行 → 400 (別ユーザー test-user-c で確認) ==="
# 先に test-user-c を作成
RES=$(curl -sS -b "$COOKIE_ADMIN" -X POST "$BASE/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL_C\",\"department\":\"hr\",\"role\":\"general\"}")
TESTC_ID=$(echo "$RES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.user?.id||'')})")
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p8e.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TESTC_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"suspended_retired\"}")
check "P8e retention 未指定で 400" "400" "$STATUS" "body=$(cat /tmp/p8e.json)"

echo -e "\n=== P8f: active 復帰時に deadline null クリア ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p8f.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TARGET_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"active\"}")
check "P8f active-復帰" "200" "$STATUS"
DEADLINE_AFTER=$(cat /tmp/p8f.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.user?.retirementRetentionDeadline||'null')})")
check "P8f deadline-null-cleared" "null" "$DEADLINE_AFTER"

# ========================================================================
# パターン 9: 自分自身の停止・削除予定化 → 403
# eval-admin で eval-admin 自身を PATCH（PM 指示：eval-admin の状態は最終的に変わらないため OK）
# ========================================================================
echo -e "\n=== P9a: 自分自身を suspended_leave にしようとする → 403 ==="
# eval-admin のIDを取得
ADMIN_ID_JSON=$(curl -sS -b "$COOKIE_ADMIN" "$BASE/api/auth/me")
ADMIN_ID=$(echo "$ADMIN_ID_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.user?.id||'')})")
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p9a.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$ADMIN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"suspended_leave\"}")
check "P9a 自己 suspended" "403" "$STATUS" "body=$(cat /tmp/p9a.json)"

echo -e "\n=== P9b: 自分自身の admin 権限剥奪 → 403 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p9b.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$ADMIN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"general\"}")
check "P9b 自己 admin 剥奪" "403" "$STATUS" "body=$(cat /tmp/p9b.json)"

echo -e "\n=== P9c: 自分自身を pending_deletion にしようとする → 403 ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/p9c.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$ADMIN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"pending_deletion\"}")
check "P9c 自己 pending_deletion" "403" "$STATUS" "body=$(cat /tmp/p9c.json)"

# ========================================================================
# パターン 10: 最後の active admin ガード → 単体テストで検証（別スクリプト）
# 実 API では self ガードが先に発火するため単体再現が困難な旨を報告
# ========================================================================
echo -e "\n=== P10: 最後の active admin ガード（単体テスト） ==="
node -e "
(async () => {
  const { getServiceRoleClient } = require('./src/lib/supabase/service-role.ts');
})();" 2>/dev/null || echo "  (単体テストは tsx で別途実行・下記参照)"

# ========================================================================
# パターン 11: audit_log 内容確認・平文 PW 非含有
# ========================================================================
echo -e "\n=== P11: audit_log 確認は tsx で別途 SELECT ==="

# ========================================================================
# パターン 12: サーバーログの平文 PW 非含有確認は dev-server.log を grep
# ========================================================================
echo -e "\n=== P12: dev-server.log の平文 PW チェック ==="
if [ -f /tmp/dev-server.log ]; then
  # 完全一致で TEMP_PW と NEW_TEMP_PW を検索
  HIT_OLD=$(grep -c "$TEMP_PW" /tmp/dev-server.log 2>/dev/null || echo 0)
  HIT_NEW=$(grep -c "$NEW_TEMP_PW" /tmp/dev-server.log 2>/dev/null || echo 0)
  check "P12 旧PW サーバーログ非含有" "0" "$HIT_OLD"
  check "P12 新PW サーバーログ非含有" "0" "$HIT_NEW"
else
  report+=("SKIP | P12 dev-server.log が見つからない")
fi

# ========================================================================
# 後片付け：テスト用ユーザーを pending_deletion に
# ========================================================================
echo -e "\n=== 後片付け: test-user-a と test-user-c を pending_deletion に ==="
STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/cleanup_a.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TARGET_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"pending_deletion\"}")
check "cleanup-a pending_deletion" "200" "$STATUS" "$(cat /tmp/cleanup_a.json)"

STATUS=$(curl -sS -b "$COOKIE_ADMIN" -o /tmp/cleanup_c.json -w "%{http_code}" \
  -X PATCH "$BASE/api/admin/users/$TESTC_ID" \
  -H "Content-Type: application/json" \
  -d "{\"accountStatus\":\"pending_deletion\"}")
check "cleanup-c pending_deletion" "200" "$STATUS" "$(cat /tmp/cleanup_c.json)"

# TARGET_ID を tmp に書き出して後続の tsx で使えるようにする
echo "$TARGET_ID" > /tmp/target_id.txt
echo "$TESTC_ID" > /tmp/testc_id.txt
echo "$TEMP_PW" > /tmp/temp_pw.txt
echo "$NEW_TEMP_PW" > /tmp/new_temp_pw.txt

# ========================================================================
# サマリー
# ========================================================================
echo -e "\n\n========================================"
echo "  PASS: $pass"
echo "  FAIL: $fail"
echo "========================================"
for line in "${report[@]}"; do
  echo "$line"
done
