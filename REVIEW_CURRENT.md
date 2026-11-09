# Review of v0.4.20

## Confirmed issues fixed

- High: connection preprocessing could throw before entering the frame cleanup block, retaining stale obstacle bounds. The entire preparation/render operation now clears the frame cache in finally. An injected socket exception reproduces and tests the fix.
- Medium: a synchronous beforeChange listener could switch workflows and cause edits or afterChange notifications to target the wrong graph. Edits now verify graph identity after beforeChange, and complete the original graph transaction. A switching-listener regression verifies this behavior.
- Medium: dangling links during dynamic slot updates could access removed sockets or write route records to disconnected inputs. Reads/writes and routing preparation now verify slots; writes additionally verify the input still owns the link.
- Maintainability: interaction regressions existed only in the development workspace. The release now includes self-contained UI and worker suites. UI code is loaded in memory; running tests does not rewrite extension sources.

## Validation

Simulated UI sequences and 10,000 geometry cases, actual Node worker messages, 150 independent maze comparisons, shared-endpoint regressions, and real WASM/native scene lifecycle tests pass. These establish reproducible coverage of tested cases, not universal correctness or live-browser compatibility.

## Remaining limitations

- Frontend event/render integration remains concentrated in a large module. Extracting interaction state and job lifecycle into independent modules would improve future reviewability; this release avoids that broad behavioral refactor.
- Native renderer and link-release hooks depend on ComfyUI frontend behavior. No live ComfyUI/browser session was used for this review.
- Search deliberately bounds graph size and Pareto labels. It cannot promise globally optimal layout or a node-free path in every scene.
- Render preparation checks numeric route geometry each frame. Work remains linear in graph size; no representative large-workflow browser/GPU profile was collected.
- Complete hot-reload teardown of document listeners and patched canvas hooks is not implemented. A full browser refresh remains the supported update path.

## Performance follow-up

v0.4.2 addresses per-frame serialization, global route invalidation on distant node movement, repeated canvas path construction, and full obstacle scans for clear routes. See PERFORMANCE.md for repeated synthetic measurements and geometry equivalence checks. Live browser profiling, dense-scene measurements and full batch-routing benchmarks remain outstanding.

## Incremental follow-up

v0.4.3 adds incremental overlap-line sweeps, refitted obstacle trees, exact segment invalidation and bounded worker finishing chunks. See PERFORMANCE_INCREMENTAL.md for measurements, oracle/equivalence tests and remaining costs. Live ComfyUI integration and browser/GPU profiling remain outstanding.

## Reference lookup and worker scheduling follow-up

v0.4.4 indexes reference origins while preserving nearest-selection ordering and live geometry updates. It removes the redundant timer between worker planning requests, with real-worker cancellation coverage and identical before/after route hashes. See PERFORMANCE_REFERENCE_INDEX.md for measured gains and their limits.

## Worker transfer follow-up

v0.4.5 caches obstacle bounds and reference paths in the routing worker. Worker transport tests cover exemption identity, reference reuse and updates, sequential finishing equivalence, empty-scene resets, reused workers and legacy requests. Existing UI, worker, geometry, index and WASM suites pass. Real-worker cancellation committed zero routes. See PERFORMANCE_WORKER_TRANSPORT.md.

## Validation efficiency follow-up

v0.4.6 reuses normalized references within each finishing operation and rejects irrelevant parallel-spacing comparisons early. A frozen exhaustive validator matches 1,500 generated reports and threshold cases exactly. Mutable-reference callers and finishing reports are checked; no persistent geometry cache was introduced. Existing UI, workers, indexes, maze comparisons and native WASM checks pass. See PERFORMANCE_VALIDATION.md.

## Obstacle scan follow-up

v0.4.7 replaces intermediate obstacle/path arrays with direct early-exit scans. Tests cover 4,000 scan comparisons, strict boundary contacts, identity-based exemptions, duplicated rectangles, and 100 finishing snapshots generated with v0.4.6. The exhaustive-validator oracle now includes its own frozen segment predicate. Existing UI, worker, index, maze and native WASM suites pass; cancellation commits no routes. See PERFORMANCE_OBSTACLE_SCANS.md.

## Obstacle-index construction follow-up

