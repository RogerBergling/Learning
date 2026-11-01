# Global settings, project files and secret safety

This is the configuration chapter: the global Git settings that shape every repository, the files every project should have, SSH signing, and the difference between “not committed” and “not in history”.

## Global settings that matter

The following is a safe baseline for a Linux developer:

```bash
git config --global user.name "Roger Bergling"
git config --global user.email "github@bergling.net"

git config --global init.defaultBranch main
git config --global pull.ff only
git config --global push.default simple
git config --global fetch.prune true
git config --global core.editor "nano"

git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

| Setting | What it means | Recommended value |
|---|---|---|
| `user.name` | Author name written into commits | Your real/team name |
| `user.email` | Author email; GitHub links commits by it | An address you control |
| `init.defaultBranch` | First branch in a new repo | `main` |
| `pull.ff` | Whether pull may create a merge | `only` (fast-forward only) |
| `push.default` | Default push target | `simple` |
| `fetch.prune` | Remove stale remote-tracking branches | `true` |
| `core.editor` | Editor for commit messages/interactive commands | An editor you know |
| `gpg.format` | Signing format | `ssh` |
| `user.signingkey` | Public SSH key used for signing | `~/.ssh/id_ed25519.pub` |
| `commit.gpgsign` | Sign every commit | `true` (if signing is required) |
| `tag.gpgsign` | Sign annotated tags | `true` (optional) |
| `gpg.ssh.allowedSignersFile` | Keys/emails trusted for local verification | `~/.config/git/allowed_signers` |
| `url.git@github.com:.insteadOf` | Rewrite HTTPS GitHub URLs to SSH | Optional convenience |

Inspect them:

```bash
git config --global --list --show-origin
git config --show-origin --get user.name
```

Local overrides live in `.git/config` and affect only that repository.

## SSH commit signing

```bash
gh auth refresh -h github.com -s admin:ssh_signing_key
gh ssh-key add ~/.ssh/id_ed25519.pub --type signing
gh api user/ssh_signing_keys
```

`allowed_signers` is a local trust file. GitHub can verify a signature without it, but `git log --show-signature`/`git verify-commit` needs the file to know which principal is trusted.

Private key permissions:

```bash
chmod 600 ~/.ssh/id_ed25519
```

A private key with group/other permissions is a risk; fix it before using signing or agent forwarding.

## Project files

| File | Purpose |
|---|---|
| `README.md` | What the project is, how to run it |
| `.gitignore` | What must not enter Git |
| `.dockerignore` | What must not enter the Docker build context |
| `.editorconfig` | Consistent whitespace/line endings |
| `.gitattributes` | Line endings and binary markers |
| `.env.example` | Variable names without values |
| `LICENSE` | Legal terms |
| `SECURITY.md` | How to report a vulnerability |
| `Dockerfile` | Image recipe |
| `.github/workflows/*.yml` | CI and publishing |

### `.gitignore`

At minimum:

```text
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
*.jks
id_rsa
id_dsa
id_ecdsa
id_ed25519
.netrc
.npmrc
.pypirc
credentials.json
terraform.tfstate
terraform.tfstate.*
```

Add language/build folders. `.gitignore` affects only untracked files; an already tracked file remains tracked until removed from the index.

### `.dockerignore`

A build-context boundary, not a Git boundary. Exclude `.git`, `.env`, keys, `node_modules`, build output, tests and local caches. See [Docker builds](#/learn/docker-02-images-and-builds).

### `.gitattributes`

```text
* text=auto eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
```

This prevents line-ending churn and accidental text diffs on binaries.

### `.env.example`

Write variable names and blank/example values:

```text
DATABASE_URL=
CLIENT_SECRET=
LOG_LEVEL=info
```

Never copy real values. If `.env` exists, keep it untracked and permission-restricted (`0600`).

## Secret safety

### Before the first commit

- Add ignore rules.
- Stage explicitly.
- Read `git diff --cached`.
- Scan filenames and content for keys/tokens.
- If a secret appears, stop. Do not “fix it in the next commit”.

### After a secret was pushed

1. **Rotate/revoke the credential at the provider.**
2. Remove it from the current tree (`git rm --cached` + commit).
3. Scan reachable history.
4. Decide whether a coordinated history rewrite is justified.
5. Monitor provider audit logs and add preventive scanning.

Deleting the file in a new commit does not remove old blobs. Rewriting history changes every affected hash and requires every clone/fork/PR to be updated.

## Common secret patterns

- Private keys: `-----BEGIN … PRIVATE KEY-----`
- Cloud tokens: AWS access keys, GitHub tokens, Slack tokens, Google API keys
- Provider-specific PATs
- `.env`, `.netrc`, `.npmrc`, credential JSON, Terraform state

Pattern scanning is a guardrail, not proof. Review is still required.

## Simulate it

- [Secrets: scan, rotate and clean](#/sim/git-secrets)
- [Remotes and auth](#/sim/git-remotes-auth)

Next: [Tags, releases and GHCR](#/learn/git-08-tags-releases-ghcr).
