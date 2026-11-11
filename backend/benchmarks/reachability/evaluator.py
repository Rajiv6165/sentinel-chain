import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from utils.reachability import analyze_reachability

class ReachabilityEvaluator:
    def __init__(self, ground_truth_path: Optional[str] = None):
        if ground_truth_path is None:
            ground_truth_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "ground_truth.json"
            )
        self.ground_truth_path = ground_truth_path
        self.samples = self._load_ground_truth()

    def _load_ground_truth(self) -> List[Dict[str, Any]]:
        with open(self.ground_truth_path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def evaluate_sample(self, sample: Dict[str, Any]) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        sample_dir = os.path.join(base_dir, sample["sample_dir"])
        
        findings = [
            {
                "package_name": sample["package_name"],
                "cve_id": sample["cve_id"]
            }
        ]
        
        results = await analyze_reachability(sample_dir, findings)
        res = results[0] if results else {}
        
        detected = res.get("reachability", "UNKNOWN")
        reason = res.get("reachability_reason", "")
        call_chain = res.get("call_chain")
        gt = sample["ground_truth"]
        
        # Determine classification category
        if detected == "REACHABLE":
            if gt == "REACHABLE":
                outcome = "CORRECT_REACHABLE"
            else:
                outcome = "FALSE_REACHABLE"
        elif detected == "UNREACHABLE":
            if gt == "UNREACHABLE":
                outcome = "CORRECT_UNREACHABLE"
            else:
                outcome = "FALSE_UNREACHABLE"  # The dangerous error!
        else: # UNKNOWN
            outcome = "HONEST_UNKNOWN"
            
        return {
            "id": sample["id"],
            "language": sample["language"],
            "package_name": sample["package_name"],
            "cve_id": sample["cve_id"],
            "pattern": sample.get("pattern", ""),
            "description": sample.get("description", ""),
            "ground_truth": gt,
            "engine_result": detected,
            "outcome": outcome,
            "reason": reason,
            "call_chain": call_chain
        }

    async def run_evaluation(self) -> Dict[str, Any]:
        results = []
        for sample in self.samples:
            sample_eval = await self.evaluate_sample(sample)
            results.append(sample_eval)
            
        total = len(results)
        gt_reachable = [r for r in results if r["ground_truth"] == "REACHABLE"]
        gt_unreachable = [r for r in results if r["ground_truth"] == "UNREACHABLE"]
        
        correct_reachable = [r for r in results if r["outcome"] == "CORRECT_REACHABLE"]
        correct_unreachable = [r for r in results if r["outcome"] == "CORRECT_UNREACHABLE"]
        false_unreachable = [r for r in results if r["outcome"] == "FALSE_UNREACHABLE"]
        false_reachable = [r for r in results if r["outcome"] == "FALSE_REACHABLE"]
        honest_unknown = [r for r in results if r["outcome"] == "HONEST_UNKNOWN"]
        
        downgraded = [r for r in results if r["engine_result"] == "UNREACHABLE"]
        downgrade_share = len(downgraded) / total if total > 0 else 0.0
        
        return {
            "total_samples": total,
            "gt_reachable_count": len(gt_reachable),
            "gt_unreachable_count": len(gt_unreachable),
            "correct_reachable_count": len(correct_reachable),
            "correct_unreachable_count": len(correct_unreachable),
            "false_unreachable_count": len(false_unreachable),
            "false_reachable_count": len(false_reachable),
            "honest_unknown_count": len(honest_unknown),
            "downgraded_as_unreachable_count": len(downgraded),
            "downgrade_share": downgrade_share,
            "samples": results
        }

