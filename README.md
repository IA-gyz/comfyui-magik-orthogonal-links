# Magik Orthogonal Links — v0.6.5


## Live pulsing connected-node and socket highlighting (v0.6.5)
Connected input/output sockets at both ends of each relevant link now receive a pulsing coloured halo, bright centre, and white outline: yellow for upstream links and blue for downstream links.


While dragging a node, its immediate upstream neighbours are highlighted with a translucent yellow overlay and its immediate downstream neighbours with a translucent dark-blue overlay. The overlays update during the drag and disappear on pointer release; they do not remain after the move.

A frontend-only ComfyUI extension that draws horizontal and vertical connections while using ComfyUI’s normal connection-creation gestures. No additional nodes, Python dependencies, or changes to generation are required.

## Installation

1. Extract this archive into your ComfyUI `custom_nodes` directory.
2. Confirm the structure is `custom_nodes/magik_orthogonal_links/__init__.py` and `custom_nodes/magik_orthogonal_links/js/`.
3. Restart ComfyUI and hard-refresh Firefox with Ctrl+Shift+R.
4. Use the **Canvas / LiteGraph renderer**. Disable Nodes 2.0 / Vue nodes if enabled.

The browser console should show `[Magik Orthogonal Links] ready — Canvas renderer. Create links normally; click a route to edit.` This is an extension, so there is no node to add.

This release targets Canvas rendering. It does not implement Nodes 2.0 / Vue rendering. It was checked against the current upstream Canvas interfaces and tested with simulated graph/browser objects; it has not been verified in a running ComfyUI instance. Other extensions that replace link rendering or intercept socket gestures may conflict.

## Creating connections

Create and reconnect links using ComfyUI’s normal socket drag-and-drop: drag an output to an input, or use the reverse direction supported by your frontend. ComfyUI handles validation, occupied inputs, Shift gestures, cancellation and its Link Release actions. The in-progress preview uses the native renderer. Completed links are drawn orthogonally and avoid nodes through the extension’s existing live routing.

There is no click-by-click path creation, custom drawing history, Ctrl elbow switching or extension right-click release override. The old horizontal-first preview setting and cancel-drawing menu entry have been removed. Existing saved routes remain readable. After connecting, drag the route to add a mandatory waypoint, double-click to add/remove one, or use automatic routing.

Alt+click socket/route highlighting remains available as described below. Native connection creation is delegated to your installed ComfyUI frontend; the extension no longer creates graph links itself.

## Tracing connected routes

- A socket-hover tooltip explains **Alt+click** to pin an amber highlight and **Empty canvas or Escape** to clear highlighting.
- Hover an output socket to outline all its outgoing routes in cyan, or an input socket to outline its incoming route.
- **Alt+click a route** to pin an amber outline on that connection alone, including locked routes. This does not start a drag or change its geometry.
- **Alt+click a socket** to pin an amber outline. Move away and the highlight stays. Click empty canvas or press Escape to clear it.
- Normal socket clicks still start drawing, and Shift gestures remain native. Tracing also works in read-only mode, changes no route metadata and creates no undo entry.
- Original link colours, overlap thickness, flow arrows and locked patterns remain visible. Pins belong to exact node/socket objects and do not transfer to replacement sockets or other workflows. Leaving the canvas clears temporary hover highlighting; window blur retains a pinned trace.

## Arranging nodes

Right-click the canvas or a node and choose **Automatically arrange selected nodes** or **Automatically arrange all nodes**.

The layout follows connections from left to right, packs nodes into columns using their current visible bounds, and uses a few ordering passes to reduce crossings. Cycles share a column; disconnected nodes are stacked. It starts near the current upper-left bounds of the affected nodes. Selected-only mode leaves other nodes stationary and avoids their rectangles. Nodes marked pinned are also left in place.

Affected unlocked connections are routed automatically after the move, independently of the Route on Drop setting. Locked route metadata remains protected; normal endpoint adaptation still applies when its nodes move. Node movement is one undo transaction; automatic link routing is recorded separately. No-op layouts create no position undo entry. Read-only mode, an active route-edit gesture, or an active routing job disables arrangement. Group frames and native reroute points are not repositioned by this node-only layout.

## Waypoints: editing the route

A waypoint is a mandatory world-space point the connection must visit, in order. Solid blue diamonds represent waypoints; automatic bends have no handles. The router chooses horizontal/vertical paths between the endpoints and waypoints.

| Action | Gesture |
|---|---|
| Add and place a waypoint | Drag any part of the connection to the desired position, without selecting first |
| Add without dragging | Double-click the line, or right-click → **Magik: add waypoint here** |
| Move a waypoint | Drag its diamond |
| Delete a waypoint | Double-click its diamond, or hover and press Delete/Backspace |
| Merge two waypoints | Drop one near another on the same connection; green feedback marks the target |
| Move a whole segment sideways | Shift+drag the segment; two necessary waypoints are added |
| Cancel the current edit | Escape; pointer cancellation, capture loss and focus loss also restore the original |
| Lock/unlock | Select a connection, then Alt+L |
| Reset to automatic | Alt+R or the reset context menu; this explicitly clears that connection's waypoints |
| Add at the pointer | Alt+C on the selected connection |

Merging removes only the moved waypoint; other mandatory points are retained. Waypoint edits do not change graph links or workflow execution. Locked routes reject editing. The regular ComfyUI socket-creation and Shift socket-reconnection gestures remain native.

### Nodes covering waypoints

A diamond turns **red** when a node covers it. The waypoint stays fixed, visible above the node and draggable; the connection continues through it, allowing a temporary local node crossing. Other spans continue avoiding nodes. Moving the node away restores normal avoidance automatically. Moving one or both connected nodes does not translate the waypoint.

During an edit a waypoint may follow the pointer through a node, making it easy to reach the far side. **Releasing a newly added/moved waypoint inside a node rejects that edit and restores its previous state.** Moving a node over an already existing waypoint preserves the waypoint instead. Red positions are checked again at release, so a node moving mid-drag cannot bypass this rule.

### Automatic routing and old routes

Automatic rerouting and redundant-corner cleanup preserve mandatory waypoints. Waypoint routes are routed span by span using the JavaScript visibility search, including when the selected unconstrained routing engine is libavoid. They are excluded from unconstrained batch polishing, which could otherwise erase mandatory points. A point may force retracing; it is never silently removed to shorten the path.

