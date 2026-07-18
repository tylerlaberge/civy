---
name: mr-feedback
description: Gather actionable review feedback from a GitHub PR, plan how to address it (one confirmation), implement the changes, push to the PR branch, then reply to and resolve each addressed comment. Use when the user runs /mr-feedback with a GitHub PR link (e.g. /mr-feedback https://github.com/tylerlaberge/civy/pull/71).
---

# mr-feedback

Take the review feedback on a **GitHub pull request** from **unaddressed** to **resolved**: collect
the actionable comments, plan the fixes, implement them after user confirmation, push to the PR
branch, and reply to each comment explaining how it was addressed.

The user invokes this with a PR URL, e.g.:

```
/mr-feedback https://github.com/tylerlaberge/civy/pull/71
```

Parse the owner, repo, and PR number from that URL. All GitHub operations use the `gh` CLI (assumed
installed and authenticated). If a `gh` call fails with an auth error, tell the user to run
`gh auth login` rather than working around it.

## Steps

### 1. Gather the feedback

1. **Read the PR and check it out** so you're working on the right branch:
   ```
   gh pr view <number> --json number,title,headRefName,url
   gh pr checkout <number>
   ```
   If the working tree is dirty, stop and ask before proceeding.
2. **Collect every source of comments:**
   - Inline review comments: `gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate`
   - Review summaries: `gh api repos/<owner>/<repo>/pulls/<number>/reviews --paginate`
   - General PR conversation: `gh api repos/<owner>/<repo>/issues/<number>/comments --paginate`
   Capture each comment's `id`, `path`/`line` (for inline), author, and body.
3. **Filter to actionable feedback.** Keep comments that request a concrete change or ask a question
   that implies one. Drop resolved threads, pure approvals/praise, and anything already addressed by
   a later commit. If a comment is ambiguous, note it as a question to raise rather than guessing.
   Track which comment `id`s you intend to address so you can reply to them later.

### 2. Plan and confirm

4. **Study the code and the relevant comments together** so the fixes fit the codebase and the PRD/
   `CLAUDE.md` conventions.
5. **Enter plan mode** and produce a concrete plan: for each piece of actionable feedback, what
   changes, in which files, and how it resolves the comment. Flag anything you'd push back on or need
   the author to clarify.
6. **Confirm the plan with the user** via ExitPlanMode. Don't start editing until they approve.
   Revise and re-confirm if they want changes.

### 3. Implement

7. Implement the approved plan, matching surrounding style and the repo conventions. If the feedback
   exposes a gap in coverage, **add or adjust the tests** as part of the fix.
8. **Verify before committing:** run the project's checks via moon — at minimum
   `moon run <project>:lint`, `<project>:typecheck`, and `<project>:test` for the touched projects
   (or `moon check --all`). Fix anything that fails. Run the `/verify` skill for changes with a
   runtime surface.

### 4. Commit and push

9. **Commit and push.** Compose a commit message in the [[commit]] format (reference the PR/issue),
   then commit and push directly to the PR branch — this flow doesn't gate on a commit-message
   confirmation:
   ```
   git push
   ```

### 5. Reply to and resolve the comments

10. **Reply to each addressed comment** explaining how it was resolved (reference the commit where
    useful). Sign each reply with the **model currently acting** — determine it at reply time (e.g.
    `— 🤖 Claude Fable 5 (via Claude Code)` or `— 🤖 Claude Opus 4.8 (via Claude Code)`), never a
    hardcoded name.
    - Inline review comment → reply in-thread:
      ```
      gh api repos/<owner>/<repo>/pulls/<number>/comments/<comment_id>/replies \
        --method POST -f body="<how it was addressed> — 🤖 <current model> (via Claude Code)"
      ```
    - General PR/issue comment → post a reply referencing it:
      ```
      gh pr comment <number> --body "<@author, how the feedback was addressed, signed>"
      ```
11. **Resolve the threads you addressed** so the PR stays tidy. Review threads are resolved via the
    GraphQL API — find the thread id and mark it resolved:
    ```
    gh api graphql -f query='query { repository(owner:"<owner>", name:"<repo>") {
      pullRequest(number: <number>) { reviewThreads(first:100) { nodes { id isResolved
        comments(first:1){ nodes { databaseId } } } } } } }'
    gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"<threadId>"}) {
      thread { isResolved } } }'
    ```
    Only resolve threads you actually addressed — leave open any you replied to with a question or a
    reasoned push-back.
12. For any feedback you deliberately did **not** act on (disagreed, out of scope, needs
    clarification), reply saying so with your reasoning rather than silently skipping it, and leave
    that thread unresolved.

### 6. Report back

13. Report the PR URL, a one-line summary of what changed, and the list of comments you replied to
    and resolved (and any you left open with questions).

## Notes

- Stop and ask if: the tree is dirty at checkout, the feedback is contradictory or unclear, the plan
  is rejected, or verification fails in a way you can't resolve.
- The only user checkpoint is **plan approval** (step 6); commit messages are not gated.
- Address feedback honestly — pushing back with reasoning is a valid resolution; silently ignoring a
  comment is not.
