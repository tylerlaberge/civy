---
name: mr-merge
description: Merge a GitHub PR into main, close it, delete the remote and local branch, and transition the linked issue from the `review` label to `done` — after an explicit user confirmation. Use when the user runs /mr-merge with a GitHub PR link (e.g. /mr-merge https://github.com/tylerlaberge/civy/pull/71).
---

# mr-merge

Land a finished **GitHub pull request**: merge it into `main`, close it out, delete its branch
(remote and local), and move the linked issue from `review` to `done`. This is a destructive,
hard-to-reverse action, so it happens **only after the user explicitly confirms**.

The user invokes this with a PR URL, e.g.:

```
/mr-merge https://github.com/tylerlaberge/civy/pull/71
```

Parse the owner, repo, and PR number from that URL. All GitHub operations use the `gh` CLI (assumed
installed and authenticated). If a `gh` call fails with an auth error, tell the user to run
`gh auth login` rather than working around it.

## Steps

### 1. Gather the facts

1. **Read the PR:**
   ```
   gh pr view <number> --json number,title,state,headRefName,baseRefName,mergeable,mergeStateStatus,url
   ```
   If it's already merged or closed, say so and stop — there's nothing to merge.
2. **Find the linked issue.** Prefer the PR's declared closing references over parsing prose:
   ```
   gh api graphql -f query='query { repository(owner:"<owner>", name:"<repo>") {
     pullRequest(number: <number>) { closingIssuesReferences(first:10) {
       nodes { number title url labels(first:20){ nodes { name } } } } } } }'
   ```
   Fall back to scanning the PR body for `Closes #<n>` / `Fixes #<n>` if the graph returns nothing.
   If there is no linked issue, note that — you'll skip the label transition but still merge.
3. **Sanity-check merge readiness.** Confirm the base is `main` and the PR is mergeable
   (`mergeable: MERGEABLE`, not blocked/behind/conflicting). If it isn't — merge conflicts, failing
   required checks, an unexpected base branch — surface that and stop rather than forcing it.

### 2. Confirm with the user — required

4. **Ask for explicit confirmation before doing anything destructive.** Present a clear summary and
   wait for an unambiguous yes. Do **not** proceed on silence, a vague reply, or an edit — only a
   clear approval. State exactly what will happen:
   - Merge **PR #<number> "<title>"** into **`main`**.
   - Delete the branch **`<headRefName>`** on the remote and locally.
   - Transition issue **#<issue> "<issue title>"** from `review` → `done` (or "no linked issue").

   Use AskUserQuestion (or a plain question) so the checkpoint is explicit. If the user says no or
   wants changes, stop and do not merge.

### 3. Merge, close, and clean up

5. **Merge the PR into main and delete the remote branch** in one step:
   ```
   gh pr merge <number> --merge --delete-branch
   ```
   Merging closes the PR automatically. `--delete-branch` removes the remote branch and, when you're
   on it, checks you back out to the default branch. Use `--merge` unless the user asks for
   `--squash` or `--rebase`.
6. **Delete the local branch** if it still exists:
   ```
   git checkout main && git pull --ff-only
   git branch -d <headRefName>   # -D only if the user confirms it's safe to force
   ```
   If `git branch -d` refuses because the branch looks unmerged, don't force it silently — mention it
   and ask.

### 4. Transition the linked issue to done

7. **Move the issue's status label** from `review` to `done` (the `done` label already exists in this
   repo). Do this on the **issue**, not the PR:
   ```
   gh issue edit <issue> --add-label done --remove-label review
   ```
   If the issue wasn't on `review`, still add `done` and remove whatever status label it has
   (`dev`/`review`), noting what you changed. If there was no linked issue, skip this step.
8. Leave the issue **open or closed** according to how it was already wired: if the PR's `Closes #<n>`
   auto-closed it on merge, that's expected. Don't reopen or force-close it beyond that — just make
   sure the label reflects `done`.

### 5. Report back

9. Report: the merged PR URL, that the branch was deleted (remote + local), and the issue moved to
   `done` (with its URL) — or note anything you skipped and why.

## Notes

- **The confirmation in step 4 is mandatory and is the whole point of this skill.** Never merge,
  delete a branch, or relabel the issue without a clear, explicit yes from the user in this session.
- Stop and ask if: the PR is already merged/closed, it isn't mergeable (conflicts/failing checks),
  the base isn't `main`, or the local branch won't delete cleanly.
- Keep GitHub's issue number as the identifier throughout — don't introduce a separate numbering
  scheme.
