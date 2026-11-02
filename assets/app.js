import {
  getBookProgress,
  getLast,
  getTheme,
  setTheme,
} from "./store.js";

const state = {
  books: [],
  genre: "All",
  query: "",
  sort: "title",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const html = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const formatWords = (words) => {
  if (!words) return "—";
  if (words >= 1000) return `${(words / 1000).toFixed(words >= 10000 ? 0 : 1)}k words`;
  return `${words} words`;
};

/* ------------------------------------------------------------------ theme */
function syncThemeButtons() {
  const theme = document.documentElement.dataset.theme;
  $$("[data-theme-toggle]").forEach((button) => {
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

/* ---------------------------------------------------------------- library */
function visibleBooks() {
  const query = state.query.trim().toLowerCase();
  const books = state.books.filter((book) => {
    const matchesGenre = state.genre === "All" || (book.genres || []).includes(state.genre);
    if (!matchesGenre) return false;
    if (!query) return true;
    return [book.title, book.author, ...(book.genres || []), book.year]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title),
    newest: (a, b) => (parseYear(b.year) - parseYear(a.year)) || a.title.localeCompare(b.title),
    shortest: (a, b) => (a.wordCount || 0) - (b.wordCount || 0),
  };
  return books.sort(sorters[state.sort] || sorters.title);
}

function parseYear(value) {
  const match = String(value || "").match(/(\d{3,4})/);
  return match ? Number(match[1]) : 0;
}

function progressBar(book) {
  const progress = getBookProgress(book.id);
  if (!progress || !book.chapterCount) return "";
  const chapter = Math.max(1, Math.min(book.chapterCount, Number(progress.chapter) || 1));
  const percent = Math.max(0, Math.min(100, Math.round((chapter / book.chapterCount) * 100)));
  return `
    <div class="card-progress" aria-label="Reading progress: ${percent}%">
      <span style="width:${percent}%"></span>
    </div>`;
}

function bookCard(book) {
  const tags = (book.genres || [])
    .slice(0, 3)
    .map((genre) => `<span class="tag">${html(genre)}</span>`)
    .join("");

  return `
    <article class="book-card">
      <a class="cover" href="read.html?book=${encodeURIComponent(book.id)}" style="--hue:${Number(book.hue) || 150}" aria-label="Read ${html(book.title)}">
        <span class="cover-frame">
          <span class="cover-eyebrow">Leafreader classics</span>
          <span class="cover-title">${html(book.title)}</span>
          <span class="cover-author">${html(book.author)}</span>
        </span>
      </a>
      <div class="book-body">
        <div class="book-heading">
          <h3><a href="read.html?book=${encodeURIComponent(book.id)}">${html(book.title)}</a></h3>
          <p class="byline">${html(book.author)}${book.year ? ` · ${html(book.year)}` : ""}</p>
        </div>
        <p class="book-description">${html(book.description || "A public-domain classic.")}</p>
        <div class="tags">${tags}</div>
        <p class="book-meta">${book.chapterCount || 0} chapters · ${formatWords(book.wordCount)}</p>
        ${progressBar(book)}
      </div>
    </article>`;
}

function renderLibrary() {
  const books = visibleBooks();
  $("#grid").innerHTML = books.map(bookCard).join("");
  $("#empty").hidden = books.length > 0;
  $("#count").textContent = `${state.books.length} book${state.books.length === 1 ? "" : "s"}`;
  renderContinue();
}

function renderGenres() {
  const genres = [...new Set(state.books.flatMap((book) => book.genres || []))].sort();
  $("#genres").innerHTML = ["All", ...genres]
    .map(
      (genre) => `
      <button class="chip${genre === state.genre ? " is-active" : ""}" data-genre="${html(genre)}" aria-pressed="${genre === state.genre}">
        ${html(genre)}
      </button>`,
    )
    .join("");
}

function renderContinue() {
  const target = $("#continue");
  const last = getLast();
  const book = last && state.books.find((item) => item.id === last.book);
  if (!book) {
    target.innerHTML = "";
    return;
  }

  const progress = getBookProgress(book.id);
  const chapter = Math.max(
    1,
    Math.min(book.chapterCount || Infinity, Number(progress?.chapter || last.chapter) || 1),
  );
  const percent = book.chapterCount
    ? Math.max(0, Math.min(100, Math.round((chapter / book.chapterCount) * 100)))
    : 0;

  target.innerHTML = `
    <div class="continue-card">
      <div class="continue-cover" style="--hue:${Number(book.hue) || 150}" aria-hidden="true"></div>
      <div class="continue-copy">
        <p class="eyebrow">Continue reading</p>
        <h3>${html(book.title)}</h3>
        <p>${html(book.author)} · chapter ${chapter} of ${book.chapterCount} · ${percent}%</p>
      </div>
      <a class="button" href="read.html?book=${encodeURIComponent(book.id)}&chapter=${chapter}">Pick up</a>
    </div>`;
}

/* -------------------------------------------------------------------- init */
async function init() {
  syncThemeButtons();
  $$("[data-theme-toggle]").forEach((button) => button.addEventListener("click", toggleTheme));

  try {
    const response = await fetch("data/catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
    const catalog = await response.json();
    state.books = Array.isArray(catalog.books) ? catalog.books : [];
  } catch (error) {
    $("#grid").innerHTML = `
      <div class="notice notice-error">
        <strong>Could not load the library.</strong>
        <p>${html(error.message)}</p>
        <p>If you opened this file directly, serve the folder instead: <code>python3 -m http.server 8080</code>.</p>
      </div>`;
    return;
  }

  renderGenres();
  renderLibrary();

  const start = $("#start-reading");
  if (start && state.books.length) {
    start.href = `read.html?book=${encodeURIComponent(state.books[0].id)}`;
  }

  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderLibrary();
  });

  $("#sort").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderLibrary();
  });

  $("#genres").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-genre]");
    if (!chip) return;
    state.genre = chip.dataset.genre;
    renderGenres();
    renderLibrary();
  });

  // The hero count is static markup, so fill it after loading.
  $("#hero-books").textContent = String(state.books.length);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* --------------------------------------------------------------- optional */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support is a bonus; ignore failures */
    });
  });
}

// Keep the theme in sync if another tab changes it.
window.addEventListener("storage", (event) => {
  if (event.key === "leafreader:theme") {
    document.documentElement.dataset.theme = getTheme() || "light";
    syncThemeButtons();
  }
});
