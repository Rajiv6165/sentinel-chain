import json
import os

SHORT_NAMES = [
    "qs", "ws", "ms", "co", "is", "ip", "du", "cp", "rm", "mv", "pi", "re", "os", "io",
    "got", "del", "ora", "koa", "ky", "ava", "tap", "tar", "zip", "xml", "csv", "yaml",
    "ejs", "pug", "less", "sass", "vite", "yarn", "pnpm", "npm", "pip", "git", "ssh", "tls",
    "net", "http", "url", "path", "fs", "util", "vm", "zlib", "crypto", "events", "buffer",
    "stream", "he", "depd", "once", "vary", "etag", "send", "pump", "from2", "split2", "yauzl"
]

SCOPED_PACKAGES = [
    "@types/node", "@types/react", "@types/react-dom", "@types/express", "@types/lodash",
    "@types/jest", "@types/mocha", "@types/chai", "@types/supertest", "@types/cors",
    "@types/multer", "@types/uuid", "@types/validator", "@types/glob", "@types/ws",
    "@types/qs", "@types/debug", "@types/mime", "@types/semver", "@types/yargs",
    "@babel/core", "@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript",
    "@babel/parser", "@babel/traverse", "@babel/types", "@babel/generator", "@babel/template",
    "@angular/core", "@angular/common", "@angular/compiler", "@angular/platform-browser",
    "@nestjs/core", "@nestjs/common", "@nestjs/platform-express", "@nestjs/testing",
    "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb", "@aws-sdk/client-sqs", "@aws-sdk/client-sns",
    "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event",
    "@vitejs/plugin-react", "@rollup/plugin-node-resolve", "@rollup/plugin-commonjs",
    "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin", "@swc/core"
]

SIMILAR_LEGIT_PAIRS = [
    ("color", "colors", "npm", "Legitimate color string parser vs ANSI color formatter"),
    ("request", "requests", "npm/pypi", "Deprecated npm request client vs Python requests library"),
    ("cookie", "cookies", "npm", "Cookie serializer vs HTTP cookie parser"),
    ("marked", "markdown", "npm", "Fast markdown compiler vs alternative markdown library"),
    ("minimist", "minimatch", "npm", "Argument parser vs glob pattern matcher"),
    ("glob", "globby", "npm", "Standard glob vs user-friendly glob with promises"),
    ("strip-ansi", "has-ansi", "npm", "Strip ANSI codes vs detect ANSI codes"),
    ("through", "through2", "npm", "Stream transform helper vs stream2 transform wrapper"),
    ("find-up", "pkg-up", "npm", "Find file up the directory tree vs find package.json specifically"),
    ("dotenv", "dotenv-expand", "npm", "Env loader vs variable expansion addon"),
    ("chalk", "chalk-pipe", "npm", "Terminal styling vs string-based chalk pipeline"),
    ("micromatch", "picomatch", "npm", "Fast globbing engine vs tiny glob matcher"),
    ("uuid", "nanoid", "npm", "RFC UUID generator vs tiny unique ID generator"),
    ("superagent", "supertest", "npm", "HTTP request client vs HTTP assertion library"),
    ("cheerio", "jsdom", "npm", "Fast HTML parser vs full DOM implementation"),
    ("mocha", "chai", "npm", "Test runner framework vs assertion library"),
    ("winston", "bunyan", "npm", "Multi-transport logger vs JSON-first logger"),
    ("pino", "log4js", "npm", "Extremely fast JSON logger vs traditional log4j port"),
    ("yargs", "commander", "npm", "Feature-rich CLI parser vs lightweight option parser"),
    ("inquirer", "prompts", "npm", "Interactive CLI prompts vs lightweight prompts"),
    ("rimraf", "del", "npm", "Node rm -rf utility vs modern deletion library"),
    ("mkdirp", "make-dir", "npm", "Classic mkdir -p vs promise-based directory creator"),
    ("cross-spawn", "execa", "npm", "Cross-platform spawn vs process execution wrapper"),
    ("fast-glob", "glob", "npm", "High-performance glob vs standard glob library"),
    ("dayjs", "date-fns", "npm", "Moment-compatible micro library vs modular date toolset"),
    ("zod", "yup", "npm", "TypeScript-first schema validator vs object schema validator"),
    ("prisma", "typeorm", "npm", "Next-generation ORM vs traditional ActiveRecord/DataMapper ORM"),
    ("bcrypt", "argon2", "npm", "Password hashing with bcrypt vs modern argon2 hashing"),
    ("cors", "helmet", "npm", "CORS middleware vs security headers middleware"),
    ("yaml", "js-yaml", "npm", "Modern YAML parser vs classic JS-YAML library")
]

