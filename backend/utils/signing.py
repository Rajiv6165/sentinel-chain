import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from sigstore.models import ClientTrustConfig, Bundle
from sigstore.oidc import Issuer, detect_credential, IdentityToken
from sigstore.sign import SigningContext
from sigstore.verify import Verifier
from sigstore.verify.policy import UnsafeNoOp, Identity

def hash_data(data):
    sha256 = hashlib.sha256()
    if isinstance(data, str):
        sha256.update(data.encode('utf-8'))
    elif isinstance(data, bytes):
        sha256.update(data)
    else:
        sha256.update(json.dumps(data, sort_keys=True).encode('utf-8'))
    return sha256.hexdigest()

def hash_file(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for block in iter(lambda: f.read(4096), b""):
            sha256.update(block)
    return sha256.hexdigest()

def generate_attestation(repo_path, sbom_content=None, report_content=None, engines_run=None, version="1.0.0"):
    # Generate SLSA provenance attestation
    if engines_run is None:
        engines_run = []
    
    subject = []
    if sbom_content:
        subject.append({
            "name": "sbom.cyclonedx.json",
            "digest": {"sha256": hash_data(sbom_content)}
        })
    if report_content:
        subject.append({
            "name": "report.json",
            "digest": {"sha256": hash_data(report_content)}
        })

    attestation = {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": subject,
        "predicateType": "https://slsa.dev/provenance/v1",
        "predicate": {
            "buildDefinition": {
                "buildType": "https://sentinel-chain.io/scan/v1",
                "externalParameters": {
                    "repository": os.path.abspath(repo_path)
                }
            },
            "runDetails": {
                "builder": {
                    "id": "https://github.com/sentinel-chain"
                },
                "metadata": {
                    "invocationId": os.environ.get("GITHUB_RUN_ID", "local"),
                    "startedOn": datetime.utcnow().isoformat() + "Z"
                },
                "engines": engines_run,
                "toolVersion": version
            }
        }
    }
    return attestation

def sign_data(data: bytes, identity_token=None):
    trust_config = ClientTrustConfig.production()
    
    if not identity_token:
        raw_token = detect_credential()
        if raw_token:
            identity_token = IdentityToken(raw_token)
        else:
            print("Notice: Opening browser for Sigstore OIDC interactive authentication...")
            issuer = Issuer(trust_config.signing_config.get_oidc_url())
            identity_token = issuer.identity_token()
            
    context = SigningContext.from_trust_config(trust_config)
    with context.signer(identity_token, cache=True) as signer:
        bundle = signer.sign_artifact(data)
        
    return bundle

def sign_file(filepath, identity_token=None):
    # Returns path to signature bundle
    artifact_path = Path(filepath)
    bundle = sign_data(artifact_path.read_bytes(), identity_token)
        
    out_path = f"{filepath}.sigstore.json"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(bundle.to_json())
    return out_path

def verify_file(filepath, bundle_path, expected_identity=None, expected_issuer=None):
    try:
        input_bytes = Path(filepath).read_bytes()
        bundle_bytes = Path(bundle_path).read_bytes()
        bundle = Bundle.from_json(bundle_bytes)
        
        verifier = Verifier.production()
        
        if expected_identity and expected_issuer:
            policy = Identity(identity=expected_identity, issuer=expected_issuer)
        else:
            # If no identity is enforced by the caller, use UnsafeNoOp to at least verify the Rekor signature validity
            policy = UnsafeNoOp()
            
        verifier.verify_artifact(input_bytes, bundle, policy)
        return True, "Verification successful against Sigstore transparency log."
    except Exception as e:
        return False, str(e)
