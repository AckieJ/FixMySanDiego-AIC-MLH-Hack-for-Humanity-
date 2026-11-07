const API = window.API_URL;
const COLORS = { High: "#d62828", Medium: "#f77f00", Low: "#2a9d8f" };

const map = L.map("map").setView([32.7157, -117.1611], 12); // downtown San Diego
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const photoInput = document.getElementById("photo");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit");
const listEl = document.getElementById("report-list");

let selectedFile = null;
let coords = null;
const markers = L.layerGroup().addTo(map);
const voted = new Set(JSON.parse(localStorage.getItem("voted") || "[]"));

function setStatus(msg) { statusEl.textContent = msg; }

photoInput.addEventListener("change", () => {
  selectedFile = photoInput.files[0];
  if (!selectedFile) return;
  preview.src = URL.createObjectURL(selectedFile);
  preview.hidden = false;
  submitBtn.disabled = true;
  coords = null;
  setStatus("Getting your location...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setStatus("Location found. Ready to submit.");
      submitBtn.disabled = false;
    },
    () => setStatus("Could not get your location. Please allow location access and try again."),
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

submitBtn.addEventListener("click", async () => {
  if (!selectedFile || !coords) return;
  submitBtn.disabled = true;
  setStatus("Analyzing photo...");
  const form = new FormData();
  form.append("file", selectedFile);
  form.append("lat", coords.lat);
  form.append("lng", coords.lng);
  try {
    const res = await fetch(`${API}/api/report`, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
    const report = await res.json();
    setStatus(`Reported: ${report.category} (${report.severity} severity). Thank you!`);
    preview.hidden = true;
    photoInput.value = "";
    selectedFile = null;
    await loadReports();
    map.setView([report.lat, report.lng], 16);
  } catch (err) {
    setStatus("Something went wrong: " + err.message);
    submitBtn.disabled = false;
  }
});

async function vote(id) {
  if (voted.has(id)) return;
  await fetch(`${API}/api/reports/${id}/vote`, { method: "POST" });
  voted.add(id);
  localStorage.setItem("voted", JSON.stringify([...voted]));
  loadReports();
}

function popupContent(r) {
  const div = document.createElement("div");
  div.className = "popup";
  const img = document.createElement("img");
  img.src = API + r.image;
  img.alt = r.category;
  const title = document.createElement("strong");
  title.textContent = `${r.category} (${r.severity})`;
  const desc = document.createElement("p");
  desc.textContent = r.description;
  const btn = document.createElement("button");
  btn.className = "vote";
  btn.textContent = voted.has(r.id) ? `Voted (${r.votes})` : `Upvote (${r.votes})`;
  btn.disabled = voted.has(r.id);
  btn.onclick = () => vote(r.id);
  div.append(img, title, desc, btn);
  return div;
}

async function loadReports() {
  const res = await fetch(`${API}/api/reports`);
  const reports = await res.json();
  markers.clearLayers();
  listEl.replaceChildren();

  reports.forEach((r) => {
    L.circleMarker([r.lat, r.lng], {
      radius: 9, color: "#fff", weight: 2, fillColor: COLORS[r.severity] || "#666", fillOpacity: 0.9,
    }).bindPopup(() => popupContent(r)).addTo(markers);
  });

  [...reports].sort((a, b) => b.votes - a.votes).slice(0, 10).forEach((r) => {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = `tag ${r.severity}`;
    tag.textContent = r.severity;
    li.append(tag, ` ${r.category}: ${r.description} `);
    const votes = document.createElement("strong");
    votes.textContent = `(${r.votes} votes)`;
    li.append(votes);
    li.style.cursor = "pointer";
    li.onclick = () => map.setView([r.lat, r.lng], 17);
    listEl.append(li);
  });
}

loadReports().catch(() => setStatus("Could not reach the server. Is the backend running?"));
