import os
import networkx as nx
import tree_sitter
import tree_sitter_python as tspy
from tree_sitter import Language, Parser
from .base import CallGraphBuilder

LIFECYCLE_DECORATOR_MARKERS = (
    '@app.route', '@app.get', '@app.post', '@app.put', '@app.delete', '@app.patch', '@app.websocket',
    '@router.', '@blueprint.', '@bp.',
    '@app.on_event', '@router.on_event',
    '@app.middleware', '@app.exception_handler', '@app.errorhandler', '@app.context_processor',
    '@app.before_first_request', '@app.before_request', '@app.after_request',
    '@app.teardown_request', '@app.teardown_appcontext',
    '@blueprint.before_', '@blueprint.after_', '@blueprint.teardown_',
    '@bp.before_', '@bp.after_', '@bp.teardown_',
    '@receiver', '.connect',
    '@app.task', '@shared_task', '@celery.task',
)

LIFECYCLE_CALL_METHODS = (
    'add_event_handler',
    'before_first_request',
    'before_request',
    'after_request',
    'teardown_request',
    'teardown_appcontext',
    'add_url_rule',
    'register_error_handler',
    'add_middleware',
    'connect',
    'register',
)

LIFECYCLE_CONSTRUCTORS = ('FastAPI', 'Starlette', 'Flask', 'APIRouter')
LIFECYCLE_KWARGS = ('lifespan', 'on_startup', 'on_shutdown', 'view_func', 'middleware')

LIFECYCLE_VAR_KEYWORDS = (
    'startup', 'shutdown', 'lifespan', 'hook', 'handler',
    'signal', 'middleware', 'callback', 'listener', 'on_event',
    'before_request', 'after_request', 'before_first_request',
)

DYNAMIC_CALLEES = (
    'getattr', 'import_module', 'importlib.import_module',
    '__import__', 'eval', 'exec',
)


