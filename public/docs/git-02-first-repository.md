# Your first repository: config, init, commit and push

A safe first repository is mostly preparation: identity, defaults, ignore rules, a reviewed first commit and a remote that is ready to receive it.

## 1. Identity

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

These become the author/committer identity on commits. GitHub links commits to an account by email, so use an address you control. A repository can override the identity in its local config when a project requires it.

## 2. Safer defaults

```bash
git config --global init.defaultBranch main
git config --global pull.ff only
git config --global push.default simple
git config --global fetch.prune true
git config --global core.editor "nano"
```

| Setting | Why |
|---|---|
| `init.defaultBranch main` | One consistent default branch |
| `pull.ff only` | Do not create accidental merge commits on pull |
| `push.default simple` | Push the matching branch, not an ambiguous target |
| `fetch.prune true` | Remove stale remote-tracking refs |
| `core.editor` | Know which editor Git will open |

For SSH signing and the full settings catalog, see [global settings and secrets](#/learn/git-07-settings-files-secrets).

## 3. Project files before history

Create at least:

```text
README.md
.gitignore
.env.example      # if the project uses environment variables
```

A minimal `.gitignore`:

```text
.env
.env.*
!.env.example
*.pem
*.key
id_rsa
id_ed25519
node_modules/
__pycache__/
.venv/
dist/
build/
*.log
```

Never rely on deleting a secret later. Add ignore rules before staging.

## 4. Initialize

```bash
mkdir my-project
cd my-project
git init -b main
git status
```

`git init` creates `.git/`; it creates no commit. The branch `main` is unborn until the first commit.

## 5. Stage and review

```bash
git add README.md .gitignore
git status
git diff --cached
```

`git diff --cached` is the exact snapshot the commit will contain. Read it. If it contains `.env`, a key or a token, stop and fix the ignore/index before committing.

## 6. Commit

```bash
git commit -m "Initial commit"
```

The commit is local. It records the staged content and metadata. If signing is configured, it is signed; the GitHub “Verified” badge additionally requires the public signing key to be registered with GitHub.

A good first commit message says what the repository starts with:

```text
Initial commit: project skeleton and safe defaults
```

## 7. Connect a remote

Create an empty repository on GitHub, then:

```bash
git remote add origin git@github.com:OWNER/REPO.git
git remote -v
```

SSH is the usual choice for developers; HTTPS with a credential helper is also fine. Never embed a personal access token in the URL.

If the GitHub repository was created with a README or license, it already has a commit. Fetch and integrate instead of force-pushing:

```bash
git pull --allow-unrelated-histories origin main
```

Use that only when you intend to combine unrelated histories; inspect the result.

## 8. First push

```bash
git push -u origin main
```

`-u` sets the upstream. Verify:

```bash
git status -sb
# ## main...origin/main
git log --oneline --decorate -3
```

## Push rejected?

A rejected push is not permission to force. Common causes:

- authentication failed,
- the remote branch has commits you do not have,
- branch protection rejected the push,
- you are pushing the wrong branch/remote.

Fetch, compare, merge/rebase deliberately, then push again. See [remotes and GitHub auth](#/learn/git-06-remotes-github).

## Simulate it

- [First repository: init, commit and push](#/sim/git-first-push)
- [Remotes and authentication](#/sim/git-remotes-auth)

Next: [Everyday workflow](#/learn/git-03-everyday-workflow).
