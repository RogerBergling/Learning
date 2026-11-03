#!/usr/bin/env python3
"""Dependency-free static checks for the Learning Lab.

This complements the in-browser Self-check page. It verifies the things that
can be checked without a browser: document/scenario registries, internal links,
actors, vault stores, assets, packaging metadata and server hardening.

    python3 scripts/verify.py

Exit code 0 means every check passed. The script uses only the Python stdlib so
it works anywhere the primary launcher works (Python 3.8+).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DOCS = PUBLIC / "docs"
JS = PUBLIC / "assets" / "js"
SCENARIOS = JS / "scenarios"

checks = 0
failures: list[tuple[str, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if not ok:
        failures.append((label, detail))


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def section(text: str, start: str, end: str | None = None) -> str:
    """Return the text after *start* up to *end* (or end of string)."""
    try:
        rest = text.split(start, 1)[1]
    except IndexError:
        return ""
    if end is not None:
        rest = rest.split(end, 1)[0]
    return rest


def quoted(block: str) -> list[str]:
    return re.findall(r"'([^']+)'", block)


# --------------------------------------------------------------------------- files

REQUIRED = [
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "Dockerfile",
    "compose.yaml",
    "start.py",
    "start.sh",
    "start.bat",
    "server.mjs",
    "package.json",
    "public/index.html",
    "public/assets/css/app.css",
    "public/assets/js/app.js",
    "public/assets/js/content.js",
    "public/assets/js/markdown.js",
    "public/assets/js/progress.js",
    "public/assets/js/quiz-data.js",
    "public/assets/js/search.js",
    "public/assets/js/tokens.js",
    "public/assets/js/version.js",
    "public/assets/js/pages/quiz.js",
    "public/assets/js/pages/topic.js",
    "public/version.json",
    ".github/workflows/docker-publish.yml",
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
]
for rel in REQUIRED:
    check((ROOT / rel).exists(), f"required file: {rel}", rel)

for rel in ("scripts/verify.py", "scripts/smoke.py"):
    check((ROOT / rel).exists(), f"verification tool: {rel}", rel)

check((ROOT / "start.sh").stat().st_mode & 0o111 != 0, "start.sh is executable")

# ------------------------------------------------------------------ registries

content = read(JS / "content.js")
doc_slugs = re.findall(r"\bslug:\s*'([^']+)'", content)
doc_files = {p.stem for p in DOCS.glob("*.md")}

check(len(doc_slugs) == len(set(doc_slugs)), "documentation slugs are unique")
check(set(doc_slugs) == doc_files, "DOCS and public/docs/*.md agree",
      f"DOCS-only={sorted(set(doc_slugs) - doc_files)} files-only={sorted(doc_files - set(doc_slugs))}")
check(len(doc_slugs) == 48, "documentation chapter count", f"{len(doc_slugs)} chapters")

for slug in doc_slugs:
    path = DOCS / f"{slug}.md"
    check(path.exists(), f"chapter exists: {slug}")
    if path.exists():
        text = read(path)
        check(len(text.strip()) > 200, f"chapter has content: {slug}", f"{len(text)} chars")
        check("\n## " in text, f"chapter has sections: {slug}")

learning_path = quoted(section(content, "export const LEARNING_PATH = [", "];"))
check(len(learning_path) == len(set(learning_path)), "LEARNING_PATH has no duplicates")
for slug in learning_path:
    check(slug in doc_slugs, f"learning path slug exists: {slug}")

# -------------------------------------------------------------------- quiz data

quiz_text = read(JS / "quiz-data.js")
quiz_blocks = re.split(r"\n  \{", quiz_text)[1:]
quiz_ids = []
check(len(quiz_blocks) >= 10, "quiz has at least 10 questions", f"{len(quiz_blocks)} questions")
for block in quiz_blocks:
    id_match = re.search(r"\n    id: '([^']+)'", block)
    question_match = re.search(r"\n    question: '([^']+)'", block)
    options_match = re.search(r"\n    options: \[(.*?)\n    \],", block, re.S)
    answer_match = re.search(r"\n    answer: (\d+)", block)
    explanation_match = re.search(r"\n    explanation: '([^']+)'", block)
    link_match = re.search(r"\n    link: \{ label: '([^']+)', href: '([^']+)' \}", block)

    qid = id_match.group(1) if id_match else ""
    quiz_ids.append(qid)
    check(bool(qid), "quiz question has an id")
    check(bool(question_match), f"quiz question text: {qid}")
    options = re.findall(r"\n      '([^']*)'", options_match.group(1)) if options_match else []
    check(len(options) >= 2, f"quiz options: {qid}", f"{len(options)} options")
    answer = int(answer_match.group(1)) if answer_match else -1
    check(0 <= answer < len(options), f"quiz answer is in range: {qid}", str(answer))
    check(bool(explanation_match), f"quiz explanation: {qid}")
    check(bool(link_match), f"quiz explanation link: {qid}")
    if link_match:
        href = link_match.group(2)
        check(href.startswith(("#/learn/", "#/sim/")), f"quiz link shape: {qid}", href)

check(len(quiz_ids) == len(set(quiz_ids)), "quiz ids are unique")

chapters = quoted(section(content, "export const CHAPTERS = [", "];"))
doc_chapters = re.findall(r"\bchapter:\s*'([^']+)'", content)
for chapter in doc_chapters:
    check(chapter in chapters, f"document chapter is declared: {chapter}", chapter)
for chapter in chapters:
    check(chapter in doc_chapters, f"chapter has at least one document: {chapter}")

categories_block = section(content, "export const CATEGORIES = {", "\n};")
categories = set(re.findall(r"^  '?([\w-]+)'?: \{", categories_block, re.M))
check(bool(categories), "CATEGORIES are declared")

topics_block = section(content, "export const TOPICS = {", "\n};")
topic_ids = set(re.findall(r"^  (\w+): \{", topics_block, re.M))
topic_order = quoted(section(content, "export const TOPIC_ORDER = [", "];"))
check({"onegate", "docker", "git", "haproxy", "esxtop"} <= topic_ids, "core topics are declared", ", ".join(sorted(topic_ids)))
check(set(topic_order) == topic_ids, "TOPIC_ORDER covers TOPICS", f"order={topic_order}")
check(sum(1 for slug in doc_slugs if slug.startswith("docker-")) >= 7, "Docker track has chapters")
check(sum(1 for slug in doc_slugs if slug.startswith("git-")) >= 8, "Git track has chapters")
check(sum(1 for slug in doc_slugs if slug.startswith("haproxy-")) >= 7, "HAProxy track has chapters")
check(sum(1 for slug in doc_slugs if slug.startswith("esxtop-")) >= 8, "ESXtop track has chapters")

# ------------------------------------------------------------------- scenarios

scenario_files = sorted(p for p in SCENARIOS.glob("*.js") if p.name not in {"index.js", "helpers.js"})
scenario_exports: dict[str, str] = {}
scenario_blocks: dict[str, str] = {}
scenario_ids: list[str] = []

for path in scenario_files:
    text = read(path)
    starts = [m.start() for m in re.finditer(r"\nexport const \w+ = \{", text)]
    for i, start in enumerate(starts):
        block = text[start: starts[i + 1] if i + 1 < len(starts) else len(text)]
        name_match = re.search(r"\nexport const (\w+) = \{", block)
        id_match = re.search(r"\n  id:\s*'([^']+)'", block)
        if name_match and id_match and "\n  title:" in block:
            name = name_match.group(1)
            sid = id_match.group(1)
            scenario_exports[name] = sid
            scenario_blocks[sid] = block
            scenario_ids.append(sid)

check(len(scenario_ids) == len(set(scenario_ids)), "scenario ids are unique",
      f"duplicates={sorted({x for x in scenario_ids if scenario_ids.count(x) > 1})}")
check(len(scenario_ids) == 46, "scenario count", f"{len(scenario_ids)} scenarios")

for sid, block in scenario_blocks.items():
    tag_match = re.search(r"\n  tags: \[([^\]]*)\]", block)
    check(tag_match is not None, f"scenario has search tags: {sid}")
    if tag_match:
        check(len(quoted(tag_match.group(1))) >= 3, f"scenario has enough search tags: {sid}")
    topic_match = re.search(r"\n  topic: '([^']+)'", block)
    scenario_topic = topic_match.group(1) if topic_match else "onegate"
    check(scenario_topic in topic_ids, f"scenario topic exists: {sid}", scenario_topic)
    layout_match = re.search(r"\n  layout: '([^']+)'", block)
    scenario_layout = layout_match.group(1) if layout_match else "onegate"
    check(scenario_layout in {"onegate", "docker", "git", "haproxy", "esxtop"}, f"scenario layout exists: {sid}", scenario_layout)

index_text = read(SCENARIOS / "index.js")
imports: dict[str, str] = {}
for names, module in re.findall(r"import \{([^}]+)\} from '\./([^']+)';", index_text):
    for name in (n.strip() for n in names.split(",")):
        if name:
            imports[name] = module
all_block = section(index_text, "const ALL = [", "];")
all_names = re.findall(r"\b([A-Za-z_$][\w$]*)\b", all_block)
check(len(all_names) == len(scenario_ids), "ALL registers every scenario", f"{len(all_names)} entries")
for name, sid in scenario_exports.items():
    check(name in all_names, f"scenario is registered in ALL: {sid}", name)
for name in all_names:
    check(name in imports, f"registered scenario is imported: {name}")
    if name in imports:
        check((SCENARIOS / imports[name]).exists(), f"scenario module exists for {name}", imports[name])

flow_block = section(index_text, "const FLOW = {", "\n};")
flow_ids = set(re.findall(r"^\s*'([^']+)':", flow_block, re.M))
check(flow_ids == set(scenario_ids), "FLOW covers exactly the scenario registry",
      f"flow-only={sorted(flow_ids - set(scenario_ids))} missing={sorted(set(scenario_ids) - flow_ids)}")

featured = set(quoted(section(index_text, "const FEATURED = new Set([", "])")))
check(featured <= set(scenario_ids), "featured scenarios exist",
      f"unknown={sorted(featured - set(scenario_ids))}")

scenario_text = "\n".join(read(p) for p in scenario_files)
used_categories = set(re.findall(r"\n  category: '([^']+)'", scenario_text))
check(used_categories <= categories, "scenario categories are declared",
      f"unknown={sorted(used_categories - categories)}")
for category in categories:
    check(category in used_categories, f"category has a scenario: {category}")

# ---------------------------------------------------------------------- layout

layout = read(JS / "sim" / "layout.js")
nodes_block = section(layout, "export const NODES = {", "export const SUBNODES")
subnodes_block = section(layout, "export const SUBNODES = {", "export const SUBNODE_SIZE")
docker_block = section(layout, "export const DOCKER_NODES = {", "/* -------------------------------------------------------------------- Git */")
git_block = section(layout, "export const GIT_NODES = {", "/* ------------------------------------------------------------------- HAProxy */")
haproxy_block = section(layout, "export const HAPROXY_NODES = {", "/* ----------------------------------------------------------------- ESXtop */")
esxtop_block = section(layout, "export const ESXTOP_NODES = {", "/* --------------------------------------------------------------- layouts */")
node_ids = set(re.findall(r"^  (\w+): \{", nodes_block, re.M))
subnode_ids = set(re.findall(r"^  '([^']+)':", subnodes_block, re.M))
docker_ids = set(re.findall(r"^  (\w+): \{", docker_block, re.M))
git_ids = set(re.findall(r"^  (\w+): \{", git_block, re.M))
haproxy_ids = set(re.findall(r"^  (\w+): \{", haproxy_block, re.M))
haproxy_sub_ids = set(re.findall(r"^  '([^']+)':", haproxy_block, re.M))
esxtop_ids = set(re.findall(r"^  (\w+): \{", esxtop_block, re.M))
esxtop_sub_ids = set(re.findall(r"^  '([^']+)':", esxtop_block, re.M))
actors = node_ids | subnode_ids | docker_ids | git_ids | haproxy_ids | haproxy_sub_ids | esxtop_ids | esxtop_sub_ids | {"onegate", "haproxy", "esxi"}

check({"user", "onegate"} <= actors, "core layout actors exist")
check({"developer", "daemon", "container"} <= docker_ids, "Docker layout actors exist")
check({"working", "local", "remote", "actions"} <= git_ids, "Git layout actors exist")
check({"client", "web1", "web2"} <= haproxy_ids, "HAProxy layout actors exist")
check({"admin", "vm", "storage", "network", "report"} <= esxtop_ids, "ESXtop layout actors exist")
for actor in sorted(set(re.findall(r"\b(?:from|to):\s*'([^']+)'", scenario_text))):
    check(actor in actors, f"step actor exists in layout: {actor}")

for block in re.findall(r"\n  nodes: \[([^\]]*)\]", scenario_text):
    for actor in quoted(block):
        check(actor in actors, f"scenario node exists in layout: {actor}")

# ------------------------------------------------------------------- token data

tokens = read(JS / "tokens.js")
stores_block = section(tokens, "export const STORES = {", "\n};")
kinds_block = section(tokens, "export const KINDS = {", "\n};")
stores = set(re.findall(r"^  (\w+):", stores_block, re.M))
kinds = set(re.findall(r"^  (\w+):", kinds_block, re.M))

check(bool(stores), "token stores are declared")
check(bool(kinds), "token kinds are declared")

helpers = read(SCENARIOS / "helpers.js")
item_definitions = {
    name: (item_id, kind)
    for name, item_id, kind in re.findall(
        r"^  (\w+): \(o = \{\}\) => \(\{ id: '([^']+)', kind: '([^']+)'",
        helpers,
        re.M,
    )
}
check(bool(item_definitions), "ITEM helpers are declared")
for name, (_item_id, kind) in item_definitions.items():
    check(kind in kinds, f"ITEM helper has a known kind: {name}", kind)

for store in set(re.findall(r"\b(?:add|del|clear)\(\s*'([^']+)'", scenario_text)):
    check(store in stores, f"vault operation uses a known store: {store}")
for name in set(re.findall(r"\bITEM\.(\w+)\(", scenario_text)):
    check(name in item_definitions, f"scenario uses a known ITEM helper: {name}")
for kind in set(re.findall(r"\bkind:\s*'([^']+)'", scenario_text)):
    check(kind in kinds, f"scenario uses a known token kind: {kind}")

# ---------------------------------------------------------------- internal links

link_re = re.compile(r"#/(sim|learn)/([A-Za-z0-9._-]+)")
link_sources = [ROOT / "README.md"] + sorted(PUBLIC.rglob("*.md")) + sorted(PUBLIC.rglob("*.js")) + [PUBLIC / "index.html"]
found_sim_links: set[str] = set()
found_learn_links: set[str] = set()

for path in link_sources:
    text = read(path)
    for kind, target in link_re.findall(text):
        if kind == "sim":
            found_sim_links.add(target)
            check(target in scenario_ids, f"simulation link resolves: {target}", str(path.relative_to(ROOT)))
        else:
            found_learn_links.add(target)
            check(target in doc_slugs, f"chapter link resolves: {target}", str(path.relative_to(ROOT)))

for sid in scenario_ids:
    check(sid in found_sim_links, f"scenario is linked from docs/README: {sid}")
check("glossary" in found_learn_links or "#/glossary" in read(ROOT / "README.md"),
      "glossary is linked from docs/README")

for path in DOCS.glob("*.md"):
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", read(path)):
        check(target.startswith(("http://", "https://", "#", "mailto:")),
              f"chapter link is absolute or in-page: {path.name}", target)

# ----------------------------------------------------------------- page wiring

learn_page = read(JS / "pages" / "learn.js")
related_block = section(learn_page, "const RELATED = {", "\n};")
for key, values in re.findall(r"^  '?([\w-]+)'?:\s*\[([^\]]*)\]", related_block, re.M):
    check(key in doc_slugs, f"RELATED key is a chapter: {key}")
    for sid in quoted(values):
        check(sid in scenario_ids, f"RELATED scenario exists: {sid}")

scenario_page = read(JS / "pages" / "scenario.js")
docs_for_block = section(scenario_page, "const DOCS_FOR = {", "\n};")
for category, values in re.findall(r"^  (\w+):\s*\[([^\]]*)\]", docs_for_block, re.M):
    check(category in categories, f"DOCS_FOR category exists: {category}")
    for slug in quoted(values):
        check(slug in doc_slugs, f"DOCS_FOR chapter exists: {slug}")

doc_titles_block = section(scenario_page, "const DOC_TITLES = {", "\n};")
for slug in re.findall(r"^\s*'([^']+)':", doc_titles_block, re.M):
    check(slug in doc_slugs, f"DOC_TITLES chapter exists: {slug}")

html = read(PUBLIC / "index.html")
for asset in re.findall(r'(?:src|href)="(/[^"]+)"', html):
    check((PUBLIC / asset.lstrip("/")).exists(), f"HTML asset exists: {asset}")

for image in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', read(ROOT / "README.md")):
    if image.startswith(("http://", "https://", "#", "data:")):
        continue
    check((ROOT / image).exists(), f"README image exists: {image}", image)
check("#/quiz" in html, "navigation exposes the quiz")

app_text = read(JS / "app.js")
check("case 'quiz'" in app_text, "router handles the quiz route")
check("renderQuiz" in app_text, "router loads the quiz page")

license = read(ROOT / "LICENSE")
check("MIT License" in license, "LICENSE is MIT")

# ----------------------------------------------------------- packaging & security

package = json.loads(read(ROOT / "package.json"))
check(package.get("type") == "module", "package.json uses ES modules")
check("start" in package.get("scripts", {}), "package.json has a start script")
check(package.get("license") == "MIT", "package.json declares the MIT license")

version_info = json.loads(read(PUBLIC / "version.json"))
check(version_info.get("version") == package.get("version"), "version.json matches package.json",
      f"{version_info.get('version')} vs {package.get('version')}")
check("imageTag" in version_info and "commit" in version_info and "buildDate" in version_info,
      "version.json has build metadata fields")
check(version_info.get("imageTag") == "local" and version_info.get("buildDate") is None,
      "version.json is a clean local fallback")
dockerfile = read(ROOT / "Dockerfile")
check("APP_VERSION" in dockerfile, "Dockerfile accepts build version metadata")
check("io.onegate.build.version" in dockerfile and "io.onegate.build.date" in dockerfile,
      "Dockerfile exposes deployment labels")

readme = read(ROOT / "README.md")
compose = read(ROOT / "compose.yaml")
workflow = read(ROOT / ".github" / "workflows" / "docker-publish.yml")
image = "ghcr.io/rogerbergling/learning:latest"

check(image in compose, "compose image matches the repository", image)
check("watchtower" not in compose.lower(), "compose must not include Watchtower")
check("/var/run/docker.sock" not in compose, "compose must not mount the Docker socket")
check("watchtower" not in readme.lower(), "README must not recommend Watchtower")
check("--profile auto-update" not in readme, "README must not recommend the removed auto-update profile")
check(image in readme, "README image matches the repository", image)
check("OIDC-OAUTH-BFF" not in readme and "OIDC-OAUTH-BFF" not in compose,
      "no stale repository name in README/compose")
check("IMAGE_NAME: ${{ github.repository }}" in workflow, "workflow publishes the current repository")
check("build-args:" in workflow, "publish workflow passes build metadata")
check("GIT_SHA=" in workflow and "BUILD_DATE=" in workflow, "publish workflow stamps commit and build time")

for command in ("scripts/verify.py", "scripts/smoke.py"):
    check(command in readme, f"README documents {command}")

for server_name in ("start.py", "server.mjs"):
    server_text = read(ROOT / server_name)
    check("Content-Security-Policy" in server_text, f"{server_name} sets CSP")
    check("X-Content-Type-Options" in server_text, f"{server_name} sets nosniff")
    check("X-Frame-Options" in server_text, f"{server_name} sets frame protection")

py_server = read(ROOT / "start.py")
js_server = read(ROOT / "server.mjs")
py_routes = set(re.findall(r'"(/[a-z-]+)"', section(py_server, "APP_ROUTE_PREFIXES = (", ")")))
js_routes = set(re.findall(r"'(/[a-z-]+)'", section(js_server, "APP_ROUTE_PREFIXES = [", "]")))
check(py_routes == js_routes, "launchers share one SPA route allowlist",
      f"python-only={sorted(py_routes - js_routes)} node-only={sorted(js_routes - py_routes)}")
check(len(py_routes) >= 8, "SPA route allowlist is populated", str(sorted(py_routes)))
check(re.search(r'server_version\s*=\s*"LearningLab"', py_server) is not None,
      "Python launcher uses a generic server identity")
check(re.search(r"def version_string\(self\).*?return self\.server_version", py_server, re.S) is not None,
      "Python launcher does not append the runtime version")
check("## Public internet exposure" in readme,
      "README documents public-internet exposure guidance")

# ------------------------------------------------------------------------ report

if failures:
    print(f"\n{len(failures)} check(s) failed; {checks - len(failures)} passed.\n")
    for label, detail in failures:
        suffix = f" — {detail}" if detail else ""
        print(f"  FAIL  {label}{suffix}")
    print()
    sys.exit(1)

print(f"All {checks} static checks passed.")
