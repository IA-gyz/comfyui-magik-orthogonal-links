# Obstacle-index construction — v0.4.8

A main-thread CPU profile of a 1,500-connection synthetic workflow highlighted routeBounds calls inside obstacle-tree construction. Every level mapped its rectangles into two temporary point lists before scanning their coordinates. Construction and leaf refits now accumulate bounds directly from rectangles. Both rectangle corners still contribute to all extrema. The tree's split-axis choice, sorting, partition boundaries, leaf copies, query traversal and refit/rebuild rules are unchanged.

## Cold-render measurements

Five independent processes per version and fixture, medians. Baseline is the frozen complete v0.4.7 JavaScript directory. Raw samples are in tests/obstacle_build_results.json.

| Connections | v0.4.7 cold preparation | v0.4.8 cold preparation | Reduction |
|---|---:|---:|---:|
| 500 | 25.97 ms | 19.59 ms | 24.6% |
| 1,500 | 50.75 ms | 46.52 ms | 8.3% |
| 3,000 | 86.88 ms | 76.98 ms | 11.4% |

All before/after geometry hashes match across all samples. These timings cover the synthetic first draw's CPU work, including geometry preparation, rather than GPU painting or actual ComfyUI workflow load time. Subsequent idle-frame timing is not a claimed improvement.

## Focused index benchmark

At 10,000 rectangles, 15 alternating timed samples after warmup in one process measured median construction of 37.97 ms before versus 30.73 ms after: 19.1% lower. Samples include allocation/GC variability. Raw values are in tests/rectangle_index_build_results.json.

The benchmark accepts an optional fourth command-line argument pointing to a baseline performance_cache.js module. With that argument it compares exact query results/order for 300 queries and 140 movement/refit/rebuild steps before timing. Without a baseline it reports only current-version construction time.

## Verification and limits

Existing brute-force obstacle queries, incremental movement/rebalancing checks, UI sequences, worker transport, exhaustive collision/validation comparisons, maze checks, shared endpoints and real native WASM suites pass. A full 1,500-connection automatic routing comparison has identical render and committed-route hashes. tests/obstacle_build_routing_check.json retains that comparison; its baseline ran under CPU profiling, so its timings must not be used as performance evidence.

This is a construction/allocation optimization, not a new path-search algorithm or improved asymptotic complexity. The cold-render and focused index fixtures are synthetic; live ComfyUI browser and GPU measurements remain outstanding.
