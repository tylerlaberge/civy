---
name: impl
description: Plan and implement a specific GitHub issue end-to-end — assign it, branch, plan, implement, commit, push, open a PR, then run a sub-agent review/feedback loop on it. Use when the user runs /impl with a GitHub issue link (e.g. /impl https://github.com/tylerlaberge/civy/issues/10).
---

# impl

Take a single GitHub issue from **assigned** to **open PR** — then review that PR and address the
feedback — for this repository. The user invokes this with an issue URL, e.g.:

```
/impl https://github.com/tylerlaberge/civy/issues/10
```

Parse the issue number (and owner/repo) from that URL. All GitHub operations use the `gh` CLI
(assumed installed and authenticated). If a `gh` call fails with an auth error, tell the user to run
`gh auth login` rather than working around it.

## Steps

### 1. Prep the issue and branch

1. **Read the issue.** `gh issue view <number> --json number,title,body,labels,url`. If it's an epic
   (`epic` label) rather than a story, point that out — this skill implements one concrete story, not
   a whole epic — and ask whether to proceed or pick a sub-issue.
2. **Assign the user** to the issue: `gh issue edit <number> --add-assignee @me`.
3. **Add the `dev` label**: `gh issue edit <number> --add-label dev`. If the label doesn't exist yet,
   create it first (`gh label create dev --color 1D76DB --description "In development"`), then add it.
4. **Branch off the up-to-date default branch.** Make sure the tree is clean first (if it isn't, stop
   and ask). Then:
   ```
   git checkout main && git pull --ff-only
   git checkout -b <number>-<short-slug>
   ```
   Name the branch `<issue-number>-<short-kebab-slug-of-title>` (e.g. `11-worker-decorator`).

### 2. Plan and confirm

5. **Study the relevant code and the PRD** (`docs/PRD.md`) so the plan fits the intended architecture
   (the monorepo layout, permissions in one place, the adapter/registry pattern — see the project
   CLAUDE.md). Don't assume not-yet-built apps or packages exist; check.
6. **Enter plan mode** and produce a concrete implementation plan: what changes, in which
   apps/packages/files, the key types/functions, and anything the issue leaves ambiguous. **Derive
   the test plan from the issue's acceptance criteria** — list the tests that will prove each
   criterion, so the tests (not a satisfied reviewer) are what gate the change as done.
7. **Confirm the plan with the user** via ExitPlanMode. Do not start editing until they approve. If
   they want changes, revise and re-confirm.

### 3. Implement

8. Implement the approved plan. Follow the repo conventions: shared shapes come from
   `packages/types`, permissions stay in the single shared service, ingestion stays idempotent,
   match surrounding code style, and **write the tests from step 6 as part of the work** — the
   change isn't complete until every acceptance criterion has a test covering it. Don't open the
   review with the tests still missing.
9. **Verify before committing:** run the project checks via moon — at minimum
   `moon run <project>:lint`, `<project>:typecheck`, and `<project>:test` for the touched projects
   (or `moon check --all`). Fix anything that fails. Run the `/verify` skill for changes with a
   runtime surface.

### 4. Commit and push

10. **Commit and push.** Compose a commit message in the [[commit]] format referencing the issue
    (`Refs #<number>`), then commit and push directly — this autonomous flow doesn't gate on a commit
    message confirmation:
    ```
    git push -u origin <branch>
    ```

### 5. Open the PR

11. **Check off the acceptance criteria on the issue.** Before opening the PR, go through the issue's
    acceptance-criteria checklist and confirm the work actually satisfies **every** item — opening the
    PR means the story is complete, so all AC must be met, not just some. Then tick each met checkbox
    in the issue body (`- [ ]` → `- [x]`) and save it:
    ```
    gh issue view <number> --json body -q .body > /tmp/issue-body.md
    # flip every satisfied "- [ ]" to "- [x]" in that file
    gh issue edit <number> --body-file /tmp/issue-body.md
    ```
    If any AC is **not** met, the work isn't done — stop and finish it (or raise the gap with the
    user) rather than opening the PR with unchecked criteria.
