# FixMySanDiego

An AI-powered civic issue tagger. Snap a photo of a pothole, broken sidewalk, dead streetlight, or illegal dumping. The app grabs your GPS location, uses Google Gemini to classify the issue and its severity, and plots it on a community map where neighbors can upvote what should be fixed first.

## Project structure

```
FixMySanDiego/
├── frontend/          # Static site (HTML/CSS/JS + Leaflet map)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js      # <- set your backend URL here
├── backend/           # FastAPI server
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── .github/workflows/pages.yml   # auto-deploys frontend to GitHub Pages
```

## Run it locally

**1. Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then paste your Gemini API key into .env
uvicorn main:app --reload
```
API docs are at http://localhost:8000/docs.

**2. Frontend**
```bash
cd frontend
python -m http.server 5500
```
Open http://localhost:5500. (Browsers allow geolocation on `localhost`; deployed sites need HTTPS.)

## Deploy

- **Frontend:** push to GitHub, then go to Settings > Pages and set Source to "GitHub Actions". The included workflow publishes the `frontend/` folder.
- **Backend:** GitHub Pages can't run Python, so host `backend/` on a service like Render, Railway, or Fly.io. Set `GEMINI_API_KEY` as an environment variable there, use `uvicorn main:app --host 0.0.0.0 --port $PORT` as the start command, then put the live URL in `frontend/config.js`.

## Notes and limitations

- Reports are stored in a JSON file and photos in `backend/uploads/`. Many free hosts wipe local files on restart, so switch to a database (e.g. SQLite on a volume or Postgres) for anything beyond a demo.
- Voting is one-per-browser via localStorage and is easy to bypass. Add accounts or rate limiting before relying on it.
- Reports are not sent to the City of San Diego. For urgent issues, use the city's official Get It Done app.
- Never commit your `.env` file. It is already in `.gitignore`.
