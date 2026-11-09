# Manual routes, shared work and memory — v0.4.18

## Implementation

Manual seeds are cached with detached copies of corner/pin values and compared numerically on every use. Socket coordinates must also match. This detects in-place edits and replacement arrays, without serializing route metadata. Only the seed is reused: obstacle invalidation still starts from intended geometry rather than a previous detour. Automatic/manual transitions update the cache mode even when their resulting geometry matches.

Preparation already resolves socket positions. Route handling now reuses these coordinates after confirming the node identities still match current graph lookups. Painting independently validates current route metadata and sockets, and reuses the seed from preparation when those values match. It does not blindly trust a frame-wide route record. Each getRoute call reads socket positions once rather than twice; motion arrays are replaced only when positions change. Slot positions remain copied before storage. Disabling the extension clears the live-path cache, releasing detached manual snapshots.

## CPU measurements

Seven independent processes per version/type, alternating order, 1,000 links. Node synthetic stub-canvas harness; median process results. Each process includes 12 static frames and three local moves. Manual fixtures assert that their records were accepted and rendered as manual paths.

| Routes | Metric | v0.4.17 ms | v0.4.18 ms |
|---|---|---:|---:|
| Manual | Cold | 68.19 | 71.64 |
| Manual | Static | 14.26 | 6.32 |
| Manual | Local move | 34.80 | 30.68 |
| Automatic control | Cold | 34.31 | 32.74 |
| Automatic control | Static | 3.36 | 3.80 |
| Automatic control | Local move | 10.72 | 8.71 |

Manual static CPU falls about 56%, local movement about 12%; cold manual rendering is about 5% slower. The automatic static control is about 13% slower in these runs, while movement is faster. No general automatic-route gain is claimed. Cache snapshots add allocation at first use in exchange for avoiding repeated manual construction. Browser/GPU timing remains unverified. Raw results: tests/manual_route_results.json and automatic_control_results.json.

## Accelerated memory soak

Run: `node --expose-gc tests/performance.mjs 1000 - --memory`.

120 fresh workflows of 1,000 manual links, six frames each: two initial frames, in-place corner edits, partial route resets/link deletions, and disabled/enabled rendering. Totals: 720 frames, 120,000 created links, 120,000 corner edits, 60,000 route resets and 24,000 link deletions. Graph and first-link WeakRefs sample 240 retired objects. Each 10-cycle checkpoint yields to the event loop before forced GC. Final cleanup switches to an empty graph and yields/collects twice; retained sampled objects fail the test.

| Measurement | Baseline | Current |
|---|---:|---:|
| Post-GC heap, cycle 10 | 16.57 MiB | 16.90 MiB |
| Post-GC heap, cycle 120 | 15.33 MiB | 15.63 MiB |
| Post-GC heap, empty workflow | 10.94 MiB | 10.98 MiB |
| RSS, cycle 10 | 345.54 MiB | 348.60 MiB |
| RSS, cycle 120 | 349.05 MiB | 351.84 MiB |
| Retired sampled objects still reachable | 0 / 240 | 0 / 240 |

Post-GC heap settles instead of increasing with workflow count. Manual snapshots cost roughly 0.3 MiB with this fixture loaded. RSS stays much higher than live JS heap because it includes runtime/allocator high-water memory; emptying a workflow does not force the OS allocation to shrink. External memory remains about 3.74 MiB and ArrayBuffers 0.20 MiB across checkpoints. Raw samples include heapTotal, heapUsed, RSS, external and ArrayBuffers in tests/memory_soak_{baseline,current}.json.

This is an accelerated Node test with simulated canvas paths, not an hours-long browser run. Only sampled retired objects are tested for collection. Native workers, WASM heaps, browser listeners, GPU Path2D storage and other extensions are outside this measurement; existing native lifecycle suites run separately. No universal leak-free claim is made.

## Correctness

All benchmark geometry hashes match v0.4.17. Ordered paint hashes match in four manual/automatic/dense/bordered/disabled fixtures. UI checks cover in-place corner edits, automatic/manual transitions, changed endpoints between preparation and painting, and exactly two socket reads per manual paint. Full UI, geometry, worker, native, snapshot and incremental-index regressions pass.
