# Path-aware viewport culling — v0.4.19

## Behavior and compatibility

The renderer checks actual orthogonal segments, not only a whole-path bounding box. A path surrounding the viewport without entering it is rejected. Stroke checks include N×base overlap widths, borders and a two-screen-pixel margin scaled into graph coordinates. Selected handles enlarge that margin. Invalid viewports/scales/widths fail open.

A cheap first pass uses the number of distinct indexed links as a conservative upper bound on overlap thickness, allowing distant routes to skip overlap-piece and Path2D construction. Near the viewport, actual piece widths decide visibility. Visible paths keep their existing stroke order, patterns and hit-test geometry. All links remain in routing and overlap preparation.

Frontend 1.55.18 culls before renderLink using endpoint/native-reroute bounds with a 20-unit margin. For example, sockets [50,140] and [60,160] fall outside viewport [0,0,100,100], while the automatic route bends through y=92. The bridge recovers such ordinary managed links and retains execution pulses, alpha and the native rendered-path registry.

The bridge is installed only when _renderAllLinkSegments exists with a compatible arity. Native reroute chains, floating links, subgraphs, badges and dragging fall back to native dispatch. It does not fix upstream custom-detour pre-culling for those excluded cases, or on versions where the hook is absent. This intentionally avoids replacing the entire frontend connection renderer.

Prepared off-screen geometry is reused only when scene/detour policy, endpoints and current route metadata match. In-place corner edits, record creation/removal, and viewport changes during painting are tested. Pin-only edits need no bridge invalidation because getRoute normalizes pins back to corner values. A per-frame viewport cache compares all four current visible_area values, and clears in finally. Numeric point comparison now uses a direct two-coordinate fast path and retains sparse/NaN comparison behavior.

## CPU measurements

Both versions use the same native-pre-cull simulation, 1,000 links, 600×600 graph-space viewport. Baseline is v0.4.18. These timings include the complete change, including numeric comparison optimization. Node/stub-canvas only: no browser or GPU timing, no native frontend layout/link-store cost.

Short-run medians from seven alternating independent processes per version/type (12 static frames, three local moves):

| Routes | Metric | Baseline ms | Current ms |
|---|---|---:|---:|
| Automatic | Cold | 59.75 | 52.80 |
| Automatic | Static | 5.06 | 2.57 |
| Automatic | Local move | 8.91 | 11.49 |
| Manual | Cold | 99.54 | 113.66 |
| Manual | Static | 3.97 | 4.46 |
| Manual | Local move | 29.45 | 42.05 |

Longer warmed runs: five alternating independent processes per version/type, 60 unmeasured warm-up frames, 60 measured static frames, 30 local moves cycling through three obstacle locations:

| Routes | Metric | Baseline ms | Current ms |
|---|---|---:|---:|
| Automatic | Cold | 59.59 | 55.87 |
| Automatic | Static | 0.76 | 0.96 |
| Automatic | Local move | 4.61 | 4.82 |
| Manual | Cold | 103.12 | 119.01 |
| Manual | Static | 1.53 | 2.49 |
| Manual | Local move | 11.05 | 11.56 |

There is no general CPU improvement. In warmed runs, the correctness bridge adds about 0.2 ms automatic / 1.0 ms manual per static frame in this fixture. Native culling already avoids painting distant endpoint boxes; checking custom routes for missed visible detours adds work. Short-run movement costs can be materially worse. Off-screen stroke and animation suppression are verified structurally; actual GPU savings are not measured. Do not infer that this release fixes browser freezing.

Raw results: tests/viewport_{automatic,manual}_results.json and viewport_steady_{automatic,manual}_results.json. Reproduce with tests/performance.mjs --viewport, optionally --manual and --steady.

## Correctness and memory

- 10,000 segment visibility comparisons, crossing detours, hollow bounds, invalid viewports, thick lanes, borders, zoom and handles.
- 10,000 numeric comparison oracle cases including sparse arrays and NaNs.
- Native-dispatch integration: visible detour recovery, execution pulse/alpha, off-screen Path2D allocation suppression, pan/animation stopping, wide lanes, in-place corner edits and record creation/reset after preparation, viewport changes during drawing, and native chain/subgraph/drag/badge/floating/disabled fallbacks.
- The integration suite also passes against the method extracted from the supplied frontend 1.55.18 source. The runner strips exactly two local TypeScript annotations, and supplies minimal LLink/geometry helpers. It is not a full frontend/Vue integration test. Upstream source is not bundled.
- Four uncropped ordered paint hashes (automatic/manual/dense/bordered/disabled variants) match v0.4.18. Viewport fixtures retain the same visible route geometry; deliberate missed-detour repairs are covered separately.
- Existing UI, worker, native WASM, geometry, snapshot and incremental-index regressions pass.
- Accelerated viewport memory soak: 120 workflows × 1,000 links, edits/resets/deletions and enable/disable, zero of 240 sampled retired graph/link objects retained after forced GC. Raw metrics: tests/viewport_memory_results.json. This does not measure browser/GPU/WASM memory.

Current viewport soak heap/RSS checkpoints (MiB):

| Cycle | Post-GC heap | RSS |
|---:|---:|---:|
| 10 | 17.71 | 262.13 |
| 20 | 17.74 | 312.63 |
| 30 | 17.79 | 320.93 |
| 40 | 17.73 | 320.83 |
| 50 | 16.44 | 323.19 |
| 60 | 16.44 | 323.59 |
| 70 | 16.44 | 320.96 |
| 80 | 16.44 | 320.96 |
| 90 | 16.45 | 320.99 |
| 100 | 16.45 | 323.19 |
| 110 | 16.46 | 323.25 |
| 120 | 16.46 | 323.72 |

Final empty-workflow heap: 8.56 MiB. This viewport soak is not directly comparable to the prior all-visible soak because far fewer Path2D objects are constructed.
