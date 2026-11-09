# Validation efficiency — v0.4.6

Pruning and lane nudging examine multiple candidate routes against a fixed reference snapshot. They now normalize reference paths once per operation and reuse the normalized paths for validation. The cache is private and operation-scoped; standalone public validation always normalizes current inputs. No references or caller options are mutated.

Parallel segments outside both the overlap epsilon and lane-distance threshold cannot contribute to any report field. Validation now rejects them before shared-socket span clipping and temporary interval allocation. Crossing checks, overlap/lane thresholds, accumulation order and obstacle exemptions are unchanged.

## Measurements

Three independent processes per version/fixture, median total automatic routing using actual Node workers. Baseline is the complete frozen v0.4.5 JavaScript directory, including its worker. The benchmark worker adapter now loads the supplied entry URL rather than always loading the current worker. Raw samples and hashes are in tests/validation_performance_results.json.

| Connections | v0.4.5 | v0.4.6 | Reduction |
|---|---:|---:|---:|
| 80 | 152.11 ms | 142.65 ms | 6.2% |
| 160 | 274.56 ms | 240.85 ms | 12.3% |
| 500 | 1005.27 ms | 859.51 ms | 14.5% |

Every before/after render and committed-route hash matches across all samples. A 500-connection cancellation test stopped in 79.6 ms with zero routes committed. Measurements are synthetic CPU/worker results, not live ComfyUI browser or GPU profiling; real-world speedups will depend on topology and routing complexity.

## Verification

The frozen pre-change exhaustive validator in tests/validation_oracle.mjs matches the new validator for 1,500 generated combinations of routes, references, obstacles and exemptions. Tests also cover distances immediately around epsilon/lane thresholds, shared endpoints, in-place reference mutation between calls, caller immutability, and final reports from pruning/nudging.

Existing simulated UI tests, real worker transport/finishing parity tests, reference and obstacle index oracles, shared-endpoint regressions, 150 independent maze comparisons and real libavoid WASM scene lifecycle tests pass. Geometry algorithms, candidate budgets, sequential finishing order and atomic commit are unchanged.