v0.4.8 replaces mapped point lists with direct rectangle-bound accumulation during tree construction and leaf refits. Before/after index queries match exactly, including result order, after 140 movement updates and periodic rebuilding. Existing brute-force index oracles and all UI/worker/geometry/WASM suites pass. A 1,500-connection routing comparison preserves render and committed-route hashes. See PERFORMANCE_OBSTACLE_BUILD.md.

## Reference-segment follow-up

v0.4.9 uses a lazy operation-local spatial tree for repeated validation during pruning/nudging. Tests cover conservative candidate coverage/order, diagonal inputs, epsilon-adjacent segments, shared endpoints, mutable callers, fallback behavior and exhaustive report parity. Before/after route hashes match for 80–1,500 connections; the complex cleanup benchmark asserts complete output equality. Existing UI/worker/geometry/index/WASM checks pass. Cancellation commits zero routes. See PERFORMANCE_REFERENCE_SEGMENTS.md.

## Native-abort recovery

Confirmed bug: routeSharedLibavoid's error path called disposal before constructing its JavaScript fallback. An already-aborted WASM runtime can throw during router.delete(), masking the original routing error and skipping recovery. Disposal now clears shared references before attempting destruction and catches failures. Temporary wrapper cleanup no longer masks routing exceptions. Failed runtimes are quarantined and recovered native workers are discarded rather than cached.

The regression injects a lane-12 transaction failure followed by an aborting destructor using a real native scene behind a test proxy. Recovery returns JavaScript routes with no node hits and the original failure message; repeated disposal/re-entry is prevented. A healthy runtime still routes at 8 and 12. UI tests verify that recovered batches discard their worker and the next job creates a fresh one. All existing regression suites pass. The exact native assertion from the user's workflow is not yet reproduced; screenshots alone do not identify the graph or first native error.

## Large-coordinate native solver follow-up

The supplied workflow contains 120 nodes at x=848,770–861,090 and y=-159,440–-152,760. An offline geometry reconstruction with 93 eligible links triggers an unhandled native WASM exception before translation; identical geometry translated near the origin completes at lane distances 8 and 12. The production fix translates only the native input/output boundary, including shapes, absolute endpoints and shape-pin offsets. Graph-space references, validation and saved positions are unchanged.

The geometry-only regression checks repeated lane 8/12 transactions, identical normalized shape/endpoint inputs across translated scenes, immutable input and an isolated native route with shape exemptions. Native outputs remain subject to existing endpoint, obstacle and policy validation; translating geometry does not bypass those gates. Existing UI/worker/geometry/index/native suites pass.

Limit: collapsed widths and port layouts in the reconstruction use approximations, and it contains 93 eligible links versus the screenshot's 92. This establishes a large-coordinate failure mode and a tested mitigation, rather than the exact browser-state assertion threshold. Live verification with the user's frontend is still needed.

## Preparation responsiveness follow-up

v0.4.12 creates the cancellable job before preparation and collects bounds, valid links and reference geometry in event-loop chunks. Settings/graph fingerprints are captured before the initial yield; checks run after subsequent yields and a forced graph check runs before worker creation. A cancellation during preparation also disposes an existing cached native worker.

Route reads are pure for the active routing canvas, including render-time reads. Endpoint adaptation and copied-route normalization occur on temporary route objects, so rendering cannot mutate persisted metadata or motion/binding caches inside the job snapshot. The per-canvas state is cleared in an inner finally even if worker/native cleanup throws.

Tests cover six interruptions of a 1,200-node preparation: cancel, read-only, position mutation, graph replacement, setting change and rendering with copied/stale route metadata. No worker is created and metadata remains unchanged. The 500-connection before/after routing check retains exact geometry hashes and committed-route counts. Existing UI, worker, geometry/index and native suites pass. Chunking targets 8 ms or 512 entries, checked every 32 entries; fingerprinting, sorting, reference-tree construction and individual callbacks remain synchronous, so this is not a universal upper bound on UI stalls. No total-time speedup is claimed.

## Structural snapshot follow-up

v0.4.13 replaces periodic full-fingerprint serialization with structural comparisons against a job-scoped snapshot. Snapshot metadata capture yields through the existing preparation helper. Until capture completes, checks retain full fingerprint comparison plus original node/link identity. Forced checks before worker creation and commit retain the original fingerprint; identity checks additionally reject replaced objects. A second forced check inside change() rejects mutations from synchronous beforeChange listeners on the same graph.

