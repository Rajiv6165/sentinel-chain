import networkx as nx
import os
from .callgraph.javascript import JavascriptCallGraphBuilder
from .callgraph.python import PythonCallGraphBuilder
from .vulnerability import get_vulnerable_functions


def detect_languages(project_dir: str) -> list[str]:
    langs = set()
    for root, _, files in os.walk(project_dir):
        if 'package.json' in files:
            langs.add('javascript')
        if 'requirements.txt' in files or 'pyproject.toml' in files or 'setup.py' in files:
            langs.add('python')
    return list(langs)


def _compute_reachable_context(
    graph: nx.DiGraph,
    entry_points: list[str],
    file_imports: dict[str, set[str]],
) -> tuple[set[str], set[str]]:
    """Returns (reachable_nodes, reachable_files) starting from all entry_points."""
    reachable_nodes: set[str] = set()
    for entry in entry_points:
        if entry in graph:
            reachable_nodes.add(entry)
            reachable_nodes.update(nx.descendants(graph, entry))

    reachable_files: set[str] = set()
    for node in reachable_nodes:
        file_attr = graph.nodes[node].get('file')
        if file_attr:
            reachable_files.add(file_attr)
        elif ':' in node:
            reachable_files.add(node.split(':', 1)[0])

    # Expand reachable files transitively through local module imports
    queue = list(reachable_files)
    while queue:
        current_file = queue.pop()
        for imported_file in file_imports.get(current_file, set()):
            if imported_file not in reachable_files:
                reachable_files.add(imported_file)
                queue.append(imported_file)

    return reachable_nodes, reachable_files


async def analyze_reachability(project_dir: str, findings: list[dict]) -> list[dict]:
    """
    Given a project directory and a list of Phase 1 findings,
    adds reachability context to each finding.
    """
    langs = detect_languages(project_dir)
    if not langs:
        # Default to JS if no manifest found, for backward compatibility with simple toy projects
        langs = ['javascript']

    graph = nx.DiGraph()
    entry_points: list[str] = []
    dynamic_constructs: list[dict] = []
    unresolved_imports: list[dict] = []
    file_imports: dict[str, set[str]] = {}

    try:
        if 'javascript' in langs:
            builder = JavascriptCallGraphBuilder()
            g, e = builder.build(project_dir)
            graph = nx.compose(graph, g)
            entry_points.extend(e)
            dynamic_constructs.extend(g.graph.get('dynamic_constructs', []))
            unresolved_imports.extend(g.graph.get('unresolved_imports', []))
            for k, v in g.graph.get('file_imports', {}).items():
                file_imports.setdefault(k, set()).update(v)

        if 'python' in langs:
            builder = PythonCallGraphBuilder()
            g, e = builder.build(project_dir)
            graph = nx.compose(graph, g)
            entry_points.extend(e)
            dynamic_constructs.extend(g.graph.get('dynamic_constructs', []))
            unresolved_imports.extend(g.graph.get('unresolved_imports', []))
            for k, v in g.graph.get('file_imports', {}).items():
                file_imports.setdefault(k, set()).update(v)

    except Exception as e:
        print(f"Failed to build call graph: {e}")
        for finding in findings:
            finding["reachability"] = "UNKNOWN"
            finding["reachability_reason"] = "Failed to parse AST / build call graph"
        return findings

    reachable_nodes, reachable_files = _compute_reachable_context(graph, entry_points, file_imports)

    # Identify dynamic constructs & unresolved imports reachable from entry points
    reachable_dynamics = [
        dc for dc in dynamic_constructs
        if dc.get('func') in reachable_nodes or dc.get('file') in reachable_files
    ]
    reachable_unresolved = [
        ui for ui in unresolved_imports
        if ui.get('file') in reachable_files
    ]

    # Enhance findings
    for finding in findings:
        pkg = finding.get("package_name")
        cve = finding.get("cve_id")

        target_nodes = []
        for node in graph.nodes():
            if node.startswith(f"{pkg}.") or node == pkg:
                target_nodes.append(node)

        # If no target nodes found by package name, try advisory cache / OSV if CVE is present
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
                if entry in graph and target in graph and nx.has_path(graph, entry, target):
                    is_reachable = True
                    path = nx.shortest_path(graph, entry, target)
                    if not shortest_path or len(path) < len(shortest_path):
                        shortest_path = path

        if is_reachable:
            finding["reachability"] = "REACHABLE"
            finding["call_chain"] = shortest_path
            finding["reachability_reason"] = "Found explicit call path from entry point."
        else:
            # Safety policy (Phase 12): refuse to downgrade to UNREACHABLE if unresolved dynamic
            # constructs, unresolved imports, or missing entry points could reach the package.
            if not entry_points:
                finding["reachability"] = "UNKNOWN"
                finding["reachability_reason"] = (
                    "Package has static call sites, but no application entry points were identified; "
                    "cannot prove unreachability."
                )
            elif reachable_dynamics:
                constructs = ", ".join(sorted({d['construct'] for d in reachable_dynamics}))
                finding["reachability"] = "UNKNOWN"
                finding["reachability_reason"] = (
                    f"No static path found, but reachable code contains unresolved dynamic constructs "
                    f"({constructs}) that could invoke {pkg}."
                )
            elif reachable_unresolved:
                targets = ", ".join(sorted({u['target'] for u in reachable_unresolved}))
                finding["reachability"] = "UNKNOWN"
                finding["reachability_reason"] = (
                    f"No static path found, but reachable modules contain unresolved imports "
                    f"({targets}) that could reach {pkg}."
                )
            else:
                finding["reachability"] = "UNREACHABLE"
                finding["reachability_reason"] = "No static path found from known entry points."

    return findings
