# Reference-segment indexing — v0.4.9

Repeated validation during pruning/nudging now queries a spatial tree of normalized reference segments. The tree is local to one operation: standalone validation still reads and normalizes current inputs, and references can change safely between operations. The main planning search/cost algorithm is unchanged.

## Correctness and fallback rules

- At least 256 reference segments and more than 16 segment queries are required before building the tree. This avoids construction costs for small or brief operations.
- Query bounds expand the candidate segment's bounding box by the larger of lane distance and overlap epsilon, plus conservative floating-point padding. Nonfinite query values use exhaustive scanning.
- Returned segments are sorted by their original reference/segment rank before report accumulation, preserving floating-point summation order.
- Each indexed segment retains its full source path's endpoints so shared-socket clipping remains identical.
- Queries returning more than half the reference segments use exhaustive scanning. Three consecutive such queries disable indexed queries for the rest of that operation.

The tree narrows candidates; the existing exact crossing, overlap, spacing and obstacle predicates remain authoritative. It introduces no new user settings or path-quality tradeoffs. Temporary index memory is released with the operation. Broad/dense scenes may gain little and still pay a one-time construction cost before fallback.

## Complex cleanup measurement

A synthetic 33-corner route constrained by 16 barriers, with 3,000 reference routes placed elsewhere, measured median pruning of **668.56 ms → 18.47 ms** (36.2×). There were 15 alternating timed samples per version after warmup in one process. Complete returned points/reports are asserted equal on every run; the resulting route has 32 corners. Raw samples are in tests/reference_segment_cleanup_results.json.

This fixture deliberately stresses many candidate checks against irrelevant distant references. It is not a representative complete workflow and the speedup must not be generalized to all automatic routing.

## Ordinary routing measurements

Three independent processes per version and size, alternating before/after execution order. Actual Node workers use the complete frozen v0.4.8 JavaScript directory for the baseline. Medians:

| Connections | v0.4.8 total routing | v0.4.9 total routing |
|---|---:|---:|
| 80 | 136.86 ms | 127.96 ms |
| 160 | 228.85 ms | 227.34 ms |
| 500 | 728.10 ms | 660.56 ms |
| 1,500 | 4090.18 ms | 4075.22 ms |

All render and committed-route hashes match across every sample. Changes are much smaller than in the complex-cleanup fixture; small differences are sensitive to process/GC variability. Raw samples are in tests/reference_segment_routing_results.json. A 500-connection cancellation check stopped in 76.5 ms and committed zero routes.

## Verification and limits

Tests check 1,000 conservative candidate queries, exhaustive comparison order, diagonal and epsilon-adjacent geometry, shared-socket references, small/nonfinite fallbacks, and final reports from pruning/nudging against the frozen exhaustive validator. Existing UI, worker transport, collision/validation, spatial/reference-index, maze, shared-endpoint and real WASM scene suites pass.

These are synthetic CPU/worker measurements. No live ComfyUI browser/GPU session was profiled. Worst-case query work remains linear when most references intersect the search region, with tree construction/sorting overhead; fallback limits repeated unhelpful queries. No global routing optimum is claimed.
