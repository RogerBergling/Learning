import { add, del, ITEM, cfg } from './helpers.js';

export const gitFirstPush = {
  id: 'git-first-push',
  title: 'First repository — init, commit and push',
  topic: 'git',
  layout: 'git',
  category: 'git',
  level: 'core',
  minutes: 9,
  tags: ['git init', 'git add', 'git commit', 'git push', '.gitignore', 'SSH', 'GitHub'],
  summary:
    'Turn a folder into a repository, choose exactly what becomes the first commit, sign it if configured, connect a remote and push without rewriting or forcing anything.',
  nodes: ['developer', 'working', 'index', 'local', 'remote'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    developer: { name: 'Developer shell', sub: 'git commands' },
    local: { name: 'Local repository', sub: '.git · first commit' },
    remote: { name: 'GitHub origin', sub: 'new empty repository' },
  },
  steps: [
    {
      from: 'developer', to: 'working', badge: 'create project files', channel: 'cli',
      detail:
        'Start with a README, a .gitignore and only the files you intend to publish. There is no repository yet; Git is not tracking anything.\n\nA `.gitignore` written before the first `git add` is much easier than removing a secret from history later.',
      vault: [add('local', ITEM.commit({ id: 'files', kind: 'commit', name: 'Project files', meta: 'untracked · not in Git yet' }))],
      tags: ['untracked', 'README', '.gitignore'],
    },
    {
      from: 'developer', to: 'local', badge: 'git init -b main', channel: 'cli',
      detail:
        '`git init` creates the `.git` directory and its configuration. `-b main` sets the first branch name immediately, avoiding a later rename from `master`.\n\nInitialization creates no commit. The branch name does not exist until there is a first commit.',
      http: {
        req: 'git init -b main',
        res: 'Initialized empty Git repository in /home/you/project/.git/',
      },
      tags: ['init', 'main', 'no commit yet'],
    },
    {
      from: 'working', to: 'index', badge: 'git add -A', channel: 'git',
      detail:
        '`git add` copies selected content into the index. The index is the exact snapshot the next commit will record; it is not a live view of the working tree.\n\n`git add -A` stages all changes, including deletions and new files. For a first commit, confirm that no secret, database or build output is included.',
      vault: [add('gitrepo', ITEM.commit({ id: 'staged', name: 'Staged snapshot', meta: 'index · first commit content' }))],
      tags: ['index', 'staging', 'snapshot'],
    },
    {
      from: 'index', to: 'index', badge: 'review the staged diff', channel: 'internal',
      detail:
        '`git diff --cached` shows what is staged — exactly what will be committed. `git status` shows tracked, staged and untracked paths.\n\nReviewing here is cheaper than amending or rewriting history later. If the diff contains `.env`, a key or a token, stop and fix the ignore rules first.',
      tags: ['diff --cached', 'review', 'secrets'],
    },
    {
      from: 'index', to: 'local', badge: 'git commit -m "Initial commit"', channel: 'git',
      detail:
        '`git commit` writes the staged snapshot plus author, timestamp, message, parent and optional signature. The commit is local; nothing has been uploaded.\n\nIf SSH signing is configured, Git signs the commit. GitHub can show it as Verified only after the public signing key is registered on your account.',
      http: {
        req: `git commit -m "Initial commit"`,
        res: '[main (root-commit) 1a2b3c4] Initial commit\n 3 files changed, 42 insertions(+)',
      },
      vault: [add('gitrepo', ITEM.commit({ id: 'commit', name: 'Initial commit', meta: 'main · 1a2b3c4' }))],
      tags: ['commit', 'signature', 'local only'],
    },
    {
      from: 'developer', to: 'remote', badge: 'git remote add origin …', channel: 'git',
      detail:
        'A remote is a name for another repository URL. `origin` is the conventional name for the main remote. Adding a remote does not create or push anything.\n\nUse SSH (`git@github.com:OWNER/REPO.git`) or an authenticated HTTPS credential helper; never embed a token in the URL.',
      http: {
        req: 'git remote add origin git@github.com:OWNER/REPO.git\ngit remote -v',
        res: 'origin  git@github.com:OWNER/REPO.git (fetch)\norigin  git@github.com:OWNER/REPO.git (push)',
      },
      tags: ['origin', 'SSH', 'no credentials in URL'],
    },
    {
      from: 'local', to: 'remote', badge: 'git push -u origin main', channel: 'git',
      detail:
        '`-u` sets the upstream so future plain `git push` and `git pull` know which remote branch this local branch tracks. The first push sends the commit and the `main` ref.\n\nA rejected first push is usually authentication, branch protection, or an existing remote commit. Fetch and inspect; do not force.',
      http: {
        req: 'git push -u origin main',
        res: `Enumerating objects: 5, done.\nTo github.com:OWNER/REPO.git\n * [new branch]      main -> main\nbranch 'main' set up to track 'origin/main'.`,
      },
      vault: [
        add('gitremote', ITEM.branch({ id: 'main', name: 'origin/main', branch: 'main', meta: 'upstream set' })),
        del('gitrepo', 'staged'),
      ],
      tags: ['push', 'upstream', 'remote branch'],
    },
    {
      from: 'developer', to: 'local', badge: 'verify before moving on', channel: 'cli',
      detail:
        '`git status -sb` should be clean and show `## main...origin/main`. `git log --oneline --decorate -3` shows the commit and the remote-tracking ref.\n\nIf status shows `No commits yet` or no upstream, the flow is not complete even if the GitHub page exists.',
      tags: ['verification', 'clean tree', 'upstream'],
    },
  ],
  notes: [
    '`git init` and `gh repo create` are different operations: one creates local metadata, the other creates a GitHub repository. The first push connects them.',
    'Use `git add <path>` when you need precision; `git add -A` is convenient but should follow a review.',
    'A signed commit proves control of a key. It does not prove the content is correct or that the branch is protected.',
    'If the remote already has an initial commit (README/license), fetch and integrate it rather than force-pushing over it.',
  ],
  config: [
    cfg('Before the first commit', [
      '`git config --global user.name` and `user.email` must be set.',
      '`git config --global init.defaultBranch main` avoids the master/main split.',
      '`git config --global pull.ff only` prevents accidental merge commits on pull.',
      '`git config --global commit.gpgsign true` plus SSH signing if you want verified commits.',
      'Create `.gitignore` before staging; never rely on deleting a secret in a later commit.',
    ]),
    cfg('Remote choices', [
      'SSH URL: `git@github.com:OWNER/REPO.git`; authenticate with an SSH key/agent.',
      'HTTPS: use a credential helper or `gh auth setup-git`; do not embed a PAT.',
      '`origin` is the default remote name; `upstream` is common for forks.',
      '`git push -u` records the upstream branch; verify with `git status -sb`.',
    ]),
  ],
  pitfalls: [
    'Committing `.env`, a private key or a token because `.gitignore` was missing.',
    'Using `git add .` without checking what the dot includes.',
    'Creating a GitHub repository with a README and then force-pushing an unrelated local history.',
    'Embedding a personal access token in the remote URL.',
    'Thinking a local commit has been uploaded; only push sends it.',
  ],
  productionChecks: [
    'Default branch is `main` and protected on GitHub.',
    'Required reviews/status checks are enabled for shared repositories.',
    'Commit signing and allowed signers are configured and verified.',
    'Secrets are ignored and scanned before the first push.',
  ],
};

