"""BookNest backend: a small FastAPI server that talks to Gemini."""

import os
import time
from typing import List

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
# Optional: with a Google Books key, book search uses Google Books.
# Without one, it falls back to Open Library (no key needed).
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

# Extra allowed frontends, comma separated, e.g. https://booknest-xxxx.onrender.com
def clean_origin(value: str) -> str:
    """Tolerate stray spaces, quotes and a trailing slash in the setting."""
    return value.strip().strip('"').strip("'").strip().rstrip("/")


EXTRA_ORIGINS = [
    clean_origin(o)
    for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if clean_origin(o)
]

SYSTEM_PROMPT = (
    "You are BookNest's friendly reading companion. Help readers with book "
    "recommendations, summaries, reading goals and journaling prompts. "
    "Be warm, concise, and avoid spoilers unless the reader asks for them."
)

# 30-second limit (value is in milliseconds) so a stuck AI call returns a clear
# error instead of hanging forever.
client = (
    genai.Client(api_key=API_KEY, http_options=types.HttpOptions(timeout=30000))
    if API_KEY
    else None
)

app = FastAPI(title="BookNest API")
print(f"BookNest API starting. Model: {MODEL}. Key set: {bool(API_KEY)}. Allowed origins: {EXTRA_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=EXTRA_ORIGINS,
    # Any localhost port, so Live Server / other dev servers work.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class HistoryItem(BaseModel):
    role: str  # "user" or "ai"
    text: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[HistoryItem] = Field(default_factory=list, max_length=20)


@app.get("/")
def root():
    return {"status": "BookNest API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}



# ---------------------------------------------------------------
# BOOK SEARCH (used by the "Add a Book" popup)
# ---------------------------------------------------------------

# Maps a catalogue's category text onto the genres in your dropdown.
# Order matters: the first rule that matches wins.
GENRE_RULES = [
    ("Science Fiction", ["science fiction", "sci-fi", "sci fi"]),
    ("Fantasy", ["fantasy"]),
    ("Horror", ["horror"]),
    ("Thriller", ["thriller", "suspense"]),
    ("Mystery", ["mystery", "detective", "crime"]),
    ("Romance", ["romance"]),
    ("Non-fiction", [
        "nonfiction", "non-fiction", "biography", "autobiography", "history",
        "self-help", "business", "psychology", "philosophy", "science",
        "cooking", "travel", "religion", "health", "memoir",
    ]),
    ("Fiction", ["fiction", "novel", "classics", "literary"]),
]


def guess_genre(text: str) -> str:
    text = (text or "").lower()
    for genre, keywords in GENRE_RULES:
        if any(word in text for word in keywords):
            return genre
    return ""


def search_google_books(query: str):
    response = requests.get(
        "https://www.googleapis.com/books/v1/volumes",
        params={
            "q": query,
            "maxResults": 6,
            "printType": "books",
            "key": GOOGLE_BOOKS_API_KEY,
        },
        timeout=8,
    )
    response.raise_for_status()

    results = []
    for item in response.json().get("items", []):
        info = item.get("volumeInfo", {})
        title = info.get("title")
        if not title:
            continue
        images = info.get("imageLinks", {})
        cover = images.get("thumbnail") or images.get("smallThumbnail") or ""
        cover = cover.replace("http://", "https://").replace("&edge=curl", "")
        results.append({
            "title": title,
            "author": ", ".join(info.get("authors", [])[:2]) or "Unknown author",
            "genre": guess_genre(" ".join(info.get("categories", []))),
            "cover": cover,
            "year": (info.get("publishedDate") or "")[:4],
        })
    return results


def search_open_library(query: str):
    response = requests.get(
        "https://openlibrary.org/search.json",
        params={
            "q": query,
            "limit": 6,
            "fields": "title,author_name,cover_i,first_publish_year,subject",
        },
        timeout=8,
    )
    response.raise_for_status()

    results = []
    for doc in response.json().get("docs", []):
        title = doc.get("title")
        if not title:
            continue
        cover_id = doc.get("cover_i")
        results.append({
            "title": title,
            "author": ", ".join(doc.get("author_name", [])[:2]) or "Unknown author",
            "genre": guess_genre(" ".join(doc.get("subject", [])[:25])),
            "cover": f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else "",
            "year": str(doc.get("first_publish_year") or ""),
        })
    return results


_search_cache = {}  # query -> (time, results, source)


@app.get("/books/search")
def search_books(q: str = Query(min_length=2, max_length=100)):
    key = q.strip().lower()
    cached = _search_cache.get(key)
    if cached and time.time() - cached[0] < 3600:
        return {"results": cached[1], "source": cached[2]}

    results, source = [], ""

    if GOOGLE_BOOKS_API_KEY:
        try:
            results = search_google_books(q)
            source = "google"
        except Exception as error:
            print(f"Google Books error: {error}")

    if not results:
        try:
            results = search_open_library(q)
            source = "openlibrary"
        except Exception as error:
            print(f"Open Library error: {error}")
            raise HTTPException(
                status_code=502,
                detail="Book search is unavailable right now.",
            )

    if len(_search_cache) > 200:
        _search_cache.clear()
    _search_cache[key] = (time.time(), results, source)
    return {"results": results, "source": source}


@app.post("/chat")
def chat(request: ChatRequest):
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="The AI service is not configured (missing GEMINI_API_KEY).",
        )

    contents = []
    for item in request.history:
        role = "user" if item.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": item.text}]})
    contents.append({"role": "user", "parts": [{"text": request.message}]})

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
        )
    except Exception as error:  # keep details in server logs only
        print(f"Gemini error: {error}")
        raise HTTPException(
            status_code=502,
            detail="The AI service had a problem. Please try again in a moment.",
        )

    reply = (response.text or "").strip()
    if not reply:
        raise HTTPException(status_code=502, detail="The AI returned an empty reply.")

    return {"reply": reply}
