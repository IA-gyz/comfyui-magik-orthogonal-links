# Worker transport performance — v0.4.5

Routing workers now retain immutable job obstacle bounds and reuse previously transferred reference paths. Main-thread jobs use a fresh encoder. The first obstacle request resets the worker decoder, including cached native workers; empty obstacle arrays also reset. Endpoint exemptions are encoded as obstacle indices and reconstructed against the resident array, preserving identity. Reference objects are treated as immutable snapshots; current integration replaces them on every route update.

Planning reference lists preserve exact order. Finishing reference maps send replacements while retaining their full original membership/order. All geometry and global finishing pass ordering remain unchanged. Each response still yields to the event loop, and finishing chunks remain bounded. Cancellation terminates the worker, while graph/settings/read-only guards and atomic commit remain active. Legacy worker messages and main-thread fallback remain supported.

## Measurements

Three independent Node processes per version and fixture, median total automatic-routing time. Baseline v0.4.4 uses its original messages against the same geometry code. Actual worker_threads transport uses structured cloning. Raw samples are in tests/worker_transport_results.json.

| Connections | v0.4.4 | v0.4.5 | Reduction |
|---|---:|---:|---:|
| 80 | 183.82 ms | 154.04 ms | 16.2% |
| 160 | 341.05 ms | 282.16 ms | 17.3% |
| 500 | 1385.88 ms | 1090.19 ms | 21.3% |

All before/after render and committed-route hashes match across all samples. A 500-connection cancellation fixture stopped in 77.4 ms and committed zero routes. The first obstacle-only prototype did not consistently improve smaller fixtures; reference-path reuse accounts for the useful additional gain.

## Limits and verification

These are synthetic CPU/worker measurements, not a live ComfyUI browser or GPU profile. Browser transport cost and real workflow topology will differ. Transport dictionaries retain earlier reference versions for the duration of a job; this trades additional job-scoped memory for reduced cloning. Successful native workers retain the last scene until the next job or worker disposal, as they already retain native scene data. No global optimum or new routing behavior is claimed.

Tests cover real worker scene resets, exact endpoint exemption identity, repeated/updated reference objects, sequential finishing equivalence, legacy requests, read-only changes during finishing, worker lifecycle, cancellation, spatial/reference indexes, independent maze comparisons, shared endpoints and real WASM routing.