Existing saved routes keep their legacy appearance until edited. The first waypoint edit switches that connection to the new waypoint model and can reflow its former automatic/manual bends. Only explicit diamonds constrain the new route. Copy/paste translates waypoints with the copied target node; ordinary node movement leaves them fixed. Reset every/selected connection explicitly clears unlocked route controls and restores automatic geometry. Native reroute chains retain their native editing behavior.

## Automatic connection setter

Right-click the canvas, a node, or a connection and choose:

- **Automatically route every connection**
- **Automatically route selected connections** — incoming/outgoing links attached to selected nodes

This first routing strategy replaces manually saved geometry with an automatically calculated orthogonal route. Its priorities are: avoid node bounds within the configured length budget, minimize Manhattan route length, then minimize bends among equal-length paths. Source and input socket directions are respected; hard immediate reversals are forbidden. Visibility-rail A* tracks direction as well as position to rank bends. Small outside rails allow backwards socket layouts to take rectangular detours.

The existing clearance and detour-limit settings apply. If no node-free route fits the budget or search complexity limit, the extension uses a direct automatic route and reports the number of fallbacks. The result is deterministic for the same node layout/settings, is saved in workflow metadata, and remains manually editable. Existing native reroute links are skipped to preserve their separate topology.

Settings are grouped under **Magik → Orthogonal Links**, **Locked Routes**, and **Orthogonal Links Advanced**.

| Main setting | Default |
|---|---|
| Enable extension | On |
| Automatically route after moving nodes | On |
| Node clearance | 12 |
| Preferred lane spacing | 8 |
| Link thickness | 3 |
| Grid snapping | 0 (off) |
| Locked route pattern | Marching stripes |
| Animation speed | 1 (0 stops animation) |

Advanced controls: routing engine (JavaScript), handle size (5), and Maximum detour (400 extra graph units). Lane spacing is a soft preference; shared endpoints can converge. Node avoidance is always enabled and may exceed the preferred detour budget to find a clear route. If no clear route is found within bounded search, a fallback can still pass through nodes.

Retained setting IDs preserve saved user values, including the previous locked pattern. The Marching stripes default applies to new/unset preferences. Old Avoid nodes, Strict node avoidance and route-length multiplier values are ignored. The single detour control now limits preferred extra distance without applying a second proportional limit.

## v0.1.31 review fixes

- Returning a drag to its starting point restores the original route, including the absence of manual metadata.
- Escape/gesture cancellation clears pending Link Release route data. Release data expires after 30 seconds and applies only to a newly created destination node.
- Workflow route records are sanitized on load/save; malformed records and non-finite coordinates are discarded safely.
- Read-only graphs reject route mutations, including menu operations and automatic batch commits. Disabling the extension during a batch also discards staged results.
- Worker message submission failures clear their pending timeout immediately.
- Cleanup compares overlap length, spacing-violation length, and spacing deficit as well as counts, preventing an equally counted but larger violation from being accepted.

## v0.1.31 routing changes

- Highway and node-edge discounts are calculated from the actual covered intervals. Splitting a straight segment no longer changes its style cost. Normalized reference geometry is reused in the search.
- When the Cartesian grid would exceed 4096 intersections, the router switches to a sparse visibility graph of obstacle corners, endpoint/frame projections and nearest obstacle-boundary ray hits. It connects neighbouring visible points on each rail, retaining directional/resource search. The sparse graph has a 12000-point safety limit and remains approximate.
- After shortcut cleanup, two worker sweeps separate conflicting movable parallel segments. Candidates target the configured lane distance (or 4 units when overlap avoidance is enabled with zero lane distance). A shift must reduce spacing deficit or overlap, preserve node clearance and enabled crossing/style constraints, and respect the detour budget. Socket-attached segments and locked routes remain fixed; impossible gaps are reported as remaining constraints.
- Progress includes the lane-spacing sweeps and the summary counts shifted segments.

The historical `ROUTING_REVIEW.md` documents the pre-change findings; its appended update records what this release addresses. These changes do not guarantee globally optimal routing or universal lane separation.

## Keeping route alternatives

The search keeps a small frontier of alternatives for each graph position and travel direction, rather than replacing every shorter but more expensive path with the cheapest one. A candidate is discarded only when another is no worse in both routing score and travelled length, or when the bounded four-alternative frontier needs pruning. The cheapest and shortest candidates are always retained when pruning.

This improves budget-constrained routing without changing settings. Path predecessors are tracked per alternative, so retaining multiple routes does not corrupt reconstruction. It remains a bounded heuristic, not a guarantee of a globally optimal layout.

## Removing unnecessary detours after automatic routing

An additional worker pass shortcuts whole staircases and rectangular doglegs after the routing sweeps. Each shortcut is checked on the final socket-attached path. It must reduce corner count (or shorten an equally cornered route), never lengthen the route, preserve socket directions, avoid new node collisions, and not worsen enabled crossing/overlap/lane-spacing constraints. Locked routes are excluded. The completion message reports how many extra corners were removed.


This addresses small valid 90-degree jogs that simple collinear cleanup cannot remove. Some bends remain necessary for node clearance or connection spacing. The bounded shortcut search tests up to 600 candidates per connection to keep calculation predictable.

## Thickness of overlapping routes

Shared horizontal/vertical portions use **N × B** thickness, where N is the number of distinct coincident routes and B is the configured base line width. Only the shared portion widens; separated branches keep their normal width. Opposite traversal directions still count as overlap. Perpendicular crossings, nearby parallel lanes, endpoint-only contacts and repeated splits of the same route do not inflate the count.

An interval sweep builds overlap runs per exact coordinate rail. The index is cached until planned geometry changes, and drawing splits shared portions at overlap-count boundaries. Locked patterns and borders use the same widened geometry. Hit testing accepts the wider visible stroke. Geometry, routing, workflow execution and stored corners are unchanged. Counts are based on links in the current graph, including portions outside the viewport; distinct coordinates are not merged by a proximity threshold.

## Route locking

