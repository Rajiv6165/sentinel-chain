import json
import os
from typing import Dict, List, Any
from utils.scoring import score_dependencies
from .dataset import load_positive_samples, load_negative_samples

def evaluate_threshold(
    positive_samples: List[Dict[str, Any]],
    negative_samples: List[Dict[str, Any]],
    top_packages: List[str],
    max_distance: int
) -> Dict[str, Any]:
    pos_names = [s["package_name"] for s in positive_samples]
    neg_names = [s["package_name"] for s in negative_samples]

    # Run detection
    pos_findings = score_dependencies(pos_names, top_packages, max_distance=max_distance)
    neg_findings = score_dependencies(neg_names, top_packages, max_distance=max_distance)

    flagged_pos = {f["package_name"]: f for f in pos_findings}
    flagged_neg = {f["package_name"]: f for f in neg_findings}

    tp = len(flagged_pos)
    fn = len(pos_names) - tp
    fp = len(flagged_neg)
    tn = len(neg_names) - fp

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "max_distance": max_distance,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "flagged_pos": flagged_pos,
        "flagged_neg": flagged_neg
    }

class TyposquatEvaluator:
    def __init__(self):
        self.positive_samples = load_positive_samples()
        self.negative_samples = load_negative_samples()
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        top_pkg_path = os.path.join(backend_dir, "data", "top_packages.json")
        with open(top_pkg_path, "r", encoding="utf-8") as f:
            self.top_packages = json.load(f)

    def evaluate(self, max_distance: int = 2) -> Dict[str, Any]:
        res = evaluate_threshold(self.positive_samples, self.negative_samples, self.top_packages, max_distance)
        fps = []
        for s in self.negative_samples:
            name = s["package_name"]
            if name in res["flagged_neg"]:
                finding = res["flagged_neg"][name]
                fps.append({
                    "package": name,
                    "category": s.get("category", "unknown"),
                    "matched_target": finding["suspected_target"],
                    "distance": finding["distance_score"],
                    "risk_level": finding["risk_level"],
                    "description": s.get("description", "")
                })
        fns = []
        for s in self.positive_samples:
            name = s["package_name"]
            if name not in res["flagged_pos"]:
                fns.append({
                    "package": name,
                    "target": s.get("target", "unknown"),
                    "citation": s.get("source", ""),
                    "description": s.get("description", "")
                })
        return {
            "max_distance": max_distance,
            "total_positive": len(self.positive_samples),
            "total_negative": len(self.negative_samples),
            "precision": res["precision"],
            "recall": res["recall"],
            "f1": res["f1"],
            "tp": res["tp"],
            "fp": res["fp"],
            "fn": res["fn"],
            "tn": res["tn"],
            "false_positives": fps,
            "false_negatives": fns
        }

    def evaluate_sweep(self, distances: List[int]) -> Dict[int, Dict[str, Any]]:
        sweep = {}
        for d in distances:
            sweep[d] = self.evaluate(max_distance=d)
        return sweep

