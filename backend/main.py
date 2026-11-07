import json
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types

load_dotenv()

BASE = Path(__file__).parent
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)
DB_FILE = BASE / "reports.json"

CATEGORIES = ["Pothole", "Damaged Sidewalk", "Broken Streetlight", "Illegal Dumping", "Other"]
SEVERITIES = ["High", "Medium", "Low"]

app = FastAPI(title="FixMySanDiego API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

client = genai.Client()  # reads GEMINI_API_KEY from the environment

PROMPT = """
You are a San Diego public works issue classifier. Analyze the image and respond with ONLY a valid JSON object matching this schema:
{
  "category": "Pothole" | "Damaged Sidewalk" | "Broken Streetlight" | "Illegal Dumping" | "Other",
  "severity": "High" | "Medium" | "Low",
  "description": "Short 1-sentence summary of the hazard"
}
Severity guide: High = immediate trip/vehicle/safety hazard, Medium = noticeable but not urgent, Low = mostly cosmetic.
"""


def load_reports() -> list:
    if DB_FILE.exists():
        return json.loads(DB_FILE.read_text())
    return []


def save_reports(reports: list) -> None:
    DB_FILE.write_text(json.dumps(reports, indent=2))


def classify(image_bytes: bytes, mime_type: str) -> dict:
    fallback = {"category": "Other", "severity": "Medium", "description": "Could not auto-classify this issue."}
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), PROMPT],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        result = json.loads(response.text)
        if result.get("category") not in CATEGORIES:
            result["category"] = "Other"
        if result.get("severity") not in SEVERITIES:
            result["severity"] = "Medium"
        result["description"] = str(result.get("description", ""))[:300]
        return result
    except Exception as e:  # network error, bad JSON, quota, etc.
        print("Classification failed:", e)
        return fallback


@app.get("/api/reports")
def list_reports():
    return load_reports()


@app.post("/api/report")
async def create_report(
    file: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image.")
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (10 MB max).")

    result = classify(contents, file.content_type)

    ext = {"image/png": ".png", "image/webp": ".webp"}.get(file.content_type, ".jpg")
    report_id = uuid.uuid4().hex[:12]
    (UPLOADS / f"{report_id}{ext}").write_bytes(contents)

    report = {
        "id": report_id,
        "lat": lat,
        "lng": lng,
        "image": f"/uploads/{report_id}{ext}",
        "votes": 0,
        "created": int(time.time()),
        **result,
    }
    reports = load_reports()
    reports.append(report)
    save_reports(reports)
    return report


@app.post("/api/reports/{report_id}/vote")
def vote(report_id: str):
    reports = load_reports()
    for r in reports:
        if r["id"] == report_id:
            r["votes"] += 1
            save_reports(reports)
            return r
    raise HTTPException(status_code=404, detail="Report not found.")
