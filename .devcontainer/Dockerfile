# syntax=docker/dockerfile:1
# Base image pinned by digest so a moving tag can't swap it out.
FROM mcr.microsoft.com/devcontainers/base:bookworm@sha256:aba0f2e0730af481edf2db5582a80c0ed2591bee78ec177f7fa7a38e8f5e1105

# iptables/ipset/dnsutils/iproute2/jq for init-firewall.sh; zsh/fzf shell QoL. build-essential +
# python3 are node-gyp's toolchain for native deps that later stories pull in (e.g. better-sqlite3
# in packages/db); without them `bun install` fails at the compile step for those packages.
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get install -y --no-install-recommends \
    iptables \
    ipset \
    dnsutils \
    iproute2 \
    curl \
    unzip \
    git \
    zsh \
    fzf \
    less \
    jq \
    ca-certificates \
    build-essential \
    python3 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# gh, from GitHub's own apt repo (Debian has no recent package). Signed by their keyring rather
# than trusted blindly. The workflow skills (/impl, /mr-review, /mr-merge) drive every issue and PR
# step through gh, so the container is unusable for them without it.
RUN mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get install -y --no-install-recommends gh \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# gh authenticates from GH_TOKEN in the env. Source it from the same read-only host mount the git
# credential helper uses (see gitconfig) so there's one token file, not two — and so `gh auth login`
# never needs to run and never writes the token to container disk. Every entrypoint execs through
# `bash -lc`, which sources /etc/profile.d, so this covers all of them; the zsh in dc:shell inherits
# the exported var from that login bash.
RUN printf '%s\n' \
    'if [ -r /home/dev/.config/civy/gh_token ]; then' \
    '  GH_TOKEN="$(cat /home/dev/.config/civy/gh_token)"; export GH_TOKEN' \
    'fi' \
    > /etc/profile.d/gh-token.sh \
  && chmod 0644 /etc/profile.d/gh-token.sh

# Relabel the base user/group vscode -> dev (same uid/gid 1000).
RUN usermod -l dev -d /home/dev -m vscode \
  && groupmod -n dev vscode

# Bake the firewall script at a fixed root-owned path and scope sudo to only it.
# Root ownership stops `dev` rewriting the script to regain arbitrary root, so this is the ONLY
# command dev may run as root. Don't add a second grant without re-reading that sentence: a
# `chown` grant here (for the cache volumes) was a full root escalation in kino, because sudoers
# matches argv literally rather than a resolved path — a relative argv matched from any cwd, and
# chown follows symlinks, so `ln -s /usr/local/bin/init-firewall.sh target` handed dev the script.
# The cache volume now seeds dev-owned instead (see /home/dev/.bun below), so no grant is needed.
COPY .devcontainer/init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 0755 /usr/local/bin/init-firewall.sh \
  && chown root:root /usr/local/bin/init-firewall.sh \
  && echo 'dev ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh' \
  > /etc/sudoers.d/init-firewall \
  && chmod 0440 /etc/sudoers.d/init-firewall \
  # Revoke the base image's blanket NOPASSWD:ALL so the firewall can't be torn down from inside.
  && rm -f /etc/sudoers.d/vscode

# Shell history volume (mounted in devcontainer.json) survives rebuilds.
RUN mkdir -p /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R dev:dev /commandhistory
ENV HISTFILE=/commandhistory/.bash_history

# Claude config mount point, owned by dev (the civy-claude-config volume mounts here at runtime).
RUN mkdir -p /home/dev/.claude && chown -R dev:dev /home/dev/.claude

# Everything below runs as the non-root user.
USER dev
ENV USER=dev

# Container git config: push to GitHub over HTTPS (rewrites SSH remotes). See gitconfig.
COPY --chown=dev:dev .devcontainer/gitconfig /home/dev/.gitconfig

# proto owns the toolchain; its shims + bin go on PATH ahead of everything. ~/.local/bin is where
# the Claude Code installer lands.
ENV PROTO_HOME=/home/dev/.proto
ENV PATH=/home/dev/.proto/shims:/home/dev/.proto/bin:/home/dev/.local/bin:${PATH}

# Install proto (no toolchain yet) — .prototools below is the single source of truth for versions.
RUN curl -fsSL https://moonrepo.dev/install/proto.sh | bash -s -- --yes --no-profile

# Install the node/bun/moon versions pinned by the repo's .prototools. `proto use` reads the
# .prototools in the cwd and installs everything it lists.
COPY --chown=dev:dev .prototools /tmp/proto/.prototools
RUN cd /tmp/proto && proto use && rm -rf /tmp/proto

# Mount point for the bun install cache, created here so a fresh named volume seeds from a dev-owned
# directory and comes up dev-owned. Docker copies the image directory's ownership onto an empty
# volume; a volume at a path the image DOESN'T have would mount root-owned and need a chown — which
# is exactly the sudo escalation the firewall section warns about. Keeping the cache on a dev-owned
# path avoids any chown grant.
RUN mkdir -p /home/dev/.bun

# Claude Code CLI via the official native installer -> ~/.local/bin/claude.
# Supply chain: unlike the digest-pinned base image, this (and proto above) curl|bashes an unpinned
# installer. Deliberate — the sandbox should run the current agent, which self-updates anyway, and
# pinning would mean an image rebuild per release. The toolchain it manages is still pinned by
# .prototools; only the installer scripts float.
RUN curl -fsSL https://claude.ai/install.sh | bash

# Container-own Claude settings, seeding the civy-claude-config volume on first mount. Must come
# AFTER the Claude install (the installer would otherwise strip our settings). Re-seed after edits:
# `bun run dc:down && docker volume rm civy_civy-claude-config && bun run dc:up`. (Compose prefixes
# volume names with the project, so the `civy-claude-config` source is `civy_civy-claude-config`.)
COPY --chown=dev:dev .devcontainer/claude-settings.json /home/dev/.claude/settings.json

# Default to zsh for interactive shells.
ENV SHELL=/bin/zsh
