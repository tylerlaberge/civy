#!/usr/bin/env bash
# Egress policy: public internet is ALLOWED by default (the agent needs docs, package registries,
# GitHub, and the ingestion APIs); private/internal ranges are BLOCKED so a hijacked agent can't
# reach the host, the LAN, or cloud metadata (169.254.169.254). The single exception is the `redis`
# sibling, allowed on its address and queue port only.
#
# Rules live in a dedicated CIVY_EGRESS chain that is built off to the side and swapped into OUTPUT
# only once complete. Re-running this script therefore replaces the policy without ever tearing it
# down, so an agent already running in the container never sees an unfiltered window. Runs as root
# via scoped sudo on every start and cannot be disabled from inside.
set -euo pipefail
IFS=$'\n\t'

CHAIN=CIVY_EGRESS
TMP=CIVY_EGRESS_NEW
REDIS_HOST="${REDIS_FIREWALL_HOST:-redis}"
REDIS_PORT="${REDIS_FIREWALL_PORT:-6379}"

# Private / internal IPv4 ranges to block outbound.
PRIVATE4=(
  "10.0.0.0/8"
  "172.16.0.0/12"     # includes the Docker bridge, its gateway, and sibling containers
  "192.168.0.0/16"
  "169.254.0.0/16"    # link-local, incl. cloud metadata 169.254.169.254
  "100.64.0.0/10"     # carrier-grade NAT
)

# fc00::/7 already covers unique-local (incl. AWS's fd00:ec2::254 metadata address).
PRIVATE6=(
  "fc00::/7"          # unique local addresses
  "fe80::/10"         # link-local
)

# Fail closed. Building into an unreferenced chain already means a mid-run failure leaves the
# PREVIOUS policy in force, but a first run has no previous policy to fall back on — so on any error
# drop egress outright rather than leave the container wide open.
fail_closed() {
  echo "[firewall] FAILED — dropping egress" >&2
  iptables -P OUTPUT DROP 2>/dev/null || true
  ip6tables -P OUTPUT DROP 2>/dev/null || true
}
trap fail_closed ERR

# Create the staging chain, clearing any leftovers from a previous failed run.
reset_chain() {
  local ipt="$1"
  while "$ipt" -D OUTPUT -j "$TMP" 2>/dev/null; do :; done
  "$ipt" -N "$TMP" 2>/dev/null || "$ipt" -F "$TMP"
}

# Put the freshly built chain into effect, replacing the previous generation. The new jump is
# inserted BEFORE the old one is removed so there is never a gap, then the old chain is dropped and
# the staging chain takes over its name.
swap_chain() {
  local ipt="$1"
  "$ipt" -I OUTPUT 1 -j "$TMP"
  while "$ipt" -D OUTPUT -j "$CHAIN" 2>/dev/null; do :; done
  "$ipt" -F "$CHAIN" 2>/dev/null || true
  "$ipt" -X "$CHAIN" 2>/dev/null || true
  "$ipt" -E "$TMP" "$CHAIN"
}

echo "[firewall] building IPv4 policy..."
reset_chain iptables
iptables -A "$TMP" -o lo -j ACCEPT
iptables -A "$TMP" -m state --state ESTABLISHED,RELATED -j ACCEPT

# DNS to the container's resolver(s), which may themselves be private addresses. Only v4 resolvers
# belong here — handing an IPv6 nameserver to iptables errors out and would abort the run.
for ns in $(awk '/^nameserver/ && $2 !~ /:/ {print $2}' /etc/resolv.conf 2>/dev/null); do
  echo "[firewall] allowing DNS resolver ${ns}"
  iptables -A "$TMP" -d "${ns}" -p udp --dport 53 -j ACCEPT
  iptables -A "$TMP" -d "${ns}" -p tcp --dport 53 -j ACCEPT
done

