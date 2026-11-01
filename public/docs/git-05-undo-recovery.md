# Undo and recovery: restore, reset, revert, stash, reflog

Every undo command changes a different place. Identify the target before running anything:

```text
working tree | index | branch/HEAD | remote
```

## Decision table

| Goal | Command | Notes |
|---|---|---|
| Unstage, keep file edits | `git restore --staged <path>` | Index only |
| Discard working-tree edits | `git diff > patch` then `git restore <path>` | Back up first |
| Remove untracked files | `git clean -n` then `git clean -f` | Destructive; never `-fdx` casually |
| Undo an unpublished commit, keep changes staged | `git reset --soft HEAD^` | Rewrites local history |
| Undo a published commit | `git revert <sha>` | New commit; safe to push |
| Fix the last unpublished commit | `git commit --amend` | New hash |
| Recover a lost commit | `git reflog`, create a rescue branch | Local only |
| Park uncommitted work | `git stash push -u` | Not a backup |
| Revert a stash drop | Usually from the patch/backup | Drop only with a patch |

## `restore`

```bash
git restore --staged src/app.js   # unstage
git restore src/app.js            # discard working-tree changes
git restore --source=HEAD~1 -- src/app.js
```

Write a patch before discarding:

```bash
mkdir -p .git/git-create-backups
umask 077
git diff > .git/git-create-backups/before-restore.patch
```

## `reset`

`reset` moves the current branch (and optionally the index/working tree):

```bash
git reset --soft HEAD^   # move branch back; keep changes staged
git reset --mixed HEAD^  # move branch and unstage; keep working tree
git reset --hard HEAD^   # move branch, unstage and discard working-tree changes
```

`--hard` is destructive. Confirm the target commit and back up first. Never reset a shared branch unless you intend to rewrite it and coordinate.

## `revert`

```bash
git revert <sha>
git push
```

Revert creates a new commit that applies the inverse diff. It is the correct way to undo a published commit on a shared branch. If the inverse conflicts, resolve and continue:

```bash
git revert --continue
git revert --abort
```

Reverting a revert re-applies the original change.

## Reflog

```bash
git reflog --date=iso | head
git log -g --oneline
git switch -c rescue <sha>
```

The reflog records HEAD and branch movements. It is local and expires according to `gc.reflogExpire`. It is not pushed and not a backup.

## Stash

```bash
git stash push -u -m "wip: login form"
git stash list
git stash show -p stash@{0}
git stash apply stash@{0}   # keep
git stash pop               # remove only if apply succeeds
git stash drop stash@{0}    # destructive; back up a patch first
```

Stashes are local. They are not shared, not pushed and not a backup. A failed apply can leave conflicts in the working tree; resolve them deliberately.

## Amend

```bash
git commit --amend
```

Amend replaces the last commit and changes its hash. It is fine for an unpublished local commit; do not amend a commit others have pulled. If you need to add files, stage them first.

## Recovery scenarios

### “I reset --hard and lost my work”

Look at the reflog, find the commit before the reset, and create a rescue branch. Uncommitted work that was never staged/committed may not be recoverable from Git; this is why patches/commits are backups.

### “I deleted a branch”

The branch ref is gone, but commits may still be reachable through the reflog, a tag, another branch or the remote. Find the tip with reflog and create a branch.

### “I pushed a bad commit”

Do not force-push shared history. Revert it, push the revert, and add a test that catches the regression.

### “I committed a secret”

Rotate the credential first. Then remove it from the current tree and decide whether a coordinated history rewrite is justified. See [secrets](#/learn/git-07-settings-files-secrets).

## Simulate it

- [Undo and recovery](#/sim/git-undo)
- [Secrets and history](#/sim/git-secrets)

Next: [Remotes and GitHub](#/learn/git-06-remotes-github).
