# Dense overlap rendering — v0.4.14

A CPU profile of a 750-connection dense fixture showed the widened-stroke loop and overlap-piece splitting among the costs. The optimization has two parts:

1. overlapPieces uses the sweep index's ordered, disjoint runs directly. Binary search still locates the first relevant run, but clipping no longer builds overlapping-run/cut lists, a Set and another sorted boundary list. Gaps retain count one, reverse travel and path-distance offsets retain their original order, and signed zero follows the old Set behavior.
2. The borderless wide-stroke loop reuses the stroke color already selected for the base path. Bordered paths retain the exact border/color alternation. Every original stroke remains, preserving layering, colors, highlighting and disabled-link dashes.

## Repeated measurements

Three independent processes per version and fixture, alternating execution order. The complete frozen v0.4.13 JavaScript directory is the baseline. Medians from dense fixtures:

| Connections | Cached-frame CPU, before → after | Local movement CPU, before → after | Cold preparation, before → after |
|---|---:|---:|---:|
| 250 | 19.93 → 10.45 ms | 35.54 → 29.60 ms | 73.28 → 65.02 ms |
| 500 | 62.39 → 37.23 ms | 110.89 → 85.22 ms | 198.16 → 165.69 ms |
| 750 | 144.86 → 75.70 ms | 277.49 → 175.30 ms | 445.80 → 332.06 ms |

Cached-frame reductions are about 40–48%; local movement reductions are about 17–37%. All geometry hashes match across all samples. Raw results, including a regular non-dense 500-link control, are in tests/dense_overlap_results.json. The regular control remains close to baseline; no broad ordinary-workflow speedup is claimed.

These timings measure Node CPU work with a stub canvas. They include render preparation and JavaScript stroke-loop overhead, not real canvas/GPU painting or browser frame latency. Native canvas setters/strokes may have different costs. Actual ComfyUI browser measurements remain outstanding.

## Equivalence evidence

- tests/overlap_pieces_oracle.mjs retains the pre-change splitter. Tests compare 15,000 generated paths against both full and incremental overlap indexes, including route reversals/retracing and zero-length segments.
- Directed cases cover gaps, clipped ranges, count-one runs, exact boundaries, signed zero and cumulative distance ordering.
- Ten normal/dense before/after comparisons record the ordered path geometry, stroke color, width, alpha, dash array/offset and line cap on every stroke. Colors, highlighted links, borders, skipped borders and alternating disabled-link dashes have identical hashes. See tests/dense_paint_results.json.
- The performance harness's --paint-check mode enables stroke hashing; keep it off for timing. --border, --skip-border and --disabled select the directed states.
- Existing UI, routing-state, geometry, incremental-index, worker and native scene regressions are retained.

## Remaining costs

The number of layered strokes is unchanged. Heavily shared paths can still produce quadratic piece/stroke counts, and GPU/browser paint costs are unmeasured. Avoiding those strokes would require a separate compositing policy to preserve colors, transparency, borders and animated locked-route patterns. This release keeps the established appearance and changes only preparation/state-setting overhead.
