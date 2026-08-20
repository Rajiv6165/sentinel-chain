# Sentinel-chain

Supply-chain security platform that proves exploitability instead of flagging on package presence — combines call-graph reachability analysis, sandboxed behavioral detection for malicious packages, typosquat detection, and LLM-generated attack narratives.

A supply-chain security platform designed to analyze dependencies and detect exploitable risks, focusing initially on typosquatting attacks against top npm and PyPI packages.

## Phase 1 Features
- **Typosquat Detector Engine:** Scans `package.json` and `requirements.txt` files for dependencies that intentionally mimic top downloaded packages.
- **Advanced Scoring:** Uses a combination of Levenshtein distance and Keyboard Adjacency to accurately identify high-risk typos (e.g. `reqeusts` vs `requests`).
- **Modern Dashboard:** React and Tailwind CSS based UI to review scan findings.

## Tech Stack
- **Backend:** Python, FastAPI
- **Frontend:** React, Vite, Tailwind CSS

## Running the Application

### Using Docker Compose (Recommended)

1. Ensure Docker Desktop is running.
2. Run the following command in the root of this project:
   ```bash
   docker-compose up --build
   ```
3. Open your browser and navigate to:
   - Frontend Dashboard: [http://localhost:5173](http://localhost:5173)
   - Backend API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Running Locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## How Typosquatting Detection Works
The `utils/scoring.py` module compares every dependency in your uploaded file against a list of known top packages.
1. It computes the Levenshtein distance.
2. If the distance is 1 (insertion/deletion/substitution) or 2 (swap), it performs QWERTY keyboard adjacency checks.
3. Swapped adjacent keys (like `e` and `u` in `reqeusts`) or substituted adjacent keys (like `i` and `u`) flag the package as a `HIGH` risk target.
