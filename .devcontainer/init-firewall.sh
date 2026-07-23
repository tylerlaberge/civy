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
# -E (errtrace) is load-bearing, not decoration: without it bash does NOT propagate the ERR trap into
# shell functions, so a failure inside reset_chain/swap_chain would exit WITHOUT running fail_closed —
# leaving OUTPUT on policy ACCEPT with no filtering chain, i.e. wide open, on exactly the path the
# fail-closed guarantee exists to cover.
set -eEuo pipefail
IFS=$'\n\t'

# This runs as root on behalf of a user we treat as untrusted, and calls iptables, awk, getent, curl
# and sort by bare name. Debian's sudoers sets `secure_path`, which is what stops `dev` shadowing any
# of them — but that invariant lives in a file this repo doesn't own. Pin PATH here so the one
# command `dev` may run as root defends itself instead of depending on that.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

CHAIN=CIVY_EGRESS
TMP=CIVY_EGRESS_NEW
# Not configurable via the environment: every invocation is `sudo init-firewall.sh`, and sudo's
# `env_reset` strips anything passed in, so env knobs here would read as configurable but be dead.
REDIS_HOST=redis
REDIS_PORT=6379

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
#
# Terminating here is part of the contract. Bash resumes at the interrupted point once a signal
# handler returns, so without the exit an INT/TERM would drop egress and then let the run carry on to
# re-set `-P OUTPUT ACCEPT` and report success — undoing the very thing the trap just did.
fail_closed() {
  echo "[firewall] FAILED — dropping egress" >&2
  iptables -P OUTPUT DROP 2>/dev/null || true
  ip6tables -P OUTPUT DROP 2>/dev/null || true
  exit 1
}
# INT/TERM as well as ERR: a signal landing between reset_chain and swap_chain (Ctrl-C during
# postCreateCommand, a docker stop racing the run) would otherwise leave OUTPUT with policy ACCEPT
# and no filtering chain — wide open, and reported nowhere.
trap fail_closed ERR INT TERM

# Create the staging chain, clearing any leftovers from a previous failed run.
reset_chain() {
  local ipt="$1"
  while "$ipt" -D OUTPUT -j "$TMP" 2>/dev/null; do :; done
  "$ipt" -N "$TMP" 2>/dev/null || "$ipt" -F "$TMP"
}

# Put the freshly built chain into effect, replacing the previous generation. The new jump is
# inserted BEFORE the old one is removed so there is never a gap, then the old chain is dropped and
# the staging chain takes over its name.
#
# The final rename relies on iptables' `-E`, whose support under the nft backend has historically
# varied. Verified working on this image's iptables v1.8.9 (nf_tables), for both iptables and
# ip6tables. If a future base image regresses it, the rename fails and egress drops entirely — loud
# rather than silent (see the README note on recovering from a fail-closed container). That reaction
# depends on `set -E` above: without errtrace the ERR trap would not fire from inside this function.
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
#
# The rule pins the address resolved right now. Recreating the redis container (image bump, a
# `docker compose up -d redis`, a network rebuild) can move it to a new address in 172.16.0.0/12,
# which the private-range REJECT then blocks with no hint that the firewall is the cause. Re-running
# this script (any of `dc:shell`, `dc:claude`, or a container restart) re-resolves and fixes it.
REDIS_IPS="$(getent ahostsv4 "${REDIS_HOST}" 2>/dev/null | awk '{print $1}' | sort -u)" || REDIS_IPS=""
if [ -n "${REDIS_IPS}" ]; then
  for ip in ${REDIS_IPS}; do
    echo "[firewall] allowing ${REDIS_HOST} at ${ip}:${REDIS_PORT}"
    iptables -A "$TMP" -d "${ip}" -p tcp --dport "${REDIS_PORT}" -j ACCEPT
  done
else
  # Not fatal: dc:shell/dc:claude gate on this script succeeding, so making an unreachable redis a
  # hard error would lock you out of the container over a stopped sibling. Warn, and drop the redis
  # clause from the final summary so it can't claim a carve-out that isn't there.
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
# `ip6tables -L` failing means the module is missing — it does NOT mean the container has no IPv6
# connectivity, and the two are independent. If v6 is actually routable while we can't filter it,
# half the address space is unprotected, so refuse to report success rather than shrug it off.
if ip6tables -L -n >/dev/null 2>&1; then
  HAS_IP6=1
else
  HAS_IP6=0
  if [ -n "$(ip -6 addr show scope global 2>/dev/null)" ]; then
    echo "[firewall] ERROR: container has routable IPv6 but ip6tables is unusable — v6 egress would be unfiltered" >&2
    fail_closed
    exit 1
  fi
  echo "[firewall] IPv6 unsupported by this kernel and no routable v6 address — skipping v6 policy"
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

# The rules above can all be present and correct while OUTPUT doesn't reach them — a swap that got
# as far as removing the old jump but not to a working rename, or an external flush. Assert the jump
# and the policy too, since those are precisely what the staging/swap machinery puts at risk.
iptables -C OUTPUT -j "$CHAIN" 2>/dev/null \
  || { echo "[firewall] ERROR: OUTPUT does not jump to ${CHAIN}" >&2; fail_closed; exit 1; }
[ "$(iptables -S OUTPUT | head -1)" = "-P OUTPUT ACCEPT" ] \
  || { echo "[firewall] ERROR: unexpected IPv4 OUTPUT policy: $(iptables -S OUTPUT | head -1)" >&2; fail_closed; exit 1; }
if [ "${HAS_IP6}" -eq 1 ]; then
  ip6tables -C OUTPUT -j "$CHAIN" 2>/dev/null \
    || { echo "[firewall] ERROR: IPv6 OUTPUT does not jump to ${CHAIN}" >&2; fail_closed; exit 1; }
  [ "$(ip6tables -S OUTPUT | head -1)" = "-P OUTPUT ACCEPT" ] \
    || { echo "[firewall] ERROR: unexpected IPv6 OUTPUT policy: $(ip6tables -S OUTPUT | head -1)" >&2; fail_closed; exit 1; }
fi

trap - ERR INT TERM
if [ -n "${REDIS_IPS}" ]; then
  echo "[firewall] OK: public egress allowed, private ranges blocked, ${REDIS_HOST}:${REDIS_PORT} permitted."
else
  echo "[firewall] OK: public egress allowed, private ranges blocked (${REDIS_HOST} unresolved — no carve-out)."
fi