Tests cover 1,000 generated nested-route/position mutations against the legacy fingerprint, directed mutations of all guarded fields, Map containers, node/link replacement, typed sizes, null inputs, mutable toJSON values, deferred capture interruption and successful capture. UI tests inject same-graph mutation during beforeChange and verify no staged metadata is saved. The before/after 500-link routing check retains exact render/route hashes and commit counts; existing suites pass. Snapshot data adds one-time capture cost and memory, while repeated checks reduce allocations. See PERFORMANCE_ROUTING_SNAPSHOT.md.

## Dense-overlap follow-up

v0.4.14 uses a linear clipping pass over ordered, disjoint overlap runs, preserving piece boundaries, direction, segment IDs and cumulative distances. Signed zero on the along axis is normalized as it was by the previous Set-based splitter. A frozen oracle matches 15,000 generated paths plus explicit gaps, clipping, reverse, count-one, zero-length and signed-zero cases.

Bordered rendering keeps its original border/color sequence. Borderless rendering removes redundant same-color assignments while retaining every stroke and width. Ten before/after stroke hashes match across normal/dense scenes with colors, highlights, borders, skipped borders and alternating disabled-link dashes. Dense-fixture geometry hashes match across all benchmark samples. No stroke batching or layer skipping was introduced. See PERFORMANCE_DENSE_OVERLAPS.md.

## Scene bounds follow-up

v0.4.15 reuses unchanged rectangles/items and skips scene-map reconstruction on unchanged frames. Every node still supplies current bounds; no mutation-hook assumptions were added. Custom bounding-box changes without position/size changes, nonfinite-box removal, and 1,000 scene-delta oracle cases pass. Full routing, UI, worker and native regression suites pass. See PERFORMANCE_SCENE_BOUNDS.md for bounded synthetic measurements.

## Simplifier follow-up

v0.4.16 removes temporary arrays from the corner simplifier. A frozen oracle covers 20,007 cases with reversals, pinning, duplicate/invalid points, number conversion, signed zero, unchanged inputs and independent output arrays. Whole-frame performance varies despite a 23% isolated CPU reduction; see PERFORMANCE_SIMPLIFY.md. Geometry and sampled ordered paint hashes match v0.4.15.

## Automatic seed reuse follow-up

v0.4.17 reuses only an automatic route's seed when socket coordinates match. It does not reuse an obstacle detour as an authored seed and does not bypass scene invalidation. Regressions cover changing either socket between preparation and paint, manual record creation/edit/removal, moving obstacles and custom bounds changes. Geometry and ordered paint hashes match v0.4.16. See PERFORMANCE_AUTOMATIC_SEEDS.md.

## Manual route and motion follow-up

v0.4.18 caches manual seeds against detached corner/pin values and socket coordinates, preserving scene invalidation. Route and socket metadata are still checked at paint time. Preparation reuses resolved socket coordinates only for matching current node identities. Unchanged motion records are reused. Disabled rendering releases the live-path map.

Regression coverage includes in-place manual edits, manual creation/removal, changed sockets between preparation and paint, socket read counts, workflow switching and immutable routing snapshots. A 120-workflow memory soak samples retired graphs/links with WeakRefs and forces collection at checkpoints; zero sampled objects remain after cleanup. This does not establish browser, GPU or WASM leak freedom. See PERFORMANCE_MANUAL_MEMORY.md for results, CPU regressions/limitations and reproduction.

## Viewport follow-up

v0.4.19 adds conservative graph-space segment/stroke visibility checks, suppression of off-screen painting/animation, and guarded recovery from the frontend 1.55.18 endpoint-only pre-cull. Scene-wide routing/overlap inputs are retained. Current route metadata, socket positions, viewport mutations and detour policy are checked before a prepared off-screen result is reused. Selected handles and widened shared lanes remain visible at edges.

10,000 visibility and 10,000 numeric-comparison oracle cases pass. Simulated native dispatch tests cover detours, execution pulses/alpha, panning, off-screen animation, metadata edits/reset between preparation and painting, wide lanes and native fallbacks. The same suite passes against the rendering method extracted from the supplied frontend 1.55.18 source, with its two local TypeScript annotations removed; the surrounding Vue/link-store environment and native reroute chains are not emulated. Full UI, worker, geometry and native WASM regressions pass. A 120-workflow viewport memory soak retains zero sampled retired graph/link objects.

