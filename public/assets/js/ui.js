import { esc } from './markdown.js';

export { esc };

const PATHS = {
  browser: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18"/><circle cx="6.2" cy="6.3" r=".7" fill="currentColor" stroke="none"/><circle cx="8.6" cy="6.3" r=".7" fill="currentColor" stroke="none"/>',
  server: '<rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h5M11 17h5"/>',
  database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/><path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 10.2 4.1 4.1 0 0 0 7 18.5Z"/>',
  gate: '<path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M9 20v-5.5a3 3 0 0 1 6 0V20"/><path d="M4 20h16"/>',
  proxy: '<path d="M3 12h6"/><path d="M15 12h6"/><rect x="9" y="8" width="6" height="8" rx="1.5"/><path d="M6 9v6M18 9v6"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4M15.5 7.5l2 2M17.5 5.5l2 2"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 3.2 19 6v6.2c0 4.3-2.9 7.3-7 8.6-4.1-1.3-7-4.3-7-8.6V6l7-2.8Z"/><path d="m9 12 2.1 2.1L15.2 10"/>',
  user: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0"/>',
  play: '<path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M6 5.5v13l9-6.5-9-6.5Z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  prev: '<path d="M18 5.5v13l-9-6.5 9-6.5Z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  reset: '<path d="M4 11a8 8 0 1 1 2.4 5.7"/><path d="M4 4.5V11h6.5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  alert: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v5"/><circle cx="12" cy="17.6" r=".9" fill="currentColor" stroke="none"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5"/>',
  arrow: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8L4.5 10.8 10.2 9 12 3.5Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m6.5 9 3 3-3 3M12.5 15h5"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  branch: '<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 7.2v9.6M8.2 19h3.3A4.5 4.5 0 0 0 16 14.5V11.2M18 11.2V9"/>',
  network: '<rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M6 9v3h12V9M12 12v3"/>',
  activity: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
};

export function icon(name, size = 18, cls = '') {
  const body = PATHS[name] || PATHS.sparkle;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function readingTime(text) {
  const words = String(text).trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
