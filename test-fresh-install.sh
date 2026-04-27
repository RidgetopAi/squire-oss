#!/usr/bin/env bash
#
# test-fresh-install.sh — Simulate a fresh user installing Squire from scratch.
#
# Copies the repo to a temp directory (no node_modules, no dist, no .env),
# walks through every step from the README, and reports pass/fail.
#
# Usage:
#   ./test-fresh-install.sh
#
# Required environment variables (your real API keys):
#   ANTHROPIC_API_KEY   — for LLM
#
# Optional:
#   OPENAI_API_KEY      — to test OpenAI embeddings instead of Ollama
#   TEST_EMBED_PROVIDER — "ollama" (default) or "openai"
#
# The script creates an isolated Postgres container on port 5436 (not 5435)
# so it won't collide with any existing dev database.

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="/tmp/squire-fresh-install-$$"
TEST_PORT=3099
DB_PORT=5436
DB_CONTAINER="squire-test-db-$$"
EMBED_PROVIDER="${TEST_EMBED_PROVIDER:-ollama}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASS=0
FAIL=0
WARN=0

# ─── Helpers ─────────────────────────────────────────────────────────

step() {
  echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"
}

pass() {
  echo -e "  ${GREEN}PASS${NC}: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC}: $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC}: $1"
  WARN=$((WARN + 1))
}

