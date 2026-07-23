#!/usr/bin/env bash
# Asserts the sandbox's network boundary actually holds. Run inside the container (`bun run
# dc:verify` from the host runs it there). Unlike the self-checks inside init-firewall.sh, this
# probes real connectivity from an unprivileged shell, so it catches a policy that applied cleanly
# but doesn't do what it claims.
set -uo pipefail

fails=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; fails=$((fails + 1)); }

echo "[verify] public egress is allowed"
if curl --connect-timeout 8 -sS -o /dev/null -w '%{http_code}' https://example.com 2>/dev/null | grep -q '^2'; then
  pass "https://example.com reachable"
else
  fail "https://example.com unreachable — the agent needs public web access"
fi

echo "[verify] cloud metadata is blocked"
if curl --connect-timeout 5 -sS -o /dev/null http://169.254.169.254/ 2>/dev/null; then
  fail "169.254.169.254 reachable — metadata endpoint is exposed"
else
  pass "169.254.169.254 blocked"
fi

echo "[verify] the bridge gateway (a host interface on Linux) is blocked"
gateway="$(ip route 2>/dev/null | awk '/^default/ {print $3; exit}')"
if [ -z "${gateway}" ]; then
  fail "could not determine the default gateway"
elif timeout 5 bash -c ":> /dev/tcp/${gateway}/22" 2>/dev/null \
  || timeout 5 bash -c ":> /dev/tcp/${gateway}/80" 2>/dev/null; then
  fail "gateway ${gateway} reachable — the host is exposed"
else
  pass "gateway ${gateway} blocked"
fi

echo "[verify] the redis sibling is reachable"
if timeout 5 bash -c ':> /dev/tcp/redis/6379' 2>/dev/null; then
  pass "redis:6379 reachable"
else
  fail "redis:6379 unreachable — the worker cannot run"
fi

echo "[verify] redis is reachable only on its queue port"
if timeout 3 bash -c ':> /dev/tcp/redis/22' 2>/dev/null; then
  fail "redis:22 reachable — the carve-out is wider than the queue port"
else
  pass "redis:22 blocked"
fi

if [ "${fails}" -ne 0 ]; then
  echo "[verify] FAILED: ${fails} check(s)" >&2
  exit 1
fi
echo "[verify] OK: all network boundary checks passed."
