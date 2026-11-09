> Historical technical notes. As of v0.3.6, the five optional appearance policies and their code have been removed; see README.md for current behavior.

# Routing and efficiency review — v0.1.22

The release adds Alt+L to lock/unlock a selected route. Key repeats, text editing, drawing, dragging and read-only mode are excluded. This review evaluates the current routing implementation; the broader algorithmic changes recommended below are not implemented in this release.

## Verdict

The geometry and shortest-path architecture are defensible. The current router is a bounded heuristic rather than an exact global optimizer. Its main quality limitations are incomplete lane placement, discretization-dependent style discounts, grid-size fallback, and order-dependent batch optimization. The background worker protects UI responsiveness but does not reduce total computational work.

## Mathematical model

A route is an orthogonal polyline. Its length is Manhattan length: the sum of absolute changes in x and y. Search state combines an intersection with arrival direction. Direction is necessary because corner costs depend on the previous segment.

The objective combines travelled length, bend penalties, connection-intersection penalties, parallel-spacing/overlap penalties, and discounts for highways or node-boundary proximity. There is also a hard length budget. This is a resource-constrained shortest-path problem: score is the objective and travelled length is the constrained resource.

At a fixed position/direction, a label can safely dominate another when its score and travelled length are no worse, with bend count breaking exact ties. The implementation now keeps multiple labels, as resource-constrained methods require. However, capping the frontier at four labels intentionally discards some potentially useful alternatives. The 4096-intersection limit and sampled references introduce further approximations. Therefore globally minimum crossings, globally fewest corners, or universal spacing guarantees cannot be claimed.

The heuristic uses 0.65 times remaining Manhattan distance when preferences are active. The current style discounts total at most 35%, and all other penalties are nonnegative, so this is a valid lower bound on the remaining search cost under the current scoring formula. Changing discounts without updating this bound could invalidate the A* assumption.

Independent routes interact through the references. Two deterministic routing sweeps improve local interactions but do not solve a simultaneous global graph-layout optimization. Their result can depend on routing order and the initial routes.

## Comparison with authoritative resources

Boost Graph's resource-constrained shortest-path documentation describes labels, feasibility and dominance checks. These support the use of multi-label state here; the four-label cap is a deliberate approximation rather than an exact implementation of that method.

The ESA 2025 paper “A Fast and Simple Algorithm for the Resource Constrained Shortest Path Problem” presents A* with resource heuristics and lazy dominance. It is a useful reference for more selective label processing, but its benchmark results cannot be transferred directly to this browser implementation or its routing objective.

libavoid uses connector search, crossing checks/rerouting and dedicated orthogonal nudging phases. It exposes segment penalties, obstacle buffers, shared-path penalties and preferred lane separation. This is the most relevant architectural comparison. Magik currently models spacing primarily as penalties during search; it has no complete global lane-ordering/nudging phase. This explains why turning on Avoid overlap does not guarantee clean evenly spaced lanes.

## Confirmed new issues

### Style score depends on artificial edge splitting

A highway reference spanning x=0..10 at y=8 rewards a candidate edge x=0..100 at y=0 for its entire length. The resulting cost is 80. Splitting the identical physical candidate at x=10 produces cost 98. The issue is the boolean “any shared parallel span” test followed by a discount for the entire edge. Along-node scoring also uses a midpoint test instead of measuring the length actually alongside a boundary.

The score should be an integral of local cost along the edge, or equivalently a sum over covered intervals. Calculate the union of highway-covered and node-edge-covered intervals, discount only those lengths, and apply the same scoring to final route comparisons. This makes the objective invariant to inserting a redundant collinear vertex.

### Grid-size fallback can masquerade as routing impossibility

A synthetic scene with 32 rectangles, each having distinct x/y boundaries, already exceeds the 4096-intersection cap. These obstacles occupy a region away from an available horizontal-then-vertical path, yet search immediately returns a fallback. Synthetic scenes with 48 and 64 such rectangles behave similarly. Runtime is low because routing is skipped, not because an optimal route was quickly found.

Replace the Cartesian product of all rails with a sparse orthogonal visibility graph or stronger spatial/corridor filtering. Report “search limit” separately from “no feasible path” to make compromises understandable.

### Frontier cap does not cap total label allocations

