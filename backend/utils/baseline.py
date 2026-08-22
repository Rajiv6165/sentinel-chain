def get_baseline():
    return {
        "trusted_domains": [
            "registry.npmjs.org",
            "registry.yarnpkg.com",
            "pypi.org",
            "files.pythonhosted.org",
            "github.com",
            "raw.githubusercontent.com"
        ],
        "allowed_write_paths": [
            "/app/node_modules",
            "/app/venv",
            "/root/.npm",
            "/root/.cache/pip",
            "/tmp"
        ],
        "critical_read_paths": [
            ".aws",
            ".ssh",
            ".npmrc",
            ".bashrc",
            ".profile",
            ".env",
            "/etc/shadow",
            "/etc/passwd"
        ]
    }
