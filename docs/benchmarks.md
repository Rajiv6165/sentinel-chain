# Sentinel-Chain Engine Benchmarks

This document publishes empirical benchmark measurements for Sentinel-Chain's two primary static detection engines:
1. **Typosquatting & Malicious Package Name Detector** (`backend/utils/scoring.py`)
2. **Static Call-Graph Reachability Engine** (`backend/utils/reachability.py`)

> [!IMPORTANT]
> **Dataset Sizes & Prominent Limitations**
> - **Typosquat Dataset**: 55 publicly documented malicious/typosquat packages from public security advisories (OSV, PyPI Security Advisories, Snyk, Datadog Security Labs) and 512 legitimate packages (including short names, scoped packages, and similar-but-legit forks).
> - **Reachability Dataset**: 20 hand-crafted, ground-truth-verified micro-projects (10 Python, 10 JavaScript/TypeScript) testing direct calls, intra-file indirect chains, aliasing, CLI scripts, dead imports, dead functions, uncalled utility files, dynamic reflection (`getattr`, `eval`), framework lifecycle hooks, Express middleware, and cross-module calls.
> - **Scope & Defensibility**: These benchmarks reflect hand-verified sample suites designed to measure detection fidelity, false-positive tradeoffs, and known static analysis blind spots. They are **not** an internet-scale empirical study across millions of repositories. Results are published without post-hoc dataset tuning.

---
## 1. Typosquat Detection Benchmark

### Methodology & Dataset Provenance
- **Positive Set (55 packages)**: Every entry is a real, documented typosquat or malicious package name sourced from official security advisories (e.g. `reqeusts`, `python-dotenvs`, `loadsh`, `electorn`, `crossenv`, `colors-cli`). Zero synthetic or invented names were used.
- **Negative Set (512 packages)**: Legitimate, widely-used npm and PyPI packages, intentionally biased towards challenging edge cases: single-word utility names (`chalk`, `glob`, `color`), scoped packages (`@aws-sdk/client-s3`), and legitimate package pairs (`dotenv` vs `dotenv-expand`, `colors` vs `colour`).
- **Algorithm**: Levenshtein edit distance evaluated against a curated reference list of top popular packages (`backend/data/top_packages.json`).

### Performance at Default Threshold (Max Distance = 2)

| Metric | Value | Detail |
| :--- | :--- | :--- |
| **Precision** | **60.00%** | True positives / (True positives + False positives) |
| **Recall** | **92.73%** | True positives / (True positives + False negatives) |
| **F1 Score** | **72.86%** | Harmonic mean of precision and recall |
| **True Positives (TP)** | 51 | Real typosquats correctly flagged (out of 55) |
| **False Positives (FP)** | 34 | Legitimate packages incorrectly flagged (out of 512) |
| **False Negatives (FN)** | 4 | Real typosquats missed |
| **True Negatives (TN)** | 478 | Legitimate packages correctly cleared |

### Threshold Sweep (Distance 1, 2, 3)

| Max Distance | Precision | Recall | F1 Score | TP | FP | FN | TN | Notes |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Distance 1 | 93.75% | 81.82% | 87.38% | 45 | 3 | 10 | 509 | Conservative (low noise, misses 10 attacks) |
| Distance 2 | 60.00% | 92.73% | 72.86% | 51 | 34 | 4 | 478 | **Default** (balanced detection) |
| Distance 3 | 32.50% | 94.55% | 48.37% | 52 | 108 | 3 | 404 | Aggressive (high false-alarm rate) |

**Analysis of Tradeoffs**:
- At **Distance 1**, precision is exceptional (93.75%), but recall falls to 81.82%, missing 10 real-world typosquats that use two-character mutations (e.g. `reqeusts`, `python-dotenvs`).
- At **Distance 2 (Default)**, recall jumps to **92.73%** (51/55 real attacks detected) with an acceptable precision of 60.00%.
- At **Distance 3**, recall barely increases (+1 detection, 94.55%), while false positives skyrocket from 34 to 108, reducing precision to 32.50%. This demonstrates that Distance 2 represents the optimal Pareto frontier.

### False Positives at Default Threshold (Distance <= 2)
Total false positives: **34** out of 512 legitimate packages.

| Legitimate Package | Target Matched | Distance | Explanation |
| :--- | :--- | :---: | :--- |
| `is` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `ip` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `du` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `pi` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `re` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `io` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `zip` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `ejs` | `rxjs` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `pug` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `less` | `jest` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `vite` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `pip` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `git` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `ssh` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `net` | `next` | 1 | Legitimate library name coincides within edit distance 2 of popular target |
| `util` | `uuid` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `vm` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `he` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `pump` | `numpy` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `request` | `requests` | 1 | Legitimate library name coincides within edit distance 2 of popular target |
| `chai` | `chalk` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `yup` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `knex` | `next` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `bytes` | `pytest` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `use` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `tox` | `six` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `nox` | `next` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `black` | `flask` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `pylint` | `eslint` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `motor` | `boto3` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `asyncpg` | `asyncio` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `boto` | `boto3` | 1 | Legitimate library name coincides within edit distance 2 of popular target |
| `vine` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |
| `huey` | `vue` | 2 | Legitimate library name coincides within edit distance 2 of popular target |

