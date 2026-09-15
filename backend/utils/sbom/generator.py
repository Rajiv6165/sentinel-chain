import uuid
import datetime

def _get_purl(ecosystem: str, pkg_name: str, version: str) -> str:
    # Basic purl generation
    if ecosystem == "npm":
        return f"pkg:npm/{pkg_name}@{version}"
    elif ecosystem == "pypi":
        return f"pkg:pypi/{pkg_name}@{version}"
    return f"pkg:generic/{pkg_name}@{version}"

def generate_cyclonedx(ecosystem: str, deps: dict[str, str], findings: list[dict]) -> dict:
    """
    Generates a CycloneDX 1.5 JSON SBOM enriched with Sentinel-Chain findings.
    """
    # Create a lookup for findings
    findings_map = {f.get("package_name"): f for f in findings}

    components = []
    for pkg_name, version in deps.items():
        finding = findings_map.get(pkg_name)
        
        properties = []
        if finding:
            properties.append({"name": "sentinel-chain:overall_risk", "value": finding.get("overall_risk", "UNKNOWN")})
            
            # Reachability
            if finding.get("cves"):
                # Use the highest reachability
                reachability = "UNKNOWN"
                for c in finding.get("cves", []):
                    if c.get("reachability") == "REACHABLE":
                        reachability = "REACHABLE"
                        break
                    elif c.get("reachability") == "UNREACHABLE":
                        reachability = "UNREACHABLE"
                properties.append({"name": "sentinel-chain:reachability", "value": reachability})
                
            # Typosquat
            if finding.get("typosquat"):
                properties.append({"name": "sentinel-chain:typosquat", "value": "true"})
                
            # Sandbox
            if finding.get("sandbox"):
                risk = finding["sandbox"].get("risk_level", "low")
                properties.append({"name": "sentinel-chain:sandbox_risk", "value": risk})

        component = {
            "type": "library",
            "name": pkg_name,
            "version": version,
            "purl": _get_purl(ecosystem, pkg_name, version),
        }
        
        if properties:
            component["properties"] = properties
            
        components.append(component)

    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "tools": {
                "components": [
                    {
                        "type": "application",
                        "author": "Sentinel-Chain",
                        "name": "Sentinel-Chain SBOM Generator",
                        "version": "1.0.0"
                    }
                ]
            }
        },
        "components": components
    }
    return sbom

def generate_spdx(ecosystem: str, deps: dict[str, str], findings: list[dict]) -> dict:
    """
    Generates an SPDX 2.3 JSON SBOM.
    """
    packages = []
    for pkg_name, version in deps.items():
        spdx_id = f"SPDXRef-Package-{pkg_name.replace('@', '').replace('/', '-')}-{version}"
        package = {
            "name": pkg_name,
            "SPDXID": spdx_id,
            "versionInfo": version,
            "downloadLocation": "NOASSERTION",
            "filesAnalyzed": False,
            "licenseConcluded": "NOASSERTION",
            "licenseDeclared": "NOASSERTION",
            "copyrightText": "NOASSERTION",
            "externalRefs": [
                {
                    "referenceCategory": "PACKAGE-MANAGER",
                    "referenceType": "purl",
                    "referenceLocator": _get_purl(ecosystem, pkg_name, version)
                }
            ]
        }
        packages.append(package)

    doc_id = f"SPDXRef-DOCUMENT"
    
    sbom = {
        "spdxVersion": "SPDX-2.3",
        "dataLicense": "CC0-1.0",
        "SPDXID": doc_id,
        "name": "Sentinel-Chain-SBOM",
        "documentNamespace": f"http://spdx.org/spdxdocs/sentinel-chain-{uuid.uuid4()}",
        "creationInfo": {
            "creators": [
                "Tool: Sentinel-Chain-1.0.0"
            ],
            "created": datetime.datetime.utcnow().isoformat() + "Z"
        },
        "packages": packages,
        "relationships": [
            {
                "spdxElementId": doc_id,
                "relatedSpdxElement": pkg["SPDXID"],
                "relationshipType": "DESCRIBES"
            } for pkg in packages
        ]
    }
    return sbom

def generate_cyclonedx_vex(ecosystem: str, deps: dict[str, str], findings: list[dict]) -> dict:
    """
    Generates a standalone CycloneDX VEX document.
    """
    vulnerabilities = []
    
    for f in findings:
        pkg_name = f.get("package_name")
        version = deps.get(pkg_name, "unknown")
        bom_ref = _get_purl(ecosystem, pkg_name, version)
        
        for c in f.get("cves", []):
            cve_id = c.get("cve_id")
            if not cve_id:
                continue
                
            reachability = c.get("reachability", "UNKNOWN")
            
            state = "unknown"
            justification = None
            if reachability == "REACHABLE":
                state = "exploitable"
            elif reachability == "UNREACHABLE":
                state = "not_affected"
                justification = "code_not_reachable"
                
            vuln = {
                "id": cve_id,
                "affects": [
                    {
                        "ref": bom_ref
                    }
                ],
                "analysis": {
                    "state": state
                }
            }
            if justification:
                vuln["analysis"]["justification"] = justification
                
            vulnerabilities.append(vuln)
            
    vex = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        },
        "vulnerabilities": vulnerabilities
    }
    
    return vex
