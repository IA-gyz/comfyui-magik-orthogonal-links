# Large-workflow performance review — v0.4.2

Compared v0.4.1 with v0.4.2 in the same Node runtime (v24.19.0). Each scenario has three independent process runs; cells report the median of those runs. Each process measures 12 unchanged frames, five distant-node moves and three local-obstacle moves. Initial-frame timing has no warm-up.

| Nodes / links | Scenario | Before (ms) | After (ms) |
|---|---|---:|---:|
| 1001 / 500 | First preparation | 68.38 | 17.37 |
| 1001 / 500 | Unchanged redraw | 3.16 | 2.26 |
| 1001 / 500 | Distant node movement | 60.04 | 2.52 |
| 1001 / 500 | Local obstacle movement | 62.34 | 7.94 |
| 2001 / 1000 | First preparation | 232.84 | 29.50 |
| 2001 / 1000 | Unchanged redraw | 5.99 | 3.91 |
| 2001 / 1000 | Distant node movement | 212.36 | 6.47 |
| 2001 / 1000 | Local obstacle movement | 229.49 | 19.63 |
| 4001 / 2000 | First preparation | 835.99 | 53.15 |
| 4001 / 2000 | Unchanged redraw | 13.36 | 8.83 |
| 4001 / 2000 | Distant node movement | 617.30 | 10.26 |
| 4001 / 2000 | Local obstacle movement | 563.82 | 37.62 |

## What changed

- Broad-phase rectangle queries avoid scanning all nodes for each clear route. Exact segment validation still decides collisions. Blocked routes retain full-scene avoidance.
- Route caches invalidate conservatively when an added, deleted or moved rectangle intersects the bounds of either authored or displayed geometry. Endpoint and detour-setting changes also invalidate. Missed scene versions force recomputation.
- Numeric comparisons replace JSON serialization for frame geometry.
- Canvas paths, overlap stroke paths and midpoints survive unchanged redraws. The 2,000-link case creates zero new Path2D objects over 12 warm frames, versus 24,000 before. Only five new base paths are created over three local movements, rather than 6,000.
- Graph fingerprint scans during automatic job staging are throttled, with an unconditional final check. This change is covered by cancellation/graph-mutation regression tests; the table does not benchmark automatic batch routing.

## Validation and limits

Before/after geometry SHA-256 hashes match for every benchmark run, covering initial, warm, distant movement and local obstacle movement. Spatial queries match brute-force results for 1,002 rectangles and 250 deterministic random queries. Existing simulated UI, worker, shared-endpoint, independent maze and real libavoid scene tests pass.

The fixture is a sparse arrangement of node pairs and horizontal links, with a moving obstacle. It does not establish performance for all dense graphs. The canvas API is simulated, so this measures CPU preparation and allocation, excluding actual browser drawing, GPU cost, node widgets, browser garbage-collection behavior and other extensions. No live ComfyUI session was used. Cold drawing remains synchronous, and blocked-route searches can still cost more in dense scenes. The global overlap index still rebuilds when route geometry changes.

## Reproduction

Run `node tests/performance.mjs 2000` from the extension folder. The optional third argument selects another main extension source file (for example, v0.4.1) while using this package’s geometry dependencies, which did not change in this release. Raw samples are in `tests/performance_results.json`.
