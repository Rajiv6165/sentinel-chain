import os
import networkx as nx
import tree_sitter
import tree_sitter_javascript as tsjs
from tree_sitter import Language, Parser
from .base import CallGraphBuilder

JS_EXTENSIONS = ('.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs')
RESOLVE_SUFFIXES = (
    '', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '/index.js', '/index.ts', '/index.jsx', '/index.tsx',
)
ROUTE_METHODS = ('get', 'post', 'put', 'delete', 'patch', 'all', 'use')
ROUTE_OBJECTS = ('app', 'router')
DYNAMIC_JS_CALLEES = ('eval', 'Function')


class JavascriptCallGraphBuilder(CallGraphBuilder):
    def __init__(self):
        self.parser = self._get_js_parser()

    def _get_js_parser(self):
        JS_LANGUAGE = Language(tsjs.language())
        parser = Parser(JS_LANGUAGE)
        return parser

    def build(self, project_dir: str) -> tuple[nx.DiGraph, list[str]]:
        graph = nx.DiGraph()
        graph.graph['dynamic_constructs'] = []
        graph.graph['unresolved_imports'] = []
        graph.graph['file_imports'] = {}

        js_files: list[tuple[str, str]] = []
        project_files: set[str] = set()

        for root, _, files in os.walk(project_dir):
            if 'node_modules' in root or '/.' in root or '\\.' in root:
                continue

            for file in files:
                if file.endswith(JS_EXTENSIONS):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, project_dir).replace('\\', '/')
                    js_files.append((file_path, rel_path))
                    project_files.add(rel_path)

        file_local_imports: dict[str, dict] = {}
        file_exports: dict[str, dict[str, str]] = {}
        file_defined_funcs: dict[str, set[str]] = {}

        for file_path, rel_path in js_files:
            local_imports, exports_map, defined_funcs = self._process_file(
                file_path, rel_path, graph, project_files
            )
            file_local_imports[rel_path] = local_imports
            file_exports[rel_path] = exports_map
            file_defined_funcs[rel_path] = defined_funcs

        # Pass 2: Resolve aliased exports, default exports, and re-export chains
        self._resolve_cross_module_links(graph, file_local_imports, file_exports, file_defined_funcs)

        entry_points = [n for n, d in graph.nodes(data=True) if d.get('type') == 'entry_point']

        for n in graph.nodes():
            if n.startswith('index.js:') or n.startswith('main.js:'):
                if n not in entry_points:
                    entry_points.append(n)

        return graph, entry_points

    def _resolve_local_specifier(self, current_rel: str, specifier: str, project_files: set[str]) -> str | None:
        if not (specifier.startswith('.') or specifier.startswith('/')):
            return None
        current_dir = os.path.dirname(current_rel)
        joined = os.path.normpath(os.path.join(current_dir, specifier)).replace('\\', '/')
        if joined.startswith('./'):
            joined = joined[2:]
        for suffix in RESOLVE_SUFFIXES:
            candidate = joined + suffix
            if candidate in project_files:
                return candidate
        return None

    def _process_file(
        self,
        file_path: str,
        rel_path: str,
        graph: nx.DiGraph,
        project_files: set[str],
    ) -> tuple[dict, dict[str, str], set[str]]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()
        except Exception as e:
            print(f"Failed to read {file_path}: {e}")
            return {}, {}, set()

        tree = self.parser.parse(bytes(code, 'utf-8'))

        aliases: dict[str, str] = {}
        local_imports: dict[str, tuple] = {}
        exports_map: dict[str, str] = {}
        defined_funcs: set[str] = set()
        graph.graph['file_imports'].setdefault(rel_path, set())

        self._find_imports(tree.root_node, rel_path, project_files, aliases, local_imports, graph)
        self._find_exports(tree.root_node, exports_map)
        self._find_functions_and_calls(tree.root_node, rel_path, graph, aliases, local_imports, defined_funcs)
        self._find_route_handlers(tree.root_node, rel_path, graph, aliases, local_imports)

        return local_imports, exports_map, defined_funcs

    def _get_node_text(self, node) -> str:
        if not node:
            return ""
        if hasattr(node, 'text'):
            return node.text.decode('utf-8')
        return ""

    def _resolve_callee(self, callee_name: str, file_path: str, aliases: dict, local_imports: dict) -> str:
        # 1. Local project module/symbol resolution
        if callee_name in local_imports:
            entry = local_imports[callee_name]
            if entry[0] == 'symbol':
                return f"{entry[1]}:{entry[2]}"
            elif entry[0] in ('default', 'module'):
                return f"{entry[1]}:__default__"

        parts = callee_name.split('.')
        base_name = parts[0]
        if base_name in local_imports:
            entry = local_imports[base_name]
            rest = '.'.join(parts[1:])
            if entry[0] in ('module', 'default'):
                return f"{entry[1]}:{rest}" if rest else f"{entry[1]}:__default__"
            elif entry[0] == 'symbol':
                return f"{entry[1]}:{entry[2]}.{rest}" if rest else f"{entry[1]}:{entry[2]}"

        # 2. External package alias resolution
        if base_name in aliases:
            pkg_name = aliases[base_name]
            return callee_name.replace(base_name, pkg_name, 1)

        # 3. Same-file local call
        return f"{file_path}:{callee_name}"

    def _walk_and_find_calls(self, node, current_func, graph, file_path, aliases, local_imports):
        if node.type == 'call_expression':
            func_node = node.child_by_field_name('function')
            if func_node:
                callee_name = self._get_node_text(func_node)

                # Check for dynamic constructs: eval(), Function(), require(expr), import(expr)
                is_dynamic = False
                if callee_name in DYNAMIC_JS_CALLEES:
                    is_dynamic = True
                elif callee_name in ('require', 'import') or func_node.type == 'import':
                    args = node.child_by_field_name('arguments')
                    if args:
                        str_args = [c for c in args.children if c.type == 'string']
                        if not str_args:
                            is_dynamic = True

                if is_dynamic:
                    if current_func in graph.nodes:
                        graph.nodes[current_func]['dynamic'] = True
                    graph.graph['dynamic_constructs'].append({
                        'file': file_path,
                        'func': current_func,
                        'construct': callee_name or 'import',
                    })

                resolved = self._resolve_callee(callee_name, file_path, aliases, local_imports)
                graph.add_edge(current_func, resolved)

        elif node.type == 'new_expression':
            ctor = node.child_by_field_name('constructor')
            if ctor and self._get_node_text(ctor) == 'Function':
                if current_func in graph.nodes:
                    graph.nodes[current_func]['dynamic'] = True
                graph.graph['dynamic_constructs'].append({
                    'file': file_path,
                    'func': current_func,
                    'construct': 'new Function',
                })

        for child in node.children:
            self._walk_and_find_calls(child, current_func, graph, file_path, aliases, local_imports)

    def _extract_require_specifier(self, call_node) -> tuple[bool, str | None]:
        """Returns (is_require_call, string_specifier_or_None)."""
        if not call_node or call_node.type != 'call_expression':
            return False, None
        func = call_node.child_by_field_name('function')
        if self._get_node_text(func) != 'require':
            return False, None
        args = call_node.child_by_field_name('arguments')
        if args:
            for c in args.children:
                if c.type == 'string':
                    return True, self._get_node_text(c).strip("'\"`")
        return True, None

    def _bind_require_target(self, name_node, specifier: str, rel_path: str, project_files: set[str], aliases: dict, local_imports: dict, graph: nx.DiGraph):
        is_local_spec = specifier.startswith('.') or specifier.startswith('/')
        target_file = self._resolve_local_specifier(rel_path, specifier, project_files) if is_local_spec else None

        if is_local_spec and not target_file:
            graph.graph['unresolved_imports'].append({
                'file': rel_path,
                'target': specifier,
                'reason': 'Unresolved local require specifier',
            })
            return

        if target_file:
            graph.graph['file_imports'][rel_path].add(target_file)

        if name_node.type == 'identifier':
            var_name = self._get_node_text(name_node)
            if target_file:
                local_imports[var_name] = ('module', target_file)
            else:
                aliases[var_name] = specifier
        elif name_node.type == 'object_pattern':
            for child in name_node.children:
                if child.type == 'shorthand_property_identifier_pattern':
                    sym = self._get_node_text(child)
                    if target_file:
                        local_imports[sym] = ('symbol', target_file, sym)
                    else:
                        aliases[sym] = f"{specifier}.{sym}"
                elif child.type == 'pair_pattern':
                    key_node = child.child_by_field_name('key')
                    val_node = child.child_by_field_name('value')
                    if key_node and val_node:
                        sym = self._get_node_text(key_node)
                        alias = self._get_node_text(val_node)
                        if target_file:
                            local_imports[alias] = ('symbol', target_file, sym)
                        else:
                            aliases[alias] = f"{specifier}.{sym}"

    def _find_imports(self, node, rel_path, project_files, aliases, local_imports, graph):
        if node.type == 'variable_declarator':
            name_node = node.child_by_field_name('name')
            value_node = node.child_by_field_name('value')
            if name_node and value_node:
                # Case 1: const x = require('...') or const { a, b: c } = require('...')
                is_req, specifier = self._extract_require_specifier(value_node)
                if is_req:
                    if specifier is not None:
                        self._bind_require_target(name_node, specifier, rel_path, project_files, aliases, local_imports, graph)
                    else:
                        graph.graph['unresolved_imports'].append({
                            'file': rel_path,
                            'target': self._get_node_text(value_node),
                            'reason': 'Dynamic require with non-literal path',
                        })
                        graph.graph['dynamic_constructs'].append({
                            'file': rel_path,
                            'func': f"{rel_path}:<module>",
                            'construct': 'require',
                        })
                # Case 2: const fn = require('./renderer').formatUserCard
                elif value_node.type == 'member_expression':
                    obj = value_node.child_by_field_name('object')
                    prop = value_node.child_by_field_name('property')
                    is_req_obj, specifier = self._extract_require_specifier(obj)
                    if is_req_obj and prop:
                        prop_name = self._get_node_text(prop)
                        if specifier is not None:
                            is_local_spec = specifier.startswith('.') or specifier.startswith('/')
                            target_file = self._resolve_local_specifier(rel_path, specifier, project_files) if is_local_spec else None
                            if is_local_spec and not target_file:
                                graph.graph['unresolved_imports'].append({
                                    'file': rel_path,
                                    'target': f"{specifier}.{prop_name}",
                                    'reason': 'Unresolved local require specifier',
                                })
                            elif target_file:
                                graph.graph['file_imports'][rel_path].add(target_file)
                                local_imports[self._get_node_text(name_node)] = ('symbol', target_file, prop_name)
                            else:
                                aliases[self._get_node_text(name_node)] = f"{specifier}.{prop_name}"
                        else:
                            graph.graph['unresolved_imports'].append({
                                'file': rel_path,
                                'target': self._get_node_text(value_node),
                                'reason': 'Dynamic require with non-literal path',
                            })

        elif node.type == 'import_statement':
            source = node.child_by_field_name('source')
            if source:
                specifier = self._get_node_text(source).strip("'\"`")
                is_local_spec = specifier.startswith('.') or specifier.startswith('/')
                target_file = self._resolve_local_specifier(rel_path, specifier, project_files) if is_local_spec else None

                if is_local_spec and not target_file:
                    graph.graph['unresolved_imports'].append({
                        'file': rel_path,
                        'target': specifier,
                        'reason': 'Unresolved local ES import specifier',
                    })
                else:
                    if target_file:
                        graph.graph['file_imports'][rel_path].add(target_file)
                    import_clause = node.child_by_field_name('import_clause') or next(
                        (c for c in node.children if c.type == 'import_clause'), None
                    )
                    if import_clause:
                        for child in import_clause.children:
                            if child.type == 'identifier':
                                name = self._get_node_text(child)
                                if target_file:
                                    local_imports[name] = ('default', target_file)
                                else:
                                    aliases[name] = specifier
                            elif child.type == 'namespace_import':
                                for sub in child.children:
                                    if sub.type == 'identifier':
                                        ns = self._get_node_text(sub)
                                        if target_file:
                                            local_imports[ns] = ('module', target_file)
                                        else:
                                            aliases[ns] = specifier
                            elif child.type == 'named_imports':
                                for specifier_node in child.children:
                                    if specifier_node.type == 'import_specifier':
                                        name_n = specifier_node.child_by_field_name('name')
                                        alias_n = specifier_node.child_by_field_name('alias')
                                        orig = self._get_node_text(name_n)
                                        alias = self._get_node_text(alias_n) if alias_n else orig
                                        if orig:
                                            if target_file:
                                                local_imports[alias] = ('symbol', target_file, orig)
                                            else:
                                                aliases[alias] = f"{specifier}.{orig}"

        for child in node.children:
            self._find_imports(child, rel_path, project_files, aliases, local_imports, graph)

    def _find_exports(self, node, exports_map: dict[str, str]):
        if node.type == 'assignment_expression':
            left = node.child_by_field_name('left')
            right = node.child_by_field_name('right')
            left_text = self._get_node_text(left)
            if left_text == 'module.exports' and right:
                if right.type == 'identifier':
                    exports_map['default'] = self._get_node_text(right)
                elif right.type == 'object':
                    for prop in right.children:
                        if prop.type == 'shorthand_property_identifier':
                            name = self._get_node_text(prop)
                            exports_map[name] = name
                        elif prop.type == 'pair':
                            k = self._get_node_text(prop.child_by_field_name('key'))
                            v_node = prop.child_by_field_name('value')
                            if v_node and v_node.type == 'identifier':
                                exports_map[k] = self._get_node_text(v_node)
            elif left_text.startswith('exports.') and right and right.type == 'identifier':
                export_name = left_text[len('exports.'):]
                exports_map[export_name] = self._get_node_text(right)

        elif node.type == 'export_statement':
            has_default = any(c.type == 'default' for c in node.children)
            for child in node.children:
                if has_default and child.type == 'identifier':
                    exports_map['default'] = self._get_node_text(child)
                elif has_default and child.type == 'function_declaration':
                    fn_name = self._get_node_text(child.child_by_field_name('name'))
                    if fn_name:
                        exports_map['default'] = fn_name
                elif child.type == 'export_clause':
                    for spec in child.children:
                        if spec.type == 'export_specifier':
                            orig = self._get_node_text(spec.child_by_field_name('name'))
                            alias_n = spec.child_by_field_name('alias')
                            exported = self._get_node_text(alias_n) if alias_n else orig
                            if orig and exported:
                                exports_map[exported] = orig

        for child in node.children:
            self._find_exports(child, exports_map)

    def _find_functions_and_calls(self, node, file_path, graph, aliases, local_imports, defined_funcs):
        if node.type in ('function_declaration', 'method_definition'):
            name_node = node.child_by_field_name('name')
            if name_node:
                func_name = self._get_node_text(name_node)
                defined_funcs.add(func_name)
                node_id = f"{file_path}:{func_name}"
                graph.add_node(node_id, type='function', file=file_path)

                body = node.child_by_field_name('body')
                if body:
                    self._walk_and_find_calls(body, node_id, graph, file_path, aliases, local_imports)

        elif node.type == 'variable_declarator':
            name_node = node.child_by_field_name('name')
            value_node = node.child_by_field_name('value')
            if name_node and name_node.type == 'identifier' and value_node and value_node.type in ('arrow_function', 'function_expression'):
                func_name = self._get_node_text(name_node)
                defined_funcs.add(func_name)
                node_id = f"{file_path}:{func_name}"
                graph.add_node(node_id, type='function', file=file_path)

                body = value_node.child_by_field_name('body')
                if body:
                    self._walk_and_find_calls(body, node_id, graph, file_path, aliases, local_imports)
                return

        for child in node.children:
            self._find_functions_and_calls(child, file_path, graph, aliases, local_imports, defined_funcs)

    def _find_route_handlers(self, node, file_path, graph, aliases, local_imports):
        if node.type == 'call_expression':
            func_node = node.child_by_field_name('function')
            if func_node and func_node.type == 'member_expression':
                obj_name = self._get_node_text(func_node.child_by_field_name('object'))
                prop_name = self._get_node_text(func_node.child_by_field_name('property'))

                if prop_name in ROUTE_METHODS and obj_name in ROUTE_OBJECTS:
                    args = node.child_by_field_name('arguments')
                    if args:
                        for arg in args.children:
                            if arg.type in ('arrow_function', 'function_expression', 'identifier', 'member_expression', 'call_expression'):
                                entry_id = f"{file_path}:route_{prop_name}"
                                graph.add_node(entry_id, type='entry_point', file=file_path)
                                if arg.type in ('identifier', 'member_expression'):
                                    callee_name = self._get_node_text(arg)
                                    resolved = self._resolve_callee(callee_name, file_path, aliases, local_imports)
                                    graph.add_edge(entry_id, resolved)
                                else:
                                    self._walk_and_find_calls(arg, entry_id, graph, file_path, aliases, local_imports)

        for child in node.children:
            self._find_route_handlers(child, file_path, graph, aliases, local_imports)

    def _resolve_cross_module_links(
        self,
        graph: nx.DiGraph,
        file_local_imports: dict[str, dict],
        file_exports: dict[str, dict[str, str]],
        file_defined_funcs: dict[str, set[str]],
    ):
        # 1. Link aliased & default exports: file:exportedName -> file:internalName
        for rel_path, exports_map in file_exports.items():
            for exported_name, internal_name in exports_map.items():
                if exported_name == 'default':
                    src = f"{rel_path}:__default__"
                else:
                    src = f"{rel_path}:{exported_name}"
                dst = f"{rel_path}:{internal_name}"
                if src != dst and (src in graph or dst in graph):
                    graph.add_edge(src, dst)

        # 2. Link re-exports: if B imports symbol from C, link B:alias -> C:orig
        for rel_path, local_imports in file_local_imports.items():
            for alias_name, entry in local_imports.items():
                if entry[0] == 'symbol':
                    target_file, target_sym = entry[1], entry[2]
                    src_node = f"{rel_path}:{alias_name}"
                    dst_node = f"{target_file}:{target_sym}"
                    if src_node in graph and src_node != dst_node and alias_name not in file_defined_funcs.get(rel_path, set()):
                        graph.add_edge(src_node, dst_node)
                elif entry[0] in ('default', 'module'):
                    target_file = entry[1]
                    src_node = f"{rel_path}:{alias_name}"
                    dst_node = f"{target_file}:__default__"
                    if src_node in graph and dst_node in graph and alias_name not in file_defined_funcs.get(rel_path, set()):
                        graph.add_edge(src_node, dst_node)
