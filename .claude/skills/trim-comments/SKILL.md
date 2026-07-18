---
name: trim-comments
description: Find and trim overly verbose comments, cleaning them down to short, present-state notes. Use when the user runs /trim-comments or asks to clean up wordy/verbose comments.
---

# trim-comments

Find overly verbose comments and clean them up. The goal is comments that describe the
**present state** of the code in as few words as possible — ideally a single line. Comments
should not narrate history, justify past decisions, or explain things the code already makes
obvious.

## What counts as an overly verbose comment

- **History/rationale narration** — explaining what the code used to do, why it changed, what
  approach was rejected, or "captured from X instead of Y". Keep comments about *what is*, not
  *what was* or *why we moved off the old way*. (Git history already records that.)
- **Restating self-explanatory code** — a comment that just paraphrases the line below it.
- **Multi-sentence paragraphs** where one short clause would do.
- **Tutorials/instructions** baked into comments that belong in docs (or nowhere).

A comment is worth keeping only when it adds something the code can't say for itself: a non-obvious
constraint, a gotcha, a security/safety note, or a "why this value" that isn't derivable from
context. When kept, reduce it to the smallest accurate form — prefer one line.

## Steps

1. **Decide scope.** If the user named files/dirs, use those. Otherwise default to the files
   changed on the current branch (`git diff --name-only main...HEAD` plus
   `git status --short`), since fresh code is where verbose comments accumulate. Confirm the
   scope with the user if it's ambiguous.
2. **Read each file** and locate comment blocks. Pay special attention to config files
   (`.devcontainer/*`, `*.json` with `//` comments, `*.yml`), READMEs, and anything recently
   touched.
3. For each comment, decide:
   - **Delete** — if the code is self-explanatory or the comment only narrates history/rationale.
   - **Trim** — if a real note is buried in verbosity: cut to a short, present-tense, ideally
     one-line comment.
   - **Keep as-is** — only if it's already short and carries non-obvious, present-state info.
4. **Apply the edits.** Don't change code behavior — only comments. Preserve any license/header
   banners.
5. **Summarize** what you changed: which comments were deleted vs. trimmed, and call out any you
   deliberately kept and why.

## Guidance for rewrites

- Present tense, present state: "Read-only token mount" not "We switched to a read-only mount
  because the env var was unreliable."
- One line when possible. Drop the "why we moved off the old approach" entirely.
- Don't invent information. If you can't state a comment's value succinctly and truthfully,
  prefer deleting it over guessing.
- When in doubt about deleting a comment that may carry real intent, trim it rather than remove
  it, and flag it in the summary so the user can confirm.
