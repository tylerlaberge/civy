#!/usr/bin/env bash
# Network policy: default-ALLOW public egress, BLOCK private/internal ranges so a hijacked agent
# can't reach the host, LAN, or cloud metadata (169.254.169.254) — but with ONE carve-out kino
# lacks: the compose network, so the sandbox can still reach the `redis` sibling. Public egress
# stays open by design (Claude needs docs, npm/registry, GitHub, the ingestion APIs). REJECT (not
# DROP) so blocked attempts fail fast. Runs as root on every start via scoped sudo; can't be
# disabled from inside.
set -euo pipefail
IFS=$'\n\t'

# Private / internal IPv4 ranges to block outbound. The compose-network carve-out below is inserted
# BEFORE these REJECTs, so the container's own subnet (which lives inside 172.16.0.0/12) stays
# reachable while the rest of that range — and every other private range — is blocked.
PRIVATE4=(
  "10.0.0.0/8"
  "172.16.0.0/12"     # includes the Docker bridge / sibling containers
  "192.168.0.0/16"
  "169.254.0.0/16"    # link-local, incl. cloud metadata 169.254.169.254
  "100.64.0.0/10"     # carrier-grade NAT
)

# Private / link-local IPv6 ranges. fc00::/7 already covers unique-local (incl. AWS's
# fd00:ec2::254 metadata address), so it needs no entry of its own.
PRIVATE6=(
  "fc00::/7"          # unique local addresses
  "fe80::/10"         # link-local
)

echo "[firewall] resetting rules..."
iptables -F
iptables -X
iptables -P INPUT ACCEPT      # inbound is host/IDE/port-forward; not the threat
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT      # public internet allowed by default

# Scope note: INPUT ACCEPT above plus the ESTABLISHED rule below means the private-range blocks only
# stop connections the container INITIATES. A private-range peer that dials in (e.g. a sibling
# container on the same bridge) still gets a bidirectional channel, because our replies match
# ESTABLISHED and short-circuit the REJECTs. That's the trade for IDE/port-forward usability, and it
# holds the threat model — the agent can't reach out — but it isn't "nothing can talk to us".
echo "[firewall] allowing loopback + established..."
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS to the container's resolver (may be a private IP) — must precede the private-range blocks.
for ns in $(awk '/^nameserver/{print $2}' /etc/resolv.conf 2>/dev/null); do
  echo "[firewall] allowing DNS resolver ${ns}"
  iptables -A OUTPUT -d "${ns}" -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -d "${ns}" -p tcp --dport 53 -j ACCEPT
done

# Compose-network carve-out (civy-specific): allow the container's OWN subnet so it can reach the
# `redis` sibling on the compose network. This must be appended BEFORE the private-range REJECTs
# (iptables is first-match) — the compose subnet sits inside 172.16.0.0/12, which the loop below
# rejects. Derive the CIDR from the primary global-scope interface (eth0), e.g. 172.20.0.3/16;
# iptables masks the host bits, so `-d 172.20.0.3/16` allows the whole 172.20.0.0/16 compose network.
COMPOSE_CIDR="$(ip -o -f inet addr show scope global 2>/dev/null | awk '{print $4; exit}')"
if [ -n "${COMPOSE_CIDR:-}" ]; then
  echo "[firewall] allowing compose network ${COMPOSE_CIDR} (redis sibling)"
  iptables -A OUTPUT -d "${COMPOSE_CIDR}" -j ACCEPT
else
  echo "[firewall] WARNING: could not determine compose subnet — redis may be unreachable" >&2
fi

echo "[firewall] blocking egress to private/internal ranges..."
for cidr in "${PRIVATE4[@]}"; do
  iptables -A OUTPUT -d "${cidr}" -j REJECT --reject-with icmp-admin-prohibited
done

# IPv6: block private/link-local ranges too. Probe the kernel once (the binary existing doesn't mean
# ip6_tables is loaded), then let failures be fatal via set -e — swallowing them with `|| true` would
# let the whole v6 policy silently no-op while the script still reports OK.
if ip6tables -L -n >/dev/null 2>&1; then
  echo "[firewall] applying IPv6 policy..."
  ip6tables -F
  ip6tables -P INPUT ACCEPT     # mirror the v4 policy (lines 35-37) for stack parity
  ip6tables -P FORWARD DROP
  ip6tables -P OUTPUT ACCEPT
  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  for cidr in "${PRIVATE6[@]}"; do
    ip6tables -A OUTPUT -d "${cidr}" -j REJECT
  done
else
  echo "[firewall] IPv6 unsupported by this kernel — skipping v6 policy"
fi

echo "[firewall] verifying..."
# Public internet must be reachable. This one can genuinely fail, so probe it for real — but across
# a few hosts, failing only if ALL are unreachable. Gating on a single host would let that host's
# transient outage exit 1, which fails postStartCommand and (since dc:claude re-runs this before
# launching) can block starting Claude even though the firewall applied fine.
PUBLIC_HOSTS=("https://example.com" "https://www.google.com" "https://cloudflare.com")
public_ok=0
for host in "${PUBLIC_HOSTS[@]}"; do
  if curl --connect-timeout 6 -sS -o /dev/null "${host}" 2>/dev/null; then
    public_ok=1
    break
  fi
done
if [ "${public_ok}" -ne 1 ]; then
  echo "[firewall] ERROR: public internet unreachable on all probe hosts — policy too strict" >&2
  exit 1
fi
# Assert the blocks exist in the ruleset rather than probing connectivity to one of them: nothing
# listens on the metadata address under Docker Desktop, so a curl to it fails whether or not the
# rules are there — a check that passes with the whole block loop deleted. `iptables -C` tests what
# we actually care about (rule present: rc=0; absent: rc=1) and works on every runtime.
for cidr in "${PRIVATE4[@]}"; do
  iptables -C OUTPUT -d "${cidr}" -j REJECT --reject-with icmp-admin-prohibited 2>/dev/null \
    || { echo "[firewall] ERROR: missing IPv4 block for ${cidr}" >&2; exit 1; }
done
if ip6tables -L -n >/dev/null 2>&1; then
  for cidr in "${PRIVATE6[@]}"; do
    ip6tables -C OUTPUT -d "${cidr}" -j REJECT 2>/dev/null \
      || { echo "[firewall] ERROR: missing IPv6 block for ${cidr}" >&2; exit 1; }
  done
fi
# Confirm the compose carve-out rule is actually in place, else redis is silently unreachable.
if [ -n "${COMPOSE_CIDR:-}" ]; then
  iptables -C OUTPUT -d "${COMPOSE_CIDR}" -j ACCEPT 2>/dev/null \
    || { echo "[firewall] ERROR: missing compose-network allow for ${COMPOSE_CIDR}" >&2; exit 1; }
fi

# Best-effort reachability check for the redis sibling. A WARNING, not fatal: redis may still be
# starting when postStartCommand runs, and a slow sibling must not block the firewall (and thus
# Claude) from coming up. bash's /dev/tcp does a real TCP connect through the carve-out above.
if timeout 5 bash -c ':> /dev/tcp/redis/6379' 2>/dev/null; then
  echo "[firewall] redis reachable at redis:6379"
else
  echo "[firewall] note: redis:6379 not reachable yet (it may still be starting)" >&2
fi

echo "[firewall] OK: public egress allowed, private/internal ranges blocked (compose network allowed)."