The bridge adds CPU overhead in warmed fixtures; see PERFORMANCE_VIEWPORT.md. No live ComfyUI/browser/GPU profile was collected, and this release does not establish a fix for the reported generation freeze or Kicker monitoring state.

## Planning allocation follow-up

v0.4.20 reuses stable plan records, computes geometry/membership changes while appending, and creates an ID set only after membership changes or a newly cached link. The new-cache flag survives partial preparation and is reset after pruning or graph/disabled cleanup. A transient link created during painting is still removed on the next preparation, even when planned IDs remain unchanged. A native-chain regression covers equal planned/cache counts with unequal membership.

Metadata rename/signature/object-conversion regressions, existing viewport/source-method tests and the full UI/worker/native/geometry suites pass. CPU gains are limited to the measured manual-route fixture; automatic controls show small regressions. Estimated allocations fall about 11%. See PERFORMANCE_PLANNING.md for measurement scope and memory results.

## Editing correctness follow-up

v0.4.21 fixes Escape leaving a route drag active and pointer cancellation/window blur committing partial edits. Interrupted gestures restore the previous manual metadata or remove the temporary manual route for an originally automatic connection. Rollback targets the original graph/link and only metadata still owned by the gesture; replacements and externally locked records are preserved. Lost pointer capture cancels, while normal pointer release commits. Undo before/after hooks remain balanced, including graph switching.

Selection, handle hit testing, handle painting and corner deletion now accept link ID zero. Simulated UI regressions cover automatic/manual rollback for Escape, pointercancel, blur and capture loss, foreign pointer cancellation, repeated pointerup, graph switching, external metadata replacement, external locking, reconnection and zero-ID corner editing. Browser/ComfyUI integration still needs live verification; no new path optimality claim is made.

Additional guards reject stale rendered links before drag setup, revalidate after synchronous beforeChange listeners, and cancel active edits when the extension is disabled. Original socket/motion snapshots are retained for restored manual routes so endpoint changes can be adapted on the next render. All 19 regression suites and the supplied frontend source-method check pass.

## Corner editing follow-up

v0.4.22 separates targeted corner deletion from whole-route simplification. deleteCorner preserves the remaining aligned handles as protected points while still removing duplicates and immediate reversals. It retains the opposite-elbow behavior for deleting a true bend; explicit redundant-corner cleanup remains available. Directed geometry regressions cover aligned and true-bend deletion, retained unrelated handles, orthogonality and input immutability.

Segment drags now measure their effective perpendicular displacement before creating an undo transaction or storing a manual route. Tangential movement on either horizontal or vertical segments leaves automatic routes automatic. Returning to the original segment axis restores the original metadata even when the cursor remains displaced along the segment. UI tests cover no-op drags, move-away/return and balanced undo hooks.

## Persistence correctness follow-up

v0.4.23 fixes saving after node movement but before the next render. Previously serialization stamped current node coordinates onto route points still expressed at their previous location, so reload could retain outdated geometry. The serializer resolves each current input link, obtains endpoint-adapted route metadata through a pure snapshot read, detaches and sanitizes it, then records current node coordinates. Missing, disconnected, mismatched or stale-bound routes are omitted from the serialized snapshot without deleting live metadata. Nodes without an attached graph retain the existing sanitization fallback.

Regressions cover simultaneous translation of both endpoints before paint, target-only movement, equality with the subsequent rendered geometry, unchanged live metadata/motion, lock preservation, configure/reload, Map-backed links and stale route omission immediately after reconnection.

## Drawing completion follow-up

v0.4.24 fixes the final socket click discarding the unfinished L preview and Ctrl orientation: only prior click history used to be saved. Compatible socket hover and completion now share a path builder that uses actual socket positions, the current L orientation, horizontal endpoint adapters and normal output-to-input ordering. Authored geometry is stored; preview and subsequent rendering derive obstacle detours through the same live avoidance path, preventing reattachment from changing the preview socket approach. Free-canvas previews and native right-click release retain their prior behavior.

