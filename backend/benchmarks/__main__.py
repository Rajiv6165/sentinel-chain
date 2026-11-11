import sys
import os
import argparse
import asyncio

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from benchmarks.runner import run_all_benchmarks

def main():
    parser = argparse.ArgumentParser(description="Sentinel-Chain Benchmark Runner")
    subparsers = parser.add_subparsers(dest="command", help="Benchmark command to execute")
    
    run_parser = subparsers.add_parser("run", help="Run full benchmark suite and generate docs/benchmarks.md")
    
    args = parser.parse_args()
    
    if args.command == "run" or len(sys.argv) == 1:
        asyncio.run(run_all_benchmarks())
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()

