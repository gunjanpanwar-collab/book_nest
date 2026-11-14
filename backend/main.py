"""BookNest backend: a small FastAPI server that talks to Gemini."""

import os
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")


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
print(
    f"BookNest API starting. Model: {MODEL}. Key set: {bool(API_KEY)}. "
    f"Allowed origins: {EXTRA_ORIGINS}"
)

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