export const gitBranchMerge = {
  id: 'git-branch-merge',
  title: 'Branches and merge — integrate without losing the graph',
  topic: 'git',
  layout: 'git',
  category: 'git-workflow',
  level: 'core',
  minutes: 10,
  tags: ['branch', 'switch', 'merge', 'fast-forward', 'conflict', 'graph'],
  summary:
    'Create a feature branch, commit independently, then merge it back. See the difference between a fast-forward and a real merge commit, and what to inspect before pushing.',
  nodes: ['developer', 'working', 'index', 'local', 'remote', 'reflog'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    local: { name: 'Local repository', sub: 'main + feature refs' },
  },
  steps: [
    {
      from: 'developer', to: 'local', badge: 'git switch -c feature/login',
      channel: 'cli',
      detail:
        'A branch is a movable name pointing at a commit. Creating one writes a ref; it does not copy the working tree or duplicate history.\n\nSwitch before editing so your changes are associated with the feature branch, and check `git status -sb` for a clean starting point.',
      http: {
        req: 'git switch -c feature/login',
        res: "Switched to a new branch 'feature/login'",
      },
      vault: [add('gitrepo', ITEM.branch({ id: 'feature', name: 'feature/login', branch: 'feature/login', meta: 'created from main' }))],
      tags: ['branch', 'switch', 'ref'],
    },
    {
      from: 'working', to: 'index', badge: 'edit + stage', channel: 'git',
      detail:
        'Changes belong to the working tree until staged. The branch does not automatically record every edit; a commit records the index.\n\nUse `git diff` for unstaged work and `git diff --cached` after staging. Review both before committing.',
      tags: ['working tree', 'index', 'review'],
    },
    {
      from: 'index', to: 'local', badge: 'commit on feature', channel: 'git',
      detail:
        'The commit advances only the current branch ref. `main` stays where it was until you merge or fast-forward it.\n\nThis is why a branch is cheap: no full copy, just another pointer plus the commits reachable from it.',
      vault: [add('gitrepo', ITEM.commit({ id: 'feature-commit', name: 'Feature commit', meta: 'feature/login · signed' }))],
      tags: ['commit', 'branch ref', 'history'],
    },
    {
      from: 'local', to: 'local', badge: 'inspect the graph', channel: 'internal',
      detail:
        '`git log --oneline --graph --decorate --all` shows both branch tips and the common ancestor. Understand the shape before merging.\n\nIf `main` has moved since the branch started, the merge will combine both histories rather than fast-forwarding.',
      tags: ['graph', 'common ancestor', 'decoration'],
    },
    {
      from: 'developer', to: 'local', badge: 'git switch main + merge',
      channel: 'cli',
      detail:
        'Switch to the target branch, then merge the feature branch. If the target has not moved, Git can fast-forward: it just moves the `main` ref to the feature commit.\n\nIf both sides moved, Git creates a merge commit with two parents. That preserves both histories and is the safe default for shared branches.',
      http: {
        req: 'git switch main\ngit merge --no-ff feature/login',
        res: "Merge made by the 'ort' strategy.\n 1 file changed, 12 insertions(+)",
      },
      vault: [add('gitrepo', ITEM.commit({ id: 'merge', name: 'Merge commit', meta: 'two parents · main' }))],
      tags: ['fast-forward', 'merge commit', 'two parents'],
    },
    {
      from: 'local', to: 'remote', badge: 'push main', channel: 'git',
      detail:
        'Push the updated `main`. The feature branch can be pushed separately for review, or deleted locally after merge.\n\nIf the remote `main` moved since your fetch, the push is rejected. Fetch, inspect and merge/rebase deliberately; never force shared history.',
      tags: ['push', 'divergence', 'no force'],
    },
    {
      from: 'local', to: 'reflog', badge: 'delete branch safely', channel: 'internal',
      detail:
        'Deleting a merged branch removes the name, not the commits. The reflog and `main` still reach the merge history.\n\nIf a branch is not merged, `git branch -d` refuses; `-D` is destructive but recoverable for a while through reflog/reflog expiry. Create a safety ref before risky operations.',
      vault: [del('gitrepo', 'feature')],
      tags: ['delete branch', 'reflog', 'safety ref'],
    },
  ],
  notes: [
    'A fast-forward is not a merge commit; it simply moves the branch pointer. `--no-ff` forces a merge commit when you want an explicit integration point.',
    'Merge preserves history; rebase rewrites the commits being replayed. Rebase only commits that are not shared.',
    'Conflicts are Git asking you to decide, not a failure. Resolve, stage, and continue; or abort cleanly.',
    'Delete merged branches, but keep the remote branch until the pull request is merged and reviewed.',
  ],
  config: [
    cfg('Branch commands', [
      '`git switch -c name` — create and switch.',
      '`git switch main` — switch to an existing branch.',
      '`git branch -vv` — local branches, upstream and ahead/behind.',
      '`git merge --no-ff feature` — explicit merge commit.',
      '`git branch -d feature` — safe delete only if merged.',
      '`git branch -D feature` — force delete; create a safety ref first.',
    ]),
    cfg('Conflict workflow', [
      'Run `git status` to see conflicted paths.',
      'Open each file, choose the correct combination, remove markers.',
      '`git add <file>` marks it resolved.',
      '`git merge --continue` or `git commit` completes the merge.',
      '`git merge --abort` returns to the pre-merge state.',
    ]),
  ],
  pitfalls: [
    'Rebasing a shared branch and force-pushing it.',
    'Deleting an unmerged branch without a safety ref.',
    'Merging with a dirty working tree and losing track of what changed.',
    'Resolving conflicts by accepting “ours” or “theirs” without reading the code.',
    'Pushing to `main` directly when the repository requires a pull request.',
  ],
  productionChecks: [
    'Protect the default branch and require review.',
    'Use short-lived feature branches and delete them after merge.',
    'Test the merge result in CI, not only each branch individually.',
    'Use a consistent merge/rebase policy for the team.',
  ],
};