POPULAR_NPM_LEGIT = [
    "semver", "debug", "ajv", "source-map", "tslib", "chokidar", "bullmq", "ioredis",
    "knex", "sharp", "morgan", "puppeteer", "playwright", "esbuild", "rollup", "tsup",
    "turbo", "lerna", "prettier-plugin-tailwindcss", "postcss", "autoprefixer", "cssnano",
    "sass-loader", "babel-loader", "file-loader", "style-loader", "html-webpack-plugin",
    "mini-css-extract-plugin", "dotenv-safe", "envalid", "joi", "superjson",
    "class-validator", "class-transformer", "reflect-metadata", "form-data", "multer",
    "busboy", "compression", "cookie-parser", "express-rate-limit", "jsonwebtoken",
    "passport", "crypto-js", "validator", "sanitize-html", "dompurify", "escape-html",
    "mime-types", "content-type", "accepts", "statuses", "http-errors", "raw-body", "bytes",
    "negotiator", "unpipe", "fresh", "parseurl", "utils-merge", "merge-descriptors",
    "array-flatten", "path-to-regexp", "methods", "serve-static", "serve-index",
    "finalhandler", "destroy", "on-finished", "ee-first", "proxy-addr", "ipaddr.js",
    "forwarded", "type-is", "media-typer", "concat-stream", "readable-stream",
    "string_decoder", "inherits", "util-deprecate", "safe-buffer", "buffer-crc32",
    "end-of-stream", "wrappy", "duplexify", "to-regex-range", "fill-range", "is-number",
    "repeat-string", "kind-of", "is-extendable", "extend-shallow", "assign-symbols",
    "split-string", "arr-diff", "array-unique", "array-union", "arr-flatten",
    "object.pick", "object.omit", "is-plain-object", "is-primitive", "is-buffer", "isobject",
    "has-values", "has-value", "unset-value", "get-value", "set-value", "union-value",
    "use", "mixin-deep", "for-in", "for-own", "base64-js", "ieee754", "buffer-from",
    "buffer-alloc", "buffer-alloc-unsafe", "buffer-fill", "safer-buffer", "elliptic",
    "bn.js", "brorand", "hash.js", "hmac-drbg", "minimalistic-assert",
    "minimalistic-crypto-utils", "asn1.js", "browserify-rsa", "create-hash", "create-hmac",
    "crypto-browserify", "diffie-hellman", "pbkdf2", "public-encrypt", "randombytes",
    "randomfill", "ripemd160", "sha.js", "des.js", "browserify-cipher", "browserify-sign",
    "parse-asn1", "browserify-des", "miller-rabin", "browserify-aes", "cipher-base",
    "evp_bytestokey", "md5.js", "ripemd160", "sha.js", "fast-deep-equal", "fast-json-stable-stringify",
    "json-schema-traverse", "uri-js", "punycode", "ip-regex", "signal-exit", "shebang-regex",
    "shebang-command", "which", "isexe", "cross-spawn", "strip-final-newline", "npm-run-path",
    "path-key", "human-signals", "is-stream", "merge-stream", "get-stream"
]

