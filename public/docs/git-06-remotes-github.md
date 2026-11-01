# Remotes, GitHub, SSH and pull requests

A remote is a named URL to another repository. GitHub is a hosting and collaboration layer; Git itself only knows about commits, refs and transport.

## Remotes

```bash
git remote -v
git remote add origin git@github.com:OWNER/REPO.git
git remote add upstream git@github.com:SOURCE/REPO.git
git fetch --prune origin
```

- `origin` is the conventional name for the main remote.
- `upstream` is common in fork workflows.
- Fetch and push URLs can differ; inspect both.
- URLs with embedded tokens are refused/unsafe. Use SSH, a credential helper or `gh auth setup-git`.

## Authentication vs identity

| Concept | Purpose |
|---|---|
| SSH key / token | Proves you may read/write the remote |
| `user.name` / `user.email` | Describes the commit author |
| Signed commit | Proves a key signed the commit; GitHub may show Verified |

A valid login does not fix a missing author identity or a missing signing key.

## SSH

```bash
ssh-keygen -t ed25519 -C "you@example.com"
# add the .pub key to GitHub → Settings → SSH and GPG keys
ssh -T git@github.com
```

- Private key: keep local, permission `0600`, preferably passphrase + agent.
- Public key: safe to share; register with GitHub.
- Do not copy the private key to a server or container.

For signing keys, register the **same** public key as a signing key and configure `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true` and `gpg.ssh.allowedSignersFile`.

## Fetch, pull, push

```bash
git fetch --prune
git status -sb
git pull --ff-only
git push
```

- `fetch` downloads and updates remote-tracking refs; no local branch change.
- `pull --ff-only` fast-forwards or stops. It will not create an accidental merge.
- `push` uploads commits and updates the remote branch. `-u` sets upstream the first time.

## Divergence

```text
local:   A ← B ← C
remote:  A ← B ← D
```

Local and remote both have commits the other does not. A push is rejected (non-fast-forward). Do not force. Fetch, inspect, then:

```bash
git log --oneline --graph --all
git merge origin/main        # preserve history
# or, only for unshared local commits:
git rebase origin/main
```

If the histories are unrelated, decide which is authoritative. `--allow-unrelated-histories` is a deliberate merge, not a default.

## Pull requests

A pull request is a GitHub review workflow around a branch, not a Git command.

1. Create a branch.
2. Push it with an upstream (`git push -u origin feature/x`).
3. Open a PR with `gh pr create` or the web UI.
4. Review, discuss and update the branch.
5. Merge according to the repository policy (merge, squash, rebase).
6. Delete the branch after merge if appropriate.
7. Fetch/prune locally.

```bash
gh pr create --fill
gh pr view --web
gh pr checks
gh pr merge --squash
```

## Branch protection and reviews

Server-side protection is what actually enforces policy:

- required reviews
- required status checks
- linear history or merge strategy
- signed commits
- no force pushes/deletions on the default branch
- restricted who can push

A local hook or a reminder is not a substitute.

## Fork workflow

```bash
git clone git@github.com:YOU/REPO.git
cd REPO
git remote add upstream git@github.com:OWNER/REPO.git
git fetch upstream
git switch -c feature/x upstream/main
```

Push to `origin` (your fork); open a PR against `upstream`. Fetch `upstream` regularly.

## Multiple GitHub accounts

```bash
gh auth status
gh auth switch --hostname github.com
```

Make sure the active `gh` account and SSH key belong to the identity you intend. A valid but wrong account can push to an unexpected repository.

## Simulate it

- [Remotes and authentication](#/sim/git-remotes-auth)
- [First repository](#/sim/git-first-push)

Next: [Global settings, files and secrets](#/learn/git-07-settings-files-secrets).
