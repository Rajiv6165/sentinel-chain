import os
import json
import shutil

SAMPLES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
if os.path.exists(SAMPLES_DIR):
    shutil.rmtree(SAMPLES_DIR)
os.makedirs(SAMPLES_DIR, exist_ok=True)

SAMPLES = [
    # ------------------ PYTHON SAMPLES (10) ------------------
    {
        "id": "py_01_direct_reachable",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "Flask GET route directly invokes requests.get()",
        "pattern": "direct_call",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/fetch', methods=['GET'])
def fetch_remote():
    target = request.args.get('url', 'https://example.com')
    resp = requests.get(target)
    return resp.text
"""
        }
    },
    {
        "id": "py_02_indirect_callchain",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "Flask POST route calls local helper function which invokes requests.post()",
        "pattern": "indirect_callchain",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask
import requests

app = Flask(__name__)

def perform_post_dispatch(target_url):
    return requests.post(target_url, json={"status": "ping"})

@app.route('/trigger', methods=['POST'])
def trigger():
    res = perform_post_dispatch("https://api.internal/webhook")
    return {"ok": True}
"""
        }
    },
    {
        "id": "py_03_aliased_import",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "from requests import get as http_get called inside Flask route",
        "pattern": "aliased_import",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask
from requests import get as http_get

app = Flask(__name__)

@app.route('/ping')
def ping():
    resp = http_get("https://example.com/health")
    return str(resp.status_code)
"""
        }
    },
    {
        "id": "py_04_main_entry_reachable",
        "language": "python",
        "package_name": "urllib3",
        "cve_id": "CVE-2021-33503",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "CLI script with if __name__ == '__main__': calling urllib3.PoolManager()",
        "pattern": "main_entry",
        "files": {
            "requirements.txt": "urllib3==1.26.4\n",
            "main.py": """import urllib3

def run_worker():
    http = urllib3.PoolManager()
    resp = http.request('GET', 'https://example.com')
    print(resp.status)

if __name__ == '__main__':
    run_worker()
"""
        }
    },
    {
        "id": "py_05_dead_import",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNKNOWN",
        "description": "Package imported but zero calls anywhere in code; honest engine marks UNKNOWN",
        "pattern": "dead_import",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask, request
import requests  # Unused import

app = Flask(__name__)

@app.route('/calculate')
def calculate():
    a = int(request.args.get('a', 0))
    b = int(request.args.get('b', 0))
    return {"sum": a + b}
"""
        }
    },
    {
        "id": "py_06_unreachable_function",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Function calls requests.delete() but is dead unreferenced code",
        "pattern": "dead_function",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask
import requests

app = Flask(__name__)

def legacy_cleanup_job():
    # Dead function - never invoked from any entry point
    return requests.delete("https://api.internal/old-records")

@app.route('/status')
def status():
    return {"status": "healthy"}
"""
        }
    },
    {
        "id": "py_07_uncalled_utility_file",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Isolated utility file calls requests.put() but is never imported by server",
        "pattern": "uncalled_utility_file",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "server.py": """from flask import Flask

app = Flask(__name__)

@app.route('/info')
def info():
    return {"version": "1.0"}
""",
            "unused_diagnostic.py": """import requests

def probe_network():
    return requests.put("https://telemetry.example.com", data="probe")
"""
        }
    },
    {
        "id": "py_08_dynamic_getattr",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNKNOWN",
        "description": "Route calls getattr(requests, action)('https://...'), dynamic reflection",
        "pattern": "dynamic_dispatch",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/dispatch')
def dispatch():
    action = request.args.get('action', 'get')
    method = getattr(requests, action)
    resp = method("https://example.com/api")
    return resp.text
"""
        }
    },
    {
        "id": "py_09_signal_handler_blindspot",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Startup lifecycle hook calls requests.get(); static graph misses non-route hook",
        "pattern": "framework_blindspot",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "app.py": """from flask import Flask
import requests

app = Flask(__name__)

def on_application_startup():
    # Framework lifecycle hook executed at startup
    requests.get("https://registry.internal/heartbeat")

app_startup_hooks = [on_application_startup]

@app.route('/health')
def health():
    return {"status": "up"}
"""
        }
    },
    {
        "id": "py_10_intermodule_blindspot",
        "language": "python",
        "package_name": "requests",
        "cve_id": "CVE-2018-18074",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Cross-file call chain: route calls imported helper in separate service module",
        "pattern": "cross_file_call",
        "files": {
            "requirements.txt": "requests==2.19.1\nflask>=2.0.0\n",
            "service.py": """import requests

def execute_remote_call(target_url):
    return requests.post(target_url, json={"status": "ping"})
""",
            "app.py": """from flask import Flask
from service import execute_remote_call

app = Flask(__name__)

@app.route('/trigger', methods=['POST'])
def trigger():
    res = execute_remote_call("https://api.internal/webhook")
    return {"ok": True}
"""
        }
    },

    # ------------------ JAVASCRIPT SAMPLES (10) ------------------
    {
        "id": "js_01_direct_reachable",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "Express app.get('/render') directly invokes lodash.template()",
        "pattern": "direct_call",
        "files": {
            "package.json": json.dumps({"name": "js_01", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash');
const app = express();

app.get('/render', (req, res) => {
    const compiled = lodash.template('Hello <%= user %>');
    res.send(compiled({ user: req.query.name || 'world' }));
});
"""
        }
    },
    {
        "id": "js_02_indirect_callchain",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "Express router.post() calls local helper function which invokes lodash.template()",
        "pattern": "indirect_callchain",
        "files": {
            "package.json": json.dumps({"name": "js_02", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash');
const router = express.Router();

function formatUserCard(data) {
    return lodash.template('Card: <%= name %>')(data);
}

router.post('/card', (req, res) => {
    const card = formatUserCard({ name: 'Alice' });
    res.json({ card });
});
"""
        }
    },
    {
        "id": "js_03_aliased_require",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "const _ = require('lodash'); _.template() inside Express post route",
        "pattern": "aliased_import",
        "files": {
            "package.json": json.dumps({"name": "js_03", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const _ = require('lodash');
const app = express();

app.post('/compile', (req, res) => {
    const tpl = _.template('<%= msg %>');
    res.send(tpl({ msg: 'hi' }));
});
"""
        }
    },
    {
        "id": "js_04_dead_import",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNKNOWN",
        "description": "const lodash = require('lodash') but zero calls; honest engine marks UNKNOWN",
        "pattern": "dead_import",
        "files": {
            "package.json": json.dumps({"name": "js_04", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash'); // Unused import
const app = express();

app.get('/greeting', (req, res) => {
    res.send('Welcome, visitor!');
});
"""
        }
    },
    {
        "id": "js_05_unreachable_function",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Uncalled dead function invokes lodash.template(); unreachable from route",
        "pattern": "dead_function",
        "files": {
            "package.json": json.dumps({"name": "js_05", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash');
const app = express();

function deprecatedReportGenerator() {
    // Dead function - never invoked or exported
    return lodash.template('Report: <%= title %>');
}

app.get('/summary', (req, res) => {
    res.json({ status: 'ok' });
});
"""
        }
    },
    {
        "id": "js_06_uncalled_test_helper",
        "language": "javascript",
        "package_name": "axios",
        "cve_id": "CVE-2020-28168",
        "ground_truth": "UNREACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Uncalled test fixture file calls axios.post(); never imported by server",
        "pattern": "uncalled_utility_file",
        "files": {
            "package.json": json.dumps({"name": "js_06", "dependencies": {"axios": "0.21.0"}}, indent=2),
            "server.js": """const express = require('express');
const app = express();

app.get('/api/users', (req, res) => {
    res.json([{ id: 1, name: 'Alice' }]);
});
""",
            "test_mock_sync.js": """const axios = require('axios');

function seedRemoteFixtures() {
    return axios.post('https://ci-database.local/seed', { clean: true });
}
"""
        }
    },
    {
        "id": "js_07_dynamic_eval",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNKNOWN",
        "description": "Route calls eval() to execute lodash.template dynamically",
        "pattern": "dynamic_dispatch",
        "files": {
            "package.json": json.dumps({"name": "js_07", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const app = express();

app.post('/dynamic-exec', (req, res) => {
    const dynamicCode = "require('lodash').template('Dynamic <%= val %>')({ val: 'ok' })";
    const result = eval(dynamicCode);
    res.send(result);
});
"""
        }
    },
    {
        "id": "js_08_middleware_blindspot",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Express app.use() middleware runs lodash.template on every request; static parser misses app.use",
        "pattern": "framework_blindspot",
        "files": {
            "package.json": json.dumps({"name": "js_08", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash');
const app = express();

function auditLoggerMiddleware(req, res, next) {
    // Middleware executed on every incoming HTTP request!
    const logMsg = lodash.template('Access to <%= path %>')({ path: req.url });
    next();
}

app.use(auditLoggerMiddleware);

app.get('/metrics', (req, res) => {
    res.json({ uptime: 100 });
});
"""
        }
    },
    {
        "id": "js_09_multi_route_partial",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "REACHABLE",
        "description": "Multi-route app: /public/ping is safe, /admin/render calls lodash.template()",
        "pattern": "multi_route_partial",
        "files": {
            "package.json": json.dumps({"name": "js_09", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "server.js": """const express = require('express');
const lodash = require('lodash');
const app = express();

app.get('/public/ping', (req, res) => {
    res.send('pong');
});

app.post('/admin/render', (req, res) => {
    const tpl = lodash.template('Admin: <%= role %>');
    res.send(tpl({ role: 'superadmin' }));
});
"""
        }
    },
    {
        "id": "js_10_intermodule_blindspot",
        "language": "javascript",
        "package_name": "lodash",
        "cve_id": "CVE-2021-23337",
        "ground_truth": "REACHABLE",
        "expected_detection": "UNREACHABLE",
        "description": "Cross-file call chain: router calls imported helper from separate renderer module",
        "pattern": "cross_file_call",
        "files": {
            "package.json": json.dumps({"name": "js_10", "dependencies": {"lodash": "4.17.20"}}, indent=2),
            "renderer.js": """const lodash = require('lodash');

function formatUserCard(data) {
    return lodash.template('Card: <%= name %>')(data);
}
module.exports = { formatUserCard };
""",
            "server.js": """const express = require('express');
const { formatUserCard } = require('./renderer');
const router = express.Router();

router.post('/card', (req, res) => {
    const card = formatUserCard({ name: 'Alice' });
    res.json({ card });
});
"""
        }
    }
]

def main():
    metadata = []
    for sample in SAMPLES:
        sample_dir = os.path.join(SAMPLES_DIR, sample["id"])
        os.makedirs(sample_dir, exist_ok=True)
        for filename, content in sample["files"].items():
            file_path = os.path.join(sample_dir, filename)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
        
        meta = {k: v for k, v in sample.items() if k != "files"}
        meta["sample_dir"] = os.path.relpath(sample_dir, os.path.dirname(os.path.abspath(__file__)))
        metadata.append(meta)
        print(f"Created sample: {sample['id']} ({sample['language']}) - GT: {sample['ground_truth']}")

    ground_truth_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ground_truth.json")
    with open(ground_truth_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Wrote ground truth metadata to {ground_truth_file} ({len(metadata)} samples)")

if __name__ == "__main__":
    main()