export const gitRebase = {
  id: 'git-rebase',
  title: 'Rebase — replay local work on a moving base',
  topic: 'git',
  layout: 'git',
  category: 'git-workflow',
  level: 'advanced',
  minutes: 10,
  tags: ['fetch', 'diverged', 'rebase', 'force-push', 'linear history', 'conflict'],
  summary:
    'The remote moved while you worked. Fetch, compare, and rebase only your unpublished commits. See exactly which history changes, why this requires a force-push if the branch was shared, and when to merge instead.',
  nodes: ['developer', 'working', 'local', 'remote', 'reflog'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    local: { name: 'Local branch', sub: 'feature commits to replay' },
    remote: { name: 'GitHub origin', sub: 'main moved ahead' },
  },
  steps: [
    {
      from: 'local', to: 'remote', badge: 'git fetch --prune', channel: 'git',
      detail:
        'Fetch downloads new remote refs and objects without changing your local branch or working tree. `--prune` removes remote-tracking refs for branches deleted on the remote.\n\nFetch first; then compare. Do not pull blindly into a dirty or diverged branch.',
      http: {
        req: 'git fetch --prune origin',
        res: 'From github.com:OWNER/REPO\n   abc1234..def5678  main -> origin/main',
      },
      tags: ['fetch', 'prune', 'read-only'],
    },
    {
      from: 'remote', to: 'local', badge: 'compare local and remote', channel: 'git',
      detail:
        '`git status -sb` shows ahead/behind. `git log --oneline --graph --all` shows the fork point. `git merge-base HEAD origin/main` identifies the common ancestor.\n\nIf local has commits the remote does not, and the remote has commits you do not have, the histories diverged.',
      tags: ['ahead/behind', 'merge-base', 'diverged'],
    },
    {
      from: 'local', to: 'reflog', badge: 'safety ref before rewrite', channel: 'internal',
      detail:
        'Before a rebase, write a backup ref such as `refs/git-create-backups/feature-…` or a branch. Rebasing rewrites the commits on your branch; the old commits remain reachable through the reflog for a while, but an explicit ref is clearer.\n\nThe reflog is local. It is not pushed and can expire.',
      vault: [add('gitrepo', ITEM.commit({ id: 'backup', name: 'Safety ref', meta: 'pre-rebase tip' }))],
      tags: ['backup', 'reflog', 'rewrite'],
    },
    {
      from: 'local', to: 'local', badge: 'git rebase origin/main', channel: 'internal',
      detail:
        'Rebase finds the common ancestor, takes your local commits, and replays them on top of `origin/main`. The new commits have new hashes because their parent changed.\n\nThis is only safe when those commits are not already shared. If someone else has them, you are rewriting published history.',
      http: {
        req: 'git rebase origin/main',
        res: 'Successfully rebased and updated refs/heads/feature/login.',
      },
      vault: [add('gitrepo', ITEM.commit({ id: 'replayed', name: 'Replayed commits', meta: 'new hashes · linear' }))],
      tags: ['replay', 'new hashes', 'not shared'],
    },
    {
      from: 'local', to: 'local', badge: 'resolve conflicts one commit at a time', channel: 'internal',
      detail:
        'A conflict pauses the rebase. `git status` shows the files; edit them, `git add` the resolution, then `git rebase --continue`. Use `git rebase --abort` to return to the pre-rebase state.\n\nDuring a rebase, `--ours` is the upstream base and `--theirs` is your replayed commit; that is the opposite of what many people expect.',
      tags: ['conflict', 'continue', 'abort', 'ours/theirs'],
    },
    {
      from: 'local', to: 'remote', badge: 'push with lease (only if yours)', channel: 'git',
      detail:
        'After rewriting a branch that only you own, the push needs a force. Prefer `--force-with-lease` so you do not overwrite someone else’s newer commits. Even then, confirm the branch is not shared.\n\nFor shared branches, merge instead; never force-push `main`.',
      tags: ['force-with-lease', 'shared history', 'merge instead'],
    },
    {
      from: 'developer', to: 'local', badge: 'verify the final graph', channel: 'cli',
      detail:
        'Check `git status -sb`, `git log --oneline --graph --decorate -10`, and the diff against the remote. If the graph or content is wrong, reset to the safety ref by hash and try a merge.\n\nA clean linear history is a preference, not a reason to endanger shared work.',
      tags: ['verify', 'reflog recovery', 'policy'],
    },
  ],
  notes: [
    'Rebase changes commit hashes. That is why it is unsuitable for commits other people already have.',
    'Merge preserves exact history and is the safer default for shared branches. Rebase is best for local cleanup before review.',
    '`--force-with-lease` is safer than `--force`, but it still rewrites remote history. Know who owns the branch.',
    'Create a safety ref before any history rewrite; the reflog is a recovery aid, not a backup strategy.',
  ],
  config: [
    cfg('Safe rebase checklist', [
      'Fetch first and inspect the graph.',
      'Confirm your commits are not on any remote branch or tag.',
      'Create a safety branch/ref.',
      'Rebase only your own local commits.',
      'Resolve conflicts deliberately; abort if unsure.',
      'Force-with-lease only on an owned branch.',
    ]),
    cfg('Commands', [
      '`git merge-base HEAD origin/main` — common ancestor.',
      '`git log --oneline --graph --all --decorate` — shape.',
      '`git rebase origin/main` — replay local commits.',
      '`git rebase --continue` / `--abort` — finish or return.',
      '`git push --force-with-lease` — guarded rewrite of an owned branch.',
    ]),
  ],
  pitfalls: [
    'Rebasing a branch that other people have pulled.',
    'Using `--force` when `--force-with-lease` would prevent a lost update.',
    'Resolving conflicts without testing the final state.',
    'Forgetting that `--ours` and `--theirs` are reversed during rebase.',
    'No safety ref before a rewrite.',
  ],
  productionChecks: [
    'Protect main and release branches from force pushes.',
    'Document whether the team uses merge or rebase for feature branches.',
    'Require CI on the rewritten branch before force-with-lease.',
    'Keep reflog expiry long enough for recovery on critical workstations.',
  ],
};