Right-click a connection and select **Lock route** or **Unlock route**. Locking an automatic route first saves its current geometry. Choose the locked-route appearance under **Settings → Magik → Locked Routes → Pattern**: Stripes, Dashes, Dots, Dash-dot, Marching stripes, Flowing dots, Moving highlight, Pulse, Reverse stripes, Reverse dots, Alternating bands, Double dashes, Comet trail, Twin comets, Scanning light, Breathing bands, Spark packets, or Heartbeat. The first four are static; all remaining patterns animate. Comets use layered translucent strokes to create a trail; scanning light reverses direction, breathing bands change band width, and heartbeat uses a double pulse. **Animation speed** ranges from 0 to 3, default 1; zero freezes animated patterns.

Locked connections retain their base colour beneath the contrasting pattern. Pattern spacing is sized in screen pixels so it stays readable while zooming. Animated patterns schedule demand-based redraws at up to approximately 30 fps only when animated locked links were rendered. Redraw scheduling stops while the document is hidden or no animated locked links are rendered; it resumes on visible redraw. Pattern selection and speed are persisted as ComfyUI settings, not individual route metadata. Unlocked links keep their normal appearance. Locked connections are skipped by automatic routing, resets, and redundant-corner cleanup. Editing handles are hidden and dragging is blocked until unlocked. Node socket adapters still follow node movement. Locked routes remain obstacles/references for other automatic routes.

The lock flag is stored with route metadata and survives workflow save/load and copying. It does not affect generation, disconnecting links, or node movement. Replacing a connection removes stale route metadata as usual. Unlocking preserves geometry and restores editing.

## Batch progress, cancellation, and final validation

Automatic commands calculate routes in a module Web Worker. A progress message and Cancel button are displayed; Escape also cancels. Results are staged and committed together only after all calculations and final checks succeed. Cancellation, worker failure/timeout, or changes to nodes, links, or route metadata discard the staged batch. Existing connections remain unchanged. A compatibility fallback without Worker support yields between connections, but an individual route calculation can still block briefly.

The final path is checked after socket adapters are attached. Redundant corners and immediate reversals are removed; node collisions introduced by attachment are repaired when the remaining original detour budget permits. The actual geometry is revalidated against final reference paths for node collisions, parallel-lane spacing/overlaps, crossings, reversals and visible corner count. The summary reports direct fallbacks and the number of routes with remaining constraints. Some compromises are intentional under the configured bounds; validation does not guarantee every preference can be satisfied.

Crossing detection distinguishes strict intersections from corner touches and shared endpoints. Aligned split segments are normalized before validation so an intersection at an unnecessary vertex is counted once. During search, a crossing at an edge split is counted only when the path continues straight through that point, rather than turning onto the other connection.

`js/routing_worker.js` owns background calculation and validation. The batch commit uses one before/after graph-change transaction; real frontend undo/redo still needs live verification.

## Preventing hard 180-degree turns

Immediate collinear reversals are collapsed during rendering and geometry edits, including pinned retracing corners. A retraced section is replaced by its direct remainder; duplicate points created by the collapse are removed too. L-shaped adapters choose the orientation with fewer reversals. Backwards socket-row waypoints use rectangular detours, and the final adapter approaches vertically before entering the input horizontally.

This removes immediate doubled-back segments. Legitimate rectangular routes that turn around nodes remain possible.

## Avoiding nodes while editing

Waypoint spans are searched independently, preserving all mandatory anchors. If a node covers an anchor, only its local approach/departure may cross that node. An anchor inside soft clearance but outside the actual node is still respected; local escape selection prefers avoiding the actual node body. Search limits and impossible layouts can produce additional fallback crossings, but mandatory points are always retained.

Legacy connections without waypoints continue using the existing local/global avoidance pipeline. Temporary avoidance geometry is derived rather than added as permanent waypoint controls.

## Strict node avoidance

**Strict node avoidance** is enabled by default. If a normal budget-constrained result still crosses nodes, the router retries without appearance preferences and with a finite extra allowance based on the enclosing scene perimeter. This prevents the configured detour limit from silently keeping routes through wide nodes. The automatic-routing summary reports expanded avoidance searches. Live avoidance uses the same retry.

Disable this setting to restore the original behaviour where over-budget routes may cross nodes. Source/destination sockets remain attached. Impossible port layouts, enclosed paths and graph/search safety limits can still leave unresolved crossings; strict mode is an avoidance priority, not a proof of feasibility.

## Automatic routing on node release

Enabled by default through **Automatically route dropped nodes**. When a pointer drag actually changes node positions, the extension waits for native pointerup handling, then runs automatic routing for incoming/outgoing links attached to those moved nodes AND any unlocked connections obstructed by their new bounds, including when the moved node has no links of its own. Group moves include every moved member. Locked routes are skipped. Simple clicks, cancelled gestures and returning nodes to their original positions do not trigger routing.

Node avoidance takes priority: if a preference-scored result still intersects nodes, routing retries without soft appearance preferences and keeps the result with fewer node collisions. Existing detour limits still apply; genuinely blocked or over-budget cases retain the documented fallback. Rapid drops are coalesced; a currently running calculation is cancelled before processing the new affected nodes. Read-only mode and graph switches prevent stale routing.

## Moving nodes and persistence

When connected nodes or their sockets move, saved routes deform with the endpoints. Horizontal/vertical segment coordinates adjust with distance-based endpoint influence; moving both endpoints together translates the route. Socket adapters preserve horizontal entry/exit. This replaces the former fixed-canvas-corner behaviour. Moving both endpoints by the same displacement between rendered frames translates the manual route with them.

Routes are saved in the destination node's `properties.magikOrthogonalRoutes`, keyed by input slot. A record contains graph-space points, a source/input signature, and serialization coordinates. This allows metadata to travel with workflow serialization and copied nodes. Copied routes are offset to the copied destination position. The extension never modifies prompt/API execution data.

Routes bind to their current link at runtime. A replacement link does not reuse a previously bound route. Socket signatures prevent applying a route to a differently named/type source. Overlapping-link chooser, rounded corners, and explicit selected-corner keyboard navigation are deferred.

## Settings

Search ComfyUI settings for **Magik Orthogonal Links**:

