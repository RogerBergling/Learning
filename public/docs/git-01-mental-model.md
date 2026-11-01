# Git mental model: working tree, index, commits and refs

Git is a content-addressed object database with a few human-friendly names in front of it. Understanding four places prevents most accidental damage.

## The four places

```text
working tree --git add--> index --git commit--> local repository --git push--> remote
```

| Place | What it is | Command that inspects it |
|---|---|---|
| **Working tree** | The files you actually edit | `git diff`, `git status` |
| **Index / staging area** | The exact snapshot proposed for the next commit | `git diff --cached`, `git ls-files --stage` |
| **Local repository** | Commits, trees, blobs, tags and refs under `.git/` | `git log`, `git show` |
| **Remote** | Another repository, usually GitHub | `git fetch`, `git remote -v` |

A commit records the **index**, not automatically every file in the folder. That is why staging is a separate step and why reviewing the staged diff matters.

## Git is a graph

Each commit points to its parents:

```text
A ← B ← C   main
         \
          D ← E   feature
```

- `A`, `B`, `C` … are content-addressed commits.
- A **branch** is a movable ref pointing at one commit.
- `HEAD` points at the current branch (or directly at a commit in detached HEAD).
- A **tag** is a stable name for a commit; it does not move like a branch.
- A **remote-tracking branch** such as `origin/main` records where `main` was on the last fetch.

Nothing is “copied” when you create a branch — only a ref is written.

## Objects and hashes

Git stores:

- **blobs** — file content
- **trees** — directory entries and modes
- **commits** — snapshot tree + parent(s) + author/committer + message
- **tags** — annotated tag objects (optional)
- **refs** — names pointing at objects

The commit hash is derived from the content and metadata. Change the message, author, parent or tree and the hash changes. This is why rebasing produces new commits.

## HEAD and detached HEAD

`HEAD` is normally a pointer to a branch ref:

```text
HEAD → refs/heads/main → C
```

If you checkout a commit hash directly, `HEAD` points at the commit without a branch. New commits are then not on a branch unless you create one. A common recovery:

```bash
git switch -c rescue
```

## Fetch is not pull

- `git fetch` downloads objects and updates remote-tracking refs. It does not change your branch or working tree.
- `git pull` is fetch plus merge or rebase, depending on config.
- `git push` uploads your commits and updates a remote ref.

Use `git status -sb` to see the current branch, upstream and ahead/behind counts.

## The reflog is local

Every time HEAD or a branch moves, Git records an entry in the reflog. This is how you find a commit after a reset or branch deletion:

```bash
git reflog --date=iso | head
git switch -c rescue <sha>
```

The reflog is local and eventually expires. It is a recovery aid, not a backup.

## What belongs in Git

- Source code, configuration templates, docs, tests, lockfiles.
- `.env.example` with variable names, **not** values.
- Small binary assets only if they belong in the project.

What does not:

- `.env`, private keys, tokens, credentials.
- Build output, dependencies, caches and logs.
- Large generated artifacts that can be rebuilt.
- Personal editor settings unless the team agrees.

Use `.gitignore` before the first commit, and [secret scanning](#/learn/git-07-settings-files-secrets) before sharing.

## Simulate it

- [First repository](#/sim/git-first-push)
- [Everyday workflow](#/learn/git-03-everyday-workflow)

Next: [Your first repository](#/learn/git-02-first-repository).
