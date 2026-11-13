# BookNest

A personalised AI-powered reading journal and book tracker.

- **Frontend:** HTML, CSS, vanilla JavaScript (`script.js`). Books and journal entries are saved in the browser (`localStorage`).
- **Backend:** Python FastAPI (`backend/main.py`) that calls the Gemini API for the AI reading companion.

## Run locally

1. Backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env            # then paste your GEMINI_API_KEY into .env
   uvicorn main:app --reload --port 8000
   ```
2. Frontend: open `index.html` with VS Code Live Server (or any static server).

## Deploy on Render

1. Push this repo to GitHub.
2. Render dashboard -> New -> Blueprint -> pick this repo (uses `render.yaml`).
3. Enter `GEMINI_API_KEY` when asked.
4. After both services are live, set `ALLOWED_ORIGINS` on `booknest-api` to the frontend URL, and set `RENDER_BACKEND_URL` at the top of `script.js` to the backend URL. Commit and push.

The free backend sleeps when idle, so the first AI reply can take about a minute.
