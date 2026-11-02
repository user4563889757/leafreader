import {
  getBookProgress,
  getFontSize,
  getTheme,
  saveBookProgress,
  setFontSize,
  setTheme,
} from "./store.js";

const $ = (selector) => document.querySelector(selector);
const html = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const params = new URLSearchParams(location.search);
const bookId = params.get("book");

const state = {
  book: null,
  index: 0,
  pendingScroll: 0,
  saveFrame: 0,
};

/* ------------------------------------------------------------------ theme */
function syncThemeButtons() {
  const theme = document.documentElement.dataset.theme;
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(theme === "dark"));
    button.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.textContent = theme === "dark" ? "☀" : "☾";
  });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  setTheme(next);
  syncThemeButtons();
}

/* ------------------------------------------------------------------- font */
function applyFontSize(size) {
  document.documentElement.style.setProperty("--reader-font-size", `${size}px`);
}

/* -------------------------------------------------------------------- toc */
function renderToc() {
  $("#toc-book").textContent = state.book.title;
  $("#toc-list").innerHTML = state.book.chapters
    .map(
      (chapter, index) => `
      <li>
        <a href="${chapterUrl(index + 1)}" data-chapter="${index}"${index === state.index ? ' class="is-active" aria-current="true"' : ""}>
          <span class="toc-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="toc-title">${html(chapter.title)}</span>
        </a>
      </li>`,
    )
    .join("");
}

function chapterUrl(number) {
  const query = new URLSearchParams({ book: state.book.id, chapter: String(number) });
  return `read.html?${query}`;
}

/* ---------------------------------------------------------------- render */
function renderChapter({ scroll = 0, push = false } = {}) {
  const chapter = state.book.chapters[state.index];
  if (!chapter) return;

  const article = $("#chapter-article");
  const words = chapter.words || chapter.paragraphs.join(" ").split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 230));

  article.setAttribute("aria-busy", "false");
  article.innerHTML = `
    <header class="chapter-head">
      <p class="chapter-kicker">${html(state.book.author)}</p>
      <h1>${html(chapter.title)}</h1>
      <p class="chapter-submeta">${minutes} min read · ${words.toLocaleString()} words</p>
    </header>
    ${chapter.paragraphs.map((paragraph) => `<p>${html(paragraph)}</p>`).join("")}`;

  document.title = `${chapter.title} — ${state.book.title}`;
  $("#book-title").textContent = state.book.title;
  $("#chapter-position").textContent = `Chapter ${state.index + 1} of ${state.book.chapters.length}`;
  $("#chapter-meta").textContent = `${state.book.title} · ${state.book.author} · ${state.book.source?.name || "Public domain"}`;

  const source = $("#source-link");
  const sourceUrl = state.book.source?.url;
  const safeSource = typeof sourceUrl === "string" && /^https?:\/\//i.test(sourceUrl);
  source.href = safeSource ? sourceUrl : "https://www.gutenberg.org/";

  const previous = $("#prev-chapter");
  const next = $("#next-chapter");
  setNavLink(previous, state.index > 0 ? chapterUrl(state.index) : null);
  setNavLink(next, state.index < state.book.chapters.length - 1 ? chapterUrl(state.index + 2) : null);

  document.querySelectorAll("#toc-list a").forEach((link) => {
    const active = Number(link.dataset.chapter) === state.index;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });

  const url = chapterUrl(state.index + 1);
  if (push) history.pushState({ chapter: state.index + 1 }, "", url);
  else history.replaceState({ chapter: state.index + 1 }, "", url);

  saveBookProgress(state.book.id, state.index + 1, scroll, state.book.chapters.length);
  updateProgressBar();

  requestAnimationFrame(() => {
    if (scroll > 0) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round(max * scroll));
    } else {
      window.scrollTo(0, 0);
    }
  });

  closeToc();
}

function setNavLink(link, url) {
  if (url) {
    link.href = url;
    link.classList.remove("is-disabled");
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
  } else {
    link.href = "#";
    link.classList.add("is-disabled");
    link.setAttribute("aria-disabled", "true");
    link.setAttribute("tabindex", "-1");
  }
}