| Setting | Default | Purpose |
|---|---|---|
| Enable extension | On | Enable orthogonal rendering and editing |
| Show flow arrows | Off | Repeated output-to-input arrows along completed routes |
| Hide on locked routes | Off | Hide arrows only on locked routes, independently of the main arrow toggle |
| Flow arrow design | Chevron | Chevron, Triangle, Open arrow, or Double chevron |
| Locked route pattern | Marching stripes | Static or animated locked-route styling |
| Locked pattern animation speed | 1 | Pattern speed; 0 stops animation |
| Link thickness | 3 | Base stroke width in graph units |
| Grid snapping | 0 | Snap placed/dragged points; 0 disables snapping |
| Handle size | 5 | Handle half-size in screen pixels |
| Automatic routing engine | JavaScript | JavaScript or experimental libavoid |
| Automatically route after moving nodes | On | Reroute affected connections after node release |
| Node clearance | 12 | Spacing around node bounds in graph units |
| Maximum detour | 400 | Preferred extra distance; node avoidance may exceed it |
| Preferred lane spacing | 8 | Preferred parallel-link spacing; 0 disables it |

Flow arrows are in **Magik → Flow Arrows**. They follow stored output-to-input direction, including connections originally drawn from an input. Aligned editable handles do not change arrow placement. Glyphs retain their screen size while zooming, stay away from corners/sockets, and appear on locked routes too unless **Hide on locked routes** is enabled. They are static and create no animation timer. Off-screen placement is clipped before iterating; a safety budget limits each route to 1,024 glyphs.

Pointer conversion matches ComfyUI CSS screen coordinates, independently of canvas backing-buffer resolution. Socket hit testing is not grid-snapped. Native link colours are retained. Corners are sharp. Automatic backwards links receive a rectangular detour, and automatic node avoidance applies while dragging segments and corners.

## Implementation

- `__init__.py`: exposes `js` through `WEB_DIRECTORY`; empty node mappings.
- `js/geometry.js`: pure orthogonal routing, simplification, midpoint, and hit-test helpers.
- `js/magik_orthogonal_links.js`: registered extension, settings, Canvas renderer wrappers, capture-phase pointer handlers, editing, and node serialization hooks.
- `js/package.json`: declares ES modules for local syntax/geometry checks; no build step.

Pointer events are intercepted at document capture phase before the native Canvas listeners. Events for other UI elements are ignored. Existing foreground/menu/serialization callbacks are chained. Link paths and midpoint data are updated for Canvas hit testing. Settings are registered explicitly through `app.ui.settings.addSetting`, so frontends that ignore declarative extension settings still expose them. Find them under **Magik → Orthogonal Links**, or search for **Magik Orthogonal Links**.

## Validation

JavaScript syntax and Python compilation passed. Automated checks cover 10,000 generated geometry cases, L-shaped drawing, undo, connection completion, cancellation, path hit-test data, detached serialization metadata, copied-route translation, paired/single node movement, segment dragging, and stale-route rejection. Live frontend compatibility remains to be tested.

Upstream interfaces consulted:

- https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/lib/litegraph/src/LGraphCanvas.ts
- https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/renderer/core/canvas/litegraph/litegraphLinkAdapter.ts

## v0.1.32 review

- Segment/corner dragging now saves routes with the same strict-avoidance logic used for rendering.
- Strict retry bounds are reduced incrementally, avoiding JavaScript argument-count limits on large scenes.

## v0.1.33 nearby-node avoidance

Strict avoidance now retries shorter socket departure/arrival adapters when a nearby obstacle blocks the normal 24-unit adapter. Saved/manual route attachment preserves these shorter adapters so the displayed connection stays clear. Detours still cannot escape genuinely enclosed ports or overlapping node bounds.

## v0.1.34 workflow investigation

The reported workflow contains no native reroutes. Some stored corners are inside other nodes; local repairs cannot preserve those corners and clear the nodes. Whole-route replacement is therefore required. Both strict and non-strict live fallbacks now validate replacement geometry. Automatic socket adapters also extend to the owning node's expanded boundary for inset ports, rather than beginning search inside that node.

A simulated renderer regression replays link 899 from the supplied layout and verifies zero node collisions with default settings. Custom-node runtime bounds, collapsed title widths and browser settings are not included in the export, so this does not replace live verification. Remaining live collisions produce a browser-console warning with the link ID, strict setting, path and obstructing node bounds, once per changed cached route.

Local detour success is no longer treated as proof of clearance: exempting the original source segment can allow added bends to cross the source node after repair. Live routing now validates the repaired geometry and invokes whole-route replacement for these false-success cases too. A dedicated regression reproduces zero local fallbacks with a remaining collision, then verifies whole-route repair.

## v0.1.35 path construction

Rendering and dragging call the shared pure `buildAvoidingPath` geometry function. It validates the authored path first and returns immediately if clear, tries local repairs, validates their actual output, and then considers whole-route replacement for completed connections. 

Unresolved candidates are compared by the number of distinct obstructing nodes, then colliding segments and reversals; a partial improvement can be retained even when complete avoidance is impossible. Obstacle-count comparisons are cached within the operation. Clear paths preserve authored waypoints. Automatic layout retains its existing preference-aware worker pipeline. Search remains bounded and is not a guarantee of global optimality.

Regression checks cover local false successes, buried waypoints, clear-path preservation, free-endpoint geometry and a simulated replay of workflow link 899, in addition to the existing geometry, interaction and worker suites.

## v0.2.0 routing architecture and libavoid

Path construction now separates shared geometry predicates (`routing_primitives.js`), obstacle visibility graph construction (`visibility_graph.js`), directional A* (`route_search.js`), route attachment/validation and policy (`geometry.js`), and lane positioning (`nudgeLanes`, after route search). Visibility edges are collision-checked and memoized per graph instead of rechecked for every search direction.

**Magik → Automatic Routing → Engine** offers **JavaScript** (default) and **libavoid (experimental)**. libavoid-js 0.5.0-beta.5 and its WASM are bundled locally. This engine applies to the automatic routing commands and node-drop automatic routing; synchronous rendering, previews and manual dragging retain JavaScript. Native shapes use the already expanded node bounds and directional connection pins. Each native route is socket-attached and validated, then uses the existing batch cleanup, lane spacing, final validation and atomic commit stages. A load, native execution, validation or non-strict detour-limit failure falls back to JavaScript and is counted in the result message.


The design follows the visibility/search/visual-positioning separation in Wybrow, Marriott and Stuckey, *Orthogonal Connector Routing* (GD 2009, published 2010). The 2014 *Seeing Around Corners* paper informs future graph-backend work; the JavaScript sparse graph is still a heuristic, not an implementation of its canonical one-bend graph or its optimality theorem. libavoid is a separate upstream engine, not a JavaScript port written for this extension. References and third-party notices are in `ROUTING_ARCHITECTURE.md` and `js/vendor/libavoid/NOTICE.md`.