POPULAR_PYPI_LEGIT = [
    "attrs", "click", "rich", "pytest-cov", "tqdm", "scipy", "scikit-learn", "matplotlib",
    "seaborn", "pytest-asyncio", "psycopg2", "redis", "cryptography", "pillow", "jinja2",
    "werkzeug", "fastapi-utils", "httpx", "anyio", "starlette", "uvicorn", "greenlet",
    "marshmallow", "alembic", "gevent", "twisted", "tornado", "aiohttp", "async-timeout",
    "yarl", "multidict", "frozenlist", "aiosignal", "protobuf", "grpcio",
    "googleapis-common-protos", "google-api-core", "google-auth", "cachetools", "pyasn1",
    "rsa", "pyparsing", "packaging", "setuptools-scm", "wheel", "flit", "poetry", "pipenv",
    "virtualenv", "tox", "nox", "flake8", "mypy", "black", "isort", "pylint", "ruff",
    "bandit", "coverage", "hypothesis", "pluggy", "iniconfig", "pygments", "prompt-toolkit",
    "wcwidth", "tabulate", "termcolor", "coloredlogs", "loguru", "structlog",
    "pydantic-settings", "pydantic-core", "sqlmodel", "tortoise-orm", "peewee", "databases",
    "orm", "motor", "pymongo", "asyncpg", "aiomysql", "aiosqlite", "cx-oracle", "pyodbc",
    "influxdb", "elasticsearch", "opensearch-py", "boto", "s3transfer", "jmespath",
    "azure-storage-blob", "azure-core", "google-cloud-storage", "fabric", "paramiko",
    "passlib", "pyjwt", "authlib", "oauthlib", "httplib2", "requests-oauthlib", "responses",
    "httpretty", "vcrpy", "betamax", "pytest-mock", "faker", "factory-boy", "freezegun",
    "time-machine", "tenacity", "retrying", "decorator", "wrapt", "boltons", "toolz",
    "cytoolz", "funcy", "more-itertools", "cached-property", "furl", "humanize", "arrow",
    "pendulum", "dateparser", "python-dotenv", "environs", "dynaconf", "hydra-core",
    "omegaconf", "click-completion", "typer", "fire", "docopt", "invoke", "celery-progress",
    "kombu", "amqp", "vine", "billiard", "rq", "dramatiq", "huey", "apscheduler",
    "schedule", "croniter", "joblib", "diskcache", "dogpile.cache", "redis-py-cluster",
    "walrus", "pika", "confluent-kafka", "kafka-python", "faust", "pulsar-client",
    "websockets", "eventlet", "simplejson", "ujson", "orjson", "msgpack", "cbor2",
    "pyyaml", "toml", "tomli", "tomli-w", "h11", "httpcore", "rfc3986", "sniffio",
    "blinker", "itsdangerous", "flask-login", "flask-cors", "flask-migrate", "flask-sqlalchemy"
]

def build_negative_samples():
    samples = []
    seen = set()

    def add(pkg, eco, cat, desc):
        if pkg not in seen:
            seen.add(pkg)
            samples.append({
                "package_name": pkg,
                "ecosystem": eco,
                "category": cat,
                "description": desc
            })

    # Short names
    for name in SHORT_NAMES:
        add(name, "npm" if name in ["qs", "ws", "ms", "co", "koa", "ora", "ky"] else "generic", "short_name", f"Short utility package: {name}")

    # Scoped packages
    for name in SCOPED_PACKAGES:
        add(name, "npm", "scoped_package", f"Scoped official/community package: {name}")

    # Similar legit pairs
    for p1, p2, eco, desc in SIMILAR_LEGIT_PAIRS:
        add(p1, eco, "similar_legit_pair", desc)
        add(p2, eco, "similar_legit_pair", desc)

    # Popular npm
    for name in POPULAR_NPM_LEGIT:
        add(name, "npm", "popular_legitimate", f"Popular legitimate npm package: {name}")

    # Popular PyPI
    for name in POPULAR_PYPI_LEGIT:
        add(name, "pypi", "popular_legitimate", f"Popular legitimate PyPI package: {name}")

    return samples

if __name__ == "__main__":
    samples = build_negative_samples()
    print(f"Generated {len(samples)} negative samples.")
    out_path = os.path.join(os.path.dirname(__file__), "negative_samples.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2)
    print(f"Wrote to {out_path}")

