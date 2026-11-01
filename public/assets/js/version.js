/* Deployment metadata. The Docker build replaces public/version.json with the
   image version, tag, commit and UTC build time. Local development uses the
   committed fallback in public/version.json. */

const FALLBACK = {
  version: 'dev',
  imageTag: 'local',
  commit: 'local',
  buildDate: null,
};

let pending = null;

function normalize(value) {
  if (!value || typeof value !== 'object') return { ...FALLBACK };
  return {
    version: String(value.version || FALLBACK.version),
    imageTag: String(value.imageTag || FALLBACK.imageTag),
    commit: String(value.commit || FALLBACK.commit),
    buildDate: value.buildDate || null,
  };
}

export function loadBuildInfo() {
  if (!pending) {
    pending = fetch('/version.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`version.json: ${response.status}`);
        return response.json();
      })
      .then(normalize)
      .catch(() => ({ ...FALLBACK }));
  }
  return pending;
}

export function formatBuildDate(value) {
  if (!value) return 'local build';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

export function formatLocalClock(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function applyBuildInfo(root, info) {
  const data = normalize(info);
  root.querySelectorAll('[data-app-version]').forEach((el) => { el.textContent = data.version; });
  root.querySelectorAll('[data-image-tag]').forEach((el) => { el.textContent = data.imageTag; });
  root.querySelectorAll('[data-commit]').forEach((el) => { el.textContent = data.commit === 'local' ? 'local' : data.commit.slice(0, 7); });
  root.querySelectorAll('[data-build-date]').forEach((el) => { el.textContent = formatBuildDate(data.buildDate); });
}