At most four active labels are kept per state, but inactive label records and heap entries remain allocated so predecessor reconstruction stays valid. The active-frontier cap is therefore not a strict whole-job memory bound. Introduce diagnostics and an explicit expansion/record budget, then consider compact records, heap cleanup or reusable arrays.

## Measurements

Runtime: Node.js v24.19.0 in the workspace, not Firefox on the user's computer. Five measured iterations after one warm-up. Deterministic synthetic layouts; one connection per iteration. Routing timing includes final attachment/repair. Worker startup, message cloning, rendering and whole-workflow batch costs are excluded.

| Layout | Obstacle rectangles | Reference connections | Route median | Shortcut median | Validation median | Direct fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| Small | 6 | 4 | 3.78 ms | 0.42 ms | 0.01 ms | 0/5 |
| Medium | 18 | 12 | 3.92 ms | 0.63 ms | 0.01 ms | 0/5 |
| Dense fixture | 36 | 24 | 8.19 ms | 0.54 ms | 0.06 ms | 0/5 |

The dense fixture reuses several boundary coordinates; it does not expose the same grid growth as the distinct-coordinate failure fixture. These are illustrative measurements, not a worst-case or real-workflow performance guarantee.

## Efficiency concerns in the code

- Each route reconstructs its coordinate graph and repeatedly scans obstacles and reference segments for candidate edges. Cache obstacle geometry and adjacency for a batch and use spatial indexes for collision/reference queries.
- The full graph fingerprint is serialized before/after many worker operations. A graph revision counter plus a targeted immutable snapshot would reduce repeated main-thread work.
- Final validation sends all other route geometry for each connection. Message cloning and validation can approach quadratic growth with connection count. Keep batch geometry in the worker and send deltas/job IDs instead.
- Shortcut cleanup tests up to 600 candidates and repeatedly normalizes references and tests collisions. Prepare reference segments and obstacle indexes once per job.
- Route metadata and pins still receive work during rendering. Move metadata normalization to edits/load events and cache rendered paths until endpoints or settings change.

## Recommended order

1. Make highway/along-node score invariant to edge subdivision.
2. Add explicit lane assignment/nudging after route search.
3. Use a sparse visibility graph and spatial indexing.
4. Keep batch state in a persistent worker and reduce full snapshots/message copies.
5. Add expansion/memory diagnostics and benchmark real exported workflows in Firefox.

The existing regression suite and worker checks pass, including Alt+L toggle/repeat/typing protection. Live ComfyUI shortcut handling, undo/redo, browser-specific worker overhead, and extension conflicts remain unverified.

## Sources

- Boost Graph: https://www.boost.org/doc/libs/latest/libs/graph/doc/html/graph/algorithms/shortest_paths/r_c_shortest_paths.html
- ESA 2025 research paper: https://drops.dagstuhl.de/storage/00lipics/lipics-vol351-esa2025/html/LIPIcs.ESA.2025.97/LIPIcs.ESA.2025.97.html
- libavoid routing phases and parameters: https://www.adaptagrams.org/documentation/namespaceAvoid.html
- libavoid router API: https://www.adaptagrams.org/documentation/classAvoid_1_1Router.html

The orthogonal-routing paper hosted at the University of Melbourne was located but its PDF was blocked during retrieval, so this review does not attribute unverified claims to that paper.

## v0.1.23 implementation update

The three leading recommendations are now implemented in bounded form:

- Style discounts use covered interval lengths, with split/unsplit regression checks. The original 80-versus-98 example now scores 98 in both cases.
- A dedicated post-routing lane-separation phase attempts nearby parallel shifts, validates them and leaves socket/locked constraints intact. It is a bounded nudging heuristic rather than a full simultaneous lane-ordering solver.
- Cartesian grids exceeding 4096 intersections now use sparse boundary/endpoint/frame projections and visibility edges. The 32-, 48-, and 64-obstacle distinct-coordinate fixtures now find collision-free routes, taking approximately 12–19 ms in one local run instead of immediately returning fallback.

For the earlier warmed fixtures, a later run measured route medians of 3.14, 5.22 and 11.77 ms. The interval scoring is more accurate but adds work; these changes should not be presented as a universal speed-up. Main-thread snapshots, message copying, comprehensive memory/expansion limits, and Firefox profiling remain future work.
