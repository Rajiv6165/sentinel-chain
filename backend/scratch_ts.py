import tree_sitter
import tree_sitter_javascript as tsjs
from tree_sitter import Language, Parser, Query

def test():
    JS_LANGUAGE = Language(tsjs.language())
    parser = Parser(JS_LANGUAGE)

    code = b"""
    const axios = require('axios');
    import { dangerousFunc } from 'bad-pkg';

    function myEndpoint(req, res) {
        doSomething();
        dangerousFunc();
    }
    
    function doSomething() {
        console.log("hello");
    }
    """
    
    tree = parser.parse(code)
    
    # Try getting query matching
    query = Query(JS_LANGUAGE, """
        (call_expression
            function: (identifier) @func_name)
        (call_expression
            function: (member_expression
                object: (identifier)
                property: (property_identifier)) @func_name)
    """)
    captures = query.captures(tree.root_node)
    print("Captures:")
    for capture, name in captures:
        print(f"{name}: {capture.text.decode('utf8')}")

if __name__ == "__main__":
    test()
