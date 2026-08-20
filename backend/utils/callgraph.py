import os
import networkx as nx
import tree_sitter
import tree_sitter_javascript as tsjs
from tree_sitter import Language, Parser

def get_js_parser():
    JS_LANGUAGE = Language(tsjs.language())
    parser = Parser(JS_LANGUAGE)
    return parser

def walk_and_find_calls(node, current_func, graph, file_path, aliases):
    """
    Recursively walks AST to find call expressions inside a function.
    """
    if node.type == 'call_expression':
        # Get the function being called
        func_node = node.child_by_field_name('function')
        if func_node:
            callee_name = _get_node_text(func_node)
            
            # Resolve against imports/aliases
            base_name = callee_name.split('.')[0]
            if base_name in aliases:
                pkg_name = aliases[base_name]
                # Replace the alias with package name for the graph
                # e.g., axios.get -> axios.get
                resolved_callee = callee_name.replace(base_name, pkg_name, 1)
                graph.add_edge(current_func, resolved_callee)
            else:
                # Local function call
                graph.add_edge(current_func, f"{file_path}:{callee_name}")
                
    for child in node.children:
        walk_and_find_calls(child, current_func, graph, file_path, aliases)

def _get_node_text(node) -> str:
    if not node:
        return ""
    if hasattr(node, 'text'):
        return node.text.decode('utf-8')
    return ""

def process_file(file_path: str, graph: nx.DiGraph, parser: Parser, base_dir: str):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
    except Exception as e:
        print(f"Failed to read {file_path}: {e}")
        return

    tree = parser.parse(bytes(code, 'utf-8'))
    rel_path = os.path.relpath(file_path, base_dir)
    
    aliases = {} # alias_name -> package_name
    
    # 1. First pass: find imports and requires to populate aliases
    _find_imports(tree.root_node, aliases)
    
    # 2. Second pass: find function definitions and their calls
    _find_functions_and_calls(tree.root_node, rel_path, graph, aliases)
    
    # 3. Third pass: find Express/router entry points like app.get(...)
    _find_route_handlers(tree.root_node, rel_path, graph, aliases)

def _find_imports(node, aliases):
    if node.type == 'variable_declarator':
        # const axios = require('axios')
        name_node = node.child_by_field_name('name')
        value_node = node.child_by_field_name('value')
        if name_node and value_node and value_node.type == 'call_expression':
            func = value_node.child_by_field_name('function')
            if _get_node_text(func) == 'require':
                args = value_node.child_by_field_name('arguments')
                if args and len(args.children) > 1:
                    arg_str = args.children[1] # string
                    if arg_str.type == 'string':
                        pkg_name = _get_node_text(arg_str).strip("'\"")
                        aliases[_get_node_text(name_node)] = pkg_name

    elif node.type == 'import_statement':
        # import { dangerousFunc } from 'bad-pkg'
        source = node.child_by_field_name('source')
        if source:
            pkg_name = _get_node_text(source).strip("'\"")
            # This is simplified; ideally we parse import clauses specifically
            # to map { x as y } correctly
            import_clause = node.child_by_field_name('import_clause')
            if import_clause:
                # Find all identifiers inside import clause
                # A robust implementation would use a query
                for child in import_clause.children:
                    if child.type == 'identifier':
                        aliases[_get_node_text(child)] = pkg_name
                    elif child.type == 'named_imports':
                        for specifier in child.children:
                            if specifier.type == 'import_specifier':
                                name = _get_node_text(specifier.child_by_field_name('name'))
                                alias = _get_node_text(specifier.child_by_field_name('alias'))
                                if alias:
                                    aliases[alias] = pkg_name
                                elif name:
                                    aliases[name] = pkg_name

    for child in node.children:
        _find_imports(child, aliases)

def _find_functions_and_calls(node, file_path, graph, aliases):
    if node.type in ['function_declaration', 'arrow_function', 'method_definition']:
        name_node = node.child_by_field_name('name')
        if name_node:
            func_name = _get_node_text(name_node)
            node_id = f"{file_path}:{func_name}"
            graph.add_node(node_id, type='function')
            
            # Walk inside body
            body = node.child_by_field_name('body')
            if body:
                walk_and_find_calls(body, node_id, graph, file_path, aliases)
                
    for child in node.children:
        _find_functions_and_calls(child, file_path, graph, aliases)

def _find_route_handlers(node, file_path, graph, aliases):
    # Detect app.get('/route', (req, res) => { ... })
    if node.type == 'call_expression':
        func_node = node.child_by_field_name('function')
        if func_node and func_node.type == 'member_expression':
            obj_name = _get_node_text(func_node.child_by_field_name('object'))
            prop_name = _get_node_text(func_node.child_by_field_name('property'))
            
            if prop_name in ['get', 'post', 'put', 'delete', 'patch'] and obj_name in ['app', 'router']:
                # This is a route handler
                args = node.child_by_field_name('arguments')
                if args:
                    # Second argument is usually the callback
                    for arg in args.children:
                        if arg.type in ['arrow_function', 'function_expression', 'identifier']:
                            entry_id = f"{file_path}:route_{prop_name}"
                            graph.add_node(entry_id, type='entry_point')
                            if arg.type == 'identifier':
                                graph.add_edge(entry_id, f"{file_path}:{_get_node_text(arg)}")
                            else:
                                walk_and_find_calls(arg, entry_id, graph, file_path, aliases)

    for child in node.children:
        _find_route_handlers(child, file_path, graph, aliases)


def build_call_graph(project_dir: str) -> tuple[nx.DiGraph, list[str]]:
    """
    Builds a call graph for a given project directory.
    Returns the graph and a list of entry point node IDs.
    """
    graph = nx.DiGraph()
    parser = get_js_parser()
    
    for root, _, files in os.walk(project_dir):
        # Skip node_modules and hidden folders
        if 'node_modules' in root or '/.' in root or '\\.' in root:
            continue
            
        for file in files:
            if file.endswith('.js') or file.endswith('.ts') or file.endswith('.jsx') or file.endswith('.tsx'):
                file_path = os.path.join(root, file)
                process_file(file_path, graph, parser, project_dir)
                
    entry_points = [n for n, d in graph.nodes(data=True) if d.get('type') == 'entry_point']
    
    # Also treat exported functions as entry points (simplified: any function in index.js, or top level functions)
    for n in graph.nodes():
        if n.startswith('index.js:') or n.startswith('main.js:'):
            if n not in entry_points:
                entry_points.append(n)
                
    return graph, entry_points
