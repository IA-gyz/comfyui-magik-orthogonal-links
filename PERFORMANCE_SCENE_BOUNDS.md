# Scene bounds checks — v0.4.15

Static frames reuse matching rectangle arrays and item objects, and return the existing scene before sceneDelta/index updates. Bounds are still collected for every node; custom getBounding changes, settings changes, removals and invalid bounds remain observable. Scene-delta fallback builds its Map directly and preserves legacy change ordering, duplicate-ID behavior and Map key semantics.

## Measurements

Seven independent processes per version/size, alternating order, Node synthetic canvas harness. Each process measures 12 static frames and three local moves; table reports the median process result. Raw outputs are in tests/scene_bounds_results_*.json. No browser or GPU measurement.

| Connections | Metric | v0.4.14 ms | v0.4.15 ms |
|---|---|---:|---:|
| 1,000 | Cold | 34.64 | 32.71 |
| 1,000 | Static | 4.51 | 3.44 |
| 1,000 | Local move | 9.96 | 11.68 |
| 5,000 | Cold | 116.84 | 115.67 |
| 5,000 | Static | 21.83 | 20.93 |
| 5,000 | Local move | 51.94 | 46.61 |

Static CPU improves about 24% and 4% respectively. Local movement varies, including a slower 1,000-link result; this change does not establish a general movement improvement. Per-node bounding-box calls and route rendering remain linear work.

Geometry hashes match across all measured runs. Ordered paint hashes match for regular and dense bordered/disabled fixtures. Scene deltas match a frozen oracle in 1,000 cases including reorder, addition, deletion and duplicate IDs. UI regression checks custom bounds changing without node motion and nonfinite bounds disappearing. Existing routing, worker, incremental-index and native regression suites pass.