Eight directed UI cases compare traced foreground preview vertices with the subsequently rendered Path2D vertices: input/output starts, both Ctrl states, with/without intermediate steps, and grid snapping while the cursor is slightly offset from the destination socket, with a blocking node in the scene. The tests also assert exact socket endpoints, orthogonality, no immediate reversals and distinct final shapes for the two Ctrl states. Existing occupied-input cancellation and incompatible socket checks remain covered. Seven relevant regression suites pass. Node-drop test waits now observe route completion with a bounded timeout instead of assuming completion within 100/150 ms.

## Dynamic endpoint editing follow-up

v0.4.25 binds a route drag to its original endpoint node and socket objects, socket coordinates and expected route metadata object. Dynamic socket replacement, endpoint-node replacement, endpoint movement or external route replacement now invalidates the edit before another write or commit. Returning to the original axis updates the expected restored record so continuing a valid drag remains supported. Rollback does not restore old metadata into a replaced endpoint node or socket: it preserves external records and removes only the gesture-owned partial record when socket identity changed.

Normal drag completion clears active gesture state before invoking afterChange, preventing a synchronous blur/cancel listener from closing the same undo transaction recursively. Pointerup rechecks enabled/read-only state. Twelve directed UI cases change source/target sockets, move either endpoint, replace metadata or replace the target node before/after the first write, checking preservation and balanced undo hooks. A synchronous afterChange-to-blur regression verifies exactly one completion with the committed route retained.

## Flow arrow feature

v0.4.26 adds two ComfyUI settings under Magik / Flow Arrows: Show flow arrows (default off) and Flow arrow design (Chevron, Triangle, Open arrow, Double chevron). Static, screen-sized glyphs follow the rendered path in output-to-input order, with corner/socket margins and no independent animation timer. Drawing is isolated with save/restore, clears inherited dashes locally and works alongside locked-route patterns. Both rendering and native pre-cull recovery include conservative glyph padding. Placement clips the candidate index interval before iteration, avoiding traversal of off-screen positions on enormous segments; each route has a 1,024-glyph safety budget.

Pure tests cover all four directions/designs, zoom sizing, short/zero/diagonal segments, viewport clipping, huge coordinates, bounded placement and exception-safe canvas restoration. Renderer integration tests cover on/off settings, every design, glyph-only viewport edges and locked links. Eight relevant regression suites pass, plus integration with the supplied frontend's extracted rendering method. The current settings table was updated to match the registered controls. No live browser verification has been performed.

## Locked-route arrow visibility

v0.4.27 adds Hide on locked routes under Magik / Flow Arrows, default off. It independently suppresses glyphs for valid locked routes when the main arrow setting is enabled. Unlocked links retain arrows, locked styling remains active, and disabling Show flow arrows still hides every arrow. Rendering culling uses glyph padding only when arrows are actually eligible for that route; native recovery retains its conservative bound. Integration regressions cover both toggles, locked/unlocked routes and immediate lock-state changes.

## Arrow continuity follow-up

v0.4.28 computes arrow placement over consecutive forward collinear runs rather than individual editable segments. Adding aligned handles, including dense subdivision into segments too short for a glyph individually, no longer moves or erases arrows on an unchanged straight path. Duplicate points are ignored, while true bends and reversals remain separate runs. Route metadata and input arrays are unchanged.

Nonfinite sizing, overflowing segment length and unsafe placement counts now fail closed instead of emitting NaN/Infinity glyph coordinates. Regressions cover all four axes, dense subdivisions and duplicates, clipping/zoom equivalence, immutable input, retained reversal directions and extreme finite scales/coordinates. Four relevant regression suites pass.

## Gesture redraw validation

v0.4.29 validates active drawing/editing gestures in the foreground renderer, before reading their endpoints. Previously dynamic socket removal followed by a redraw without pointer movement could read a retired socket and throw. Invalid gestures now cancel through the existing rollback path; disabled rendering also clears active gestures at foreground paint. A directed regression replaces the removed socket's position reader with a throwing function and verifies redraw never calls it and exits drawing mode. UI, viewport, planning-cache and flow-arrow suites pass.

## Route command transaction guards

