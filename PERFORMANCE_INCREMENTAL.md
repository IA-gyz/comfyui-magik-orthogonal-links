# Incremental performance — v0.4.3 versus v0.4.2

Three independent processes per version/scenario. Each process measures 12 static frames, five distant-node movements and three local-obstacle movements. Table entries are medians of the three process results. Worker-routing times include routing, finishing and commit through a Node worker adapter.

| Scenario | Before (ms) | After (ms) |
|---|---:|---:|
| 4001 nodes / 2000 links: Idle redraw | 7.12 | 7.95 |
| 4001 nodes / 2000 links: Distant movement | 11.12 | 8.64 |
| 4001 nodes / 2000 links: Local movement | 34.27 | 15.42 |
| 500 shared links: Idle redraw | 60.99 | 61.78 |
| 500 shared links: Distant movement | 63.86 | 60.19 |
| 500 shared links: Local movement | 175.30 | 125.88 |
| Automatic JavaScript routing, 80 links, worker | 430.31 | 359.34 |
| Automatic JavaScript routing, 160 links, worker | 960.65 | 721.70 |

## Implementation

- Incremental overlap events retain route contributions, sweep only dirty horizontal/vertical lines, and preserve line dependencies when visible counts are unchanged. Canvas stroke paths are reused where their geometry is identical. A single busy line may still require resweeping all its contributors.
- Obstacle leaves and ancestor bounds are refitted for local movement. Insertions/deletions, large updates and 128 refit rounds trigger rebuilding to prevent long-term tree degradation. Node enumeration and change detection still scan the scene.
- Bounding-box candidates are checked against actual authored and displayed segments before invalidation. Endpoint changes and touched detours remain invalidating.
- Finishing stages cross the worker boundary in chunks of 64 instead of one connection per message. All polish chunks run before any nudge pass, and final validation sees all final references. Jobs below 32 connections and no-worker execution keep the previous path. Worker operations remain bounded by the existing timeout; dense scenes can still be expensive.

## Verification

Geometry hashes match in every before/after process, including worker-produced stored route points. Incremental overlap results match full rebuilding across 400 edits. Obstacle refits match brute-force queries over 300 movement rounds and 1,500 queries, with insertion/deletion and periodic rebalancing coverage. Real-worker finishing matches sequential polish/two-nudge/validate passes, including chunks of seven in the equivalence test. A simulated UI test changes read-only state during finishing and verifies that no staged route is committed. Existing interaction, independent maze, shared-endpoint and real WASM scene tests pass.

## Limits and reproduction

These fixtures cover sparse node pairs and a dense fan-in with 500 links sharing a target and many segments. Canvas drawing is simulated; actual GPU painting, browser garbage collection, widgets and other extensions are excluded. Large shared-segment layouts still perform many strokes under the N×base-thickness rule. Idle-frame times are roughly unchanged and can be slightly slower. This release does not claim a universal speedup or live ComfyUI FPS improvement.

Use `node tests/performance.mjs 2000`, add `--dense` for shared links, or use `node tests/performance.mjs 160 - --route --worker` for automatic routing. The optional third argument selects a prior main source; MAGIK_BENCH_HELPERS can select its prior helper directory. The comparison used unmodified v0.4.2 main/overlap/spatial-cache code and unchanged geometry dependencies. Raw samples are in tests/incremental_performance_results.json.