export const gitUndo = {
  id: 'git-undo',
  title: 'Undo and recovery — restore, reset, revert, reflog and stash',
  topic: 'git',
  layout: 'git',
  category: 'git-workflow',
  level: 'advanced',
  minutes: 12,
  tags: ['restore', 'unstage', 'reset --soft', 'revert', 'reflog', 'stash', 'backup patch'],
  summary:
    'Every undo is a different operation. Learn which one touches the working tree, which one touches the index, which one rewrites local history and which one safely reverses shared history.',
  nodes: ['developer', 'working', 'index', 'local', 'remote', 'reflog'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    reflog: { name: 'Reflog & backup patches', sub: 'local recovery' },
  },
  steps: [
    {
      from: 'working', to: 'index', badge: 'stage a change', channel: 'git',
      detail:
        'Start from a concrete state: a modified tracked file is staged but not committed. The working tree, index and HEAD now differ.\n\nKnow which of the three places your recovery command will affect before running it.',
      tags: ['working tree', 'index', 'HEAD'],
    },
    {
      from: 'index', to: 'working', badge: 'git restore --staged', channel: 'git',
      detail:
        '`git restore --staged <path>` copies the path from HEAD back into the index. It unstages the change but leaves the working-tree file untouched.\n\nThis is the safe “I staged too much” operation. It does not discard your edits.',
      http: {
        req: 'git restore --staged src/app.js\ngit status -sb',
        res: 'M  src/app.js  ->  M src/app.js',
      },
      tags: ['unstage', 'index only', 'safe'],
    },
    {
      from: 'developer', to: 'working', badge: 'git restore --source=HEAD', channel: 'cli',
      detail:
        'Discarding working-tree edits is destructive. Before doing it, write a patch: `git diff > .git/git-create-backups/…patch` with restrictive permissions, then run the restore.\n\n`git restore` restores files; `git clean` removes untracked files and is even more destructive. Never run `git clean -fdx` casually.',
      vault: [add('reflog', ITEM.commit({ id: 'patch', name: 'Backup patch', meta: 'working-tree edits · 0600' }))],
      tags: ['discard', 'backup patch', 'clean'],
    },
    {
      from: 'developer', to: 'local', badge: 'git reset --soft HEAD^', channel: 'cli',
      detail:
        'A soft reset moves the current branch back one commit while leaving the changes staged. It rewrites only local history; the old commit is still in the reflog.\n\nNever soft-reset a commit that is already on a shared remote; use `git revert` for shared history.',
      vault: [add('gitrepo', ITEM.commit({ id: 'soft', name: 'Soft reset tip', meta: 'local only · changes staged' }))],
      tags: ['soft reset', 'local history', 'unpublished'],
    },
    {
      from: 'local', to: 'remote', badge: 'git revert <commit>', channel: 'git',
      detail:
        'Revert creates a new commit that applies the inverse diff. It does not erase history, so it is safe to push to a shared branch.\n\nUse revert for a published bad commit. Resolve conflicts if the inverse change is no longer clean.',
      http: {
        req: 'git revert 1a2b3c4\ngit push',
        res: '[main 9f8e7d6] Revert "…"\n 1 file changed, 4 deletions(-)',
      },
      vault: [add('gitrepo', ITEM.commit({ id: 'revert', name: 'Revert commit', meta: 'new commit · shared history' }))],
      tags: ['revert', 'shared history', 'new commit'],
    },
    {
      from: 'local', to: 'reflog', badge: 'find the lost commit', channel: 'internal',
      detail:
        'The reflog records where HEAD and branches pointed over time. `git reflog` and `git log -g` can find a commit after a reset or branch deletion.\n\nRecover with `git switch -c rescue <commit>` or `git reset --hard <commit>` only after confirming the target. The reflog is local and eventually expires.',
      http: {
        req: 'git reflog --date=iso | head',
        res: '1a2b3c4 HEAD@{0}: reset: moving to HEAD^\n9f8e7d6 HEAD@{1}: commit: feature',
      },
      tags: ['reflog', 'recover', 'local only'],
    },
    {
      from: 'working', to: 'reflog', badge: 'git stash push', channel: 'internal',
      detail:
        'Stash saves uncommitted work on a local stack so you can switch context without committing. It is not pushed and is not a backup; a failed apply leaves conflicts in the working tree.\n\nUse `git stash push -u` to include untracked files, `git stash list` to inspect and `git stash pop` only when you are ready to resolve conflicts.',
      vault: [add('reflog', ITEM.commit({ id: 'stash', name: 'Stash entry', meta: 'local · not pushed' }))],
      tags: ['stash', 'local', 'context switch'],
    },
  ],
  notes: [
    'Ask which of the four places a command changes: working tree, index, branch/HEAD, or remote.',
    '`restore` and `clean` affect files; `reset` and `revert` affect history (differently); `stash` is temporary local storage.',
    'A patch or safety ref before a destructive action is cheaper than hoping the reflog covers you.',
    'A revert of a revert re-applies the original change; it is not magic, just another commit.',
  ],
  config: [
    cfg('Undo decision table', [
      'Unstage but keep edits: `git restore --staged <path>`.',
      'Discard edits: write a patch, then `git restore <path>`; never `clean -fdx` casually.',
      'Undo an unpublished commit, keep changes staged: `git reset --soft HEAD^`.',
      'Undo a published commit: `git revert <sha>` and push normally.',
      'Find lost work: `git reflog`, then create a rescue branch.',
      'Park work: `git stash push -u`; apply/pop deliberately.',
    ]),
    cfg('Safety habits', [
      'Create a backup branch/ref before rewriting history.',
      'Back up discardable working-tree changes as a patch.',
      'Check whether HEAD is on a remote branch or tag before reset/amend.',
      'Never use `git reset --hard` as a first response to a mistake.',
    ]),
  ],
  pitfalls: [
    'Using `reset --hard` and losing uncommitted work.',
    'Force-pushing rewritten history to a shared branch instead of reverting.',
    'Assuming `git stash` is backed up or shared.',
    'Dropping a stash without a patch backup.',
    'Running `git clean -fdx` in a directory with untracked source or secrets.',
  ],
  productionChecks: [
    'Revert shared commits; never rewrite shared history.',
    'Protect release branches from force pushes.',
    'Keep recovery procedures documented and tested.',
    'Back up patches/safety refs before destructive local operations.',
  ],
};

