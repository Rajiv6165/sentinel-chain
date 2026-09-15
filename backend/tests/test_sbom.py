import pytest
from utils.sbom.generator import generate_cyclonedx, generate_spdx, generate_cyclonedx_vex

def test_generate_cyclonedx():
    deps = {"lodash": "4.17.21", "express": "4.17.1"}
    findings = [
        {
            "package_name": "lodash",
            "overall_risk": "CRITICAL",
            "cves": [{"cve_id": "CVE-2021-23337", "reachability": "REACHABLE", "epss_score": 0.8}],
            "typosquat": None,
            "sandbox": {"risk_level": "low"}
        }
    ]
    
    cdx = generate_cyclonedx("npm", deps, findings)
    assert cdx["bomFormat"] == "CycloneDX"
    assert cdx["specVersion"] == "1.5"
    assert len(cdx["components"]) == 2
    
    lodash_comp = next(c for c in cdx["components"] if c["name"] == "lodash")
    assert lodash_comp["version"] == "4.17.21"
    
    props = {p["name"]: p["value"] for p in lodash_comp.get("properties", [])}
    assert props.get("sentinel-chain:reachability") == "REACHABLE"
    assert props.get("sentinel-chain:overall_risk") == "CRITICAL"

def test_generate_spdx():
    deps = {"requests": "2.25.1"}
    findings = []
    
    spdx = generate_spdx("pypi", deps, findings)
    assert spdx["spdxVersion"] == "SPDX-2.3"
    assert len(spdx["packages"]) == 1
    assert spdx["packages"][0]["name"] == "requests"
    
def test_generate_vex():
    deps = {"lodash": "4.17.21"}
    findings = [
        {
            "package_name": "lodash",
            "cves": [{"cve_id": "CVE-2021-23337", "reachability": "UNREACHABLE"}],
        }
    ]
    
    vex = generate_cyclonedx_vex("npm", deps, findings)
    assert vex["bomFormat"] == "CycloneDX"
    assert len(vex["vulnerabilities"]) == 1
    assert vex["vulnerabilities"][0]["id"] == "CVE-2021-23337"
    assert vex["vulnerabilities"][0]["analysis"]["state"] == "not_affected"
    assert vex["vulnerabilities"][0]["analysis"]["justification"] == "code_not_reachable"
