import os
import tempfile
import pytest

from utils.reachability import analyze_reachability
from utils.scoring import analyze_typosquat, score_dependencies, DEFAULT_MAX_DISTANCE
from utils.aggregator import aggregate_risk_scores


def _write_project(tmp_dir: str, files: dict[str, str]):
    for rel_path, content in files.items():
        full_path = os.path.join(tmp_dir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)


# ==============================================================================
# FIX 1: Cross-module call resolution (Python & JavaScript)
# ==============================================================================

@pytest.mark.asyncio
async def test_python_cross_module_from_import_and_alias():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "service.py": """
import requests

def execute_remote_call(url):
    return requests.post(url, json={"ok": True})
""",
            "app.py": """
from flask import Flask
from service import execute_remote_call as run_remote

app = Flask(__name__)

@app.route('/trigger', methods=['POST'])
def trigger():
    return run_remote("https://api.internal/hook")
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "service.py:execute_remote_call" in res[0]["call_chain"]
        assert "requests.post" in res[0]["call_chain"]


@pytest.mark.asyncio
async def test_python_cross_module_import_module_alias_and_relative():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "pkg/__init__.py": "",
            "pkg/client.py": """
import requests

def fetch_data():
    return requests.get("https://example.com")
""",
            "pkg/views.py": """
from flask import Flask
from .client import fetch_data as do_fetch

app = Flask(__name__)

@app.route('/data')
def data():
    return do_fetch()
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "pkg/client.py:fetch_data" in res[0]["call_chain"]


@pytest.mark.asyncio
async def test_python_cross_module_reexport_via_init():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "pkg/__init__.py": "from .worker import send_ping\n",
            "pkg/worker.py": """
import requests

def send_ping():
    return requests.get("https://example.com/ping")
""",
            "app.py": """
from flask import Flask
from pkg import send_ping

app = Flask(__name__)

@app.route('/ping')
def ping():
    return send_ping()
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "pkg/worker.py:send_ping" in res[0]["call_chain"]


@pytest.mark.asyncio
async def test_js_cross_module_require_destructured_and_aliased():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "package.json": '{"name": "test", "dependencies": {"lodash": "4.17.20"}}',
            "renderer.js": """
const lodash = require('lodash');

function internalRender(data) {
    return lodash.template('Card: <%= name %>')(data);
}
module.exports = { formatUserCard: internalRender };
""",
            "server.js": """
const express = require('express');
const { formatUserCard: renderCard } = require('./renderer');
const router = express.Router();

router.post('/card', (req, res) => {
    res.json({ card: renderCard({ name: 'Alice' }) });
});
""",
        })
        res = await analyze_reachability(td, [{"package_name": "lodash", "cve_id": "CVE-2021-23337"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "renderer.js:internalRender" in res[0]["call_chain"]


@pytest.mark.asyncio
async def test_js_cross_module_es_import_named_and_default():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "package.json": '{"name": "test-esm", "dependencies": {"lodash": "4.17.20"}}',
            "utils/tpl.js": """
import _ from 'lodash';

function compileBody(str) {
    return _.template(str);
}
export default compileBody;
""",
            "server.js": """
import express from 'express';
import renderTemplate from './utils/tpl';
const app = express();

app.get('/page', (req, res) => {
    res.send(renderTemplate('<h1>Hi</h1>')({}));
});
""",
        })
        res = await analyze_reachability(td, [{"package_name": "lodash", "cve_id": "CVE-2021-23337"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "utils/tpl.js:compileBody" in res[0]["call_chain"]


# ==============================================================================
# FIX 2: Express middleware (app.use / router.use)
# ==============================================================================

@pytest.mark.asyncio
async def test_express_app_use_and_router_use_middleware():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "package.json": '{"name": "mw-test", "dependencies": {"lodash": "4.17.20"}}',
            "auth.js": """
const lodash = require('lodash');

function checkHeader(req, res, next) {
    lodash.template('<%= h %>')({ h: req.headers.auth });
    next();
}
module.exports = { checkHeader };
""",
            "server.js": """
const express = require('express');
const { checkHeader } = require('./auth');
const router = express.Router();

router.use('/secure', checkHeader);

router.get('/secure/ping', (req, res) => {
    res.send('ok');
});
""",
        })
        res = await analyze_reachability(td, [{"package_name": "lodash", "cve_id": "CVE-2021-23337"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "server.js:route_use" in res[0]["call_chain"]
        assert "auth.js:checkHeader" in res[0]["call_chain"]


# ==============================================================================
# FIX 3: Python startup/lifecycle hooks (FastAPI lifespan/on_event, Flask hooks)
# ==============================================================================

@pytest.mark.asyncio
async def test_fastapi_on_event_and_lifespan_entry_points():
    # Case A: @app.on_event("startup")
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nfastapi>=0.100.0\n",
            "app.py": """
from fastapi import FastAPI
import requests

app = FastAPI()

