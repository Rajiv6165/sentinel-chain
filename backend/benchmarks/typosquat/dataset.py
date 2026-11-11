import json
import os
from typing import List, Dict, Any

DIR_PATH = os.path.dirname(os.path.abspath(__file__))

def load_positive_samples() -> List[Dict[str, Any]]:
    path = os.path.join(DIR_PATH, "positive_samples.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_negative_samples() -> List[Dict[str, Any]]:
    path = os.path.join(DIR_PATH, "negative_samples.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

