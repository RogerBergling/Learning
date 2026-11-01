# Everyday Git: status, stage, diff, commit, log

The daily loop is small. The discipline is in reviewing before history becomes permanent.

## The loop

```bash
git status
git diff
git add <paths>
git diff --cached
git commit -m "…"
git log --oneline --decorate -5
```

## `git status`

Shows the branch, upstream, staged changes, unstaged changes and untracked files.

```text
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  modified:   public/index.html

Changes not staged for commit:
  modified:   server.mjs

Untracked files:
  notes.txt
```

Short form:

```bash
git status -sb
```

## The index is a proposal

`git add` copies content into the index. It does not freeze the working tree; later edits are unstaged until added again.

Useful forms:

```bash
git add path/to/file       # one file
git add -A                  # all changes, including deletions
git add -p                  # choose hunks interactively
git add --intent-to-add f   # record the path without content
```

`git add -A` is convenient but must follow a review. `git add -p` gives precision.

## Diff views

```bash
git diff                   # working tree vs index
git diff --cached          # index vs HEAD
git diff HEAD              # working tree vs last commit
git diff --stat            # summary
git diff --word-diff       # prose-friendly
```

If you cannot explain the staged diff, do not commit it.

## Commit messages

A useful message explains the change and why, not just the files:

```text
Fix audience validation in the billing API

The API accepted any token signed by the issuer, regardless of aud.
Reject tokens whose audience is not api.billing and add a regression test.
```

Conventional prefixes (`feat:`, `fix:`, `docs:`) can help automation but do not replace meaning. For a learning lab, clarity is more important than ceremony.

## Inspecting history

```bash
git log --oneline --decorate -10
git log --graph --oneline --decorate --all
git show <sha>
git log -p -- path/to/file
git blame path/to/file
```

Use `git log --follow` to track a file across renames. `git show` is read-only; it is safe.

## Undo a staging mistake

```bash
git restore --staged path
```

This copies HEAD back into the index while leaving the working tree alone. It is the safe “I staged too much” command.

## Discard local edits carefully

```bash
git diff > backup.patch
git restore path
```

The patch is your recovery route. `git restore` overwrites working-tree content; `git clean -fdx` also deletes untracked files and is far more destructive.

## Commit only what you reviewed

- Run `git diff --cached` before every commit.
- Keep secrets and generated files out of the index.
- Do not mix unrelated changes in one commit if you can avoid it.
- Run tests after committing? Better before, on the exact staged content when possible.

## Simulate it

- [First repository](#/sim/git-first-push)
- [Branches and merge](#/sim/git-branch-merge)

Next: [Branches, merge and rebase](#/learn/git-04-branches-merge-rebase).