@app.on_event("startup")
async def warm_cache():
    requests.get("https://cache.internal/warm")

@app.get("/health")
def health():
    return {"ok": True}
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "app.py:warm_cache" in res[0]["call_chain"]

    # Case B: FastAPI(lifespan=my_lifespan)
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nfastapi>=0.100.0\n",
            "app.py": """
from contextlib import asynccontextmanager
from fastapi import FastAPI
import requests

@asynccontextmanager
async def app_lifespan(app):
    requests.post("https://registry.internal/boot")
    yield

app = FastAPI(lifespan=app_lifespan)

@app.get("/health")
def health():
    return {"ok": True}
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "app.py:app_lifespan" in res[0]["call_chain"]


@pytest.mark.asyncio
async def test_flask_before_first_request_hook():
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """
from flask import Flask
import requests

app = Flask(__name__)

@app.before_first_request
def initialize_remote():
    requests.get("https://config.internal/init")

@app.route("/status")
def status():
    return {"ok": True}
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "REACHABLE"
        assert "app.py:initialize_remote" in res[0]["call_chain"]


# ==============================================================================
# FIX 4: Safety policy (dynamic / unresolved imports -> UNKNOWN, never downgrade)
# ==============================================================================

@pytest.mark.asyncio
async def test_safety_policy_dynamic_construct_prevents_unreachable():
    # Dead-looking static call exists in helper, BUT reachable route uses getattr/eval
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """
from flask import Flask, request
import requests

app = Flask(__name__)

def dynamic_target():
    return requests.get("https://example.com/secret")

@app.route("/run")
def run_endpoint():
    fn_name = request.args.get("fn", "dynamic_target")
    fn = eval(fn_name)
    return fn()
""",
        })
        res = await analyze_reachability(td, [{"package_name": "requests", "cve_id": "CVE-2018-18074"}])
        assert res[0]["reachability"] == "UNKNOWN"
        assert "dynamic constructs" in res[0]["reachability_reason"].lower()


@pytest.mark.asyncio
async def test_safety_policy_unresolved_local_import_prevents_unreachable():
    # Reachable file has an unresolved local relative require while vulnerable pkg has static call elsewhere
    with tempfile.TemporaryDirectory() as td:
        _write_project(td, {
            "package.json": '{"name": "unresolved-test", "dependencies": {"lodash": "4.17.20"}}',
            "server.js": """
const express = require('express');
const missingMod = require('./generated_routes');
const lodash = require('lodash');
const app = express();

function indirectTemplate() {
    return lodash.template('<%= x %>')({ x: 1 });
}

app.get('/health', (req, res) => {
    res.send('ok');
});
""",
        })
        res = await analyze_reachability(td, [{"package_name": "lodash", "cve_id": "CVE-2021-23337"}])
        assert res[0]["reachability"] == "UNKNOWN"
        assert "unresolved imports" in res[0]["reachability_reason"].lower()


def test_safety_policy_aggregator_never_downgrades_unknown():
    high_epss_unknown = [{"cve_id": "CVE-2021-23337", "reachability": "UNKNOWN", "epss_score": 0.9}]
    high_epss_unreachable = [{"cve_id": "CVE-2021-23337", "reachability": "UNREACHABLE", "epss_score": 0.9}]

    assert aggregate_risk_scores("lodash", None, high_epss_unknown, None)["overall_risk"] == "CRITICAL"
    assert aggregate_risk_scores("lodash", None, high_epss_unreachable, None)["overall_risk"] == "LOW"


# ==============================================================================
# FIX 5: Typosquat default distance 1 (high confidence), distance 2 (low review)
# ==============================================================================

def test_typosquat_default_distance_1_and_review_tier_distance_2():
    assert DEFAULT_MAX_DISTANCE == 1

    # Distance 1: high-confidence default flag -> CRITICAL in aggregator
    d1 = analyze_typosquat("reqiests", "requests")
    assert d1 is not None
    assert d1["distance_score"] == 1
    assert d1["confidence"] == "high"
    assert d1["confidence_label"] == "high confidence"
    assert aggregate_risk_scores("reqiests", d1, [], None)["overall_risk"] == "CRITICAL"

    # Distance 2: NOT flagged by default; when inspected via max_distance=2, marked low confidence / review -> LOW
    assert analyze_typosquat("reqeusts", "requests") is None
    d2 = analyze_typosquat("reqeusts", "requests", max_distance=2)
    assert d2 is not None
    assert d2["distance_score"] == 2
    assert d2["risk_level"] == "low"
    assert d2["confidence"] == "low"
    assert d2["confidence_label"] == "low confidence / review"
    assert aggregate_risk_scores("reqeusts", d2, [], None)["overall_risk"] == "LOW"

    # score_dependencies defaults to distance 1
    default_findings = score_dependencies(["reqiests", "reqeusts"], ["requests"])
    assert [f["package_name"] for f in default_findings] == ["reqiests"]