12. **Open a pull request** targeting `main`:
    ```
    gh pr create --base main --head <branch> --fill --assignee @me
    ```
    Write a title referencing the issue and a body that summarizes the change and closes the issue
    (`Closes #<number>`), ending with the Claude Code attribution line. Prefer building the body
    explicitly over `--fill` when the commit message is thin.
13. **Transition the issue to `review`.** The `dev`/`review` labels track the issue's state, so move
    them on the **issue**, not the PR: `gh issue edit <number> --add-label review --remove-label dev`
    (create the `review` label first if it doesn't exist). Don't add a status label to the PR.
14. **Report back** the branch name, the PR URL, and a one-line summary of what shipped.

### 6. Review & feedback loop

Once the PR is open, run a review-and-address loop, **spinning off sub-agents** so the heavy
diff-reading and analysis stays out of the main conversation's context. The two sub-agents are
deliberately different kinds so the review stays independent of the implementation:

15. **Review the PR — with a *cold* reviewer.** Launch a fresh sub-agent (Agent tool,
    `subagent_type: general-purpose`) to carry out the [[mr-review]] flow on the PR URL. It must start
    cold — **do not** use a fork or pass it the implementation reasoning — so it reviews the diff
    blind, judging the code rather than the intent it already knows. It posts signed inline review
    comments autonomously and returns a summary. Relay that summary.
16. **Address the feedback — with a fork.** Launch a sub-agent (`subagent_type: fork`, which inherits
    this conversation's context) to carry out the [[mr-feedback]] flow on the same PR — addressing
    feedback is a continuation of your own work, so the context helps. **Actionable feedback includes
    comments the user left themselves** — the user may review the PR on GitHub and leave their own
    inline comments (unsigned, from the repo-owner account). Treat those exactly like any other review
    comment: gather, plan, and address them. Don't skip or get confused by a thread just because a
    human wrote it instead of the cold reviewer. It has one user checkpoint (plan approval), so drive
    it as a relay:
    - The fork gathers the actionable comments and returns a **proposed plan**. Present it to the user
      and get approval. **An edit or a push-back is not an approval** — if the user changes anything
      about the plan, relay the revision to the fork, have it restate the adjusted plan, and present it
      again. Keep iterating until the user gives a clean, explicit approval; only then proceed.
    - Continue that same fork (SendMessage with its id) to implement, verify, commit, push to the PR
      branch, reply to each addressed comment, and resolve the threads.
    If there was no actionable feedback, say so and skip to step 17.
17. **Loop until the user is satisfied.** There is no fixed iteration cap — after each pass, ask the
    user whether they want **another** review/feedback pass. If yes, repeat steps 15–16 against the
    same PR (a new cold reviewer each time). Keep looping until the user says it's been reviewed
    enough; only then stop.

### 7. Merge

18. **Merge once the user stops the loop.** When the user ends the review loop (step 17), carry out the
    [[mr-merge]] flow on the PR to land it. `mr-merge` has its own **explicit merge confirmation** —
    honor it: the user's "stop reviewing" is *not* itself merge approval, so let `mr-merge` ask for a
    clear go-ahead before merging, then merge, close the PR, delete the branch, and transition the
    linked issue from `review` to `done`.

## Notes

- Stop and ask if: the tree is dirty at branch time, the issue is unclear/underspecified, the plan is
  rejected, or verification fails in a way you can't resolve.
- The user checkpoints are the **implementation plan** (step 7), the **feedback plan** (step 16), the
  **decision to loop again** (step 17), and the **merge confirmation** (step 18, owned by `mr-merge`).
  Commit messages are not gated — commit directly once the work verifies.
- Keep GitHub's issue number as the identifier throughout — don't invent a separate numbering scheme.

## PR body format

```
Implements <issue title>.

- <key change>
- <key change>

Closes #<number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
