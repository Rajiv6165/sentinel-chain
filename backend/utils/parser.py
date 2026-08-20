import json
import re

def parse_dependencies(filename: str, content: str) -> list[str]:
    """
    Parses a package.json or requirements.txt file and returns a list of dependency names.
    """
    deps = set()
    
    if filename.endswith(".json"):
        try:
            data = json.loads(content)
            if "dependencies" in data:
                deps.update(data["dependencies"].keys())
            if "devDependencies" in data:
                deps.update(data["devDependencies"].keys())
            if "peerDependencies" in data:
                deps.update(data["peerDependencies"].keys())
        except json.JSONDecodeError:
            pass
            
    elif filename.endswith(".txt"):
        # Very basic requirements.txt parsing
        # Matches formats like:
        # requests==2.25.1
        # Flask>=1.1.2
        # pandas
        for line in content.splitlines():
            line = line.strip()
            # Ignore comments and empty lines
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            
            # Extract the package name (everything before ==, >=, <=, ~, >, <)
            match = re.match(r"^([a-zA-Z0-9_\-\.]+)", line)
            if match:
                deps.add(match.group(1).lower())
                
    return list(deps)