Verification includes 150 shortest-path comparisons against an independent Lee-style maze BFS, real WASM transactions through the shipped browser bundle with HTTP loading in a simulated worker environment, the existing interaction/worker suites and a simulated workflow replay. Live ComfyUI verification remains required. The tests below are standalone and do not require npm dependencies:

```sh
node tests/path_search.mjs
node tests/libavoid.mjs
```

## v0.2.1 review fixes

- Free the owned `displayRoute()` polygon copy returned by the pinned libavoid binding. Point copies are also tracked for exception-safe disposal.
- Attempt every temporary-value and router destructor independently so one cleanup error does not skip the remaining releases. Cleanup failures are reported to the console.
- Added tests instrumenting real native route-copy ownership and injecting a valid but inferior candidate into an empty-reference scene.

## v0.3.0 shared scenes and incremental updates

With **Magik → Automatic Routing → Engine → libavoid (experimental)** selected, automatic routing now submits all eligible connections to one native scene and calls `processTransaction()` once for the batch. Native crossing penalties, shared-path penalties and lane nudging can consider the eligible connections together. The JavaScript engine remains the default. Preview and manual dragging behavior is unchanged.

The worker and native scene survive successful batches on the same graph. Node rectangles are added, moved/resized or removed incrementally. Unchanged connections retain their native objects; changed endpoints/pin geometry rebuild only the affected connectors. A node-drop routing batch uses the same mechanism. The result message includes reused native connector count. Cancellation, failed/changed-graph batches, graph switches, extension disable and engine changes discard the cached worker; the next batch starts clean. A shared transaction has a 45-second worker timeout. Without worker support, native routing works per batch but the scene is disposed afterwards and the synchronous native transaction cannot be interrupted mid-call.


The native scene is reused as a candidate scene even if JavaScript polishing altered the previously committed visual path. It is not a byte-for-byte mirror of the persisted manual geometry. Search validation and the graph-change guard remain authoritative.

The worker entry now ignores main-thread imports, so frontends enumerating helper modules do not overwrite the page's message handler.

Additional real-WASM scene tests:

```sh
node tests/shared_scene.mjs
```

They cover joint obstacle routing, retained native connectors after obstacle movement, resize and endpoint updates, node/connector deletion, graph identity reset, immutable fixed references, and failed-scene recovery. Simulated UI tests cover worker reuse, cancellation, graph switches, and locked route preservation. Live ComfyUI verification remains required.

## v0.3.1 drawing controls

Ctrl replaces Shift for flipping the preview and committing alternate L bends. Ctrl-clicks work while drawing, including completing a connection. Both inputs and outputs can start a route. Input-started routes leave to the left, complete on an output and reverse their stored waypoint order to preserve normal link direction. Type checking, undo, cancellation and read-only protection apply in both directions. The native reverse right-click release requires `dragNewFromInput`; if that API is unavailable, the draft remains active with an explanatory message.

Simulated interaction regressions cover the Ctrl/Shift distinction, reverse preview and waypoint storage, occupied-input preservation on cancellation/type rejection, successful reverse completion, reverse native release and missing-API/read-only guards. Live ComfyUI verification remains required.

## v0.3.2 native Shift gesture

Shift+drag on an output passes through to ComfyUI so all connected links can be moved together to another output. An ordinary output click still starts orthogonal drawing, and Ctrl still flips the L preview. Shift during an existing draft continues drawing normally.

## v0.3.3 native input Shift gesture

Shift+drag on an input also passes through to ComfyUI's native link interaction. Ordinary input clicks still start reverse orthogonal drawing. This applies when starting a gesture; Shift during an existing draft continues drawing normally.

## v0.3.4 compact shared-endpoint routing


Existing saved paths are preserved until rerouted: run Automatically route every connection (locked routes stay protected). No settings reset is needed.

`node tests/shared_endpoints.mjs` covers six links converging on one collapsed input, rejection of native rectangular detours, cleanup, endpoint exemptions and graph-subdivision-independent costs. Interaction, worker, independent maze-search and real WASM scene regressions also pass. Live ComfyUI visual verification remains required.

## v0.3.5 aligned fan-in


Rerun automatic routing to replace saved geometry. Six-link regressions check aligned rails, native candidate selection, nudging stability and obstacle fallback; existing UI, worker and real WASM regressions pass. Live ComfyUI visual verification remains required.

## v0.3.6 simplified automatic routing

Removed the five appearance toggles and their implementations: style coverage calculation, crossing/overlap search penalties, optional corner weighting, cleanup protection for those policies, and their native libavoid configuration branches. Saved values for removed settings are ignored. Automatic routing uses distance, a small fixed bend cost, and soft lane spacing. Shared destination alignment, node avoidance, route locks, overlap thickness rendering and the engine selector remain available.

Minimal lane distance remains a soft spacing preference (zero disables spacing). Shared sockets permit convergence. Existing routes are retained until rerouted. This release passes UI interaction/setting-count regressions, worker tests, independent obstacle maze checks, shared-endpoint tests and real libavoid scene tests. Live ComfyUI visual verification remains required.

## v0.3.7 refactor review

Fixed inconsistent precedence for top-level lane distance in JavaScript routing and native candidate comparison. Narrowed the shared-endpoint nudging guard to actual canonical approach rails, so other simple routes can still improve their spacing. Removed the empty frontend policy object and constant preference branches. Added regressions for zero-lane overrides, native/JavaScript consistency, ignored legacy toggle values and ordinary lane nudging at a shared endpoint. Interaction, worker, maze and real WASM scene checks pass; live ComfyUI visual verification remains required.

## v0.3.8 interaction sequence guards

Drafts now validate their graph, node identity and original slot before native release or continued interaction. Segment drags validate the original connection identity, endpoint tuple, input binding and lock state before writing. Cancellation releases pointer capture and clears pending node-drop snapshots. Finishing a drag after switching graphs closes undo bookkeeping on the original graph. Automatic jobs discard all staged results if routing settings change while the worker runs.

Sequence regressions cover graph changes before rendering, right-click after node removal, dynamic slot replacement, settings changes during worker execution and pointerup after a graph switch. UI interaction, worker, shared-endpoint and real libavoid scene tests pass. This is simulated interaction coverage; live ComfyUI verification remains required.

## v0.3.9 stale menus and competing pointers

