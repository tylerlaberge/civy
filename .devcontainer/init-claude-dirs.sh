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
# This runs as root against paths under dev's own home, so it treats dev as hostile (the sandbox's
# whole premise) and defends the two ways dev could turn a chown into a root escalation:
#
#   Symlinks. dev can rename `projects` (a same-dir rename succeeds even with the memory mountpoint
#   under it) and drop a symlink in its place, then do the same for a depth-1 child. So every chown
#   is `-h` (never dereference the link), and the `find` runs with the default -P, which reports a
#   symlinked start point rather than descending it — a `projects -> /etc` swap leaves /etc untouched
#   and at worst chowns a symlink dev already owns. A dangling symlink makes `mkdir -p` fail, which
#   under `set -e` aborts before any chown: fail closed.
#
#   Hardlinks. `-h` does NOT protect these — a hardlink IS the inode, so a chown of a hardlink to a
#   root-owned file (e.g. the sudoers drop-in) would hand dev that file. The `-type d` below is what
#   rules them out: a hardlink to a root file is -type f and never matches, independent of the
#   kernel's fs.protected_hardlinks (which also blocks creating such a link, but isn't relied on here).
set -euo pipefail

claude_dir=/home/dev/.claude
projects_dir="${claude_dir}/projects"

# Idempotent: on a container whose dirs are already dev-owned this is a no-op.
mkdir -p "${projects_dir}"
chown -h dev:dev "${projects_dir}"

# The per-project dirs (one per workspace path Claude has seen). Depth 1, directories only — below
# them sit the transcripts, which dev already owns, and the memory bind, whose ownership comes from
# the host and must not be rewritten. `-type d` also excludes any planted symlink/hardlink (see above).
find "${projects_dir}" -mindepth 1 -maxdepth 1 -type d -exec chown -h dev:dev {} +