### False Negatives at Default Threshold (Distance <= 2)
Total false negatives (attacks missed): **4** out of 55 real attacks.

| Missed Malicious Package | Intended Victim | Advisory / Citation | Reason for Miss |
| :--- | :--- | :--- | :--- |
| `cross-env.js` | `cross-env` | Oscar Bolmsten Discovery (2017) / npm Security Advisory 2017-08 | Edit distance exceeds threshold 2 (e.g. prefix/suffix combo mutation) |
| `crossenv` | `cross-env` | npm Security Advisory (2017) / BleepingComputer | Edit distance exceeds threshold 2 (e.g. prefix/suffix combo mutation) |
| `beautifull-soup` | `beautifulsoup4` | OSV: MAL-2022-1502 / PyPI Security Research | Edit distance exceeds threshold 2 (e.g. prefix/suffix combo mutation) |
| `celery-client` | `celery` | OSV: MAL-2022-1770 / Sonatype Intelligence | Edit distance exceeds threshold 2 (e.g. prefix/suffix combo mutation) |

---
## 2. Reachability Engine Benchmark

### Methodology & Ground Truth Definition
- **Dataset**: 20 hand-verified micro-projects across Python and JavaScript.
- **Ground Truth Classification**:
  - `REACHABLE`: The vulnerable function or package is genuinely called at runtime (statically, dynamically via reflection, or via framework hooks/middleware).
  - `UNREACHABLE`: The vulnerable function or package is never invoked anywhere during runtime execution (dead imports, unused functions, isolated diagnostic scripts).
- **Dangerous Error Definition**: A **False UNREACHABLE** is a vulnerability that is reachable at runtime, but the static analysis engine incorrectly downgrades it as `UNREACHABLE`. This is a critical failure mode because it creates false security confidence.

### Classification Matrix

| Metric | Count | Percentage | Description |
| :--- | :---: | :---: | :--- |
| **Total Sample Projects** | 20 | 100.0% | 10 Python, 10 JavaScript/TypeScript projects |
| **Ground Truth Reachable** | 14 | 70.0% | Packages executed at runtime |
| **Ground Truth Unreachable** | 6 | 30.0% | Packages never executed at runtime |
| **Correct REACHABLE (TP)** | 8 | 57.1% of GT Reachable | Correctly traced path from entry point |
| **Correct UNREACHABLE (TN)** | 4 | 66.7% of GT Unreachable | Correctly identified dead/uncalled code |
| **False UNREACHABLE (Dangerous FN)** | **4** | **28.6%** of GT Reachable | **Critical**: Downgraded reachable CVEs due to blind spots |
| **False REACHABLE (FP)** | 0 | 0.0% | Unreachable packages marked reachable |
| **Honestly Marked UNKNOWN** | 4 | 20.0% of Total | Engine refrained from guessing on dynamic dispatch |

### Alert Downgrade Share vs. False UNREACHABLE Analysis

- **Alert Downgrade Share**: **40.0%** (8 of 20 total CVE alerts downgraded to `UNREACHABLE`).
- **False UNREACHABLE Count**: **4**.

> [!WARNING]
> While the engine downgraded **40.0%** of alerts as unreachable, **4 out of the 8 downgraded alerts (50.0%) were actually False UNREACHABLEs**.
> In a production deployment, relying solely on static AST reachability to silence CVE alerts would silence real vulnerabilities executed via framework middleware, startup handlers, or cross-file module calls.

### Detailed Per-Sample Evaluation Results

