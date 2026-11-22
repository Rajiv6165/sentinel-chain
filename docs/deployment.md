# Sentinel-Chain Public Deployment Guide

This guide describes how to configure, harden, and deploy Sentinel-Chain as a public web application or demo on free-tier cloud hosting.

---

## 1. Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │          Public Web Browser           │
                      └──────────────────┬────────────────────┘
                                         │ HTTPS
                      ┌──────────────────▼────────────────────┐
                      │    Frontend (Vercel / Netlify)        │
                      │  - React 19 + Vite                    │
                      │  - Public demo warning banner         │
                      │  - Dynamic sandbox tab visibility     │
                      └──────────────────┬────────────────────┘
                                         │ HTTPS / CORS
                      ┌──────────────────▼────────────────────┐
                      │   Backend API (Render / Railway)      │
                      │  - Non-root production container      │
                      │  - Rate limiting per IP (SlowAPI)     │
                      │  - Safe zip extraction (anti-slip)    │
                      │  - Per-scan 60s timeout               │
                      │  - Daily LLM narrative cap            │
                      │  - Disabled sandbox by default        │
                      └──────────┬──────────────────┬─────────┘
                                 │                  │
                ┌────────────────▼─────────┐   ┌────▼─────────────────┐
                │ Hosted PostgreSQL (Neon) │   │ Anthropic Claude API │
                │ - Auto-migrations        │   │ - Capped daily quota │
                │ - In-memory fallback     │   └──────────────────────┘
                └──────────────────────────┘
```

---

## 2. Environment Variables Reference

| Variable | Scope | Default | Description |
| :--- | :---: | :---: | :--- |
| `ENABLE_SANDBOX` | Backend | `false` | **Critical Security Flag**. Keep `false` in public deployments. Running untrusted package install scripts requires privileged Docker access that must never be exposed to public web traffic. |
| `DATABASE_URL` | Backend | *(empty)* | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). If omitted, Sentinel-Chain gracefully degrades to an in-memory job store. |
| `CORS_ORIGINS` | Backend | `http://localhost:5173,...` | Comma-separated list of allowed frontend origins (e.g. `https://sentinel-chain.vercel.app`). Wildcard `*` is disallowed in production. |
| `ANTHROPIC_API_KEY` | Backend | *(empty)* | Optional. Enables Claude 3.5 Sonnet to explain findings. If omitted or quota is exhausted, the engine falls back to standard structured findings. |
| `LLM_DAILY_CAP` | Backend | `50` | Maximum number of Anthropic LLM calls per calendar day to prevent unexpected API costs on a public demo. |
| `MAX_UPLOAD_MB` | Backend | `15` | Maximum permitted zip/file upload size in megabytes (legacy: `MAX_UPLOAD_SIZE_BYTES`). Uploads exceeding this are rejected with HTTP 413. |
| `MAX_UNCOMPRESSED_MB`| Backend | `50` | Maximum cumulative uncompressed zip size in megabytes (legacy: `MAX_UNCOMPRESSED_SIZE_BYTES`) to prevent zip-bomb attacks. |
| `MAX_ZIP_FILES` | Backend | `1000` | Maximum number of files in an uploaded repository zip (legacy: `MAX_FILE_COUNT`), excluding filtered folders/media. |
| `SCAN_TIMEOUT_SECONDS` | Backend | `60` | Maximum duration before an AST reachability or unified scan times out. |
| `VITE_API_URL` | Frontend | *(empty)* | Backend base URL for the frontend application (e.g. `https://sentinel-chain-api.onrender.com`). |

---

## 3. Step-by-Step Free-Tier Deployment

### Step A: Free Hosted PostgreSQL (Neon / Supabase)
1. Sign up for a free PostgreSQL instance at [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Create a new database named `sentinel_chain`.
3. Copy the pooled connection string (`postgresql://<user>:<password>@<host>/sentinel_chain?sslmode=require`).

> [!NOTE]
> If you omit `DATABASE_URL`, Sentinel-Chain automatically runs in in-memory fallback mode with zero configuration needed.

### Step B: Backend Deployment on Render (or Railway / Fly.io)
1. Fork or push the repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** -> **Web Service**.
3. Connect your repository:
   - **Root Directory**: `backend`
   - **Environment**: **Docker** (Render will automatically detect `backend/Dockerfile`)
   - **Region**: Select your preferred region (e.g., Oregon or Frankfurt).
   - **Instance Type**: **Free**
4. In the **Environment Variables** section, configure:
   - `ENABLE_SANDBOX`: `false`
   - `DATABASE_URL`: Your Postgres connection string from Step A.
   - `CORS_ORIGINS`: Your frontend URL (e.g. `https://sentinel-chain.vercel.app`).
   - `LLM_DAILY_CAP`: `50`
   - `ANTHROPIC_API_KEY`: *(Optional)* Your Anthropic API key.
5. Click **Create Web Service**.
6. Render will build the non-root production Docker image and start the service.
7. Verify the service health:
   ```bash
   curl -f https://<your-render-url>/api/health
   # Expected response: {"status":"ok","loaded_packages":100,"db_enabled":true,"sandbox_enabled":false}
   ```

### Step C: Frontend Deployment on Vercel (or Netlify / Render Static Site)
1. In [Vercel Dashboard](https://vercel.com), click **Add New** -> **Project**.
2. Import your GitHub repository.
3. Configure project settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**, add:
   - `VITE_API_URL`: Your backend URL from Step B (e.g. `https://sentinel-chain-api.onrender.com`).
5. Click **Deploy**.
6. Once deployed, copy your production frontend URL (e.g. `https://sentinel-chain.vercel.app`) and ensure it is listed in the backend's `CORS_ORIGINS` variable.

---

## 4. Production Hardening Checklist

- [x] **Disabled Sandbox Engine**: `ENABLE_SANDBOX=false` disables the Phase 3 containerized install engine and Docker socket access, protecting the host machine.
- [x] **Safe Zip Extraction**:
  - Rejects Zip-Slip directory traversal attempts.
  - Rejects symbolic links to avoid arbitrary host filesystem reading.
  - Enforces 15 MB upload limit, 50 MB uncompressed limit, and 1,000 file limit (zip-bomb protection).
  - Guarantees immediate cleanup of temporary extraction directories in all execution paths.
- [x] **Rate Limiting**: Configured via SlowAPI (`10-20 requests/minute` per IP for upload and scan endpoints).
- [x] **Cost Protection**: Daily Anthropic API call quota prevents unexpected billing spikes.
- [x] **Non-Root Docker Execution**: Runs as unprivileged user `appuser` (UID 10001).
- [x] **Public Warning Banner**: Prominently notifies visitors that the instance is a public demo and private source code should not be uploaded.
- [x] **Sigstore Server Safety**: Interactive OIDC browser flows are disabled on headless server runtimes; verification and CI-ambient token signing remain operational.
