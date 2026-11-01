# Git glossary

Terms used throughout the Git and GHCR track.

## A–C

**Annotated tag** — A tag object containing a tagger, message, date and optional signature. Prefer it for releases.

**Author / committer** — The person who wrote a change and the person who created the commit. Usually the same; both are recorded.

**Blob** — Git object storing file content. Identified by a content hash.

**Branch** — A movable ref to a commit. `main` and `feature/x` are branches, not copies of the repository.

**Build context** — The files sent to a Docker builder. Distinct from Git’s working tree.

**Cache / cache hit** — A reused build or dependency artifact when inputs are unchanged.

**Commit** — A snapshot tree plus parent(s), author, committer, message and optional signature, identified by a hash.

**Commit graph** — The directed acyclic graph of commits.

**Conflict** — Both sides changed overlapping content; a human must decide the resolution.

**Conventional commit** — A message convention such as `feat:`/`fix:` that can drive changelogs and versioning.

**Credential helper** — A program that supplies HTTPS credentials without embedding them in the URL.

## D–H

**Detached HEAD** — HEAD points directly at a commit instead of a branch. New commits are unreferenced unless you create a branch.

**Digest** — An immutable content hash such as `sha256:…` for an image/manifest.

**Diverged** — Local and remote branches both have commits the other does not.

**Fast-forward** — Moving a branch forward to a descendant commit without a merge commit.

**Fetch** — Download objects and update remote-tracking refs without changing local branches or files.

**GHCR** — GitHub Container Registry.

**GitHub Actions** — GitHub’s CI/workflow runner. It builds the committed ref, not your local working tree.

**HEAD** — The ref that represents the currently checked-out commit/branch.

**History rewrite** — Changing existing commits (rebase, amend, filter). Changes hashes and requires coordination if shared.

**Hook** — A script run by Git at a lifecycle point, e.g. `pre-commit`.

## I–P

**Index / staging area** — The proposed snapshot for the next commit.

**Lightweight tag** — A simple ref to a commit, with no tag object.

**Merge** — Combine two histories, often creating a commit with two parents.

**Object** — Blob, tree, commit or tag stored in Git’s database.

**Origin** — Conventional name for the main remote.

**Pull** — Fetch plus merge or rebase, depending on config.

**Pull request** — A GitHub review workflow for a branch; not a Git primitive.

**Push** — Upload commits and update a remote ref.

**PKCE** — Unrelated to Git; see the OneGate track.

## Q–S

**Rebase** — Replay commits on a new base. Rewrites their hashes; safe only for unshared commits.

**Ref** — A name pointing at an object, e.g. `refs/heads/main`, `refs/tags/v1.1.0`, `refs/remotes/origin/main`.

**Reflog** — Local log of ref/HEAD movements. Useful for recovery; not pushed.

**Release** — GitHub metadata/notes/assets attached to a tag.

**Remote** — A named URL to another repository, e.g. `origin`.

**Remote-tracking branch** — A local record of a remote branch, e.g. `origin/main`.

**Revert** — Create a new commit that inverses an earlier commit. Safe for shared history.

**SSH signing** — Using an SSH key to sign commits/tags; verified via an allowed-signers file and/or GitHub.

**Stash** — Local temporary storage for uncommitted changes; not shared or backed up.

**Submodule** — A repository embedded at a pinned commit inside another repository.

## T–Z

**Tag** — A name for a commit; release tags should be immutable in practice.

**Tree** — Git object describing a directory and its entries.

**Upstream** — The remote branch a local branch tracks; also a conventional remote name in forks.

**Working tree** — The files currently on disk that you edit.

**Worktree** — An additional checkout linked to the same repository, useful for working on multiple branches.

**XSS/CSRF** — Web security terms; see the OneGate track.

**YAML** — The format used by Compose and GitHub Actions. Indentation is significant.

**Zero-trust** — A security model that authenticates every request; relevant to deployment and registry access.

## See also

- [Git mental model](#/learn/git-01-mental-model)
- [Global settings and secrets](#/learn/git-07-settings-files-secrets)
- [Tags, releases and GHCR](#/learn/git-08-tags-releases-ghcr)
- [Docker glossary](#/learn/docker-glossary)