# The redis sibling, narrowly. Allowing the whole compose subnet instead would also expose the
# bridge gateway — a host interface on Linux — and every other container on that network.
REDIS_IPS="$(getent ahostsv4 "${REDIS_HOST}" 2>/dev/null | awk '{print $1}' | sort -u)" || REDIS_IPS=""
if [ -n "${REDIS_IPS}" ]; then
  for ip in ${REDIS_IPS}; do
    echo "[firewall] allowing ${REDIS_HOST} at ${ip}:${REDIS_PORT}"
    iptables -A "$TMP" -d "${ip}" -p tcp --dport "${REDIS_PORT}" -j ACCEPT
  done
else
  echo "[firewall] WARNING: could not resolve ${REDIS_HOST} — the worker will not reach it" >&2
fi

for cidr in "${PRIVATE4[@]}"; do
  iptables -A "$TMP" -d "${cidr}" -j REJECT --reject-with icmp-admin-prohibited
done

swap_chain iptables
iptables -P INPUT ACCEPT      # inbound is host/IDE/port-forward; not the threat
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT     # anything the chain doesn't reject is public traffic

# Scope note: INPUT ACCEPT plus the ESTABLISHED rule means these blocks only stop connections the
# container INITIATES. A private-range peer that dials in still gets a bidirectional channel,
# because our replies match ESTABLISHED. That's the trade for IDE/port-forward usability; it holds
# the threat model (the agent can't reach out) but isn't "nothing can talk to us".

# The binary existing doesn't mean ip6_tables is loaded, so probe once and reuse the answer.
if ip6tables -L -n >/dev/null 2>&1; then
  HAS_IP6=1
else
  HAS_IP6=0
  echo "[firewall] IPv6 unsupported by this kernel — skipping v6 policy"
fi

if [ "${HAS_IP6}" -eq 1 ]; then
  echo "[firewall] building IPv6 policy..."
  reset_chain ip6tables
  ip6tables -A "$TMP" -o lo -j ACCEPT
  ip6tables -A "$TMP" -m state --state ESTABLISHED,RELATED -j ACCEPT
  for ns in $(awk '/^nameserver/ && $2 ~ /:/ {print $2}' /etc/resolv.conf 2>/dev/null); do
    echo "[firewall] allowing IPv6 DNS resolver ${ns}"
    ip6tables -A "$TMP" -d "${ns}" -p udp --dport 53 -j ACCEPT
    ip6tables -A "$TMP" -d "${ns}" -p tcp --dport 53 -j ACCEPT
  done
  for cidr in "${PRIVATE6[@]}"; do
    ip6tables -A "$TMP" -d "${cidr}" -j REJECT
  done
  swap_chain ip6tables
  ip6tables -P INPUT ACCEPT
  ip6tables -P FORWARD DROP
  ip6tables -P OUTPUT ACCEPT
fi

echo "[firewall] verifying..."
# Public internet must be reachable. Probe a few hosts and fail only if ALL are unreachable: gating
# on one host would let its transient outage fail postStartCommand (and so block starting Claude,
# since dc:shell/dc:claude re-run this) even though the policy applied fine.
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

# Assert the blocks exist rather than probing connectivity to one: nothing listens on the metadata
# address under Docker Desktop, so a curl there fails whether or not the rules are present — a check
# that would still pass with the whole block loop deleted. `iptables -C` tests what we care about.
for cidr in "${PRIVATE4[@]}"; do
  iptables -C "$CHAIN" -d "${cidr}" -j REJECT --reject-with icmp-admin-prohibited 2>/dev/null \
    || { echo "[firewall] ERROR: missing IPv4 block for ${cidr}" >&2; fail_closed; exit 1; }
done
if [ "${HAS_IP6}" -eq 1 ]; then
  for cidr in "${PRIVATE6[@]}"; do
    ip6tables -C "$CHAIN" -d "${cidr}" -j REJECT 2>/dev/null \
      || { echo "[firewall] ERROR: missing IPv6 block for ${cidr}" >&2; fail_closed; exit 1; }
  done
fi

trap - ERR
echo "[firewall] OK: public egress allowed, private ranges blocked, ${REDIS_HOST}:${REDIS_PORT} permitted."
