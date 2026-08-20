import networkx as nx
from .callgraph import build_call_graph
from .vulnerability import get_vulnerable_functions

async def analyze_reachability(project_dir: str, findings: list[dict]) -> list[dict]:
    """
    Given a project directory and a list of Phase 1 findings,
    adds reachability context to each finding.
    """
    try:
        graph, entry_points = build_call_graph(project_dir)
    except Exception as e:
        print(f"Failed to build call graph: {e}")
        for finding in findings:
            finding["reachability"] = "UNKNOWN"
            finding["reachability_reason"] = "Failed to parse AST / build call graph"
        return findings

    # Enhance findings
    for finding in findings:
        pkg = finding.get("package_name")
        cve = finding.get("cve_id") # Note: Phase 1 findings might not have CVE IDs, let's assume it checks package names initially
        
        # In a real scanner, Phase 1 outputs CVE IDs. For typosquatting, the "vulnerability" is the package itself.
        # If it's a typosquat, any call to it is dangerous.
        # Let's see if the finding is a typosquat (risk_level high).
        # We look for the package name in the graph edges (e.g. `bad-pkg.dangerousFunc`)
        
        # Let's find all nodes in the graph that belong to this package
        # Since we map aliases, a call to a bad package looks like an edge to `bad-pkg.funcName` or just `bad-pkg`
        target_nodes = []
        for node in graph.nodes():
            if node.startswith(f"{pkg}.") or node == pkg:
                target_nodes.append(node)
                
        # If no target nodes found by package name, but maybe we didn't capture the exact call
        # Try OSV if CVE is present (for future extension)
        if not target_nodes and cve:
            try:
                vuln_funcs = await get_vulnerable_functions(pkg, cve)
                for func in vuln_funcs:
                    node_name = f"{pkg}.{func}"
                    if node_name in graph.nodes():
                        target_nodes.append(node_name)
            except Exception as e:
                print(f"Failed to get OSV functions for {cve}: {e}")
                finding["reachability"] = "UNKNOWN"
                finding["reachability_reason"] = f"Failed to fetch vulnerability patch data: {e}"
                continue
                
        if not target_nodes:
             # Package might just be imported but not called, or called dynamically
             finding["reachability"] = "UNKNOWN"
             finding["reachability_reason"] = "Package imported but no direct static calls found. May use dynamic dispatch."
             continue

        # Check reachability from any entry point
        is_reachable = False
        shortest_path = None
        
        for entry in entry_points:
            for target in target_nodes:
                if nx.has_path(graph, entry, target):
                    is_reachable = True
                    path = nx.shortest_path(graph, entry, target)
                    if not shortest_path or len(path) < len(shortest_path):
                        shortest_path = path

        if is_reachable:
            finding["reachability"] = "REACHABLE"
            finding["call_chain"] = shortest_path
            finding["reachability_reason"] = "Found explicit call path from entry point."
        else:
            finding["reachability"] = "UNREACHABLE"
            finding["reachability_reason"] = "No static path found from known entry points."
            
    return findings