export const gitSecrets = {
  id: 'git-secrets',
  title: 'Secrets — ignore, scan, rotate, then clean history',
  topic: 'git',
  layout: 'git',
  category: 'git-security',
  level: 'advanced',
  minutes: 10,
  tags: ['.gitignore', '.env', 'secret scan', 'history', 'rotate', 'filter-repo'],
  summary:
    'A token is sitting in a file. Prevent it from entering a commit, scan both the working tree and Git history, rotate the credential first, then decide whether history rewriting is justified.',
  nodes: ['developer', 'working', 'index', 'local', 'remote', 'reflog'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    local: { name: 'Commit history', sub: 'all reachable objects' },
    remote: { name: 'GitHub / provider', sub: 'credential must be rotated' },
  },
  steps: [
    {
      from: 'working', to: 'index', badge: 'a secret file is staged', channel: 'git',
      detail:
        'The current commit is not the only risk. A file staged now will enter history; a file pushed already must be treated as compromised.\n\nStop before committing. Look at the staged diff and filenames, not only the working tree.',
      vault: [add('local', ITEM.secret({ id: 'token', name: 'Leaked token', meta: 'staged · do not commit' }))],
      tags: ['staged secret', 'stop', 'history'],
    },
    {
      from: 'index', to: 'index', badge: 'scan filenames + content', channel: 'internal',
      detail:
        'Check sensitive filenames (`.env`, keys, credentials) and content patterns (private keys, cloud tokens, GitHub tokens). A pattern scan is a guardrail, not proof that everything is safe.\n\nIf a false positive is intentional, require an explicit typed confirmation rather than silently bypassing the scan.',
      tags: ['secret scan', 'patterns', 'guardrail'],
    },
    {
      from: 'working', to: 'working', badge: 'add .gitignore rules', channel: 'git',
      detail:
        'Add `.env`, `.env.*`, private keys, credentials files and local build output. Keep `!.env.example` if you want to document variable names.\n\n`.gitignore` only affects untracked files. A file already tracked stays tracked until removed from the index.',
      vault: [add('local', ITEM.file({ id: 'gitignore', name: '.gitignore', meta: '.env · keys · credentials', value: '.env\n.env.*\n!.env.example\n*.pem\n*.key\nid_ed25519\n' }))],
      tags: ['.gitignore', 'untracked only', 'env.example'],
    },
    {
      from: 'local', to: 'reflog', badge: 'scan reachable history', channel: 'internal',
      detail:
        'Scan all reachable commits and blobs, not just HEAD. Deleting the file in a new commit does not remove the old blob from history.\n\nHistory scans are bounded for performance. Findings need triage; a clean current tree does not imply a clean history.',
      tags: ['history scan', 'blobs', 'bounded'],
    },
    {
      from: 'developer', to: 'remote', badge: 'rotate the credential first', channel: 'deploy',
      detail:
        'Assume any secret that reached a remote, a log or another machine is compromised. Revoke/rotate it at the provider before worrying about Git history.\n\nRewriting history cannot unshare a secret that someone already copied or a bot already indexed.',
      tags: ['rotate', 'revoke', 'assume compromise'],
    },
    {
      from: 'local', to: 'remote', badge: 'remove from current tree', channel: 'git',
      detail:
        '`git rm --cached <path>` stops tracking a file without deleting the local copy. Commit the removal and push normally. This fixes the current tree only; history still contains old blobs.\n\nIf the file was never pushed, amending/unpushed cleanup is lower risk. If it was pushed, coordinate any history rewrite with every clone/fork.',
      tags: ['git rm --cached', 'current tree', 'not history'],
    },
    {
      from: 'local', to: 'local', badge: 'history rewrite decision', channel: 'internal',
      detail:
        'History rewriting with `git filter-repo` changes commit hashes and requires all collaborators to re-clone or reset. It is justified for a real leaked credential after rotation, not for cosmetic cleanup.\n\nMake a mirror/backup, coordinate, then run it. Force-push tags/branches only with an explicit plan.',
      tags: ['filter-repo', 'coordination', 'force'],
    },
    {
      from: 'developer', to: 'remote', badge: 'verify and monitor', channel: 'git',
      detail:
        'After rotation and cleanup, confirm the old credential is invalid, scan the new history, and monitor provider audit logs for misuse.\n\nAdd a pre-commit secret scan and CI scanning so the next occurrence is caught earlier.',
      tags: ['verify', 'monitor', 'pre-commit'],
    },
  ],
  notes: [
    'Rotate first. A history rewrite is cleanup, not incident response.',
    '`.gitignore` prevents future staging; it does not remove already tracked files or old blobs.',
    'Secret scanning is probabilistic. Combine filename rules, content patterns, provider-side scanning and review.',
    'History rewrites are a coordination event. Every clone, fork and open PR is affected.',
    'Keep `.env.example` with names only; never copy values into it.',
  ],
  config: [
    cfg('Baseline .gitignore', [
      '`.env`, `.env.*`, and `!.env.example`.',
      '`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `id_rsa`, `id_ed25519`.',
      '`.netrc`, `.npmrc`, `.pypirc`, `credentials.json`, Terraform state.',
      'Build output, dependencies, logs and editor files.',
    ]),
    cfg('Incident order', [
      'Stop committing/pushing the secret.',
      'Rotate/revoke it at the provider.',
      'Remove from the current tree and commit the fix.',
      'Scan history and decide whether a coordinated rewrite is required.',
      'Monitor for misuse and add preventive scanning.',
    ]),
  ],
  pitfalls: [
    'Deleting a secret in a new commit and assuming it is gone from history.',
    'Committing `.env` because it “only has local values”.',
    'Running `filter-repo` before rotating the credential.',
    'Rewriting shared history without coordinating with every clone and open PR.',
    'Trusting a single regex scan as complete proof.',
  ],
  productionChecks: [
    'Secret scanning in pre-commit and CI.',
    'Provider-side push protection and audit logs.',
    'Documented rotation and incident response.',
    'No secrets in images, build args, logs or CI outputs.',
  ],
};

