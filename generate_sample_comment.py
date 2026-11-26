import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from utils.markdown_formatter import format_markdown_summary

with open('frontend/src/data/sampleReport.json', 'r', encoding='utf-8') as f:
    sample_data = json.load(f)

findings = sample_data.get('findings', [])
scanned_count = sample_data.get('scanned_count', len(findings))

markdown_output = format_markdown_summary(
    results=findings,
    scanned_count=scanned_count,
    project_name="Sentinel-Chain Sample"
)

output_path = 'frontend/src/data/sampleComment.md'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(markdown_output)

print(f"Generated {output_path} successfully ({len(markdown_output)} characters)")
print("--- PREVIEW ---")
print(markdown_output[:400])