v0.4.30 revalidates single-route commands after synchronous beforeChange listeners. Adding/deleting corners, cleanup, reset, lock/unlock and bend insertion abort their edit if the graph fingerprint or target link identity changes during the undo hook. This prevents commands from editing a newly locked route, undoing a lock applied by another listener, or writing geometry prepared against replaced metadata. Existing graph/read-only checks and balanced afterChange calls remain in place. Directed keyboard regressions cover adding/deleting corners, lock and reset with a beforeChange listener that locks the route. UI, viewport, planning-cache, flow-arrow and routing-snapshot suites pass.

## Corner merging and movement across obstacles

v0.4.31 snaps dragged corners to other interior corners on the same route within max(8, handle-size+2) screen pixels. Coincident vertices merge and the intervening loop is removed while preserving surrounding orthogonal segments. Endpoints are excluded. Snapping is provisional during the drag; subsequent movement derives from the original gesture geometry, so moving away restores the unmerged shape. A cyan active-corner marker shows intended position, turning green at merge targets.

Drag updates now save authored translated geometry rather than storing live node-avoidance detours as pins. The existing live renderer continues to derive clear detours. This prevents transient obstacle routes from becoming persistent extra corners and keeps the intended drag point available while crossing a node. Segment drags use the same authored/derived separation. Existing cancellation and undo handling remain in effect.

Regressions cover adjacent/nonadjacent merging, snap tolerance, immutable input, corner movement through a blocking node with a visible intended handle, a clear rendered detour, continued movement to the far side, green merge feedback and merged metadata. Nine relevant UI/geometry/worker/viewport regression suites pass. No live ComfyUI verification has been performed.

## Socket connection tracing

v0.4.32 adds cyan socket-hover route outlines and amber persistent outlines using Alt+click. Output sockets trace fan-out; input sockets trace incoming links. Empty-canvas click or Escape clears both marks, including in read-only mode. Ordinary clicks/Shift socket gestures preserve drawing/native behavior. Tracing does not modify graph properties or create undo transactions.

Marks store graph/node/socket identities and validate them against the live graph during rendering; replaced sockets/nodes and other workflows cannot inherit the trace. Workflow switches and disabling clear marks, pointer leave clears hover, and blur clears hover while retaining a pinned trace. Outlines preserve the base colour and locked patterns, use widened overlap geometry and include border width at high zoom. Glyph/handle/trace padding remains conservative in both ordinary and native pre-cull rendering paths.

Directed UI tests cover two-link fan-out, unrelated-link exclusion, input scope, locked links, hover leave, Alt pin without drawing, clear actions, socket replacement, read-only pin/clear, unchanged metadata/undo and normal drawing. Eight relevant regression suites pass; live browser verification remains outstanding.

## Socket hover tooltip

v0.4.33 adds a non-interactive tooltip beside the hovered input/output socket, with the requested two lines and bold shortcut labels. Position is clamped to the viewport; tooltip dimensions are measured on entry/viewport-width changes rather than every pointer move. It hides with hover clearing, drawing, Alt pinning, leave, blur, Escape, workflow switch or disabling. UI tests verify exact content, non-blocking pointer behavior and show/hide transitions; viewport regression also passes.

## Direct route highlighting

v0.4.34 extends Alt+click tracing to the route itself. It pins the same amber outline on that one connection without initiating a drag, entering drawing mode or modifying metadata. Socket pins and route pins replace one another; empty canvas/Escape clears either. Locked routes and read-only viewing are supported. Direct pins validate graph, exact link and endpoint node/socket identities plus topology and input ownership, so replacement links cannot inherit the trace. UI regressions cover direct pin scope, no drawing/undo, clear actions, replacement-link rejection and locked routes in read-only mode.

## Automatic node layout

v0.4.35 adds Automatically arrange selected nodes / Automatically arrange all nodes to the existing graph and node context menus. The pure layout module uses iterative strongly connected components, DAG longest-path layers, four barycentric ordering sweeps and variable-size column packing. It avoids stationary rectangles, retains pinned nodes and anchors the result near the original affected bounds. It does not claim global crossing optimality. Group frames and native reroute points remain in place.

Integration stages geometry before writing, revalidates graph fingerprint, node identity, pinned state and actual bounds after synchronous undo hooks, and applies positions in one transaction. Affected unlocked links, including unrelated links obstructed by moved nodes, are then rerouted through the existing staged routing pipeline. Locked metadata remains protected. No-op layouts avoid position undo entries. Read-only, active gestures and active routing jobs are guarded.

