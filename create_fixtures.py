import zipfile
import os

os.makedirs('test_fixtures', exist_ok=True)

pkg_json = '''{
  "name": "test-direct-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "4.18.2"
  }
}'''

with open('test_fixtures/package.json', 'w', encoding='utf-8') as f:
    f.write(pkg_json)

with zipfile.ZipFile('test_fixtures/test_repo.zip', 'w') as z:
    z.writestr('package.json', pkg_json)
    z.writestr('index.js', 'const express = require("express");\nconst app = express();\napp.listen(3000);\n')

print('Test fixtures created in test_fixtures/')
