#!/usr/bin/env bash
# Runs on the HOST (not in the container) via devcontainer.json's `initializeCommand`, before the
# container is created — for both `bun run dc:up` and the IDE's "Reopen in Container". It makes the
# project-memory bind portable across developers and clone paths, replacing a hardcoded host path.
#
# The bind must land on Claude's per-project memory dir, whose name is the workspace path with every
# non-alphanumeric character turned into `-` (e.g. /Users/me/projects/civy -> -Users-me-projects-civy).
# devcontainer.json can't compute that (no string transforms on ${localWorkspaceFolder}) and compose
# can't either (no bash-style expansion in interpolation), so we compute it here and hand it to
# compose through a generated .env — which compose loads from the dir of the first `-f` file, i.e.
# this .devcontainer/ dir. docker-compose.yml then interpolates ${CLAUDE_PROJECT_KEY}.
set -euo pipefail

# Workspace path comes from devcontainer.json as $1 (${localWorkspaceFolder}); fall back to cwd.
workspace="${1:-$PWD}"

# Mirror Claude's project-dir mangling: every non-alphanumeric char -> `-`.
key="$(printf '%s' "$workspace" | sed 's/[^a-zA-Z0-9]/-/g')"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${script_dir}/.env"

# Validation the hardcoded path couldn't give: a bind whose source is missing isn't an error — Docker
# silently creates an empty host dir and mounts that, yielding an empty memory dir with no diagnostic.
# Ensure the REAL host memory dir exists so the bind resolves to it, and warn if host Claude is absent.
memory_dir="${HOME}/.claude/projects/${key}/memory"
if [ ! -d "${HOME}/.claude" ]; then
  echo "[init-host-env] warning: ${HOME}/.claude not found — host Claude may not be installed; creating the memory dir anyway" >&2
fi
mkdir -p "${memory_dir}"

printf 'CLAUDE_PROJECT_KEY=%s\n' "${key}" > "${env_file}"
echo "[init-host-env] CLAUDE_PROJECT_KEY=${key} -> ${env_file}"
echo "[init-host-env] host memory dir: ${memory_dir}"
