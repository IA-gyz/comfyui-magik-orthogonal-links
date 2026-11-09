# Automatic route seed reuse — v0.4.17

Previously every liveRoute call rebuilt and simplified the automatic seed, including both preparation and paint in unchanged frames. The seed depends only on the two socket positions and the fixed default stub. The live-route cache now marks automatic seeds and reuses one only when both endpoints match. Manual routes and native reroute chains still construct their geometry as before.

This does not bypass the origin/target identity, detour setting or scene-version checks. Obstacle changes still invoke avoidance starting from the original seed, so detours disappear when obstacles move away. Manual-record creation/edit/removal is observed on each call. No extra per-link point snapshots are allocated.

## Measurements

Seven independent processes per version/size, alternating baseline/current order. Node synthetic stub-canvas harness: median process results, with 12 static frames and three local moves per process. No browser or GPU timing.

| Connections | Metric | v0.4.16 ms | v0.4.17 ms |
|---|---|---:|---:|
| 1,000 | Cold | 33.77 | 32.75 |
| 1,000 | Static | 3.77 | 2.95 |
| 1,000 | Local move | 9.53 | 7.63 |
| 5,000 | Cold | 120.92 | 115.97 |
| 5,000 | Static | 19.16 | 17.99 |
| 5,000 | Local move | 45.06 | 42.40 |

Static CPU falls about 22%/6%; local-move CPU about 20%/6%. The fixtures primarily contain automatic routes, so gains do not predict manual-route-heavy workflow performance. Raw outputs: tests/automatic_seed_results_*.json.

## Validation

Geometry hashes match in all measured runs. Ordered paint hashes match in regular, dense and dense bordered/disabled fixtures. UI regressions check independently changed socket coordinates, transitions between automatic and edited manual routes, moving obstacles, and custom bounding boxes without node motion. Existing UI, geometry, worker, native, snapshot and incremental-index suites pass.