Extension menu callbacks now reject changed graphs or graph state, preventing stale commands from editing another workflow or bypassing a later route lock. Native menu callbacks remain untouched in the canvas menu. Redundant-corner cleanup and detour actions also recheck locks and rendered records. Route dragging accepts movement/release only from its owning pointer and prevents another primary press from starting a competing draft. Delayed native-release metadata validates the original node and slot identity and cannot overwrite locked routes or write in read-only mode.

Added simulated regressions for stale reset menus after graph switch/lock changes, competing pointer movement/release, and slot replacement between native release and link creation. Interaction, worker, shared-endpoint and real libavoid scene tests pass. Live ComfyUI verification remains required.

## v0.4.0 simplified settings

Applied the main/advanced settings layout above. Renamed lane distance and link width, made avoidance standard, removed the redundant avoidance toggles and route-length multiplier, and retained one preferred extra-distance budget. Simulated UI settings/interaction checks, worker tests, shared-endpoint tests, independent maze search and real libavoid scene tests pass. Live ComfyUI visual verification remains required.

## v0.4.1 production review

Fixed stale obstacle caches after preprocessing exceptions, validated slots and current input bindings before metadata writes, skipped dangling slot references during routing/cleanup, and bound undo completion to the original graph when beforeChange triggers a graph switch. The distributable now includes standalone simulated UI and worker regressions.

Run from this folder:

```sh
node tests/ui.mjs
node tests/worker-test.mjs
node tests/path_search.mjs
node tests/shared_endpoints.mjs
node tests/shared_scene.mjs
```

See REVIEW_CURRENT.md for review scope and remaining limitations.

## v0.4.2 large-workflow performance

Added a spatial index for exact obstacle validation of already-clear routes, conservative local invalidation using both old/new obstacle bounds and authored/displayed route bounds, numeric geometry comparisons instead of per-frame serialization, and cached canvas paths/overlap strokes/midpoints. A local overlap-index change no longer rebuilds every base canvas path. Full routing-job graph fingerprints are checked at most once per 33 ms during staging and always immediately before commit; graph identity, read-only state and settings are checked at each stage.

Tests cover stale-cache invalidation, endpoint changes, obstacle insertion/movement/removal, overlap rendering, and 250 spatial queries checked against a brute-force oracle. All existing UI, worker, maze and real WASM tests pass.

```sh
node tests/performance_cache.mjs
node tests/performance.mjs 2000
```

See PERFORMANCE.md and tests/performance_results.json for measured before/after results. These are synthetic CPU preparation measurements, not live ComfyUI FPS measurements. Dense overlapping layouts and full automatic routing may remain expensive.

## v0.4.3 incremental indexes and worker finishing

Overlap updates now resweep only changed coordinate lines and preserve cached strokes on unaffected lines. Unchanged frames skip index updates. Small obstacle movements refit affected tree leaves and ancestors; structural edits, broad moves and periodic rebalancing still rebuild the tree. Route invalidation now checks actual segments after the conservative bounding-box test, avoiding false invalidations inside empty L-shaped envelopes. Unchanged overlap stroke geometry is reused even when nearby overlap counts change, and width/color lookups are hoisted out of stroke loops.

Worker cleanup, lane adjustment and validation use chunks of up to 64 routes for jobs with at least 32 eligible connections. Global pass order, reference updates, locking and final atomic commit are preserved; cancellation terminates the worker and discards staged results. Small jobs and the no-worker fallback retain sequential finishing.

```sh
node tests/incremental_indexes.mjs
node tests/worker-test.mjs
node tests/performance.mjs 500 - --dense
node tests/performance.mjs 160 - --route --worker
```

See PERFORMANCE_INCREMENTAL.md and tests/incremental_performance_results.json. Measured improvements target movement and worker finishing; idle frames do not show a consistent improvement. Tests include exact before/after geometry hashes, index queries against rebuild/brute-force oracles, chunked versus sequential finishing, and read-only changes during finishing. Live browser measurements remain outstanding.

## v0.4.4 nearby-reference index and worker scheduling

Automatic routing builds a spatial origin index once per job to select the same nearest 64 reference connections, with stable insertion-order ties. Small sets use precomputed-distance sorting; larger sets use bounded-heap tree queries. IDs resolve against the current route Map, preserving sequential geometry updates. JavaScript planning and shared-libavoid candidate selection both use the index. Full finishing/validation reference sets are unchanged.

Worker responses already yield to the UI event loop, so planning no longer adds another timer after every response. Explicit yielding remains in the no-worker fallback. Graph/settings guards, Escape cancellation, finishing chunks and atomic commit remain active.

```sh
node tests/reference_index.mjs
node tests/reference_performance.mjs 10000 300
node tests/performance.mjs 500 - --route --worker
node tests/performance.mjs 500 - --route --worker --cancel
```

See PERFORMANCE_REFERENCE_INDEX.md and the raw reference lookup/routing JSON results in tests. End-to-end geometry hashes match v0.4.3. Random/tied/extreme-coordinate selection oracles, existing UI/worker/maze/WASM checks and real-worker timed cancellation pass. Live ComfyUI browser profiling remains outstanding.

## v0.4.5 worker transfer cache

Automatic routing sends obstacle bounds once per job. Planning requests reuse reference paths by transport ID; finishing chunks send changed reference entries. Exempt endpoint rectangles retain object identity with obstacle bounds. Each new job resets its scene, including when reusing a native worker. The no-worker fallback and legacy worker messages remain supported.

Sequential planning/finishing, geometry algorithms, cancellation and atomic commit are unchanged. In repeated synthetic real-worker tests, automatic routing was 16–21% faster for 80–500 connections, with identical geometry hashes. See PERFORMANCE_WORKER_TRANSPORT.md and tests/worker_transport_results.json. Live ComfyUI/browser profiling remains outstanding.

```sh
node tests/worker_transport.mjs
```

## v0.4.6 validation efficiency

Route finishing normalizes its reference paths once per operation instead of once per candidate. Validation skips spacing calculations for parallel segments already outside both overlap and lane-distance thresholds. Public validation still reads current path contents on every call, so in-place edits cannot leave a stale cache.

Repeated real-worker routing fixtures measured 6–15% lower total time than v0.4.5, with identical geometry hashes. See PERFORMANCE_VALIDATION.md and tests/validation_performance_results.json. The benchmark adapter now honors the supplied worker entry point, allowing complete previous-version worker comparisons.