| Sample ID | Lang | Target & CVE | Pattern | Ground Truth | Engine Result | Evaluation Outcome | Call Chain / Reason |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| `py_01_direct_reachable` | python | `requests` (CVE-2018-18074) | direct_call | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | app.py:fetch_remote -> requests.get |
| `py_02_indirect_callchain` | python | `requests` (CVE-2018-18074) | indirect_callchain | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | app.py:trigger -> app.py:perform_post_dispatch -> request... |
| `py_03_aliased_import` | python | `requests` (CVE-2018-18074) | aliased_import | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | app.py:ping -> requests.get |
| `py_04_main_entry_reachable` | python | `urllib3` (CVE-2021-33503) | main_entry | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | main.py:__main__ -> main.py:run_worker -> urllib3.PoolMan... |
| `py_05_dead_import` | python | `requests` (CVE-2018-18074) | dead_import | **UNREACHABLE** | `UNKNOWN` | `HONEST_UNKNOWN` | Package imported but no direct static calls found. May us... |
| `py_06_unreachable_function` | python | `requests` (CVE-2018-18074) | dead_function | **UNREACHABLE** | `UNREACHABLE` | `CORRECT_UNREACHABLE` | No static path found from known entry points. |
| `py_07_uncalled_utility_file` | python | `requests` (CVE-2018-18074) | uncalled_utility_file | **UNREACHABLE** | `UNREACHABLE` | `CORRECT_UNREACHABLE` | No static path found from known entry points. |
| `py_08_dynamic_getattr` | python | `requests` (CVE-2018-18074) | dynamic_dispatch | **REACHABLE** | `UNKNOWN` | `HONEST_UNKNOWN` | Package imported but no direct static calls found. May us... |
| `py_09_signal_handler_blindspot` | python | `requests` (CVE-2018-18074) | framework_blindspot | **REACHABLE** | `UNREACHABLE` | `FALSE_UNREACHABLE` | No static path found from known entry points. |
| `py_10_intermodule_blindspot` | python | `requests` (CVE-2018-18074) | cross_file_call | **REACHABLE** | `UNREACHABLE` | `FALSE_UNREACHABLE` | No static path found from known entry points. |
| `js_01_direct_reachable` | javascript | `lodash` (CVE-2021-23337) | direct_call | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | server.js:route_get -> lodash.template |
| `js_02_indirect_callchain` | javascript | `lodash` (CVE-2021-23337) | indirect_callchain | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | server.js:route_post -> server.js:formatUserCard -> lodas... |
| `js_03_aliased_require` | javascript | `lodash` (CVE-2021-23337) | aliased_import | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | server.js:route_post -> lodash.template |
| `js_04_dead_import` | javascript | `lodash` (CVE-2021-23337) | dead_import | **UNREACHABLE** | `UNKNOWN` | `HONEST_UNKNOWN` | Package imported but no direct static calls found. May us... |
| `js_05_unreachable_function` | javascript | `lodash` (CVE-2021-23337) | dead_function | **UNREACHABLE** | `UNREACHABLE` | `CORRECT_UNREACHABLE` | No static path found from known entry points. |
| `js_06_uncalled_test_helper` | javascript | `axios` (CVE-2020-28168) | uncalled_utility_file | **UNREACHABLE** | `UNREACHABLE` | `CORRECT_UNREACHABLE` | No static path found from known entry points. |
| `js_07_dynamic_eval` | javascript | `lodash` (CVE-2021-23337) | dynamic_dispatch | **REACHABLE** | `UNKNOWN` | `HONEST_UNKNOWN` | Package imported but no direct static calls found. May us... |
| `js_08_middleware_blindspot` | javascript | `lodash` (CVE-2021-23337) | framework_blindspot | **REACHABLE** | `UNREACHABLE` | `FALSE_UNREACHABLE` | No static path found from known entry points. |
| `js_09_multi_route_partial` | javascript | `lodash` (CVE-2021-23337) | multi_route_partial | **REACHABLE** | `REACHABLE` | `CORRECT_REACHABLE` | server.js:route_post -> lodash.template |
| `js_10_intermodule_blindspot` | javascript | `lodash` (CVE-2021-23337) | cross_file_call | **REACHABLE** | `UNREACHABLE` | `FALSE_UNREACHABLE` | No static path found from known entry points. |

### Root Cause Analysis of Detection Failures
1. **Framework & Lifecycle Blindspots (Samples `py_09`, `js_08`)**:
   - In Python, decorators like `@app.on_event('startup')` or lifecycle hooks execute when the application launches. Because the static AST builder only registers HTTP route decorators (`@app.route`, `@app.get`), it misses non-route entry points.
   - In Express, `app.use(middleware)` runs on every incoming request. The AST builder inspects route registration methods (`get`, `post`, `put`, `delete`) and overlooks `app.use`, causing middleware calls to be marked unreachable.
2. **Cross-Module Call Resolution (Samples `py_10`, `js_10`)**:
   - When a route handler calls a function imported from another module (e.g. `service.py` or `renderer.js`), the static AST builder creates file-scoped call graph nodes (`app.py:route -> app.py:execute_remote_call` vs `service.py:execute_remote_call -> requests.post`). Without cross-file inter-module symbol resolution, the graph disconnectedly evaluates to `UNREACHABLE`.
3. **Dynamic Reflection & Dispatch (Samples `py_08`, `js_07`)**:
   - When packages are invoked via `getattr(pkg, method)` or `eval(...)`, the engine cannot trace an AST edge to the target function. It honestly marks the finding `UNKNOWN` rather than claiming it is unreachable.

---
## 3. Reproducibility & Offline Determinism

Both benchmarks are deterministic and runnable completely offline without network access.

### Running the Benchmark
```bash
# From the repository root:
python -m backend.benchmarks run
```

### Offline Caching
- Vulnerability advisories and patch function lists are pre-cached in `backend/data/advisory_cache.json`.
- Typosquat sample sets are versioned in `backend/benchmarks/typosquat/*.json`.
- Sample code repositories are self-contained under `backend/benchmarks/reachability/samples/`.