class PythonCallGraphBuilder(CallGraphBuilder):
    def __init__(self):
        self.parser = self._get_python_parser()

    def _get_python_parser(self):
        PY_LANGUAGE = Language(tspy.language())
        parser = Parser(PY_LANGUAGE)
        return parser

    def build(self, project_dir: str) -> tuple[nx.DiGraph, list[str]]:
        graph = nx.DiGraph()
        graph.graph['dynamic_constructs'] = []
        graph.graph['unresolved_imports'] = []
        graph.graph['file_imports'] = {}

        py_files: list[tuple[str, str]] = []
        project_modules: dict[str, str] = {}

        for root, _, files in os.walk(project_dir):
            if 'venv' in root or '.venv' in root or '__pycache__' in root or '/.' in root or '\\.' in root:
                continue

            for file in files:
                if file.endswith('.py'):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, project_dir).replace('\\', '/')
                    py_files.append((file_path, rel_path))
                    self._register_module(rel_path, project_modules)

        file_local_imports: dict[str, dict] = {}
        file_wildcards: dict[str, list[str]] = {}
        file_defined_funcs: dict[str, set[str]] = {}

        for file_path, rel_path in py_files:
            local_imports, wildcards, defined_funcs = self._process_file(
                file_path, rel_path, graph, project_modules
            )
            file_local_imports[rel_path] = local_imports
            file_wildcards[rel_path] = wildcards
            file_defined_funcs[rel_path] = defined_funcs

        # Pass 2: Resolve re-exports and wildcard imports across modules
        self._resolve_cross_module_links(graph, file_local_imports, file_wildcards, file_defined_funcs)

        entry_points = [n for n, d in graph.nodes(data=True) if d.get('type') == 'entry_point']
        return graph, entry_points

    def _register_module(self, rel_path: str, project_modules: dict[str, str]):
        no_ext = rel_path[:-3] if rel_path.endswith('.py') else rel_path
        parts = no_ext.split('/')
        if parts[-1] == '__init__':
            if len(parts) > 1:
                mod_name = '.'.join(parts[:-1])
                project_modules[mod_name] = rel_path
        else:
            mod_name = '.'.join(parts)
            project_modules[mod_name] = rel_path

    def _resolve_relative_module(self, current_rel: str, dot_count: int, mod_suffix: str, project_modules: dict[str, str]) -> str | None:
        current_parts = current_rel.replace('\\', '/').split('/')
        # Directory package parts of the current file
        pkg_parts = current_parts[:-1]
        # dot_count == 1 means current package; dot_count == 2 means parent package, etc.
        up = dot_count - 1
        if up > len(pkg_parts):
            return None
        base_parts = pkg_parts[:len(pkg_parts) - up] if up > 0 else list(pkg_parts)
        if mod_suffix:
            target_parts = base_parts + mod_suffix.split('.')
        else:
            target_parts = base_parts
        candidate = '.'.join(p for p in target_parts if p)
        return project_modules.get(candidate)

    def _process_file(
        self,
        file_path: str,
        rel_path: str,
        graph: nx.DiGraph,
        project_modules: dict[str, str],
    ) -> tuple[dict, list[str], set[str]]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()
        except Exception as e:
            print(f"Failed to read {file_path}: {e}")
            return {}, [], set()

        tree = self.parser.parse(bytes(code, 'utf-8'))

        aliases: dict[str, str] = {}
        local_imports: dict[str, tuple] = {}
        wildcards: list[str] = []
        defined_funcs: set[str] = set()
        graph.graph['file_imports'].setdefault(rel_path, set())

        self._find_imports(
            tree.root_node, rel_path, project_modules,
            aliases, local_imports, wildcards, graph
        )
        self._find_functions_and_calls(
            tree.root_node, rel_path, graph, aliases, local_imports, defined_funcs
        )
        self._find_entry_points(
            tree.root_node, rel_path, graph, aliases, local_imports, defined_funcs
        )
        self._find_module_level_constructs(
            tree.root_node, rel_path, graph, aliases, local_imports, defined_funcs
        )

        return local_imports, wildcards, defined_funcs

    def _get_node_text(self, node) -> str:
        if not node:
            return ""
        if hasattr(node, 'text'):
            return node.text.decode('utf-8')
        return ""

    def _resolve_callee(self, callee_name: str, file_path: str, aliases: dict, local_imports: dict) -> str:
        # 1. Exact or prefix match in local_imports
        if callee_name in local_imports:
            entry = local_imports[callee_name]
            if entry[0] == 'symbol':
                return f"{entry[1]}:{entry[2]}"
            elif entry[0] == 'module':
                return entry[1]

        parts = callee_name.split('.')
        # Try longest module prefix first (e.g. pkg.sub.fn -> pkg/sub.py:fn)
        for i in range(len(parts) - 1, 0, -1):
            prefix = '.'.join(parts[:i])
            rest = '.'.join(parts[i:])
            if prefix in local_imports:
                entry = local_imports[prefix]
                if entry[0] == 'module':
                    return f"{entry[1]}:{rest}"
                elif entry[0] == 'symbol':
                    return f"{entry[1]}:{entry[2]}.{rest}"

        # 2. External package alias
        base_name = parts[0]
        if base_name in aliases:
            pkg_name = aliases[base_name]
            return callee_name.replace(base_name, pkg_name, 1)

        # 3. Local call in same file
        return f"{file_path}:{callee_name}"

    def _walk_and_find_calls(self, node, current_func, graph, file_path, aliases, local_imports):
        if node.type == 'call':
            func_node = node.child_by_field_name('function')
            if func_node:
                callee_name = self._get_node_text(func_node)

                # Check for dynamic dispatches like getattr, import_module, eval, exec, __import__
                if callee_name in DYNAMIC_CALLEES or any(callee_name.endswith(f".{d}") for d in ('import_module',)):
                    if current_func in graph.nodes:
                        graph.nodes[current_func]['dynamic'] = True
                    graph.graph['dynamic_constructs'].append({
                        'file': file_path,
                        'func': current_func,
                        'construct': callee_name,
                    })

                resolved = self._resolve_callee(callee_name, file_path, aliases, local_imports)
                graph.add_edge(current_func, resolved)

        for child in node.children:
            self._walk_and_find_calls(child, current_func, graph, file_path, aliases, local_imports)

    def _find_imports(self, node, rel_path, project_modules, aliases, local_imports, wildcards, graph):
        if node.type == 'import_statement':
            # import service
            # import service as svc
            # import pkg.sub
            for child in node.children:
                if child.type == 'dotted_name':
                    mod_name = self._get_node_text(child)
                    if mod_name in project_modules:
                        target_file = project_modules[mod_name]
                        local_imports[mod_name] = ('module', target_file)
                        graph.graph['file_imports'][rel_path].add(target_file)
                    else:
                        aliases[mod_name] = mod_name
                elif child.type == 'aliased_import':
                    mod_name = self._get_node_text(child.child_by_field_name('name'))
                    alias = self._get_node_text(child.child_by_field_name('alias'))
                    if mod_name in project_modules:
                        target_file = project_modules[mod_name]
                        local_imports[alias] = ('module', target_file)
                        graph.graph['file_imports'][rel_path].add(target_file)
                    else:
                        aliases[alias] = mod_name

        elif node.type == 'import_from_statement':
            module_name_node = node.child_by_field_name('module_name')
            if module_name_node:
                is_relative = (module_name_node.type == 'relative_import')
                target_file = None
                mod_name = ""

                if is_relative:
                    dot_count = 0
                    suffix = ""
                    for sub in module_name_node.children:
                        if sub.type == 'import_prefix':
                            dot_count = self._get_node_text(sub).count('.')
                        elif sub.type == 'dotted_name':
                            suffix = self._get_node_text(sub)
                    mod_name = ('.' * dot_count) + suffix
                    target_file = self._resolve_relative_module(rel_path, dot_count, suffix, project_modules)
                else:
                    mod_name = self._get_node_text(module_name_node)
                    target_file = project_modules.get(mod_name)

                # Collect imported items strictly after the 'import' keyword
                seen_import_kw = False
                for child in node.children:
                    if child.type == 'import':
                        seen_import_kw = True
                        continue
                    if not seen_import_kw:
                        continue

                    if child.type == 'wildcard_import':
                        if target_file:
                            wildcards.append(target_file)
                            graph.graph['file_imports'][rel_path].add(target_file)
                        elif is_relative:
                            graph.graph['unresolved_imports'].append({
                                'file': rel_path,
                                'target': f"{mod_name}.*",
                                'reason': 'Unresolved relative wildcard import',
                            })
                        continue

                    if child.type == 'dotted_name':
                        sym_name = self._get_node_text(child)
                        alias_name = sym_name
                    elif child.type == 'aliased_import':
                        sym_name = self._get_node_text(child.child_by_field_name('name'))
                        alias_name = self._get_node_text(child.child_by_field_name('alias'))
                    else:
                        continue

                    # Check if `from pkg import submod` refers to a submodule file
                    submod_file = None
                    if is_relative and not target_file:
                        # e.g. `from . import service`
                        dot_count = 0
                        suffix = ""
                        for sub in module_name_node.children:
                            if sub.type == 'import_prefix':
                                dot_count = self._get_node_text(sub).count('.')
                            elif sub.type == 'dotted_name':
                                suffix = self._get_node_text(sub)
                        combined = f"{suffix}.{sym_name}" if suffix else sym_name
                        submod_file = self._resolve_relative_module(rel_path, dot_count, combined, project_modules)
                    elif not is_relative:
                        submod_file = project_modules.get(f"{mod_name}.{sym_name}")

                    if submod_file:
                        local_imports[alias_name] = ('module', submod_file)
                        graph.graph['file_imports'][rel_path].add(submod_file)
                    elif target_file:
                        local_imports[alias_name] = ('symbol', target_file, sym_name)
                        graph.graph['file_imports'][rel_path].add(target_file)
                    elif is_relative:
                        graph.graph['unresolved_imports'].append({
                            'file': rel_path,
                            'target': f"{mod_name}.{sym_name}",
                            'reason': 'Unresolved relative import',
                        })
                    else:
                        aliases[alias_name] = f"{mod_name}.{sym_name}"

        for child in node.children:
            self._find_imports(child, rel_path, project_modules, aliases, local_imports, wildcards, graph)

    def _find_functions_and_calls(self, node, file_path, graph, aliases, local_imports, defined_funcs, parent_class=None):
        if node.type == 'class_definition':
            name_node = node.child_by_field_name('name')
            if name_node:
                class_name = self._get_node_text(name_node)
                body = node.child_by_field_name('body')
                if body:
                    for child in body.children:
                        self._find_functions_and_calls(
                            child, file_path, graph, aliases, local_imports, defined_funcs, parent_class=class_name
                        )

        elif node.type == 'function_definition':
            name_node = node.child_by_field_name('name')
            if name_node:
                func_name = self._get_node_text(name_node)
                if parent_class:
                    func_name = f"{parent_class}.{func_name}"

                defined_funcs.add(func_name)
                node_id = f"{file_path}:{func_name}"
                graph.add_node(node_id, type='function', file=file_path)

                body = node.child_by_field_name('body')
                if body:
                    self._walk_and_find_calls(body, node_id, graph, file_path, aliases, local_imports)

        else:
            for child in node.children:
                self._find_functions_and_calls(
                    child, file_path, graph, aliases, local_imports, defined_funcs, parent_class
                )

    def _find_entry_points(self, node, file_path, graph, aliases, local_imports, defined_funcs):
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
                    if any(marker in dec for marker in LIFECYCLE_DECORATOR_MARKERS):
                        is_entry = True
                        break

                if is_entry:
                    name_node = func_node.child_by_field_name('name')
                    if name_node:
                        func_name = self._get_node_text(name_node)
                        node_id = f"{file_path}:{func_name}"
                        if node_id not in graph:
                            graph.add_node(node_id, type='function', file=file_path)
                        graph.nodes[node_id]['type'] = 'entry_point'

        elif node.type == 'if_statement':
            condition = node.child_by_field_name('condition')
            if condition:
                cond_text = self._get_node_text(condition)
                if '__name__' in cond_text and '__main__' in cond_text:
                    body = node.child_by_field_name('consequence')
                    if body:
                        entry_id = f"{file_path}:__main__"
                        graph.add_node(entry_id, type='entry_point', file=file_path)
                        self._walk_and_find_calls(body, entry_id, graph, file_path, aliases, local_imports)

        for child in node.children:
            self._find_entry_points(child, file_path, graph, aliases, local_imports, defined_funcs)

    def _extract_identifiers(self, node) -> list[str]:
        ids = []
        if node.type in ('identifier', 'attribute'):
            ids.append(self._get_node_text(node))
            return ids
        for child in node.children:
            ids.extend(self._extract_identifiers(child))
        return ids

    def _link_lifecycle_handler(self, ident: str, file_path: str, graph: nx.DiGraph, local_imports: dict, defined_funcs: set[str]):
        target_node = None
        if ident in defined_funcs:
            target_node = f"{file_path}:{ident}"
        elif ident in local_imports:
            entry = local_imports[ident]
            if entry[0] == 'symbol':
                target_node = f"{entry[1]}:{entry[2]}"
        elif '.' in ident:
            parts = ident.split('.')
            if parts[0] in local_imports and local_imports[parts[0]][0] == 'module':
                target_node = f"{local_imports[parts[0]][1]}:{'.'.join(parts[1:])}"

        if target_node:
            entry_id = f"{file_path}:lifecycle_hook"
            graph.add_node(entry_id, type='entry_point', file=file_path)
            graph.add_edge(entry_id, target_node)

    def _find_module_level_constructs(self, root_node, file_path, graph, aliases, local_imports, defined_funcs):
        """
        Inspects module-level statements for:
        - FastAPI(lifespan=fn, on_startup=[...]) / Starlette(...) lifecycle registrations
        - app.add_event_handler / signal.connect / atexit.register / before_first_request(fn)
        - Module-level hook/startup registry lists (e.g. app_startup_hooks = [on_startup])
        - Top-level dynamic calls (eval/exec/import_module)
        """
        for child in root_node.children:
            if child.type != 'expression_statement':
                continue
            for expr in child.children:
                if expr.type == 'assignment':
                    left = expr.child_by_field_name('left')
                    right = expr.child_by_field_name('right')
                    lhs_name = self._get_node_text(left).lower() if left else ""

                    # Case 1: app = FastAPI(lifespan=fn, on_startup=[...])
                    if right and right.type == 'call':
                        self._inspect_lifecycle_call(right, file_path, graph, aliases, local_imports, defined_funcs)

                    # Case 2: app_startup_hooks = [on_application_startup]
                    if right and any(kw in lhs_name for kw in LIFECYCLE_VAR_KEYWORDS):
                        for ident in self._extract_identifiers(right):
                            self._link_lifecycle_handler(ident, file_path, graph, local_imports, defined_funcs)

                elif expr.type == 'call':
                    self._inspect_lifecycle_call(expr, file_path, graph, aliases, local_imports, defined_funcs)

    def _inspect_lifecycle_call(self, call_node, file_path, graph, aliases, local_imports, defined_funcs):
        func_node = call_node.child_by_field_name('function')
        args_node = call_node.child_by_field_name('arguments')
        if not func_node:
            return

        callee = self._get_node_text(func_node)

        # Check top-level dynamic call
        if callee in DYNAMIC_CALLEES or callee.endswith('.import_module'):
            graph.graph['dynamic_constructs'].append({
                'file': file_path,
                'func': f"{file_path}:<module>",
                'construct': callee,
            })

        if not args_node:
            return

        # FastAPI(lifespan=..., on_startup=[...]) / Starlette(...)
        callee_base = callee.split('.')[-1]
        if callee_base in LIFECYCLE_CONSTRUCTORS:
            for arg in args_node.children:
                if arg.type == 'keyword_argument':
                    kw_name = self._get_node_text(arg.child_by_field_name('name'))
                    kw_val = arg.child_by_field_name('value')
                    if kw_name in LIFECYCLE_KWARGS and kw_val:
                        for ident in self._extract_identifiers(kw_val):
                            self._link_lifecycle_handler(ident, file_path, graph, local_imports, defined_funcs)

        # app.add_event_handler("startup", fn) / signal.connect(fn) / atexit.register(fn)
        if callee_base in LIFECYCLE_CALL_METHODS:
            for arg in args_node.children:
                if arg.type in ('identifier', 'attribute', 'list', 'tuple'):
                    for ident in self._extract_identifiers(arg):
                        self._link_lifecycle_handler(ident, file_path, graph, local_imports, defined_funcs)
                elif arg.type == 'keyword_argument':
                    kw_val = arg.child_by_field_name('value')
                    if kw_val:
                        for ident in self._extract_identifiers(kw_val):
                            self._link_lifecycle_handler(ident, file_path, graph, local_imports, defined_funcs)

    def _resolve_cross_module_links(
        self,
        graph: nx.DiGraph,
        file_local_imports: dict[str, dict],
        file_wildcards: dict[str, list[str]],
        file_defined_funcs: dict[str, set[str]],
    ):
        # 1. Re-export chains: if B imports `foo` from C, link B:foo -> C:foo
        for rel_path, local_imports in file_local_imports.items():
            for alias_name, entry in local_imports.items():
                if entry[0] == 'symbol':
                    target_file, target_sym = entry[1], entry[2]
                    src_node = f"{rel_path}:{alias_name}"
                    dst_node = f"{target_file}:{target_sym}"
                    if src_node in graph and src_node != dst_node and alias_name not in file_defined_funcs.get(rel_path, set()):
                        graph.add_edge(src_node, dst_node)

        # 2. Wildcard imports: if A has `from B import *` and calls A:fn (not defined in A) while B:fn exists
        for rel_path, wildcard_targets in file_wildcards.items():
            defined_here = file_defined_funcs.get(rel_path, set())
            prefix = f"{rel_path}:"
            for node in list(graph.nodes()):
                if node.startswith(prefix):
                    sym = node[len(prefix):]
                    if sym not in defined_here and not sym.startswith('__'):
                        for target_file in wildcard_targets:
                            candidate = f"{target_file}:{sym}"
                            if sym in file_defined_funcs.get(target_file, set()) or candidate in graph:
                                graph.add_edge(node, candidate)
