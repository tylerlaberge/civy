---
name: commit
description: Create a git commit from the staged changes with a succinct, well-structured message. Use when the user runs /commit or asks to commit staged changes.
---

# commit

Create a commit from **all current changes** with a concise, structured message.

## Steps

1. **Stage everything**, including untracked files: `git add -A`.
2. Inspect what's now staged:
   - `git diff --cached --stat` for the overview
   - `git diff --cached` to read the actual changes
3. If there's nothing to commit (clean tree), stop and tell the user there are no changes.
4. **Determine the ticket.** Every commit must reference the GitHub issue (story/epic) the changes
   are for — this is required, not optional.
   - Infer it from context when clear: the current branch name (e.g. `impl/22-...`, `22-...`), the
     issue you're actively implementing, or an explicit mention from the user.
   - If you can't determine it confidently, **ask the user for the ticket number before committing.**
     Don't invent or guess an issue number.
5. Write the commit message in this format:
   - **One-line summary** in the imperative mood, ~50 chars, no trailing period.
   - A blank line.
   - A short bulleted list of the key changes (only the notable ones — don't enumerate every file).
   - A blank line, then a `Refs #<number>` trailer linking the ticket (required).
   - A blank line, then the co-author signature.
6. **Show the full message to the user and confirm it's acceptable before committing.** If they want
   changes, revise and confirm again.
7. Once approved, commit with `git commit -m "..."` (use multiple `-m` flags or a heredoc to preserve
   formatting). Do not push.

## Message format

```
Add jurisdiction permission guard to comments API

- Centralize the comment-permission rule in PermissionsService
- Return a canComment verdict + reason on bill detail responses
- Cover the Maine/federal/out-of-state matrix with e2e tests

Refs #25

Co-Authored-By: <current model> <noreply@anthropic.com>
```

## Signature

Always end the message with the co-author trailer naming the **model currently in use** — determine
it at commit time, never hardcode one:

```
Co-Authored-By: <current model> <noreply@anthropic.com>
```

For example `Claude Fable 5`, `Claude Opus 4.8`, or `Claude Sonnet 5`, depending on which model is
actually acting in the session.
