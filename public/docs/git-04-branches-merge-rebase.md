# Branches, merge, rebase and conflicts

Branches let independent lines of work exist without copying the repository. Merge and rebase are two different ways to integrate them; choosing the right one is a policy and safety decision.

## Branches are refs

```bash
git switch -c feature/login
git switch main
git branch -vv
```

A branch is a movable pointer to a commit. Creating/switching is local and cheap. The commits remain reachable through branches, tags, the reflog and other refs.

## Fast-forward merge

If `main` has not moved since you branched, merging just moves the `main` ref forward:

```bash
git switch main
git merge feature/login
```

No merge commit is created. The history is linear and the feature commits become part of `main`.

## True merge commit

If both branches moved, Git creates a merge commit with two parents:

```bash
git merge --no-ff feature/login
```

The merge commit records the integration point. This is usually the safest integration for shared branches because it does not rewrite existing commits.

## Rebase

Rebase replays your commits on a new base:

```bash
git switch feature/login
git fetch origin
git rebase origin/main
```

Your commits get new hashes because their parent changed. This produces a linear history. It is safe only for commits that are **not already shared**.

If the branch is shared, use merge. If you must rewrite an owned branch, use:

```bash
git push --force-with-lease
```

Never force-push `main`, release branches or a branch someone else is using.

## Conflict resolution

A conflict means both sides changed the same region and Git will not guess.

```bash
git status
# edit the files, remove <<<<<<< ======= >>>>>>> markers
git add <resolved files>
git merge --continue   # or git commit for a merge
# or:
git merge --abort
```

During a rebase:

```bash
git add <resolved files>
git rebase --continue
git rebase --abort
```

Important: during a rebase, `--ours` refers to the upstream base and `--theirs` refers to your replayed commit. That is the reverse of a normal merge from the user’s perspective.

## Safety refs and backups

Before merge/rebase or destructive cleanup, create a safety ref:

```bash
git branch backup/feature-$(date +%Y%m%d-%H%M%S)
# or a ref that does not clutter branches:
git update-ref refs/git-create-backups/feature-20261101 HEAD
```

The reflog is also useful, but explicit refs are easier to find and explain.

## Abort and recover

- `git merge --abort` returns to the pre-merge state.
- `git rebase --abort` returns to the pre-rebase state.
- `git reflog` finds previous HEAD/branch positions.
- `git reset --hard <sha>` discards all local changes; use only after a backup and with intent.
- `git revert <sha>` reverses a shared commit by creating a new commit.

## Team policy

There is no single correct merge/rebase policy. Decide explicitly:

- Merge feature → main with a merge commit (audit-friendly).
- Rebase local feature branches before opening a PR (linear).
- Squash-merge in GitHub (one commit per PR; the PR is the review unit).
- Never rebase shared branches.

Document the policy and protect the default branch.

## Simulate it

- [Branches and merge](#/sim/git-branch-merge)
- [Rebase](#/sim/git-rebase)

Next: [Undo and recovery](#/learn/git-05-undo-recovery).
