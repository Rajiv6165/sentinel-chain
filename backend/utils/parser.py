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

def parse_dependencies_with_versions(filename: str, content: str) -> dict[str, str]:
    """
    Parses a package.json or requirements.txt file and returns a dict of dependency names to versions.
    """
    deps = {}
    
    if filename.endswith(".json"):
        try:
            data = json.loads(content)
            for key in ["dependencies", "devDependencies", "peerDependencies"]:
                if key in data:
                    for pkg, ver in data[key].items():
                        # Clean version strings like ^1.0.0 or ~2.0.0
                        clean_ver = re.sub(r'^[~^><=]+', '', ver)
                        deps[pkg] = clean_ver
        except json.JSONDecodeError:
            pass
            
    elif filename.endswith(".txt"):
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
                
            # Extract package name and version
            match = re.match(r"^([a-zA-Z0-9_\-\.]+)(?:[=<>~]+(.*))?", line)
            if match:
                pkg_name = match.group(1).lower()
                version = match.group(2) if match.group(2) else "unknown"
                deps[pkg_name] = version
                
    return deps