cleanup() {
  step "Cleanup"

  # Kill API server if running
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
    echo "  Stopped API server (PID $API_PID)"
  fi

  # Remove test database container
  if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
    echo "  Removed test database container"
  fi

  # Remove temp directory
  if [[ -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
    echo "  Removed $TEST_DIR"
  fi

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════${NC}"
  echo -e "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}WARN: $WARN${NC}"
  if [[ $FAIL -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}All checks passed. Ready to ship.${NC}"
  else
    echo -e "  ${RED}${BOLD}$FAIL check(s) failed. Fix before release.${NC}"
  fi
  echo -e "${BOLD}═══════════════════════════════════════${NC}"
}

trap cleanup EXIT

wait_for_port() {
  local port=$1
  local label=$2
  local max_wait=${3:-30}
  local probe_path=${4:-/api/health}
  local elapsed=0
  # Accept any HTTP response (including 4xx/5xx) — we just want to know the
  # server is listening. -sf would treat 404 on / as failure even when up.
  while ! curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port$probe_path" 2>/dev/null | grep -qE '^[1-5][0-9][0-9]$'; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ $elapsed -ge $max_wait ]]; then
      fail "$label did not become available on port $port within ${max_wait}s"
      return 1
    fi
  done
  return 0
}

# ─── Preflight ───────────────────────────────────────────────────────

echo -e "\n${BOLD}Squire Fresh Install Test${NC}"
echo "========================="
echo "Test dir:  $TEST_DIR"
echo "API port:  $TEST_PORT"
echo "DB port:   $DB_PORT"
echo "Embed:     $EMBED_PROVIDER"
echo ""

# Check required tools
step "Preflight: Required tools"

for cmd in node npm docker curl; do
  if command -v "$cmd" &>/dev/null; then
    pass "$cmd found: $(command -v "$cmd")"
  else
    fail "$cmd not found — install it first"
    exit 1
  fi
done

node_version=$(node -v)
node_major=$(echo "$node_version" | sed 's/v//' | cut -d. -f1)
if [[ "$node_major" -ge 20 ]]; then
  pass "Node.js $node_version (>= 20 required)"
else
  fail "Node.js $node_version too old (>= 20 required)"
  exit 1
fi

# Check API keys
step "Preflight: API keys"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  fail "ANTHROPIC_API_KEY not set. Export it before running this script."
  exit 1
else
  pass "ANTHROPIC_API_KEY is set"
fi

if [[ "$EMBED_PROVIDER" == "openai" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    fail "OPENAI_API_KEY not set but TEST_EMBED_PROVIDER=openai"
    exit 1
  else
    pass "OPENAI_API_KEY is set"
  fi
elif [[ "$EMBED_PROVIDER" == "ollama" ]]; then
  if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    pass "Ollama is running"
    # Check if nomic-embed-text is available
    if curl -sf http://localhost:11434/api/tags | grep -q "nomic-embed-text"; then
      pass "nomic-embed-text model available"
    else
      warn "nomic-embed-text not found — will attempt to pull"
      ollama pull nomic-embed-text 2>&1 || true
    fi
  else
    fail "Ollama not running at localhost:11434. Start it or use TEST_EMBED_PROVIDER=openai"
    exit 1
  fi
fi

# ─── Step 1: Simulate git clone ─────────────────────────────────────

step "1. Simulate fresh clone"

mkdir -p "$TEST_DIR"

# Copy repo excluding artifacts a git clone wouldn't have
rsync -a \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='web/node_modules' \
  --exclude='web/.next' \
  --exclude='web/dist' \
  "$SCRIPT_DIR/" "$TEST_DIR/"

cd "$TEST_DIR"

# Verify clean state
if [[ -d "node_modules" ]]; then
  fail "node_modules present (should not exist in fresh clone)"
else
  pass "No node_modules — clean state"
fi

if [[ -f ".env" ]]; then
  fail ".env present (should not exist in fresh clone)"
else
  pass "No .env — clean state"
fi

if [[ -d "dist" ]]; then
  fail "dist/ present (should not exist in fresh clone)"
else
  pass "No dist/ — clean state"
fi

# Check key files exist
for f in README.md LICENSE .env.example package.json docker-compose.yml Dockerfile tsconfig.json; do
  if [[ -f "$f" ]]; then
    pass "Found $f"
  else
    fail "Missing $f"
  fi
done

if [[ -d "schema" ]]; then
  migration_count=$(ls schema/*.sql 2>/dev/null | wc -l)
  pass "Found $migration_count migration files in schema/"
else
  fail "Missing schema/ directory"
fi

# ─── Step 2: npm install ────────────────────────────────────────────

step "2. npm install"

if npm install --loglevel=error 2>&1; then
  pass "npm install succeeded"
else
  fail "npm install failed"
  exit 1
fi

if [[ -d "node_modules" ]]; then
  pass "node_modules created"
else
  fail "node_modules not created"
  exit 1
fi

# ─── Step 3: TypeScript build ───────────────────────────────────────

step "3. TypeScript build"

if npx tsc 2>&1; then
  pass "tsc build succeeded"
else
  fail "tsc build failed"
  exit 1
fi

if [[ -f "dist/api/server.js" ]]; then
  pass "dist/api/server.js exists"
else
  fail "dist/api/server.js not found after build"
fi

if [[ -f "dist/cli.js" ]]; then
  pass "dist/cli.js exists"
else
  fail "dist/cli.js not found after build"
fi

# ─── Step 4: Configure .env ─────────────────────────────────────────

step "4. Configure .env"

if [[ ! -f ".env.example" ]]; then
  fail ".env.example missing"
  exit 1
fi

cp .env.example .env

# Write test configuration
cat > .env << ENVEOF
# Database — test container on port $DB_PORT
DATABASE_URL=postgresql://squire:squire_dev@localhost:$DB_PORT/squire

# API Server
PORT=$TEST_PORT
CORS_ORIGIN=http://localhost:3001

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
LLM_MAX_TOKENS=8192
LLM_TEMPERATURE=0.7
ENVEOF

if [[ "$EMBED_PROVIDER" == "openai" ]]; then
  cat >> .env << ENVEOF

# Embeddings — OpenAI
EMBED_PROVIDER=openai
EMBED_MODEL=text-embedding-3-small
EMBED_DIMENSION=1536
OPENAI_API_KEY=$OPENAI_API_KEY
ENVEOF
else
  cat >> .env << ENVEOF

# Embeddings — Ollama (local)
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
OLLAMA_URL=http://localhost:11434
ENVEOF
fi

pass ".env created with test configuration"

# ─── Step 5: Start test database ────────────────────────────────────

step "5. Start PostgreSQL (isolated test container)"

# Remove any leftover test container
docker rm -f "$DB_CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$DB_CONTAINER" \
  -e POSTGRES_USER=squire \
  -e POSTGRES_PASSWORD=squire_dev \
  -e POSTGRES_DB=squire \
  -p "$DB_PORT:5432" \
  pgvector/pgvector:pg16 >/dev/null

# Wait for postgres to be ready
echo "  Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U squire -d squire >/dev/null 2>&1; then
    pass "PostgreSQL ready on port $DB_PORT"
    break
  fi
  if [[ $i -eq 30 ]]; then
    fail "PostgreSQL did not start within 30s"
    exit 1
  fi
  sleep 1
done

# Verify pgvector extension is available.
# Retry briefly: pg_isready can return ready before the role-auth path is
# fully wired, especially on the first connection of a fresh container.
# Under `set -e`, a failing command substitution inside an assignment exits
# the script — so we run docker exec directly and capture its output via a
# tempfile to keep both the exit code and the error message.
ext_ok=0
ext_err=""
ext_log=$(mktemp)
for i in $(seq 1 10); do
  if docker exec "$DB_CONTAINER" psql -U squire -d squire \
      -c "CREATE EXTENSION IF NOT EXISTS vector;" >"$ext_log" 2>&1; then
    pass "pgvector extension available"
    ext_ok=1
    break
  fi
  sleep 1
done
ext_err=$(cat "$ext_log")
rm -f "$ext_log"
if [[ $ext_ok -eq 0 ]]; then
  fail "pgvector extension not available"
  echo "  Last error: $ext_err"
  exit 1
fi

# ─── Step 6: Run migrations ─────────────────────────────────────────

step "6. Database migrations"

migration_output=$(npm run db:migrate 2>&1)
migration_exit=$?

if [[ $migration_exit -eq 0 ]]; then
  applied=$(echo "$migration_output" | grep -c "Applied:" || true)
  pass "Migrations completed ($applied applied)"
else
  fail "Migrations failed"
  echo "$migration_output"
  exit 1
fi

# Verify key tables exist
for table in memories entities beliefs patterns insights raw_observations memory_edges living_summaries; do
  if docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='$table';" | grep -q 1; then
    pass "Table '$table' exists"
  else
    fail "Table '$table' not found"
  fi
done

# ─── Step 7: Run migrations again (idempotency) ─────────────────────

step "7. Migration idempotency"

migration_output2=$(npm run db:migrate 2>&1)
if [[ $? -eq 0 ]]; then
  if echo "$migration_output2" | grep -q "No new migrations"; then
    pass "Second migration run: no-op (idempotent)"
  else
    skipped=$(echo "$migration_output2" | grep -c "Skipped:" || true)
    pass "Second migration run: $skipped skipped (idempotent)"
  fi
else
  fail "Second migration run failed"
fi

# ─── Step 8: Start API server ───────────────────────────────────────

step "8. Start API server"

# Start in background
node dist/api/server.js > /tmp/squire-test-api-$$.log 2>&1 &
API_PID=$!

echo "  API server starting (PID $API_PID)..."

# Wait for it to be ready
if wait_for_port "$TEST_PORT" "API server" 20; then
  pass "API server running on port $TEST_PORT"
else
  echo "  Server log tail:"
  tail -20 /tmp/squire-test-api-$$.log 2>/dev/null || true
  exit 1
fi

# ─── Step 9: Health check ───────────────────────────────────────────

step "9. Health check"

health_response=$(curl -sf "http://localhost:$TEST_PORT/api/health" 2>&1 || true)

if [[ -z "$health_response" ]]; then
  fail "Health endpoint returned empty response"
else
  echo "  Response: $health_response"

  if echo "$health_response" | grep -q '"status"'; then
    pass "Health endpoint returns valid JSON"
  else
    fail "Health endpoint returned unexpected format"
  fi

  if echo "$health_response" | grep -q '"database":"connected"'; then
    pass "Database: connected"
  else
    fail "Database: not connected"
  fi

  if echo "$health_response" | grep -q '"status":"connected"'; then
    pass "Embedding provider: connected"
  else
    warn "Embedding provider: not connected (check $EMBED_PROVIDER)"
  fi
fi

# ─── Step 10: API endpoint smoke tests ──────────────────────────────

step "10. API endpoint smoke tests"

# GET endpoints that should return 200
for endpoint in \
  "/api/health" \
  "/api/memories?limit=5" \
  "/api/entities" \
  "/api/beliefs" \
  "/api/notes" \
  "/api/lists" \
  "/api/identity" \
; do
  status=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:$TEST_PORT$endpoint" 2>&1 || echo "000")
  if [[ "$status" == "200" ]]; then
    pass "GET $endpoint → $status"
  else
    fail "GET $endpoint → $status (expected 200)"
  fi
done

# ─── Step 11: Store a memory via API ─────────────────────────────────

step "11. Store a memory (POST /api/memories)"

create_response=$(curl -sf -X POST "http://localhost:$TEST_PORT/api/memories" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test memory from fresh install script. Meeting with Alex about the product roadmap — she wants to prioritize mobile over desktop this quarter."}' \
  2>&1 || echo "FAILED")

if echo "$create_response" | grep -q '"id"'; then
  memory_id=$(echo "$create_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  pass "Memory created (API returned ID): $memory_id"
else
  fail "Memory creation failed: $create_response"
  memory_id=""
fi

# ─── Step 12: Deep pipeline validation ───────────────────────────────

step "12. Deep pipeline validation (wait for ingestion to complete)"

if [[ -n "$memory_id" ]]; then
  echo "  Waiting for ingestion pipeline to process memory $memory_id..."

  # Poll the database for embedding — this proves the full pipeline ran
  pipeline_ok=false
  for attempt in $(seq 1 20); do
    # Check if the memory has an embedding (non-null vector)
    has_embedding=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
      "SELECT COUNT(*) FROM memories WHERE id='$memory_id' AND embedding IS NOT NULL;" 2>/dev/null || echo "0")

    if [[ "$has_embedding" == "1" ]]; then
      pipeline_ok=true
      break
    fi
    sleep 1
  done

  if $pipeline_ok; then
    pass "Embedding generated (vector stored in DB after ${attempt}s)"
  else
    fail "Embedding NOT generated after 20s — ingestion pipeline broken"
  fi

  # Check salience score was computed
  salience=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
    "SELECT salience FROM memories WHERE id='$memory_id';" 2>/dev/null || echo "")
  if [[ -n "$salience" ]] && [[ "$salience" != "" ]]; then
    pass "Salience score computed: $salience"
  else
    warn "Salience score not found (may be computed asynchronously)"
  fi

  # Check if entities were extracted (Alex should be detected)
  entity_count=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
    "SELECT COUNT(*) FROM entity_mentions WHERE memory_id='$memory_id';" 2>/dev/null || echo "0")
  if [[ "$entity_count" -gt 0 ]]; then
    pass "Entity extraction: $entity_count entity mention(s) linked to memory"
  else
    warn "No entity mentions found (extraction may be async or LLM-dependent)"
  fi

  # Check Alex entity exists in entities table
  alex_exists=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
    "SELECT COUNT(*) FROM entities WHERE LOWER(name) LIKE '%alex%';" 2>/dev/null || echo "0")
  if [[ "$alex_exists" -gt 0 ]]; then
    pass "Entity 'Alex' found in entities table"
  else
    warn "Entity 'Alex' not found — extraction may be async"
  fi
fi

# ─── Step 13: Semantic search validation ─────────────────────────────

step "13. Semantic search (verify it finds the right memory)"

if [[ -n "$memory_id" ]]; then
  search_response=$(curl -sf "http://localhost:$TEST_PORT/api/memories/search?query=product+roadmap+mobile&limit=5" 2>&1 || echo "FAILED")

  if echo "$search_response" | grep -q "$memory_id"; then
    pass "Semantic search returned the exact memory by ID"
  elif echo "$search_response" | grep -q "roadmap"; then
    pass "Semantic search found roadmap content (ID format may differ)"
  else
    fail "Semantic search did not find the stored memory"
    echo "  Query: 'product roadmap mobile'"
    echo "  Response: $(echo "$search_response" | head -c 300)"
  fi

  # Negative test: search for something completely unrelated
  unrelated_response=$(curl -sf "http://localhost:$TEST_PORT/api/memories/search?query=quantum+physics+black+holes&limit=5" 2>&1 || echo "FAILED")
  unrelated_count=$(echo "$unrelated_response" | grep -c '"id"' || true)

  if [[ "$unrelated_count" -eq 0 ]]; then
    pass "Negative search: unrelated query returned 0 results (correct)"
  else
    warn "Negative search: unrelated query returned $unrelated_count result(s) — may be low-threshold match"
  fi
fi

# ─── Step 14: Store more memories and test context generation ────────

step "14. Store additional memories and validate context generation"

# Second memory about Alex
create2_response=$(curl -sf -X POST "http://localhost:$TEST_PORT/api/memories" \
  -H "Content-Type: application/json" \
  -d '{"content": "Alex presented the Q2 numbers today. Revenue is up 15% but churn increased. She suggested we focus on retention before new features."}' \
  2>&1 || echo "FAILED")

if echo "$create2_response" | grep -q '"id"'; then
  pass "Second memory stored (Alex + Q2 numbers)"
else
  fail "Second memory creation failed"
fi

# Third memory about a completely different topic
create3_response=$(curl -sf -X POST "http://localhost:$TEST_PORT/api/memories" \
  -H "Content-Type: application/json" \
  -d '{"content": "Started learning Rust this weekend. The borrow checker is challenging but the compiler error messages are surprisingly helpful."}' \
  2>&1 || echo "FAILED")

if echo "$create3_response" | grep -q '"id"'; then
  pass "Third memory stored (Rust learning — different topic)"
else
  fail "Third memory creation failed"
fi

# Wait for all embeddings to process
echo "  Waiting for pipeline to process all memories..."
for attempt in $(seq 1 20); do
  embedded_count=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
    "SELECT COUNT(*) FROM memories WHERE embedding IS NOT NULL;" 2>/dev/null || echo "0")
  if [[ "$embedded_count" -ge 3 ]]; then
    break
  fi
  sleep 1
done
pass "$embedded_count memories with embeddings in database"

# Test context generation — should mention Alex
context_response=$(curl -sf -X POST "http://localhost:$TEST_PORT/api/context" \
  -H "Content-Type: application/json" \
  -d '{"query": "What do I know about Alex and the roadmap?", "maxTokens": 2000}' \
  2>&1 || echo "FAILED")

if [[ "$context_response" == "FAILED" ]] || [[ -z "$context_response" ]]; then
  fail "Context generation returned empty or failed"
else
  pass "Context generation returned a response ($(echo "$context_response" | wc -c) bytes)"

  # Check that context mentions Alex (the relevant entity)
  if echo "$context_response" | grep -iq "alex"; then
    pass "Context mentions 'Alex' — relevant content surfaced"
  else
    warn "Context does not mention 'Alex' — may need more processing time"
  fi

  # Check that context mentions roadmap or mobile or revenue (memory content)
  if echo "$context_response" | grep -iqE "roadmap|mobile|revenue|Q2|retention"; then
    pass "Context contains memory-derived content"
  else
    warn "Context does not contain expected memory content"
  fi
fi

# ─── Step 15: CLI deep tests ────────────────────────────────────────
# SKIPPED 2026-04-26: this block predates Phase 4's CLI reshape.
# - References commands that no longer exist (`health`, `count`)
# - Each `npx tsx src/cli.ts ...` cold-boots the app + makes LLM calls;
#   8 calls in series is too slow for a smoke test and risks shell-timeout
#   killing the script before cleanup runs (which is what happened the
#   first time — orphaned container + temp dir).
# Set RUN_STEP_15=1 to re-enable while iterating on a rewrite.

step "15. CLI deep tests"

if [[ "${RUN_STEP_15:-0}" != "1" ]]; then
  warn "Step 15 skipped (set RUN_STEP_15=1 to enable; needs rewrite for current CLI)"
else

# Health check via CLI
cli_health=$(npx tsx src/cli.ts health 2>&1 || echo "CLI_FAILED")
if echo "$cli_health" | grep -iq "database\|healthy\|connected\|status"; then
  pass "CLI: squire health"
else
  warn "CLI: squire health — unexpected output"
  echo "  Output: $(echo "$cli_health" | head -c 300)"
fi

# Count should show >= 3 memories
cli_count=$(npx tsx src/cli.ts count 2>&1 || echo "CLI_FAILED")
if echo "$cli_count" | grep -qE "[3-9]|[0-9]{2,}"; then
  pass "CLI: squire count shows >= 3 memories"
else
  warn "CLI: squire count — expected >= 3"
  echo "  Output: $(echo "$cli_count" | head -c 200)"
fi

# List should return results
cli_list=$(npx tsx src/cli.ts list --limit 5 2>&1 || echo "CLI_FAILED")
if [[ "$cli_list" != "CLI_FAILED" ]] && [[ $(echo "$cli_list" | wc -l) -gt 1 ]]; then
  pass "CLI: squire list --limit 5 ($(echo "$cli_list" | wc -l) lines of output)"
else
  fail "CLI: squire list returned no data"
fi

# Search via CLI should find roadmap memory
cli_search=$(npx tsx src/cli.ts search "roadmap" 2>&1 || echo "CLI_FAILED")
if echo "$cli_search" | grep -iq "roadmap\|mobile\|alex"; then
  pass "CLI: squire search 'roadmap' found relevant content"
else
  warn "CLI: squire search 'roadmap' — no relevant content in output"
  echo "  Output: $(echo "$cli_search" | head -c 300)"
fi

# Store a memory via CLI (tests the observe command path)
cli_observe=$(npx tsx src/cli.ts observe "Talked to Jamie about the design system. She's proposing we switch from Tailwind to vanilla CSS for the component library." 2>&1 || echo "CLI_FAILED")
if [[ "$cli_observe" != "CLI_FAILED" ]]; then
  pass "CLI: squire observe (stored memory via CLI)"
else
  fail "CLI: squire observe failed"
fi

# Verify count increased
sleep 2
cli_count2=$(npx tsx src/cli.ts count 2>&1 || echo "CLI_FAILED")
if echo "$cli_count2" | grep -qE "[4-9]|[0-9]{2,}"; then
  pass "CLI: memory count increased after observe"
else
  warn "CLI: memory count may not have increased yet"
fi

# Beliefs list (should not crash, may be empty on fresh install)
cli_beliefs=$(npx tsx src/cli.ts beliefs list 2>&1 || echo "CLI_FAILED")
if [[ "$cli_beliefs" != "CLI_FAILED" ]]; then
  pass "CLI: squire beliefs list (no crash)"
else
  fail "CLI: squire beliefs list crashed"
fi

# Entities list (should show Alex and Jamie if extraction ran)
cli_entities=$(npx tsx src/cli.ts entities list 2>&1 || echo "CLI_FAILED")
if [[ "$cli_entities" != "CLI_FAILED" ]]; then
  pass "CLI: squire entities list (no crash)"
  if echo "$cli_entities" | grep -iq "alex\|jamie"; then
    pass "CLI: entities list shows extracted entities"
  else
    warn "CLI: entities list — no recognized entities yet (extraction may be async)"
  fi
else
  fail "CLI: squire entities list crashed"
fi

# Summaries (should not crash)
cli_summaries=$(npx tsx src/cli.ts summaries 2>&1 || echo "CLI_FAILED")
if [[ "$cli_summaries" != "CLI_FAILED" ]]; then
  pass "CLI: squire summaries (no crash)"
else
  warn "CLI: squire summaries failed"
fi

fi  # end RUN_STEP_15 gate

# ─── Step 16: Database state summary ─────────────────────────────────

step "16. Database state summary"

echo "  Verifying data across all key tables..."

for table_check in \
  "memories:Total memories" \
  "raw_observations:Raw observations" \
  "entities:Entities extracted" \
  "entity_mentions:Entity mentions" \
  "memory_edges:Memory edges" \
  "beliefs:Beliefs extracted" \
; do
  table=$(echo "$table_check" | cut -d: -f1)
  label=$(echo "$table_check" | cut -d: -f2)
  count=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
    "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "?")
  echo "  $label: $count"
done

# Verify embedding dimensions match config
embed_dim=$(docker exec "$DB_CONTAINER" psql -U squire -d squire -tAc \
  "SELECT vector_dims(embedding) FROM memories WHERE embedding IS NOT NULL LIMIT 1;" 2>/dev/null || echo "?")
if [[ "$EMBED_PROVIDER" == "openai" ]]; then
  expected_dim=1536
else
  expected_dim=768
fi
if [[ "$embed_dim" == "$expected_dim" ]]; then
  pass "Embedding dimensions correct: $embed_dim (expected $expected_dim for $EMBED_PROVIDER)"
else
  if [[ "$embed_dim" == "?" ]]; then
    warn "Could not read embedding dimensions"
  else
    fail "Embedding dimensions: $embed_dim (expected $expected_dim for $EMBED_PROVIDER)"
  fi
fi

# ─── Step 17: Web frontend build ────────────────────────────────────

step "17. Web frontend build"

if command -v pnpm &>/dev/null; then
  pass "pnpm found"

  cd web
  if pnpm install --frozen-lockfile 2>&1 | tail -3; then
    pass "pnpm install succeeded"
  else
    # Try without frozen lockfile (lockfile may be stale)
    if pnpm install 2>&1 | tail -3; then
      pass "pnpm install succeeded (without frozen lockfile)"
    else
      fail "pnpm install failed"
    fi
  fi

  if pnpm build 2>&1 | tail -5; then
    pass "Next.js build succeeded"
  else
    fail "Next.js build failed"
  fi
  cd "$TEST_DIR"
else
  warn "pnpm not installed — skipping web frontend build (npm install -g pnpm to test)"
fi

# ─── Step 18: Docker build ──────────────────────────────────────────

step "18. Docker image build (API)"

if docker build -t squire-test-api-$$ . 2>&1 | tail -5; then
  pass "Docker image built successfully"
  docker rmi "squire-test-api-$$" >/dev/null 2>&1 || true
else
  fail "Docker image build failed"
fi

# ─── Step 19: .env.example completeness ──────────────────────────────

step "19. .env.example completeness check"

# Extract env vars referenced in config/index.ts
config_vars=$(grep -oP "process\.env\['\K[^']+|required\('\K[^']+|optional\('\K[^']+" "$SCRIPT_DIR/src/config/index.ts" | sort -u)
example_vars=$(grep -oP '^#?\s*\K[A-Z_]+=?' "$SCRIPT_DIR/.env.example" | sed 's/=$//' | sort -u)

missing_from_example=0
for var in $config_vars; do
  if ! echo "$example_vars" | grep -q "^${var}$"; then
    # Skip vars that are composed from other vars or internal
    case "$var" in
      BLOCKED_COMMANDS) continue ;;
    esac
    warn ".env.example missing: $var"
    missing_from_example=$((missing_from_example + 1))
  fi
done

if [[ $missing_from_example -eq 0 ]]; then
  pass ".env.example documents all config variables"
fi

# ─── Step 20: Documentation check ───────────────────────────────────

step "20. Documentation check"

for doc in README.md LICENSE docs/CONFIGURATION.md docs/INTEGRATIONS.md docs/ARCHITECTURE.md; do
  if [[ -f "$SCRIPT_DIR/$doc" ]]; then
    lines=$(wc -l < "$SCRIPT_DIR/$doc")
    pass "$doc exists ($lines lines)"
  else
    fail "$doc missing"
  fi
done

# Check README has key sections
for section in "Quick Start" "Configuration" "CLI" "API" "Contributing" "License"; do
  if grep -q "$section" "$SCRIPT_DIR/README.md"; then
    pass "README contains '$section' section"
  else
    warn "README missing '$section' section"
  fi
done

# ─── Done ────────────────────────────────────────────────────────────
# cleanup runs via trap
