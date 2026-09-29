import os
from pathlib import Path
from sigstore.models import ClientTrustConfig
from sigstore.oidc import Issuer, detect_credential, IdentityToken
from sigstore.sign import SigningContext

def test_sign():
    # Attempt to detect CI token
    raw_token = detect_credential()
    if raw_token:
        print("Detected ambient credential.")
        token = IdentityToken(raw_token)
    else:
        print("Falling back to interactive auth.")
        trust_config = ClientTrustConfig.production()
        issuer = Issuer(trust_config.signing_config.get_oidc_url())
        # For testing, we might not want to actually open browser in agent.
        # But let's see.
        pass

if __name__ == "__main__":
    test_sign()
