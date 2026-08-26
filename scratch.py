import tree_sitter_python as tspy
from tree_sitter import Language, Parser

code = b"""
@app.route('/api/data')
def fetch_data():
    requests.get('http://example.com')
"""

PY_LANGUAGE = Language(tspy.language())
parser = Parser(PY_LANGUAGE)
tree = parser.parse(code)

def print_tree(node, level=0):
    print("  " * level + node.type)
    for child in node.children:
        print_tree(child, level + 1)

print_tree(tree.root_node)
