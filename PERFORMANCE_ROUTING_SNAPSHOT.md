# Routing-state checks — v0.4.13

Previously every throttled graph check rebuilt nested node/link arrays and serialized all guarded geometry into one JSON string. The new job snapshot copies route metadata once and compares node positions/sizes, collapse flags, input link bindings, route metadata and endpoint tuples directly. Route-point arrays are traversed without allocating temporary point arrays or JSON strings. Mutable objects with custom toJSON use a serialization fallback; ordinary route records use structural comparison. Object/key checks are deliberately conservative and may reject changes that JSON would ignore.

## Snapshot and commit safety

The job captures graph/node/link identity before its first yield. Deep snapshot capture runs in preparation chunks, with the original full fingerprint guarding the capture phase. The existing full fingerprint remains the forced check before worker creation and before commit. Forced checks also verify original node/link object identity.

The transaction callback performs another forced check after graph.beforeChange(), before any route is saved. This closes a pre-existing gap where a synchronous listener could modify the same graph between the outer check and the first write. Same-graph mutation is tested independently of graph replacement. All snapshot state is scoped to the job and is released after its worker handlers/job are cleared.

## Focused measurements

A synthetic fixture with 5,000 nodes, 5,000 links and eight vertices plus pins per route used 25 alternating timed samples after warmup in one Node process. Median repeated full fingerprint checks were 12.19 ms; structural checks were 8.05 ms: 34.0% lower. Raw samples are in tests/routing_snapshot_results.json.

The focused script's synchronous one-time snapshot capture measured 58.50 ms in that cold run. Production uses chunked capture rather than this synchronous convenience constructor, and incurs additional yields/guard overhead. Snapshot data also consumes temporary memory. The repeated-check savings amortize this cost on long jobs; short jobs may take longer overall. No end-to-end speedup is claimed. Initial/final fingerprint serialization remains synchronous and linear in guarded geometry.

## Verification and limitations

- 1,000 generated mutations are rejected when the old fingerprint changes; directed tests cover bounds, collapse flags, bindings, route points/pins/locks/signatures/saved fields, nested additions/removals, node/link additions/deletions/order and endpoint changes.
- Identical serialized node/link replacements are additionally rejected by identity.
- Map/object link containers, typed sizes, null inputs and mutable toJSON values are covered.
- Deferred capture yields, rejects intervening mutation through its guard and completes unchanged scenes.
- UI transaction-hook mutation applies no staged routes. Preparation cancellation/read-only/settings/graph-change and pure painting tests still pass.
- A 500-link worker run has identical before/after render and committed-route hashes/counts. The raw single-run timings in tests/snapshot_routing_check.json are equivalence evidence, not a performance comparison.
- Existing geometry, index, worker, native scene and large-coordinate lane-8/12 suites pass.

These are synthetic Node CPU results. Live browser/GPU profiling remains outstanding. Changes are still detected on the existing periodic schedule, with forced full checks protecting worker startup and commit; this is not an event-driven mutation tracker or a global optimality change.
