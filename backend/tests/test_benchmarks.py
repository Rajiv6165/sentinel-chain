import os
import pytest
from benchmarks.typosquat.evaluator import TyposquatEvaluator
from benchmarks.reachability.evaluator import ReachabilityEvaluator
from benchmarks.runner import run_all_benchmarks, get_repo_root


def test_typosquat_dataset_sizes():
    evaluator = TyposquatEvaluator()
    assert len(evaluator.positive_samples) == 55, "Expected 55 positive samples"
    assert len(evaluator.negative_samples) == 512, "Expected 512 negative samples"
    assert len(evaluator.top_packages) > 0, "Top packages list should not be empty"


def test_typosquat_evaluation_metrics():
    evaluator = TyposquatEvaluator()
    # Default max_distance is now 1 (high confidence)
    res = evaluator.evaluate()
    assert res["max_distance"] == 1
    assert res["tp"] == 45
    assert res["fp"] == 3
    assert res["fn"] == 10
    assert res["tn"] == 509
    assert res["precision"] >= 0.90
    assert res["f1"] >= 0.85


def test_typosquat_threshold_sweep():
    evaluator = TyposquatEvaluator()
    sweep = evaluator.evaluate_sweep([1, 2, 3])
    assert 1 in sweep and 2 in sweep and 3 in sweep
    # As distance increases, recall should be non-decreasing and false positives should be non-decreasing
    assert sweep[1]["recall"] <= sweep[2]["recall"] <= sweep[3]["recall"]
    assert sweep[1]["fp"] <= sweep[2]["fp"] <= sweep[3]["fp"]


@pytest.mark.asyncio
async def test_reachability_samples_count():
    evaluator = ReachabilityEvaluator()
    assert len(evaluator.samples) == 20, "Expected 20 reachability sample projects"

    # Ground truth breakdown (unchanged from Phase 11)
    gt_reachable = [s for s in evaluator.samples if s["ground_truth"] == "REACHABLE"]
    gt_unreachable = [s for s in evaluator.samples if s["ground_truth"] == "UNREACHABLE"]
    assert len(gt_reachable) == 14
    assert len(gt_unreachable) == 6


@pytest.mark.asyncio
async def test_reachability_evaluation_results():
    evaluator = ReachabilityEvaluator()
    res = await evaluator.run_evaluation()

    assert res["total_samples"] == 20
    assert res["correct_reachable_count"] == 12
    assert res["correct_unreachable_count"] == 4
    assert res["false_unreachable_count"] == 0, "Phase 12 fixes should drive False UNREACHABLE to 0 on benchmark suite"
    assert res["honest_unknown_count"] == 4
    assert res["false_reachable_count"] == 0
    assert res["downgrade_share"] == 0.2  # 4 / 20 = 20.0%


@pytest.mark.asyncio
async def test_benchmark_runner_and_report_generation():
    result = await run_all_benchmarks()
    assert "typosquat_default" in result
    assert "typosquat_sweep" in result
    assert "reachability" in result
    assert "phase_11_baseline" in result
    assert "report_path" in result

    report_file = result["report_path"]
    assert os.path.isfile(report_file)
    with open(report_file, "r", encoding="utf-8") as f:
        content = f.read()
    assert "# Sentinel-Chain Engine Benchmarks" in content
    assert "Before (Phase 11)" in content
    assert "After (Phase 12)" in content
    assert "Dataset Sizes & Prominent Limitations" in content
    assert "Typosquat Detection Benchmark" in content
    assert "Reachability Engine Benchmark" in content
    assert "False UNREACHABLE" in content
