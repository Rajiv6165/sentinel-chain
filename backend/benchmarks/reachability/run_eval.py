import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from benchmarks.reachability.evaluator import ReachabilityEvaluator

async def main():
    evaluator = ReachabilityEvaluator()
    res = await evaluator.run_evaluation()
    for s in res["samples"]:
        print(f"{s['id']} [{s['language']}]: GT={s['ground_truth']} :: Engine={s['engine_result']} :: Outcome={s['outcome']}")
    print("\n--- SUMMARY METRICS ---")
    print(f"Total Samples: {res['total_samples']}")
    print(f"GT Reachable: {res['gt_reachable_count']}")
    print(f"GT Unreachable: {res['gt_unreachable_count']}")
    print(f"Correct REACHABLE: {res['correct_reachable_count']}")
    print(f"Correct UNREACHABLE: {res['correct_unreachable_count']}")
    print(f"False UNREACHABLE (Dangerous False Negative): {res['false_unreachable_count']}")
    print(f"False REACHABLE (False Positive): {res['false_reachable_count']}")
    print(f"Honestly Marked UNKNOWN: {res['honest_unknown_count']}")
    print(f"Downgraded as UNREACHABLE count: {res['downgraded_as_unreachable_count']}")
    print(f"Alert Downgrade Share: {res['downgrade_share'] * 100:.1f}%")

if __name__ == "__main__":
    asyncio.run(main())

