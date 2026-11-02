#!/usr/bin/env python3
"""Import public-domain books from Project Gutenberg into a static Leafreader site.

Only uses the Python standard library, so it costs nothing to run:

    python3 scripts/import_gutenberg.py --id 11 --id 1342

For each book it writes data/books/<slug>.json and refreshes data/catalog.json.
Project Gutenberg texts are public domain in the United States. Check your local
copyright terms before redistributing them elsewhere.

No affiliation with Project Gutenberg. Please keep the source link and be
considerate: this script sleeps between requests and identifies itself.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BOOKS_DIR = DATA_DIR / "books"
CATALOG = DATA_DIR / "catalog.json"

USER_AGENT = "Leafreader/1.0 (static public-domain importer)"
GUTENDEX = "https://gutendex.com/books/{id}"
GUTENBERG_TEXT = "https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt"


# ---------------------------------------------------------------------------
# Small metadata overrides for the demo library. Everything else comes from
# Gutendex. Descriptions are original summaries written for this project.
# ---------------------------------------------------------------------------
OVERRIDES = {
    11: {
        "slug": "alice-in-wonderland",
        "year": "1865",
        "genres": ["Fantasy", "Children's", "Classics"],
        "description": (
            "A bored girl follows a waistcoated rabbit down a hole and lands in a "
            "world where logic is optional, queens are lethal, and a cat can vanish "
            "mid-conversation."
        ),
        "hue": 158,
    },
    84: {
        "slug": "frankenstein",
        "year": "1818",
        "genres": ["Gothic", "Science Fiction", "Classics"],
        "description": (
            "A gifted student assembles a living creature from dead matter, then "
            "abandons it. What follows is less a monster story than a study of "
            "ambition, neglect, and revenge."
        ),
        "hue": 210,
    },
    132: {
        "slug": "the-art-of-war",
        "year": "c. 5th century BCE",
        "author": "Sun Tzu",
        "startAt": r"^Chapter I\. LAYING PLANS",
        "genres": ["Philosophy", "Strategy", "Classics"],
        "description": (
            "Thirteen compact chapters on conflict, deception, terrain, and "
            "leadership, still quoted wherever strategists gather."
        ),
        "hue": 8,
    },
    1661: {
        "slug": "sherlock-holmes",
        "title": "The Adventures of Sherlock Holmes",
        "author": "Arthur Conan Doyle",
        "year": "1892",
        "genres": ["Mystery", "Classics"],
        "description": (
            "Twelve adventures of literature's most famous consulting detective, "
            "narrated by Dr. Watson and set in the fog of Victorian London."
        ),
        "hue": 32,
    },
    1342: {
        "slug": "pride-and-prejudice",
        "year": "1813",
        "genres": ["Romance", "Classics"],
        "description": (
            "Elizabeth Bennet has opinions, a sharp tongue, and no patience for "
            "Mr. Darcy. Manners, money, and misjudgement do the rest."
        ),
        "hue": 340,
    },
    2701: {
        "slug": "moby-dick",
        "year": "1851",
        "genres": ["Adventure", "Classics"],
        "description": (
            "Ishmael signs onto a whaling ship and discovers its captain has "
            "converted a personal grudge into a voyage of cosmic scale."
        ),
        "hue": 195,
    },
}

GENRE_RULES = [
    (r"fantasy", "Fantasy"),
    (r"science fiction|sci-fi", "Science Fiction"),
    (r"horror|gothic", "Gothic"),
    (r"detective|mystery|crime", "Mystery"),
    (r"romance|love stories", "Romance"),
    (r"war|military|strategy", "Strategy"),
    (r"philosoph", "Philosophy"),
    (r"child|juvenile", "Children's"),
    (r"adventure", "Adventure"),
    (r"poetry", "Poetry"),
]

HEADING_PATTERNS = [
    re.compile(r"^(?:chapter|book|part|volume|letter)\s+(?:[ivxlcdm]+|\d+|[a-z]+)\b", re.I),
    re.compile(r"^[IVXLCDM]{1,7}\.\s+\S"),
    re.compile(r"^(?:prologue|epilogue|introduction|preface|foreword)\b", re.I),
]


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def fetch(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_meta(book_id: int) -> dict:
    try:
        return json.loads(fetch(GUTENDEX.format(id=book_id)).decode("utf-8"))
    except Exception as error:  # noqa: BLE001 - best-effort metadata
        print(f"  ! could not fetch metadata: {error}", file=sys.stderr)
        return {}


def fetch_text(book_id: int) -> str:
    raw = fetch(GUTENBERG_TEXT.format(id=book_id))
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def strip_boilerplate(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\ufeff", "", text)

    start = re.search(
        r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*",
        text,
        re.I | re.S,
    )
    if start:
        text = text[start.end():]
    end = re.search(
        r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK",
        text,
        re.I,
    )
    if end:
        text = text[: end.start()]

    # Drop common production credits that sit after the marker in some files.
    text = re.sub(r"^(?:Produced by|E-text prepared by|Transcribed from).*?(?:\n\n)", "", text, flags=re.I | re.S)
    return text.strip()


def to_paragraphs(text: str) -> list[str]:
    chunks = re.split(r"\n\s*\n", text)
    paragraphs: list[str] = []
    for chunk in chunks:
        lines = [line.strip() for line in chunk.splitlines()]
        lines = [
            line
            for line in lines
            if line
            and not re.fullmatch(r"\[?(?:Illustration|Image|Frontispiece|Plate)[^\]]*\]?", line, re.I)
            and not re.fullmatch(r"\d{1,4}", line)
        ]
        if not lines:
            continue
        paragraph = re.sub(r"\s+", " ", " ".join(lines)).strip()
        if paragraph:
            paragraphs.append(paragraph)
    return paragraphs


def is_heading(paragraph: str) -> bool:
    if len(paragraph) > 140:
        return False
    return any(pattern.search(paragraph) for pattern in HEADING_PATTERNS)


def looks_like_title(paragraph: str) -> bool:
    if len(paragraph) > 90 or paragraph.endswith((".", ";", ":")):
        return False
    letters = [char for char in paragraph if char.isalpha()]
    if not letters:
        return False
    upper = sum(1 for char in letters if char.isupper()) / len(letters)
    return upper > 0.6 or paragraph.istitle()


def split_chapters(paragraphs: list[str]) -> list[tuple[str, list[str]]]:
    headings: list[int] = []
    for index, paragraph in enumerate(paragraphs):
        if is_heading(paragraph):
            headings.append(index)

    if len(headings) < 2:
        return chunk_by_words(paragraphs)

    chapters: list[tuple[str, list[str]]] = []
    front = paragraphs[: headings[0]]
    if sum(len(p.split()) for p in front) > 150:
        chapters.append(("Front matter", front))

    for position, start in enumerate(headings):
        end = headings[position + 1] if position + 1 < len(headings) else len(paragraphs)
        title = paragraphs[start].strip()
        body_start = start + 1

        # Merge a short subtitle line, e.g. "CHAPTER I." + "Down the Rabbit-Hole".
        if body_start < end and looks_like_title(paragraphs[body_start]):
            title = f"{title} — {paragraphs[body_start].strip()}"
            body_start += 1

        body = paragraphs[body_start:end]
        if body:
            chapters.append((title, body))

    # A heading at the very end can produce an empty chapter; drop empties.
    chapters = [(title, body) for title, body in chapters if body]
    return chapters if len(chapters) >= 2 else chunk_by_words(paragraphs)


def chunk_by_words(paragraphs: list[str]) -> list[tuple[str, list[str]]]:
    chapters: list[tuple[str, list[str]]] = []
    current: list[str] = []
    words = 0
    target = 3500
    for paragraph in paragraphs:
        current.append(paragraph)
        words += len(paragraph.split())
        if words >= target:
            chapters.append((f"Part {len(chapters) + 1}", current))
            current, words = [], 0
    if current:
        chapters.append((f"Part {len(chapters) + 1}", current))
    return chapters


def author_name(meta: dict) -> str:
    authors = meta.get("authors") or []
    if not authors:
        return "Unknown"
    name = authors[0].get("name", "Unknown")
    if "," in name:
        last, first = [part.strip() for part in name.split(",", 1)]
        return f"{first} {last}".strip()
    return name


def infer_genres(meta: dict) -> list[str]:
    subjects = " ".join(meta.get("subjects") or []) + " " + " ".join(meta.get("bookshelves") or [])
    genres: list[str] = []
    for pattern, genre in GENRE_RULES:
        if re.search(pattern, subjects, re.I) and genre not in genres:
            genres.append(genre)
    if not genres:
        genres.append("Classics")
    if "Classics" not in genres:
        genres.append("Classics")
    return genres[:4]


def build_book(book_id: int) -> tuple[dict, dict]:
    override = OVERRIDES.get(book_id, {})
    print(f"• fetching Gutenberg #{book_id}…")
    meta = fetch_meta(book_id)
    text = fetch_text(book_id)
    paragraphs = to_paragraphs(strip_boilerplate(text))
    if not paragraphs:
        raise ValueError(f"no text parsed for Gutenberg #{book_id}")

    raw_title = meta.get("title") or f"Gutenberg #{book_id}"
    title = override.get("title") or re.split(r"\s*[;:]\s*", raw_title)[0].strip()
    author = override.get("author") or author_name(meta)
    slug = override.get("slug") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]

    chapter_data = split_chapters(paragraphs)
    start_at = override.get("startAt")
    if start_at:
        pattern = re.compile(start_at, re.I)
        for index, (chapter_title, _body) in enumerate(chapter_data):
            if pattern.search(chapter_title):
                chapter_data = chapter_data[index:]
                break

    chapters = []
    for index, (chapter_title, body) in enumerate(chapter_data, start=1):
        chapters.append(
            {
                "id": f"ch-{index}",
                "title": chapter_title,
                "paragraphs": body,
                "words": sum(len(p.split()) for p in body),
            }
        )

    word_count = sum(chapter["words"] for chapter in chapters)
    book = {
        "id": slug,
        "gutenbergId": book_id,
        "title": title,
        "author": author,
        "year": override.get("year", ""),
        "genres": override.get("genres") or infer_genres(meta),
        "description": override.get("description", ""),
        "hue": override.get("hue", (book_id * 47) % 360),
        "source": {
            "name": "Project Gutenberg",
            "url": f"https://www.gutenberg.org/ebooks/{book_id}",
            "license": "Public domain (US)",
        },
        "chapterCount": len(chapters),
        "wordCount": word_count,
    }
    return book, {**book, "chapters": chapters}


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
def load_catalog() -> dict:
    if CATALOG.exists():
        return json.loads(CATALOG.read_text(encoding="utf-8"))
    return {"updated": "", "books": []}


def save_catalog(catalog: dict) -> None:
    catalog["books"].sort(key=lambda book: (book["title"].lower(), book["author"].lower()))
    catalog["updated"] = time.strftime("%Y-%m-%d")
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", dest="ids", type=int, action="append", required=True, help="Project Gutenberg book ID (repeatable)")
    args = parser.parse_args()

    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog()
    existing = {book["id"]: book for book in catalog["books"]}

    failures = 0
    for index, book_id in enumerate(args.ids):
        try:
            summary, full = build_book(book_id)
            (BOOKS_DIR / f"{summary['id']}.json").write_text(
                json.dumps(full, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
            existing[summary["id"]] = summary
            print(
                f"  ✓ {summary['title']} — {summary['author']} "
                f"({summary['chapterCount']} chapters, {summary['wordCount']:,} words)"
            )
        except Exception as error:  # noqa: BLE001 - keep importing the rest
            failures += 1
            print(f"  ✗ #{book_id}: {error}", file=sys.stderr)

        if index < len(args.ids) - 1:
            time.sleep(1.0)

    catalog["books"] = list(existing.values())
    save_catalog(catalog)
    print(f"\nCatalog: {len(catalog['books'])} book(s) → {CATALOG.relative_to(ROOT)}")
    return 1 if failures and not existing else 0


if __name__ == "__main__":
    raise SystemExit(main())
