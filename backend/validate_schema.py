import json
import urllib.request
import jsonschema

# CycloneDX Validation
print("Validating CycloneDX...")
cdx_schema_url = "https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.5b.schema.json"
try:
    with urllib.request.urlopen(cdx_schema_url) as response:
        cdx_schema = json.loads(response.read().decode())
    with open("sbom.cyclonedx.json") as f:
        cdx_sbom = json.load(f)
    jsonschema.validate(instance=cdx_sbom, schema=cdx_schema)
    print("CycloneDX SBOM is VALID!")
except Exception as e:
    print(f"CycloneDX Validation failed: {e}")

# SPDX Validation
print("Validating SPDX...")
spdx_schema_url = "https://raw.githubusercontent.com/spdx/spdx-spec/development/v2.3.1/schemas/spdx-schema.json"
try:
    with urllib.request.urlopen(spdx_schema_url) as response:
        spdx_schema = json.loads(response.read().decode())
    with open("sbom.spdx.json") as f:
        spdx_sbom = json.load(f)
    jsonschema.validate(instance=spdx_sbom, schema=spdx_schema)
    print("SPDX SBOM is VALID!")
except Exception as e:
    print(f"SPDX Validation failed: {e}")
