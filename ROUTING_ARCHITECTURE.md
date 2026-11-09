> Historical technical notes. As of v0.3.6, the five optional appearance policies and their code have been removed; see README.md for current behavior.

# Routing architecture, v0.3.0

## Geometry and policy stages

Shared predicates operate in graph coordinates. Node rectangles are expanded before routing; open interiors block edges, boundaries remain usable. `visibility_graph.js` constructs rail or bounded sparse graphs, memoizing clear neighbours. `route_search.js` provides direction-aware resource-constrained A*, with an injected objective and four active non-dominated labels per state. Inactive parent records remain for reconstruction. This is a bounded heuristic, not an unrestricted A* optimality guarantee or a canonical one-bend graph implementation.

`geometry.js` owns socket adapters, policy scoring, local preservation/repair, validation and lane nudging. Synchronous rendering/dragging/previews use `buildAvoidingPath`. The explicit JavaScript auto-router retains its existing two-sweep policy pipeline.

## Shared native scene

`libavoid_scene.js` maintains a `NativeRoutingScene` containing one Router, shape records by node ID, connector records by link ID, and directional pins. Each snapshot includes expanded rectangles, eligible connections and immutable external reference paths. Removed or changed connectors are detached before shape removal or pin-offset changes. Changed rectangles use the pinned binding's three-argument `moveShape_poly(shape, polygon, false)`; this moves/resizes the existing obstacle and allows libavoid to invalidate visibility/routes. Unchanged connectors keep their native objects; changed endpoint geometry rebuilds the affected connector and pins. Configuration changes rebuild connectors to force reevaluation under the new native parameters.

All requested native connectors are present before one `processTransaction()` call. Its result is copied to JavaScript, freeing native polygon/point copies. Native candidates pass the same socket/obstacle/policy selector used by the isolated adapter, with other shared candidates and locked/unselected reference paths. A JavaScript candidate may win. Post-selection JavaScript polishing and lane nudging can change the collective native solution. Final batch validation and graph fingerprint checks run before an atomic commit.

The binding has no fixed-route setter. Locked/unselected connections are therefore excluded from movable native connectors and remain external JavaScript references. Native hyperedge routing is not enabled. Global optimality, perfect spacing, and stability of every route are not guaranteed.

## Worker lifecycle

The successful native worker is retained per active graph, with its message handlers cleared between jobs. Subsequent batches reuse the scene; cancelled/failed batches terminate their worker. Graph switches, engine changes and disabled rendering release an idle cache. The graph fingerprint and enabled/read-only guards reject staged results after edits. Shared transactions have a 45-second timeout; individual polish/nudge/validation jobs keep 15 seconds. Without Worker support, one main-thread scene is used for the batch and disposed at completion; incremental reuse across batches and mid-call native cancellation require the worker.

A cached native candidate scene need not equal the last JavaScript-polished visual paths. The candidate selector and final validation check the requested snapshot rather than trusting native success. Each module realm keeps at most one shared native scene and resets it for a new scene identity or runtime, bounding retained scene state.

## References

- Wybrow, Marriott, Stuckey. Orthogonal Connector Routing. GD 2009 / LNCS 5849 (2010), 219–231. https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf
- Marriott, Stuckey, Wybrow. Seeing Around Corners: Fast Orthogonal Connector Routing. Diagrams 2014, 31–37. https://users.monash.edu/~mwybrow/papers/marriott-diagrams-2014.pdf
- Wybrow, Marriott, Stuckey. Incremental Connector Routing. GD 2005 / LNCS 3843 (2006), 446–457. https://users.monash.edu/~mwybrow/papers/wybrow-gd-2005.pdf
- Wybrow, Marriott, Stuckey. Orthogonal Hyperedge Routing. Diagrams 2012, 51–64. https://users.monash.edu/~mwybrow/papers/wybrow-diagrams-2012.pdf
- Hart, Nilsson, Raphael. A Formal Basis for the Heuristic Determination of Minimum Cost Paths. IEEE TSSC 4(2), 1968, 100–107. https://doi.org/10.1109/TSSC.1968.300136
- Lee. An Algorithm for Path Connections and Its Applications. IRE TEC EC-10(3), 1961, 346–365. https://doi.org/10.1109/TEC.1961.5219222
- libavoid overview: https://www.adaptagrams.org/documentation/libavoid.html
- JavaScript/WASM port: https://github.com/Aksem/libavoid-js


## Native copy ownership review

The pinned binding returns independent owned polygon copies from `displayRoute()` (two calls are not aliases). Those copies and their point copies are explicitly released. Router-owned shapes, pins and connectors are released only through the router. Tests instrument the actual WASM binding to verify that each returned route copy is deleted after a transaction, rather than inferring ownership from the C++ method signature.
