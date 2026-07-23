#!/usr/bin/env bash
# Asserts the sandbox's network boundary actually holds. Run inside the container (`bun run
# dc:verify` from the host runs it there). Unlike the self-checks inside init-firewall.sh, this
# probes real connectivity from an unprivileged shell, so it catches a policy that applied cleanly
# but doesn't do what it claims.
#
# Blocked checks assert HOW the connection failed, not merely THAT it failed. "Could not connect" is
# worthless here: nothing listens on the metadata address, on the gateway's ports, or on redis:22, so
# a plain connection failure reports success even with every REJECT rule deleted. The private-range
# rules reject with icmp-admin-prohibited, which surfaces as EHOSTUNREACH (113); an absent listener
# behind no rule gives ECONNREFUSED (111) or a timeout instead. Keying on 113 is what makes these
# checks capable of failing.
set -uo pipefail

REJECTED_ERRNO=113   # EHOSTUNREACH, i.e. our icmp-admin-prohibited REJECT

fails=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; fails=$((fails + 1)); }

# Report how a TCP connect ended: CONNECTED, TIMEOUT, or "errno=<n>". python3 is already in the image
# (node-gyp's toolchain) and is the only thing here that can surface the errno bash's /dev/tcp hides.
probe() {
  python3 - "$1" "$2" <<'PY' 2>/dev/null || echo "PROBE_ERROR"
import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
s = socket.socket()
s.settimeout(4)
try:
    s.connect((host, port))
    print("CONNECTED")
except socket.timeout:
    print("TIMEOUT")
except OSError as e:
    print(f"errno={e.errno}")
finally:
    s.close()
PY
}

# Assert a destination is blocked BY THE FIREWALL, not merely unreachable.
assert_rejected() {
  local label="$1" host="$2" port="$3" result
  result="$(probe "$host" "$port")"
  case "$result" in
    "errno=${REJECTED_ERRNO}") pass "${label} rejected by the firewall (errno ${REJECTED_ERRNO})" ;;
    CONNECTED) fail "${label} is REACHABLE — the firewall is not blocking it" ;;
    TIMEOUT) fail "${label} timed out rather than being rejected — no REJECT rule is matching it" ;;
    *) fail "${label} failed as ${result}, not errno ${REJECTED_ERRNO} — not a firewall rejection" ;;
  esac
}

assert_reachable() {
  local label="$1" host="$2" port="$3" result
  result="$(probe "$host" "$port")"
  if [ "$result" = "CONNECTED" ]; then
    pass "${label} reachable"
  else
    fail "${label} unreachable (${result})"
  fi
}

echo "[verify] public egress is allowed"
if curl --connect-timeout 8 -sS -o /dev/null -w '%{http_code}' https://example.com 2>/dev/null | grep -q '^2'; then
  pass "https://example.com reachable"
else
  fail "https://example.com unreachable — the agent needs public web access"
fi

echo "[verify] cloud metadata is blocked"
assert_rejected "169.254.169.254:80" 169.254.169.254 80

echo "[verify] the bridge gateway (a host interface on Linux) is blocked"
gateway="$(ip route 2>/dev/null | awk '/^default/ {print $3; exit}')"
if [ -z "${gateway}" ]; then
  fail "could not determine the default gateway"
else
  assert_rejected "gateway ${gateway}:22" "${gateway}" 22
fi

echo "[verify] the redis sibling is reachable on its queue port"
assert_reachable "redis:6379" redis 6379

echo "[verify] redis is reachable ONLY on its queue port"
assert_rejected "redis:22" redis 22

if [ "${fails}" -ne 0 ]; then
  echo "[verify] FAILED: ${fails} check(s)" >&2
  exit 1
fi
echo "[verify] OK: all network boundary checks passed."
