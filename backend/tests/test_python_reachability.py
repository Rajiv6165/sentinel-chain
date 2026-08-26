import pytest
import networkx as nx
import os
import tempfile
import asyncio
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.callgraph.python import PythonCallGraphBuilder
from utils.reachability import analyze_reachability

# A toy mock project with a vulnerable dependency call (Python)
TOY_PROJECT = {
    "app.py": """
import requests
from flask import Flask

app = Flask(__name__)

@app.route('/api/data')
def fetch_data():
    call_api()
    
def call_api():
    requests.get('http://example.com')
    
def unused_function():
    requests.post('http://example.com')
    """,
    "safe.py": """
import requests

def do_nothing():
    print("Safe")
    
if __name__ == "__main__":
    do_nothing()
    """
}

@pytest.fixture
def toy_project_dir():
    with tempfile.TemporaryDirectory() as temp_dir:
        for filename, content in TOY_PROJECT.items():
            with open(os.path.join(temp_dir, filename), "w") as f:
                f.write(content)
        # Create a requirements.txt to trigger Python auto-detection in analyze_reachability
        with open(os.path.join(temp_dir, "requirements.txt"), "w") as f:
            f.write("requests==2.26.0\nflask==2.0.1")
            
        yield temp_dir

def test_build_python_call_graph(toy_project_dir):
    builder = PythonCallGraphBuilder()
    graph, entry_points = builder.build(toy_project_dir)
    
    # Check if entry point is detected (fetch_data has @app.route)
    assert "app.py:fetch_data" in entry_points
    
    # Check if entry point from safe.py is detected (has if __name__ == "__main__")
    assert "safe.py:__main__" in entry_points
    
    # Check if edges exist
    # `app.py:fetch_data` should call `app.py:call_api`
    assert ("app.py:fetch_data", "app.py:call_api") in graph.edges
    assert ("app.py:call_api", "requests.get") in graph.edges

@pytest.mark.asyncio
async def test_analyze_python_reachability(toy_project_dir):
    # Mock findings from Phase 1
    findings = [
        {
            "package_name": "requests",
            "suspected_target": "reqeusts", # Typosquat logic doesn't strictly matter here, but simulating a finding
            "risk_level": "high",
            "distance_score": 1,
            "reasoning": "Levenshtein distance is 1."
        }
    ]
    
    results = await analyze_reachability(toy_project_dir, findings)
    
    assert len(results) == 1
    result = results[0]
    
    assert result["reachability"] == "REACHABLE"
    assert result["call_chain"] == ["app.py:fetch_data", "app.py:call_api", "requests.get"]
