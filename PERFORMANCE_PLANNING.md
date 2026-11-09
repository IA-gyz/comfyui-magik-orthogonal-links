# Planning allocation reduction — v0.4.20

## Implementation

Previously each stable frame allocated a new {id,points} record per planned connection, an ID array, and an ID Set, then compared the planned geometry in another pass. Stable point-array references now reuse the existing record. The append operation returns geometry/membership change bits, eliminating the extra comparison pass. Numerically equal regenerated geometry still avoids an overlap update.

An ID set is created only when planned membership/order/length changes, or liveRoute creates a previously uncached ID. The latter flag is necessary: native painting can introduce a transient link that is absent from preparation. Comparing map sizes alone is insufficient when a native-reroute entry has no live-path cache. Pruning resets the flag; graph switches and disabled cleanup clear both the cache and flag. No mutation hooks or revision assumptions were added. The per-frame planned array and normal node/socket validation still exist.

## CPU measurements

Baseline v0.4.19 and current canvases share a process with independent graphs, caches, contexts and version-specific helper modules. After 80 alternating warm-up frame pairs, 100 static pairs and 30 local movement pairs alternate which version executes first. Three independent paired processes per route type, 1,000 links with a 600×600 graph-space viewport. Geometry hashes match after static measurement and every local pair.

The table reports medians of the three per-process median results:

| Routes | Metric | Baseline ms | Current ms |
|---|---|---:|---:|
| Automatic | Static | 1.365 | 1.389 |
| Automatic | Local move | 4.311 | 4.324 |
| Manual | Static | 2.639 | 2.339 |
| Manual | Local move | 11.322 | 9.336 |

Manual static CPU is about 11% lower and local movement about 18% lower. Automatic static/movement medians are slightly slower (about 2% / 0.3%); no automatic speedup is claimed. Same-process pairing reduces machine-load drift but introduces shared GC/JIT effects; it is not a browser/GPU benchmark or a statistical performance guarantee. The complete change is measured, and the v0.4.19 visibility repair remains enabled.

Raw results: tests/planning_paired_{automatic,manual}.json. The harness is tests/paired_performance.mjs; pass a baseline js directory containing its main file and helper modules.

## Sampled allocations

V8 HeapProfiler sampling, 8,192-byte sampling interval, including objects collected by minor and major GC. After 80 warm-up frames, 400 unchanged frames are sampled. Three independent processes per version/type, alternating order. These are estimates of bytes allocated, not retained heap or exact allocation counts.

| Routes | Baseline KiB/frame | Current KiB/frame |
|---|---:|---:|
| Automatic | 793.9 | 707.5 |
| Manual | 1165.3 | 1038.8 |

Estimated allocation falls about 11% in both fixtures. The raw samples are tests/planning_allocations_{automatic,manual}.json. Reproduce with tests/planning_allocations.mjs, using the same source/helper selection as tests/performance.mjs. Node inspector is used only by the benchmark, not by the extension.

## Verification

- Stable planning reuses records; transient paint-only entries are pruned on the next frame.
- Link deletion, native-chain size ambiguity, workflow switching and disable/re-enable cleanup pass.
- Renaming source type/output/input, changing signature metadata, or changing an object-valued socket name's string conversion after preparation remains observable.
- Four ordered paint hashes match v0.4.19; all paired geometry hashes match.
- Viewport integration also passes with the rendering method extracted from the supplied frontend 1.55.18 source, with the surrounding UI mocked.
- Existing UI, geometry, worker, native WASM, snapshot and incremental-index regressions pass.

The accelerated 120-workflow/720-frame viewport memory soak retained zero of 240 sampled retired graph/link objects after collection. Final empty-workflow heap: 8.59 MiB. Raw samples: tests/planning_memory_results.json. Browser/GPU/WASM memory remains outside this measurement.
