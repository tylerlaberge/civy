---
name: mr-review
description: Perform a thorough code review of a GitHub pull request and leave the findings as inline review comments on the PR (signed by the reviewing model). Reviews for bugs, correctness, AI slop, code smells, bad abstractions, duplication, and simplification. Use when the user runs /mr-review with a GitHub PR link (e.g. /mr-review https://github.com/tylerlaberge/civy/pull/71).
---

# mr-review

Perform a thorough code review of a **GitHub pull request** and post the findings as **review
comments on the PR itself** — inline on the offending lines where possible, with a summary review
body tying it together. Each comment is **signed by the reviewing model** so the author knows it came
from an AI reviewer.

The user invokes this with a PR URL, e.g.:

```
/mr-review https://github.com/tylerlaberge/civy/pull/71
```

Parse the owner, repo, and PR number from that URL. All GitHub operations use the `gh` CLI (assumed
installed and authenticated). If a `gh` call fails with an auth error, tell the user to run
`gh auth login` rather than working around it.

## Steps

### 1. Gather the PR

1. **Read the PR metadata and diff:**
   ```
   gh pr view <number> --json number,title,body,headRefName,headRefOid,baseRefName,url
   gh pr diff <number>
   ```
   Note the head SHA (`headRefOid`) — you'll need it to anchor inline comments.
2. **Check the PR out locally so you can read surrounding code**, not just the diff:
   ```
   gh pr checkout <number>
   ```
   If the working tree is dirty, stop and tell the user rather than clobbering their changes.

### 2. Review for real understanding

3. **Read beyond the diff.** Open the surrounding files and related code to judge correctness, spot
   broken assumptions, and understand how the change interacts with the rest of the codebase. Honor
   the project's conventions in `CLAUDE.md` (permissions in one shared service, shared types from
   `packages/types`, idempotent ingestion, islands only where earned).
4. **Hunt for issues** across at least these dimensions:
   - **Correctness & bugs** — logic errors, off-by-one, null/undefined handling, race conditions,
     bad edge-case behavior, broken error handling, type mismatches.
   - **AI slop** — vacuous or redundant comments, defensive code for impossible cases, needless
     re-implementation of existing utilities, inconsistent style, leftover scaffolding, over-verbose
     naming, hedging abstractions that add nothing.
   - **Code smells & bad abstractions** — wrong altitude, leaky or premature abstractions, god
     functions, tight coupling, poor separation of concerns, misused patterns.
   - **Dead / unused code** — exports with no consumers, unreachable branches, unused
     variables/params/imports. Grep for references before calling something unused, and note when
     it's intentional forward-looking scaffolding rather than an accident.
   - **Duplication** — repeated logic that should be shared, copy-paste drift.
   - **Simplification & design** — opportunities to remove code, lean on existing helpers, or apply
     a cleaner pattern.

### 3. Post the review

5. **Map each finding to a location.** A finding that lands on specific changed lines becomes an
   **inline comment** anchored to `path` + `line` (the line number in the PR's new file). Broader
   findings that don't map to one line go in the **review summary body**.
6. **Sign every comment.** End each comment body (inline comments and the summary) with a signature
   line identifying the **model currently acting** — determine it at review time, never hardcode one:
   ```
   — 🤖 Reviewed by <current model> (via Claude Code)
   ```
   For example `Claude Fable 5` or `Claude Opus 4.8`; keep the signature on its own line.
7. **Write clear findings.** For each: state the problem concisely, tag its severity
   (**Critical / High / Medium / Low**), and suggest a concrete fix or direction. Don't paste large
   code blocks — point at the code. Be specific and honest; don't invent issues to fill a category.
   If a dimension is clean, don't manufacture nits.
8. **Post it as a single PR review** (event `COMMENT` — never `APPROVE` or `REQUEST_CHANGES`; an AI
   reviewer should not gate merges). Build the payload and submit via `gh api`. Write the JSON to a
   temp file to keep quoting sane:
   ```
   gh api repos/<owner>/<repo>/pulls/<number>/reviews \
     --method POST --input <payload.json>
   ```
   where `<payload.json>` looks like:
   ```json
   {
     "commit_id": "<headRefOid>",
     "event": "COMMENT",
     "body": "<summary overview + any non-line-specific findings, signed>",
     "comments": [
       { "path": "apps/api/src/comments/comments.service.ts", "line": 12, "side": "RIGHT",
         "body": "**High** — <finding>.\n\n— 🤖 Reviewed by <current model> (via Claude Code)" }
     ]
   }
   ```
   Use `line` for a single-line comment; add `start_line` (with `start_side`) for a multi-line span.
   If the API rejects a comment because its line isn't part of the diff, move that finding into the
   summary body rather than dropping it.
9. **Lead the summary body with a short overview** in prose — what the change does and how the pieces
   fit — before listing any findings, so the author is oriented before the critique.

### 4. Report back

10. Report the PR URL, the number of inline comments posted, and a one-line take on the overall
    health of the change.

## Notes

- **This is an independent review pass.** Review the diff on its own merits; don't lean on prior
  reasoning about how the change was built. When [[impl]] runs this, it spawns a *cold* sub-agent for
  exactly this reason — the reviewer should judge the code, not rubber-stamp a familiar intent.
- **This skill writes to the PR, not the working tree.** It posts review comments; it does not edit,
  stage, or commit code. Addressing feedback is the job of the [[mr-feedback]] skill.
- Post **one** review (a single `reviews` call) rather than many individual comments, so the author
  gets one coherent review notification.
- Prioritize signal: lead with the findings that matter most, and prefer a faithful "this looks
  solid" over manufactured nitpicks.
