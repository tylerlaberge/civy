#!/usr/bin/env bash
# Hands the Claude config dirs back to `dev`, so Claude can write session transcripts.
#
# The problem this exists for: docker-compose.yml binds the host project-memory dir at
# /home/dev/.claude/projects/${CLAUDE_PROJECT_KEY}/memory — a mount point nested several levels
# inside the civy-claude-config volume. Docker creates missing mount-point directories at container
# CREATE time, and it creates them root:root regardless of the ownership of the volume they land in.
# So `projects/` and `projects/<key>/` come up root-owned, and Claude — running as dev — cannot
# create <key>/<session>.jsonl next to the memory bind. The symptom is the startup warning
# "Transcript writes are failing (permission denied — EACCES) · recent messages may not be saved for
# resume": the session runs, but nothing is resumable.
#
# Run from devcontainer.json's postStartCommand via the sudo grant in the Dockerfile. It only ever
# grants ownership TO dev, on two fixed absolute paths inside dev's own home.
#
# Every chown here is `-h` (never dereference). That is load-bearing, not stylistic: dev can replace
# any of these paths with a symlink between our checking and our chowning, and a dereferencing chown
# would then hand dev ownership of whatever the link points at — /etc, /usr/local/bin — which is a
# root escalation out of the sandbox. With -h the worst case is that dev owns a symlink it created.
# `find` is invoked with the default -P, so a symlinked start point is reported, not descended.
set -euo pipefail

claude_dir=/home/dev/.claude
projects_dir="${claude_dir}/projects"

# Idempotent: on a container whose dirs are already dev-owned this is a no-op.
mkdir -p "${projects_dir}"
chown -h dev:dev "${projects_dir}"

# The per-project dirs (one per workspace path Claude has seen). Depth 1 only — below them sit the
# transcripts, which dev already owns, and the memory bind, whose ownership comes from the host and
# must not be rewritten.
find "${projects_dir}" -mindepth 1 -maxdepth 1 -exec chown -h dev:dev {} +