export const gitRemotesAuth = {
  id: 'git-remotes-auth',
  title: 'Remotes and GitHub auth — SSH, fetch, pull and push',
  topic: 'git',
  layout: 'git',
  category: 'git-workflow',
  level: 'core',
  minutes: 9,
  tags: ['origin', 'upstream', 'SSH', 'gh auth', 'fetch', 'pull', 'push', 'diverged'],
  summary:
    'Connect a local clone to GitHub, authenticate with SSH, fetch before changing anything, and handle a rejected push by inspecting divergence instead of forcing.',
  nodes: ['developer', 'working', 'local', 'remote', 'reflog'],
  stores: ['local', 'gitrepo', 'gitremote'],
  nodeLabels: {
    remote: { name: 'GitHub origin', sub: 'SSH + branch protection' },
  },
  steps: [
    {
      from: 'developer', to: 'remote', badge: 'SSH key + gh auth status', channel: 'git',
      detail:
        'Authentication proves who may read or write. SSH uses a key pair; the public key is registered with GitHub and the private key stays on your machine, protected by permissions and preferably an agent/passphrase.\n\n`ssh -T git@github.com` and `gh auth status` verify authentication. A valid Git identity is separate from authentication.',
      http: {
        req: 'ssh -T git@github.com\ngh auth status',
        res: `Hi OWNER! You've successfully authenticated...\n✓ Logged in to github.com as OWNER`,
      },
      tags: ['SSH', 'gh auth', 'identity'],
    },
    {
      from: 'developer', to: 'local', badge: 'git remote -v', channel: 'cli',
      detail:
        'A remote is a name plus URL. Check both fetch and push URLs; they can differ. `origin` usually points at your fork or the main repository, and `upstream` at the source repository in a fork workflow.\n\nNever put a token in the URL. Use SSH or a credential helper.',
      tags: ['remote', 'fetch URL', 'push URL'],
    },
    {
      from: 'local', to: 'remote', badge: 'git fetch --prune', channel: 'git',
      detail:
        'Fetch updates remote-tracking refs (`origin/main`) without touching your local branch or working tree. It is the safe first step when anything feels out of sync.\n\nAhead/behind counts in `git status -sb` come from these refs.',
      tags: ['fetch', 'remote-tracking', 'read-only'],
    },
    {
      from: 'remote', to: 'local', badge: 'fast-forward pull', channel: 'git',
      detail:
        'If the local branch is behind and the working tree is clean, `git pull --ff-only` moves the branch forward without a merge commit. If a fast-forward is impossible, stop and inspect instead of creating accidental history.\n\nFetch + merge is the explicit two-step version of pull.',
      http: {
        req: 'git pull --ff-only',
        res: 'Fast-forward\n src/app.js | 4 ++--',
      },
      tags: ['pull', 'fast-forward', 'clean tree'],
    },
    {
      from: 'local', to: 'remote', badge: 'push rejected: non-fast-forward', channel: 'git',
      detail:
        'A rejected push means the remote has commits you do not have. It is not a reason to force. Fetch, inspect `git log --graph --all`, then merge or rebase your local work onto the new remote tip.\n\nIf the histories are unrelated, do not force; decide which repository/history is authoritative.',
      tags: ['rejected push', 'diverged', 'no force'],
    },
    {
      from: 'developer', to: 'local', badge: 'set upstream', channel: 'cli',
      detail:
        '`git push -u origin main` records the remote as upstream. `git branch --set-upstream-to=origin/main` repairs it later.\n\nA missing upstream makes plain `git push`/`pull` ambiguous. Check `git status -sb`; it prints the tracking relationship.',
      tags: ['upstream', 'tracking', 'status -sb'],
    },
    {
      from: 'remote', to: 'reflog', badge: 'recover from a bad local state', channel: 'internal',
      detail:
        'If a fetch/pull/reset left you somewhere unexpected, the reflog records previous branch tips. Create a rescue branch or reset deliberately to a known commit. Do not force-push to “fix” the remote.\n\nRemote history is shared; local reflog is your safety net.',
      vault: [add('gitrepo', ITEM.branch({ id: 'rescue', name: 'rescue branch', branch: 'rescue', meta: 'local recovery' }))],
      tags: ['reflog', 'rescue', 'shared history'],
    },
  ],
  notes: [
    'Authentication and author identity are different: SSH proves access; user.name/user.email describe the commit author.',
    'Fetch is safe. Pull combines fetch with merge or rebase depending on config; use `--ff-only` to avoid surprises.',
    'A fork usually has `origin` (your fork) and `upstream` (the source project). Fetch both when you need to compare.',
    'Branch protection may reject a push even when authentication succeeds. Read the error; do not assume it is a key problem.',
  ],
  config: [
    cfg('Remote and auth commands', [
      '`ssh -T git@github.com` — test SSH authentication.',
      '`gh auth status` / `gh auth login` — GitHub CLI session.',
      '`git remote -v` — fetch/push URLs.',
      '`git fetch --prune origin` — update remote refs.',
      '`git pull --ff-only` — safe fast-forward-only update.',
      '`git push -u origin main` — first push and upstream setup.',
      '`git status -sb` — branch + ahead/behind.',
    ]),
    cfg('Global URL rewrite (optional)', [
      '`git config --global url."git@github.com:".insteadOf "https://github.com/"`',
      'Lets you paste HTTPS GitHub URLs while Git uses SSH underneath.',
      'Ensure your SSH key and agent are configured; a rewrite does not create authentication.',
    ]),
  ],
  pitfalls: [
    'Force-pushing after a rejected push because “the remote is wrong”.',
    'Embedding a PAT in the remote URL or shell history.',
    'Using the wrong GitHub account when multiple gh accounts are authenticated.',
    'Forgetting `-u` on the first push and then wondering why plain push has no target.',
    'Pulling with a dirty working tree and creating a conflict you did not intend.',
  ],
  productionChecks: [
    'SSH keys have passphrases and private-key permissions are 0600.',
    'Branch protection requires review/status checks on main.',
    'CI uses scoped tokens, not personal credentials.',
    'No force-push to shared branches; enforce it server-side.',
  ],
};

