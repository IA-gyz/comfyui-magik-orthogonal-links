# Simplifier allocation reduction — v0.4.16

The previous simplifier created a three-item slice for each examined corner and an array from splice when removing it. Direct indexing and tail replacement now perform the same operations without those arrays. Explicit finite-coordinate checks replace an array callback. Pin lookup runs only for collinear, nonreversing corners, where pins can affect the result.

## Validation

20,007 cases match the frozen v0.4.15 implementation, including duplicate points, repeated reversals, pinned corners, invalid coordinates, numeric conversion and signed zero. Inputs and pins remain unchanged, and returned points are independent copies. All measured frame geometry hashes match; regular and dense bordered/disabled ordered paint hashes match.

## Measurements

Isolated simplification: 200,000 six-point routes per run, warm-up followed by nine alternating baseline/current runs. Median CPU time 55.65 → 42.88 ms, about 23% lower. This isolates the hot loop and is not a frame-rate measurement. Reproduce with `node tests/simplify_performance.mjs`; raw runs are in tests/simplify_micro_results.json.

Whole frames: seven independent processes per version/size in alternating order, using tests/performance.mjs. Median of process results:

| Connections | Metric | v0.4.15 ms | v0.4.16 ms |
|---|---|---:|---:|
| 1,000 | Cold | 34.60 | 37.61 |
| 1,000 | Static | 3.83 | 3.41 |
| 1,000 | Local move | 10.20 | 10.34 |
| 5,000 | Cold | 120.61 | 114.14 |
| 5,000 | Static | 20.19 | 21.84 |
| 5,000 | Local move | 47.61 | 50.85 |

Results are mixed, including slower 5,000-link static/movement runs. No general frame-rate or dragging gain is established. The retained change reduces hot-loop allocations with exact tested geometry parity. Browser/GPU performance remains unverified. Raw frame results are in tests/simplify_frame_results_*.json.
