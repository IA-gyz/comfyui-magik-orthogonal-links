# Reference selection and worker scheduling — v0.4.4

## End-to-end automatic routing

Compared with v0.4.3 using three independent Node processes per version and scene. Values are median total JavaScript routing times through a real Node worker adapter, including finishing and commit.

| Links | v0.4.3 (ms) | v0.4.4 (ms) |
|---|---:|---:|
| 80 | 397.80 | 200.69 |
| 160 | 775.21 | 349.77 |
| 500 | 2576.18 | 1275.90 |

The reference-index-only experiment showed no material end-to-end improvement in these sizes. The larger total-time gain came after removing a redundant setTimeout after every worker response: awaiting a real worker message already returns control to the event loop. Explicit timer yielding remains in the no-worker fallback.

## Isolated reference lookup

10,000 reference origins, 300 nearest-64 queries, three runs within one process:

- Full filter/sort: 2740.78 ms.
- Indexed queries: 16.76 ms.
- Index construction: 17.75 ms, once per job.

The tree stores origin positions, IDs and insertion ranks. Equal distances retain the original stable-sort order, including coincident outputs. Current path geometry is read from the caller’s Map after selection. Origins must remain fixed for the job; graph-change guards discard staged results after edits. Small sets use sorting, and non-finite coordinates retain the legacy fallback ordering. Finishing and validation still consider their full reference sets.

## Verification and limitations

Every before/after process produced matching display-geometry and stored-route SHA-256 hashes. Selection tests compare the actual returned ID order with full stable sorting across random scenes, mixed ID types, tied/coincident positions and extreme/non-finite coordinates. Real-worker cancellation after a timer produced zero committed routes. Existing UI interaction, worker-chunk equivalence, spatial/overlap oracles, independent maze and real libavoid tests pass.

Canvas painting and node widgets are simulated. The end-to-end timing uses sparse node pairs, JavaScript routing and Node worker messaging, not a live browser or a large native-libavoid benchmark. Native integration is covered by existing real WASM tests. These results do not establish browser FPS or a universal factor of improvement. Browser timer scheduling and the proportion of search versus messaging work affect real gains.

Raw samples: tests/reference_lookup_results.json and tests/reference_routing_results.json. Reproduce with the commands in README.md. The third argument of tests/performance.mjs can select the v0.4.3 main source for comparison; geometry, overlap and obstacle helpers did not change in this release.
