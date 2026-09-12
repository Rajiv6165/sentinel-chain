#!/bin/bash
set -e

SCAN_PATH=$1
FAIL_ON_SEVERITY=$2
ENABLE_SANDBOX=$3

python /action/backend/github_action_runner.py \
  --path "$GITHUB_WORKSPACE/$SCAN_PATH" \
  --fail-on-severity "$FAIL_ON_SEVERITY" \
  --enable-sandbox "$ENABLE_SANDBOX"
