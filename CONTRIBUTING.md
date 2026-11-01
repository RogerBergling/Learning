# Contributing to the Learning Lab

This project is deliberately small: static ES modules, dependency-free Python
launchers and Markdown chapters. There is no build step, package install or
external service. Please keep it that way unless a change genuinely requires
something else.

## Before you open a pull request

```bash
python3 scripts/verify.py     # registries, links, assets, packaging, headers
python3 scripts/smoke.py      # starts start.py and checks real HTTP responses
python3 -m py_compile start.py scripts/verify.py scripts/smoke.py
```

With Node available:

```bash
node --check server.mjs
find public/assets/js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Open the site through the launcher, not as a `file://` URL, and run
`#/selftest`. It should report 100%. The CI workflow runs the static checks,
the smoke test, JavaScript syntax checks and a Docker build on every push and
pull request.

## Adding or changing a scenario

1. Add or edit a plain object in `public/assets/js/scenarios/`.
2. Register it in `scenarios/index.js` (import, `ALL` and `FLOW`).
3. Add a `#/sim/<id>` link to at least one chapter or the README so the
   catalog checker can find it.
4. Run `python3 scripts/verify.py` and `#/selftest`.
5. Keep the data honest:
   - `id`, `topic`, `layout`, `title`, `level`, `category`, `summary`, `minutes`;
   - a top-level `tags` array for the Simulations search;
   - actors are keys from the selected layout in `sim/layout.js`;
   - every step has a `badge`, a meaningful `detail` and a valid `channel`;
   - vault stores and artifact kinds exist in `tokens.js`;
   - endpoints and CLI examples are illustrative unless documented in the vendor manual.

When a flow relies on a OneGate feature the manual does not document, label it
as generic OAuth/OIDC and say “verify in your deployment”. Look at the existing
scenario notes for the wording.

## Writing chapters

- Keep the Markdown in `public/docs/` as the single source of truth; the site
  fetches the same files.
- Add the chapter to `DOCS` with a `topic` and `chapter`, then add it to the
  appropriate topic path in `TOPICS` and to `CHAPTERS` when introducing a new
  chapter group. Keep `LEARNING_PATH` for the OneGate track.
- Use `#/learn/<slug>` and `#/sim/<id>` links; the checker rejects broken ones.
- Do not add relative file links or external assets. The lab must stay offline
  and dependency-free.
- Explain the security consequence, not just the configuration field.

## Search, quiz and progress

- The Learn search index is built from the same Markdown files; do not add a
  second content index.
- Quiz questions live in `public/assets/js/quiz-data.js`. Every question needs
  a unique id, a `track` from `TOPICS`, an area label, an in-range answer, an
  explanation and a `#/learn/...` or `#/sim/...` link. The self-check validates
  them.
- Chapter and quiz progress is stored only in `localStorage` under
  `og-progress-v1` by `progress.js`. Never add server-side or third-party
  tracking.

## Versioning

`public/version.json` is the local-development fallback and must match the
`version` in `package.json`. The Docker build replaces it with the image
version, tag, commit SHA and UTC build timestamp. Keep the fallback's
`imageTag: "local"` and `commit: "local"`; do not commit generated build
metadata.

The home page and footer display the result. To verify a deployment, compare
the page or `/version.json` with the image labels.

## Security and the launchers

Both launchers must keep the same security headers (CSP, `nosniff`,
`X-Frame-Options`, referrer and permissions policy). The site has no inline
scripts or forms; inline styles are used by the markup and simulator, hence
`style-src 'unsafe-inline'`. Do not relax `script-src`.

The Python launcher is the primary path. The Node launcher exists only for
machines without Python and should remain feature-equivalent (SPA fallback,
`HEAD`, safe path resolution, no directory listings).

## Content and trademarks

This is an unofficial study aid. Do not add vendor screenshots, manuals,
customer data or real credentials. Use `example.com` and synthetic subjects.
