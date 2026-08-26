import os
import networkx as nx
import tree_sitter
import tree_sitter_javascript as tsjs
from tree_sitter import Language, Parser
from .base import CallGraphBuilder

class JavascriptCallGraphBuilder(CallGraphBuilder):
    def __init__(self):
        self.parser = self._get_js_parser()

    def _get_js_parser(self):
        JS_LANGUAGE = Language(tsjs.language())
        parser = Parser(JS_LANGUAGE)
        return parser

    def build(self, project_dir: str) -> tuple[nx.DiGraph, list[str]]:
        graph = nx.DiGraph()
        
        for root, _, files in os.walk(project_dir):
            if 'node_modules' in root or '/.' in root or '\\.' in root:
                continue
                
            for file in files:
                if file.endswith('.js') or file.endswith('.ts') or file.endswith('.jsx') or file.endswith('.tsx'):
                    file_path = os.path.join(root, file)
                    self._process_file(file_path, graph, project_dir)
                    
        entry_points = [n for n, d in graph.nodes(data=True) if d.get('type') == 'entry_point']
        
        for n in graph.nodes():
            if n.startswith('index.js:') or n.startswith('main.js:'):
                if n not in entry_points:
                    entry_points.append(n)
                    
        return graph, entry_points

    def _process_file(self, file_path: str, graph: nx.DiGraph, base_dir: str):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()
        except Exception as e:
            print(f"Failed to read {file_path}: {e}")
            return

        tree = self.parser.parse(bytes(code, 'utf-8'))
        rel_path = os.path.relpath(file_path, base_dir)
        
        aliases = {}
        
        self._find_imports(tree.root_node, aliases)
        self._find_functions_and_calls(tree.root_node, rel_path, graph, aliases)
        self._find_route_handlers(tree.root_node, rel_path, graph, aliases)

    def _get_node_text(self, node) -> str:
        if not node:
            return ""
        if hasattr(node, 'text'):
            return node.text.decode('utf-8')
        return ""

    def _walk_and_find_calls(self, node, current_func, graph, file_path, aliases):
        if node.type == 'call_expression':
            func_node = node.child_by_field_name('function')
            if func_node:
                callee_name = self._get_node_text(func_node)
                
                base_name = callee_name.split('.')[0]
                if base_name in aliases:
                    pkg_name = aliases[base_name]
                    resolved_callee = callee_name.replace(base_name, pkg_name, 1)
                    graph.add_edge(current_func, resolved_callee)
                else:
                    graph.add_edge(current_func, f"{file_path}:{callee_name}")
                    
        for child in node.children:
            self._walk_and_find_calls(child, current_func, graph, file_path, aliases)

    def _find_imports(self, node, aliases):
        if node.type == 'variable_declarator':
            name_node = node.child_by_field_name('name')
            value_node = node.child_by_field_name('value')
            if name_node and value_node and value_node.type == 'call_expression':
                func = value_node.child_by_field_name('function')
                if self._get_node_text(func) == 'require':
                    args = value_node.child_by_field_name('arguments')
                    if args and len(args.children) > 1:
                        arg_str = args.children[1]
                        if arg_str.type == 'string':
                            pkg_name = self._get_node_text(arg_str).strip("'\"")
                            aliases[self._get_node_text(name_node)] = pkg_name

        elif node.type == 'import_statement':
            source = node.child_by_field_name('source')
            if source:
                pkg_name = self._get_node_text(source).strip("'\"")
                import_clause = node.child_by_field_name('import_clause')
                if import_clause:
                    for child in import_clause.children:
                        if child.type == 'identifier':
                            aliases[self._get_node_text(child)] = pkg_name
                        elif child.type == 'named_imports':
                            for specifier in child.children:
                                if specifier.type == 'import_specifier':
                                    name = self._get_node_text(specifier.child_by_field_name('name'))
                                    alias = self._get_node_text(specifier.child_by_field_name('alias'))
                                    if alias:
                                        aliases[alias] = pkg_name
                                    elif name:
                                        aliases[name] = pkg_name

        for child in node.children:
            self._find_imports(child, aliases)

    def _find_functions_and_calls(self, node, file_path, graph, aliases):
        if node.type in ['function_declaration', 'arrow_function', 'method_definition']:
            name_node = node.child_by_field_name('name')
            if name_node:
                func_name = self._get_node_text(name_node)
                node_id = f"{file_path}:{func_name}"
                graph.add_node(node_id, type='function')
                
                body = node.child_by_field_name('body')
                if body:
                    self._walk_and_find_calls(body, node_id, graph, file_path, aliases)
                    
        for child in node.children:
            self._find_functions_and_calls(child, file_path, graph, aliases)

    def _find_route_handlers(self, node, file_path, graph, aliases):
        if node.type == 'call_expression':
            func_node = node.child_by_field_name('function')
            if func_node and func_node.type == 'member_expression':
                obj_name = self._get_node_text(func_node.child_by_field_name('object'))
                prop_name = self._get_node_text(func_node.child_by_field_name('property'))
                
                if prop_name in ['get', 'post', 'put', 'delete', 'patch'] and obj_name in ['app', 'router']:
                    args = node.child_by_field_name('arguments')
                    if args:
                        for arg in args.children:
                            if arg.type in ['arrow_function', 'function_expression', 'identifier']:
                                entry_id = f"{file_path}:route_{prop_name}"
                                graph.add_node(entry_id, type='entry_point')
                                if arg.type == 'identifier':
                                    graph.add_edge(entry_id, f"{file_path}:{self._get_node_text(arg)}")
                                else:
                                    self._walk_and_find_calls(arg, entry_id, graph, file_path, aliases)

        for child in node.children:
            self._find_route_handlers(child, file_path, graph, aliases)