Nine regression suites pass. Layout-specific tests cover variable node sizes, fork/join, cycles, disconnected nodes, fixed obstacles, deterministic repeat layout, immutable inputs and a 6,000-node chain without recursion. UI checks cover selected/all commands, legacy Map selection, stationary/pinned nodes, no-op undo, read-only rejection, beforeChange invalidation, real rerouting after layout and locked metadata preservation. No live ComfyUI verification has been performed.

## Native connection creation refactor

v0.5.0 removes the custom step-by-step drawing state machine, committed-corner history, Ctrl orientation toggle, delayed native-release route attachment and browser-contextmenu interception. Socket pointerdown/move/up/cancel events now pass through to ComfyUI, except the existing explicit Alt+click highlight action. Socket starts deselect manual editing so native Delete/Escape keys remain available. Native in-progress render calls (null/dragging link) delegate to the original renderer. Completed graph links retain orthogonal rendering/live avoidance and existing saved-route support. Horizontal-first preview settings and cancel-drawing commands are removed; cancel-route-edit remains.

UI regressions were rebuilt around the new ownership boundary: ordinary/Shift/Ctrl socket gestures, native preview delegation, contextmenu/pointercancel pass-through, output/input connection stand-ins, occupied/incompatible inputs, empty release, retained editing/cancel/undo, serialization, highlighting/tooltips and layout. The native-handler stand-in validates event delivery, not the full upstream browser integration. Relevant existing isolated regressions for corner merging/cross-node movement, lock races, dynamic endpoint changes and layout remain active. The original geometry contracts, including 10,000 generated cases, are retained in geometry_contracts.mjs. Live ComfyUI verification remains outstanding.

Validation: all 22 UI, geometry, layout, cache, viewport, worker, reference/index and native WASM regression suites passed for v0.5.0.

## Mandatory waypoint model

v0.6.0 introduces separately serialized waypoints instead of editing every automatic bend. Dragging a route creates one control; double-click adds/removes, hover Delete removes, Shift+drag adds the endpoints of a translated segment, and dragging onto another control merges only the moved point. Diamonds show explicit controls and active drag validity. Native connection creation remains unchanged. Old route metadata renders through the legacy pipeline until the first waypoint edit replaces that route's geometry.

Waypoint routing searches each ordered span independently and never simplifies across mandatory anchors. Local escape/arrival portals allow node-covered anchors to remain on the route. Portal selection checks actual node bodies as well as expanded clearance rectangles. Blue controls turn red when covered; node movement does not alter control coordinates. A covered control is hit-tested before node bodies and can be dragged out. A newly added/moved control released inside a node rolls back; release rechecks current coverage. Other existing red controls do not invalidate an unrelated valid edit.

Waypoint-mode endpoint motion skips legacy geometric deformation. Sanitization/serialization preserve finite controls; copied targets translate controls when their node identity changes. Cache reuse checks current controls, endpoints, scene and detour policy; native pre-cull preparation cannot reuse a legacy seed for waypoint metadata. Glyph culling includes waypoint handles. Unconstrained batch routing excludes controlled routes and references their actual span geometry. Redundant-corner cleanup skips explicit waypoint metadata. Explicit resets still clear controls.

New geometry regressions cover mandatory order, covered anchors, clear routing after obstacle movement, backward/collinear controls, soft-clearance portals and immutable input. UI regressions cover direct drag creation, node-crossing movement, rejected releases, node-over-anchor red feedback, dragging from under a node, fixed coordinates under endpoint movement, serialization, double-click/hover Delete, Shift translation, batch/cleanup preservation, merge preservation, mid-drag obstacle movement and Escape rollback. Full native handler stand-in and legacy UI/geometry/cache/worker tests remain active. Live ComfyUI verification remains outstanding.

Validation: all 23 regression suites passed. Additional final UI/pure checks passed for copy/paste translation, large coordinates and native-reroute editing exclusion.


v0.6.1 fixes early drag cancellation when frontend reactive properties wrap assigned route records. Saving and rollback now retain the identity read back from node properties, including motion/binding caches. UI regression uses deep reactive proxies and redraws between successive moves; waypoint and UI suites pass. Live ComfyUI verification remains needed.
