// Shared persistence helpers. Everything stays in this browser.
const PREFIX = "leafreader:";

export const THEME_KEY = `${PREFIX}theme`;
export const PROGRESS_KEY = `${PREFIX}progress`;
export const LAST_KEY = `${PREFIX}last`;
export const FONT_KEY = `${PREFIX}font`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private mode — fail silently */
  }
}

export function getTheme() {
  return read(THEME_KEY, null);
}

export function setTheme(theme) {
  write(THEME_KEY, theme);
}

export function getProgressMap() {
  const value = read(PROGRESS_KEY, {});
  return value && typeof value === "object" ? value : {};
}

export function getBookProgress(bookId) {
  const entry = getProgressMap()[bookId];
  if (!entry || !Number.isFinite(entry.chapter)) return null;
  return entry;
}

export function saveBookProgress(bookId, chapter, scroll = 0, chapterCount = 0) {
  const map = getProgressMap();
  map[bookId] = {
    chapter,
    scroll: Math.min(1, Math.max(0, Number(scroll) || 0)),
    chapterCount,
    at: Date.now(),
  };
  write(PROGRESS_KEY, map);
  write(LAST_KEY, { book: bookId, chapter, at: Date.now() });
}

export function getLast() {
  const value = read(LAST_KEY, null);
  if (!value || typeof value.book !== "string") return null;
  return value;
}

export function getFontSize() {
  const size = Number(read(FONT_KEY, 20));
  return Number.isFinite(size) ? Math.min(28, Math.max(17, size)) : 20;
}

export function setFontSize(size) {
  write(FONT_KEY, Math.min(28, Math.max(17, size)));
}