```sh
node tests/validation.mjs
```

## v0.4.7 obstacle scan efficiency

Validation scans obstacle rectangles directly instead of filtering a temporary list for each segment. Pruning and nudging share an early-exit collision-ID scan, avoiding repeated mapping, filtering and path slicing. Rectangle identity exemptions and collision-ID ordering remain unchanged.

Repeated real-worker routing fixtures measured 10–20% lower total time than v0.4.6, with identical route geometry hashes. See PERFORMANCE_OBSTACLE_SCANS.md and tests/obstacle_scan_results.json. Live ComfyUI/browser profiling remains outstanding.

```sh
node tests/obstacle_scans.mjs
```

## v0.4.8 obstacle-index construction

Obstacle-tree construction and refits calculate bounds directly from rectangles, avoiding temporary point lists at every tree level. Tree partitions, query order, rectangle copies and movement/rebuild rules remain unchanged.

A 10,000-rectangle build benchmark measured 19% lower median construction time. Five-process cold-render fixtures with 500–3,000 connections measured 8–25% lower time, with identical geometry hashes. These are synthetic CPU results; live browser measurements remain outstanding. See PERFORMANCE_OBSTACLE_BUILD.md and the raw results in tests.

```sh
node tests/rectangle_index_performance.mjs 10000 15
```

## v0.4.9 reference-segment index

Pruning and nudging can index normalized reference segments to skip distant geometry during repeated validation. The index is local to one finishing operation. Small sets and brief operations retain exhaustive scanning; unhelpful broad queries fall back to it. Candidate order and original route endpoints are preserved, including shared-socket spacing exemptions.

A synthetic complex-cleanup fixture with 3,000 references and 33 input corners measured roughly 669 ms → 18 ms with identical output. Ordinary automatic-routing fixtures showed much smaller improvements. This does not imply a 36× speedup for complete workflows. See PERFORMANCE_REFERENCE_SEGMENTS.md and raw results in tests. Live browser profiling remains outstanding.

```sh
node tests/reference_segments.mjs
node tests/reference_segment_performance.mjs
```

## v0.4.10 native-abort recovery

A native routing failure can leave WASM unable to execute even destructors. Shared-scene cleanup previously could throw again and prevent the JavaScript fallback, leaving the message “program has already aborted! No staged routes applied.” Cleanup now detaches the scene before disposal, catches destructor failures and preserves the original routing failure for diagnostics.

Failed native runtimes are quarantined. A recovered JavaScript batch does not cache its failed native worker; the next native job starts a fresh worker. With no worker support, the failed main-thread runtime remains disabled until a full browser refresh, while JavaScript routing remains available. Normal route selection, lane-distance settings and successful native-worker reuse are unchanged.

Tests inject a transaction failure and an aborting destructor together, check JavaScript recovery and node avoidance, verify that the failed runtime is not re-entered, and verify fresh-worker creation after recovery. Real WASM test scenes pass at lane distances 8 and 12. The original user's workflow-specific native failure at 12 has not been reproduced; the workflow JSON is needed to identify that trigger. This release fixes recovery rather than claiming to fix the native solver's underlying failure.

## v0.4.11 large-coordinate native routing

Native scenes and isolated native routes now translate geometry near the origin before calling libavoid and translate returned paths back. Nodes, saved workflow positions, locked routes and JavaScript policy references remain in graph coordinates. Lane spacing uses the same units; no scaling is applied. The native origin is quantized in 1,024-unit steps to reduce recentering during small node movements. Existing scene signatures update shapes/connectors when the local coordinates change.

This addresses a reproducible native failure reconstructed from ANIMAAAA-MegaPrompt: its nodes lie around x=850,000 and y=-154,000. The reconstructed scene aborted in native processTransaction at original coordinates, but completed at both lane distances 8 and 12 after translation. Collapsed bounds/socket geometry were approximated offline; the fixture has 93 eligible links versus 92 in the screenshot, so this does not reproduce the exact browser state or the precise 8-versus-12 boundary.

The release includes a geometry-only 120-node/93-link fixture without prompts, widget values or filenames. Tests cover both lane values, policy switching, identical normalized scene inputs and finite returned native paths, original input immutability and isolated native routing with endpoint exemptions. Previous abort recovery remains active.

```sh
node tests/native_coordinates.mjs
```

## v0.4.12 cancellable preparation

Automatic routing shows a cancellable preparation phase before collecting node bounds and reference paths. Collection yields to the event loop in chunks and rechecks cancellation, settings, read-only mode and graph identity. A forced full graph check follows collection before any worker is acquired or started.

While an automatic job is active, route reads use temporary copies instead of normalizing persisted metadata or updating motion/binding caches. This keeps painting during preparation from silently changing the routing snapshot. Saved routes are still committed together after final validation. Cancel and errors clear this temporary read behavior even if cleanup fails.

UI regression tests interrupt a 1,200-node preparation with Escape, read-only changes, node movement, workflow switches, lane-setting changes and canvas painting. Interrupted jobs create no worker and leave route metadata unchanged. A 500-connection before/after check retains identical render/committed-route hashes and commit counts. This improves responsiveness rather than claiming lower total routing time; additional yields can add elapsed time.

Fingerprint serialization, link sorting and reference-tree construction remain synchronous. Individual extension-provided geometry callbacks cannot be preempted. Live browser profiling remains outstanding.

## v0.4.13 cheaper routing-state checks

Periodic job checks compare against a captured structural snapshot instead of repeatedly allocating a full geometry JSON string. Snapshot capture is chunked and cancellable. The original full fingerprint comparison remains before worker creation and before commit, and now runs again inside the commit transaction after beforeChange hooks. Node/link object replacements also invalidate the job even if their serialized fields agree.

A 5,000-node/5,000-link focused fixture measured median repeated checks of 12.2 ms → 8.1 ms, about 34% lower. Snapshot capture has an additional one-time CPU/memory cost; this does not claim a 34% improvement in total routing time, particularly for short jobs. See PERFORMANCE_ROUTING_SNAPSHOT.md and raw results in tests.

```sh
node tests/routing_snapshot.mjs
node tests/routing_snapshot_performance.mjs 5000 25
```

## v0.4.14 dense-overlap rendering

