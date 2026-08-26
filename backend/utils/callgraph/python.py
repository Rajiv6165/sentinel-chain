import os
import networkx as nx
import tree_sitter
import tree_sitter_python as tspy
from tree_sitter import Language, Parser
from .base import CallGraphBuilder

class PythonCallGraphBuilder(CallGraphBuilder):
    def __init__(self):
        self.parser = self._get_python_parser()

    def _get_python_parser(self):
        PY_LANGUAGE = Language(tspy.language())
        parser = Parser(PY_LANGUAGE)
        return parser

    def build(self, project_dir: str) -> tuple[nx.DiGraph, list[str]]:
        graph = nx.DiGraph()
        
        for root, _, files in os.walk(project_dir):
            if 'venv' in root or '.venv' in root or '__pycache__' in root or '/.' in root or '\\.' in root:
                continue
                
            for file in files:
                if file.endswith('.py'):
                    file_path = os.path.join(root, file)
                    self._process_file(file_path, graph, project_dir)
                    
        entry_points = [n for n, d in graph.nodes(data=True) if d.get('type') == 'entry_point']
        
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
        self._find_entry_points(tree.root_node, rel_path, graph, aliases)

    def _get_node_text(self, node) -> str:
        if not node:
            return ""
        if hasattr(node, 'text'):
            return node.text.decode('utf-8')
        return ""

    def _walk_and_find_calls(self, node, current_func, graph, file_path, aliases):
        if node.type == 'call':
            func_node = node.child_by_field_name('function')
            if func_node:
                callee_name = self._get_node_text(func_node)
                
                # Check for dynamic dispatches like getattr, import_module
                if callee_name in ['getattr', 'import_module', 'eval', 'exec']:
                    graph.nodes[current_func]['dynamic'] = True
                
                base_name = callee_name.split('.')[0]
                if base_name in aliases:
                    pkg_name = aliases[base_name]
                    # If alias is exact match (e.g. `requests.get`), we replace requests with pkg if different
                    # Actually, if we do `import requests as req`, alias maps `req` to `requests`.
                    resolved_callee = callee_name.replace(base_name, pkg_name, 1)
                    graph.add_edge(current_func, resolved_callee)
                else:
                    # Could be built-in or local
                    graph.add_edge(current_func, f"{file_path}:{callee_name}")
                    
        for child in node.children:
            self._walk_and_find_calls(child, current_func, graph, file_path, aliases)

    def _find_imports(self, node, aliases):
        if node.type == 'import_statement':
            # import requests
            # import requests as req
            for child in node.children:
                if child.type == 'dotted_name':
                    pkg_name = self._get_node_text(child)
                    aliases[pkg_name] = pkg_name
                elif child.type == 'aliased_import':
                    name = self._get_node_text(child.child_by_field_name('name'))
                    alias = self._get_node_text(child.child_by_field_name('alias'))
                    aliases[alias] = name
                    
        elif node.type == 'import_from_statement':
            # from requests import get
            module_name_node = node.child_by_field_name('module_name')
            if module_name_node:
                pkg_name = self._get_node_text(module_name_node)
                for child in node.children:
                    if child.type == 'dotted_name': # the imported items
                        func_name = self._get_node_text(child)
                        aliases[func_name] = f"{pkg_name}.{func_name}"
                    elif child.type == 'aliased_import':
                        name = self._get_node_text(child.child_by_field_name('name'))
                        alias = self._get_node_text(child.child_by_field_name('alias'))
                        aliases[alias] = f"{pkg_name}.{name}"

        for child in node.children:
            self._find_imports(child, aliases)

    def _find_functions_and_calls(self, node, file_path, graph, aliases, parent_class=None):
        if node.type == 'class_definition':
            name_node = node.child_by_field_name('name')
            if name_node:
                class_name = self._get_node_text(name_node)
                body = node.child_by_field_name('body')
                if body:
                    for child in body.children:
                        self._find_functions_and_calls(child, file_path, graph, aliases, parent_class=class_name)
                        
        elif node.type == 'function_definition':
            name_node = node.child_by_field_name('name')
            if name_node:
                func_name = self._get_node_text(name_node)
                if parent_class:
                    func_name = f"{parent_class}.{func_name}"
                
                node_id = f"{file_path}:{func_name}"
                graph.add_node(node_id, type='function')
                
                body = node.child_by_field_name('body')
                if body:
                    self._walk_and_find_calls(body, node_id, graph, file_path, aliases)
                    
        else:
            for child in node.children:
                self._find_functions_and_calls(child, file_path, graph, aliases, parent_class)

    def _find_entry_points(self, node, file_path, graph, aliases):
        if node.type == 'decorated_definition':
            decorators = []
            func_node = None
            
            for child in node.children:
                if child.type == 'decorator':
                    decorators.append(self._get_node_text(child))
                elif child.type == 'function_definition':
                    func_node = child
                    
            if func_node:
                is_entry = False
                for dec in decorators:
                    if any(x in dec for x in ['@app.route', '@app.get', '@app.post', '@router.', '@blueprint.']):
                        is_entry = True
                        break
                
                if is_entry:
                    name_node = func_node.child_by_field_name('name')
                    if name_node:
                        func_name = self._get_node_text(name_node)
                        node_id = f"{file_path}:{func_name}"
                        # Mark the function itself as an entry point
                        if node_id not in graph:
                            graph.add_node(node_id, type='function')
                        graph.nodes[node_id]['type'] = 'entry_point'

        elif node.type == 'if_statement':
            # Check for `if __name__ == "__main__":`
            condition = node.child_by_field_name('condition')
            if condition:
                cond_text = self._get_node_text(condition)
                if '__name__' in cond_text and '__main__' in cond_text:
                    body = node.child_by_field_name('consequence')
                    if body:
                        # Find all calls in this block and mark as entry point calls
                        entry_id = f"{file_path}:__main__"
                        graph.add_node(entry_id, type='entry_point')
                        self._walk_and_find_calls(body, entry_id, graph, file_path, aliases)

        for child in node.children:
            self._find_entry_points(child, file_path, graph, aliases)