export const gitReleaseGhcr = {
  id: 'git-release-ghcr',
  title: 'Release to GHCR — tag, Actions, image and verified pull',
  topic: 'git',
  layout: 'git',
  category: 'git-delivery',
  level: 'advanced',
  minutes: 12,
  tags: ['tag', 'release', 'GitHub Actions', 'GHCR', 'semver', 'image digest', 'version.json'],
  summary:
    'Turn a reviewed commit into a release: create a version tag, let GitHub Actions build and push the image, then pull it on the deployment host and prove the version with /version.json.',
  nodes: ['developer', 'local', 'remote', 'actions', 'ghcr', 'server'],
  stores: ['local', 'gitrepo', 'gitremote', 'github', 'registry', 'deployment'],
  nodeLabels: {
    remote: { name: 'GitHub repository', sub: 'commit + tag + workflow' },
    actions: { name: 'GitHub Actions', sub: 'build · push GHCR' },
    ghcr: { name: 'GHCR package', sub: 'tag + immutable digest' },
    server: { name: 'Deployment host', sub: 'pull · run · verify' },
  },
  steps: [
    {
      from: 'developer', to: 'local', badge: 'git tag -a v1.1.0 -m …', channel: 'cli',
      detail:
        'A release starts from a known commit. An annotated tag stores a message, tagger and date; a signed tag also carries a signature. A lightweight tag is just a ref.\n\nTag the commit you actually tested, not a later working-tree state. The tag is local until pushed.',
      http: {
        req: 'git tag -a v1.1.0 -m "Learning Lab 1.1.0"',
        res: '',
      },
      vault: [add('gitrepo', ITEM.tag({ id: 'release', name: 'v1.1.0', tag: 'v1.1.0', meta: 'annotated · tested commit' }))],
      tags: ['tag', 'annotated', 'release commit'],
    },
    {
      from: 'local', to: 'remote', badge: 'git push origin v1.1.0', channel: 'git',
      detail:
        'Pushing the tag publishes the release marker. Tags are not pushed by a normal branch push unless configured; push them explicitly.\n\nBranch protection and tag protection rules apply separately. Do not move a release tag after consumers have pulled it.',
      http: {
        req: 'git push origin v1.1.0',
        res: 'To github.com:OWNER/REPO.git\n * [new tag]         v1.1.0 -> v1.1.0',
      },
      vault: [add('gitremote', ITEM.tag({ id: 'release', name: 'origin v1.1.0', tag: 'v1.1.0', meta: 'immutable release marker' }))],
      tags: ['push tag', 'tag protection', 'immutability'],
    },
    {
      from: 'remote', to: 'actions', badge: 'workflow triggered by tag', channel: 'ci',
      detail:
        'The workflow trigger decides whether this tag builds. A `tags: ["v*"]` filter does; a branch-only trigger does not. Check the run’s SHA and ref before trusting the green badge.\n\nThe workflow needs `contents: read` and `packages: write`, and must authenticate to GHCR with the built-in token or a scoped token.',
      http: {
        req: 'push refs/tags/v1.1.0\n.github/workflows/docker-publish.yml',
        res: `Run #42 · refs/tags/v1.1.0 · success\npermissions: contents: read, packages: write`,
      },
      vault: [add('github', ITEM.workflow({ id: 'wf', name: 'GHCR publish workflow', meta: 'tag v1.1.0 · success' }))],
      tags: ['trigger', 'permissions', 'SHA'],
    },
    {
      from: 'actions', to: 'ghcr', badge: 'build + push image', channel: 'registry',
      detail:
        'Buildx builds the image and pushes it under the repository-derived name. Metadata action generates tags (version, branch, SHA); the digest is the immutable identity.\n\nA version tag can still move if someone republishes it. Record the digest, not just the tag.',
      vault: [
        add('github', ITEM.image({ id: 'image', name: 'Built image', meta: 'v1.1.0 · sha-… · digest' })),
        add('registry', ITEM.image({ id: 'image', name: 'GHCR image', meta: 'v1.1.0 · digest sha256:…' })),
      ],
      tags: ['buildx', 'metadata', 'digest', 'GHCR'],
    },
    {
      from: 'ghcr', to: 'server', badge: 'pull release / digest', channel: 'registry',
      detail:
        'The deployment host pulls the release tag or digest. Private packages need registry authentication; public packages allow anonymous pulls.\n\nPrefer a version or digest over `latest`. Verify the package is the one linked to this repository and that the server is pulling the new name after a repository rename.',
      http: {
        req: 'docker pull ghcr.io/owner/repo:v1.1.0',
        res: 'Digest: sha256:…',
      },
      vault: [add('deployment', ITEM.image({ id: 'image', name: 'Deployed image', meta: 'v1.1.0 · verified digest' }))],
      tags: ['pull', 'private package', 'digest'],
    },
    {
      from: 'server', to: 'server', badge: 'recreate + healthcheck', channel: 'deploy',
      detail:
        'Start a new container from the pulled image and let the healthcheck prove it can serve traffic. Compose/Watchtower must recreate the container; pulling alone is not enough.\n\nNamed volumes and networks persist. The old container/image can be kept for rollback.',
      tags: ['recreate', 'healthcheck', 'rollback'],
    },
    {
      from: 'server', to: 'developer', badge: 'GET /version.json', channel: 'deploy',
      detail:
        'The version stamp must show the release version, image tag, commit and build date. This is the end-to-end proof that tag → workflow → registry → pull → runtime is complete.\n\nIf the old values remain, inspect the running digest, the container start time, the proxy cache and the host’s pull policy.',
      http: {
        req: 'GET /version.json HTTP/1.1\nHost: learning.example.com',
        res: `{"version":"1.1.0","imageTag":"v1.1.0","commit":"c4d8cf5","buildDate":"…"}`,
      },
      tags: ['version stamp', 'end-to-end', 'verification'],
    },
    {
      from: 'remote', to: 'developer', badge: 'gh release create v1.1.0', channel: 'deploy',
      detail:
        'A GitHub release attaches notes and optional assets to the tag. It is metadata around the tag, not a separate build. Generate notes from commits and link the published image digest.\n\nKeep release notes factual: what changed, how to verify the digest, and any migration steps.',
      tags: ['release notes', 'assets', 'digest'],
    },
  ],
  notes: [
    'A tag names a commit; an image tag names an image manifest. Release both deliberately and record the digest.',
    'The workflow trigger is part of the release contract. A tag that does not match the trigger publishes nothing.',
    'GHCR package visibility, linked repository and token permissions are separate from Git branch permissions.',
    'A repository rename changes the image name produced by `${{ github.repository }}`; old package paths do not update automatically.',
    'Automated updaters are convenient but need a rollback and verification plan.',
  ],
  config: [
    cfg('Release checklist', [
      'Test the exact commit on the default branch.',
      'Create an annotated/signed tag `vX.Y.Z` on that commit.',
      'Push the tag explicitly.',
      'Confirm the tag-triggered workflow ran for that ref.',
      'Record the GHCR digest and package visibility.',
      'Pull/recreate on the host and verify `/version.json` + health.',
      'Write release notes and keep the previous digest for rollback.',
    ]),
    cfg('GHCR workflow essentials', [
      '`on: push: tags: ["v*"]` and optionally `workflow_dispatch`.',
      '`permissions: contents: read, packages: write`.',
      'Login with `GITHUB_TOKEN` for a repository-linked package.',
      'Metadata tags: semver, major/minor, SHA; include the digest in release notes.',
      'Build multi-arch only if the deployment hosts need it; every platform costs build time.',
    ]),
  ],
  pitfalls: [
    'Tagging a commit that is not the one CI tested.',
    'Forgetting to push the tag and wondering why the release workflow did not run.',
    'Using `latest` only and losing the ability to identify or roll back a build.',
    'Missing `packages: write` or package linking, causing a 403 during push.',
    'Pulling a new image but not recreating the running container.',
    'Renaming the repository and leaving the server on the old GHCR path.',
  ],
  productionChecks: [
    'Protected, signed release tags and an immutable version policy.',
    'Image signing/scanning and digest verification in deployment.',
    'Healthcheck and a rollback to the previous digest.',
    'Version stamp checked after every deployment.',
  ],
};
