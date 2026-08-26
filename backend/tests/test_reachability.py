import pytest
import networkx as nx
import os
import tempfile
import asyncio
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.callgraph.javascript import JavascriptCallGraphBuilder
from utils.reachability import analyze_reachability

# A toy mock project with a vulnerable dependency call
TOY_PROJECT = {
    "index.js": """
        const reqeusts = require('reqeusts');
        const router = require('router');
        const app = router();
        
        app.get('/api/data', function(req, res) {
            fetchData();
        });
        
        function fetchData() {
            reqeusts.get('http://example.com');
        }
        
        function unusedFunction() {
            reqeusts.post('http://example.com');
        }
    """,
    "safe.js": """
        const reqeusts = require('reqeusts');
        
        function doNothing() {
            console.log("Safe");
        }
    """
}

@pytest.fixture
def toy_project_dir():
    with tempfile.TemporaryDirectory() as temp_dir:
        for filename, content in TOY_PROJECT.items():
            with open(os.path.join(temp_dir, filename), "w") as f:
                f.write(content)
        yield temp_dir

def test_build_call_graph(toy_project_dir):
    builder = JavascriptCallGraphBuilder()
    graph, entry_points = builder.build(toy_project_dir)
    
    # Check if entry point is detected (app.get -> fetch_data)
    # The node id for route might be `index.js:route_get`
    assert any('route_get' in n for n in entry_points)
    
    # Check if edges exist
    # `index.js:fetchData` should call `reqeusts.get`
    assert ("index.js:fetchData", "reqeusts.get") in graph.edges

@pytest.mark.asyncio
async def test_analyze_reachability(toy_project_dir):
    # Mock findings from Phase 1
    findings = [
        {
            "package_name": "reqeusts",
            "suspected_target": "requests",
            "risk_level": "high",
            "distance_score": 1,
            "reasoning": "Levenshtein distance is 1."
        }
    ]
    
    results = await analyze_reachability(toy_project_dir, findings)
    
    assert len(results) == 1
    result = results[0]
    
    assert result["reachability"] == "REACHABLE"
    assert "reqeusts.get" in result["call_chain"]
    # Chain should look something like: ['index.js:route_get', 'index.js:fetchData', 'reqeusts.get']
    assert len(result["call_chain"]) >= 2

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as temp_dir:
        for filename, content in TOY_PROJECT.items():
            with open(os.path.join(temp_dir, filename), "w") as f:
                f.write(content)
                
        print("Running test_build_call_graph...")
        test_build_call_graph(temp_dir)
        
        print("Running test_analyze_reachability...")
        asyncio.run(test_analyze_reachability(temp_dir))
        
        print("All tests passed!")