Overlap pieces are clipped directly from the sweep index's ordered runs, avoiding a second cut-set allocation and sort. Borderless links retain their stroke color through the wide-segment loop instead of assigning it repeatedly. Stroke order, border order, counts × base thickness, dashes and highlighting are unchanged.

Three-process dense fixtures with 250–750 connections measured 40–48% lower cached-frame CPU time and 17–37% lower local-movement CPU time. These are synthetic preparation/stub-canvas measurements; live browser/GPU gains remain unverified. See PERFORMANCE_DENSE_OVERLAPS.md and raw results in tests.

```sh
node tests/overlap_pieces.mjs
node tests/performance.mjs 750 - --dense
node tests/performance.mjs 40 - --dense --paint-check --border --disabled
```

## v0.4.15 scene bounds checks

Unchanged frames reuse node rectangles and skip rebuilding the scene map. Bounds are still read every frame, including custom bounding boxes. Clearance is read once per bounds collection. Scene-delta construction also avoids temporary entry arrays.

Seven alternating baseline/current processes measured static-frame CPU time of 4.51 → 3.44 ms for 1,000 connections and 21.83 → 20.93 ms for 5,000. Movement timings varied; no general dragging gain is claimed. Geometry and sampled paint sequences match v0.4.14. Live browser/GPU performance remains unverified. See PERFORMANCE_SCENE_BOUNDS.md.

## v0.4.16 simplifier allocation reduction

Route simplification now uses direct indexing and removes a middle corner without temporary slice/splice arrays. Invalid coordinates, pinned points and reversal handling are preserved. A frozen v0.4.15 oracle matches 20,007 generated and explicit cases.

The isolated 200,000-call benchmark measured 55.65 → 42.88 ms (23% less CPU). Whole-frame measurements were mixed, so this release does not establish a frame-rate or dragging improvement. See PERFORMANCE_SIMPLIFY.md and raw results in tests.

## v0.4.17 automatic seed reuse

Automatic routes reuse their initial geometry when both socket coordinates are unchanged. Scene invalidation and obstacle avoidance still run normally. Manual routes and native reroute chains retain their existing construction paths.

Seven alternating baseline/current processes per size measured 6–22% less static-frame CPU and 6–20% less local-movement CPU at 1,000/5,000 connections. Geometry hashes and sampled paint sequences match v0.4.16. These are synthetic Node/stub-canvas measurements; browser/GPU gains remain unverified. See PERFORMANCE_AUTOMATIC_SEEDS.md.

## v0.4.18 manual routes and memory

Manual routes reuse initial geometry when both sockets, corner values and protected-point values match detached snapshots. In-place corner edits are detected. Preparation passes resolved socket positions to route handling; painting still checks current sockets and route metadata. Motion records are refreshed only when positions change. Disabling the extension clears the live-route cache.

For 1,000 manual routes, seven alternating baseline/current processes measured 56% less static-frame CPU and 12% less local-movement CPU. Automatic-route measurements were mixed; no general automatic-route improvement is claimed. Geometry and sampled ordered paint hashes match v0.4.17.

An accelerated 120-workflow/720-frame memory soak covered edits, route resets, link deletion and enable/disable cycles. None of 240 sampled retired graph/link objects remained reachable after collection. Post-GC heap use settled near 15.63 MiB with a workflow loaded (baseline 15.33 MiB), and 10.98 MiB after clearing it (baseline 10.94 MiB). This measures the Node simulated canvas; browser/GPU/WASM memory was not measured. See PERFORMANCE_MANUAL_MEMORY.md.

```sh
node tests/performance.mjs 1000 - --manual
node --expose-gc tests/performance.mjs 1000 - --memory
```

## v0.4.19 path-aware viewport culling

Fully off-screen paths skip painting and locked-pattern animation. Segment tests use overlap widths, borders, zoom and selected-handle size. Routing and overlap preparation still include all links. Invalid/missing viewport information fails open.

A guarded Canvas frontend 1.55.x bridge recovers ordinary links whose custom detours or wide strokes are on screen even though the native socket-only bounds are off screen. Native reroute chains, subgraphs, floating links, badges and dragging retain their original native dispatch. If the native hook is unavailable, renderer-side culling still works, but upstream pre-culling is not repaired.

This is a visibility correction, not a general CPU-speed claim. In the warmed 1,000-link fixture, static-frame medians rose from 0.76 to 0.96 ms for automatic routes and 1.53 to 2.49 ms for manual routes. Native culling already skips many off-screen links; verifying custom paths adds work. Shorter runs were mixed. Off-screen drawing/animation work is suppressed, but browser/GPU gains remain unmeasured. See PERFORMANCE_VIEWPORT.md for full results and limitations.

```sh
node tests/viewport.mjs
node tests/viewport_ui.mjs
node tests/native_culling_source.mjs /path/to/frontend/src/lib/litegraph/src/LGraphCanvas.ts
node tests/performance.mjs 1000 - --viewport --manual --steady
node --expose-gc tests/performance.mjs 1000 - --memory --viewport
```

## v0.4.20 planning allocation reduction

Stable frames reuse route planning records and avoid constructing a full ID set. Geometry/membership changes are detected during the existing append pass. A cache-membership flag preserves cleanup for transient paint-only links, including native-chain cases where cache size alone would be misleading. Viewport recovery and current metadata checks remain enabled.

Three paired-process benchmarks with 1,000 links measured 11% lower static CPU and 18% lower movement CPU for manual routes. Automatic controls were slightly slower; no automatic-route improvement is claimed. V8 sampling estimated 11% less allocation per frame in both fixtures. These are Node/stub-canvas results, not browser/GPU measurements. See PERFORMANCE_PLANNING.md.

```sh
node tests/planning_cache.mjs
node tests/paired_performance.mjs /path/to/baseline/js 1000 --viewport --manual
node tests/planning_allocations.mjs 1000 - --viewport --manual
```

### Saving after node movement

Saved manual routes use current socket positions even when saving occurs before the next canvas redraw. Serialization adapts a detached snapshot, preserving live route and motion state. Stale metadata belonging to a replaced or disconnected connection is omitted from the saved workflow.


## Live pulsing connected-node and socket highlighting (v0.6.5)

Connected neighbours are highlighted with a smooth pulse during node dragging: upstream nodes are yellow and downstream nodes are dark blue. The overlay follows the moved node(s) and disappears immediately on release. Animation pauses while the browser tab is hidden.