/* --------------------------------------------------------------- progress */
function currentScrollRatio() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function updateProgressBar() {
  $("#reading-progress").style.width = `${currentScrollRatio() * 100}%`;
}

function queueProgressSave() {
  updateProgressBar();
  if (state.saveFrame) return;
  state.saveFrame = requestAnimationFrame(() => {
    state.saveFrame = 0;
    if (!state.book) return;
    saveBookProgress(
      state.book.id,
      state.index + 1,
      currentScrollRatio(),
      state.book.chapters.length,
    );
  });
}

/* -------------------------------------------------------------------- toc */
function openToc() {
  document.body.classList.add("toc-open");
  $("#toc-toggle").setAttribute("aria-expanded", "true");
  $("#toc-backdrop").hidden = false;
}

function closeToc() {
  document.body.classList.remove("toc-open");
  $("#toc-toggle").setAttribute("aria-expanded", "false");
  $("#toc-backdrop").hidden = true;
}

function toggleToc() {
  if (document.body.classList.contains("toc-open")) closeToc();
  else openToc();
}

/* -------------------------------------------------------------- navigation */
function goTo(index, { push = true, scroll = 0 } = {}) {
  if (!state.book || index < 0 || index >= state.book.chapters.length) return;
  state.index = index;
  renderChapter({ scroll, push });
}

function goToFromUrl() {
  const requested = Number(new URLSearchParams(location.search).get("chapter") || 1);
  const index = Math.min(
    state.book.chapters.length - 1,
    Math.max(0, (Number.isFinite(requested) ? requested : 1) - 1),
  );
  const progress = getBookProgress(state.book.id);
  const restore = progress && progress.chapter === index + 1 ? progress.scroll : 0;
  state.index = index;
  renderChapter({ scroll: restore });
}

/* -------------------------------------------------------------------- init */
async function init() {
  syncThemeButtons();
  applyFontSize(getFontSize());

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", toggleTheme);
  });

  $("#font-down").addEventListener("click", () => {
    const size = Math.max(17, getFontSize() - 1);
    setFontSize(size);
    applyFontSize(size);
  });
  $("#font-up").addEventListener("click", () => {
    const size = Math.min(28, getFontSize() + 1);
    setFontSize(size);
    applyFontSize(size);
  });

  $("#toc-toggle").addEventListener("click", toggleToc);
  $("#toc-backdrop").addEventListener("click", closeToc);

  $("#toc-list").addEventListener("click", (event) => {
    const link = event.target.closest("a[data-chapter]");
    if (!link) return;
    event.preventDefault();
    goTo(Number(link.dataset.chapter));
  });

  $("#prev-chapter").addEventListener("click", (event) => {
    event.preventDefault();
    goTo(state.index - 1);
  });
  $("#next-chapter").addEventListener("click", (event) => {
    event.preventDefault();
    goTo(state.index + 1);
  });

  window.addEventListener("scroll", queueProgressSave, { passive: true });
  window.addEventListener("resize", updateProgressBar);

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, select, textarea, [contenteditable]")) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(state.index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(state.index - 1);
    } else if (event.key === "Escape") {
      closeToc();
    }
  });

  window.addEventListener("popstate", () => {
    if (!state.book) return;
    goToFromUrl();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === "leafreader:theme") {
      document.documentElement.dataset.theme = getTheme() || "light";
      syncThemeButtons();
    }
  });

  if (!bookId) {
    showError("No book was selected. Pick one from the library.");
    return;
  }

  try {
    const response = await fetch(`data/books/${encodeURIComponent(bookId)}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`The chapter file returned HTTP ${response.status}.`);
    state.book = await response.json();
    if (!Array.isArray(state.book.chapters) || state.book.chapters.length === 0) {
      throw new Error("This book has no chapters.");
    }

    renderToc();
    goToFromUrl();
  } catch (error) {
    showError(error.message || "Unknown error.");
  }
}

function showError(message) {
  $("#error").hidden = false;
  $("#error-message").textContent = message;
  $("#chapter-article").innerHTML = "";
  $("#chapter-article").setAttribute("aria-busy", "false");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
