# SSR and hydration

Status: implemented foundation with the explicit limits listed below.

## Composable document shells

Use `Document` from `@exactjs/core/document` to fill missing document structure while retaining
authored html/body attributes, head metadata, scripts, and reactive titles. It emits renderer-owned
asset and hydration slots and preserves the leading HTML doctype. See
[child composition and document shells](child-composition.md) for selection rules, asset options,
streaming behavior, and the distinction between reactive documents and server-only shells.

## Host-controlled render checkpoints

SSR accepts `scheduleRender(signal): void | Promise<void>` at initial string, hydratable
string, or document-stream execution and after pending component data settles. Returning
void continues synchronously. A promise delays CPU rendering until admission is available.
Ready component work and transport backpressure do not add scheduling checkpoints.

When the hook is omitted, SSR uses the adapter policy associated with its request signal.
Custom Node handlers must forward the supplied signal; custom Bun pages must forward
`request.signal`. The same host controller observes each request once and decides admission
at render entry and data readiness. No response or component execution is shared. An explicit
hook overrides the inherited render policy, but does not disable initial handler admission.
Use `{ adaptive: false }` on the adapter when replacing its entire policy with a custom gate.

The adapter and a separately bundled renderer share weak signal-to-policy associations in
one realm. Derived request and stream cancellation scopes inherit the policy. Component
frames do not allocate policy registries. The runtime consults admission after pending props
or blocking component work settles, before executing dependent output. The compiler's
existing immediate/pending continuation contract is sufficient; sink drains and parent
completion propagation do not introduce additional checks. Static head publication before
pending body tasks remains available. Queued resumption respects cancellation and the task
deadline, and retains normal component cleanup on failure.

Custom gates should reject promptly and release queued resources on abort. Runtime
configuration forwards the hook to its rendering configuration.

The Node adapter's `createNodeRenderScheduler({ maxBatchSize: 32 })` returns a gate suitable
for sharing across a host's requests. It prefers `node:timers/promises`'s `scheduler.yield()`
and falls back to `setImmediate` when yield is unavailable. Each batch releases at most the
configured number of starts. Queued cancellation rejects with the original signal reason and
removes its continuation. Fully canceled batches release their request references immediately;
the immediate fallback also cancels its callback. A pending yield cannot itself be canceled,
but its eventual settlement has no canceled requests to release. Yield failures reject waiting
requests and remove their abort listeners. Work already
released remains subject to normal renderer cancellation. The scheduler does not claim or
consume response bodies. A batch-size limit bounds starts per callback, not render duration
or the host's total pending request count.

Node request handlers enable adaptive admission by default. `createExactNodeHandler(context)`
handles framework endpoints; `createNodeHandler(handler)` wraps custom page/application handlers
before their eager string rendering or streaming work starts. Create a handler once per host.
Its callback receives a disconnect signal, which must be passed to pending rendering and output.
A generic `writeNodeResponse()` call alone cannot schedule string rendering that already finished.
Native Bun handlers also enable adaptive admission by default. `{ adaptive: false }` explicitly disables
admission. Do not additionally install an always-yielding SSR hook inside an automatically
scheduled handler.

`createExactBunHandler(context)` handles framework endpoints; `createBunRequestHandler(handler)`
wraps a complete native Fetch dispatcher. Pass both `(request, server)` through any wrapper and
route every HTTP request through this dispatcher, without a separate Bun `routes` map. Calls
without a native server remain immediate. The outer eXact handler owns admission for nested handlers.
Bun uses observed arrivals plus the change in native `pendingRequests` to measure request drain.
Returning a Response does not count as draining its body. Native departures include disconnects,
so this is a capacity signal, not a successful-response counter or a client latency measurement.
Scheduling never wraps, buffers, or coalesces response bodies. Each native host owns its controller.

The signal-bound host scheduler may select a policy for the actual string or progressive renderer API.
Explicit `scheduleRender` options retain priority. Bun keeps initial Fetch admission and string
rendering on its adaptive controller, while progressive render entry and data resumption use a shared
half-millisecond work window. An immediate callback marks a new window; promise completion alone does
not reset it. Checks are cooperative and do not bound uninterrupted authored work. Ready component
traversal and transport backpressure remain unchanged. The same compiled component runs in every mode.
Mixed output modes retain one host-wide arrival/departure observer and one bounded continuation queue.
`{ adaptive: false }` disables both inherited output policies.

The Node adaptive controller starts monitoring after four closely spaced requests. Sparse requests do
not create a histogram, timer, or scheduling promise. It samples every 250 ms. Immediate control
windows finish after at least 250 ms and 100 completed responses, or after 750 ms when that count
has not been reached. Scheduled trial and enabled-policy observation windows last at least 750 ms.
Two high-lag baseline windows and enough completed responses trigger a trial.
After a settling interval, it compares the trial's completed-response rate and p95 event-loop delay
with immediate controls on both sides. Busy trials must improve rate and lag against both controls.
A demand-limited trial may instead retain scheduling when lag improves against both controls,
p95 delay is below 3 ms, event-loop utilization is below 80%, and at least 99% of the requests
admitted during that window have already completed within it. This avoids treating a transient
control-window completion burst as sustainable offered demand. Unsuccessful trials back off for
two seconds, increasing up to 30 seconds. A selected policy remains active while
p95 event-loop delay is below 3 ms and event-loop utilization is below 80%. With that headroom, a
lower completion rate can reflect lower offered demand rather than lost capacity. Otherwise, successful
trials are reassessed after 30 seconds, or sooner when a window loses the established capacity or lag
benefit. Once a selected policy has demonstrated that headroom, three consecutive unhealthy observation
windows are required before returning to immediate admission. Saturated policies retain prompt
reassessment. A healthy window clears the streak. Deferring reassessment does not reset its deadline: sustained busy or lagging
windows resume it.
Shorter immediate controls and less frequent routine probes limit the queueing caused by temporarily
disabling useful scheduling. These windows do not impose a response deadline or share rendered responses.
Each decision requires at least 100 completed responses in the compared windows. Quiet traffic
resets the policy; an idle sample disables the monitor and clears the
unreferenced timer. Completions from prior observation windows do not count toward new decisions.

Bun's adaptive admission controller uses the same trial windows, bounded start batches, idle cleanup, and backoff periods. Its
samples use native departures rather than Node finish events. An open body remains pending across
window boundaries. Changes in the native pending count account for requests that drain in a later
window without mistaking Response creation for transmission completion.

For busy Bun workloads, trials must improve native departure rate against both immediate controls.
They must also improve lag against both controls or keep p95 timer intervals below 5 ms. A selected
busy policy may retain its rate benefit with sub-five-millisecond lag despite small control-window
lag differences. Higher lag and rate losses still trigger reassessment, and the routine deadline
remains active. This avoids rejecting a genuine capacity gain because of timer dispatch jitter.

Bun demand-limited selection requires lower lag than both immediate controls, p95 timer intervals
below 8 ms, event-loop thread CPU below 85% of one core, and native departures totaling at least 99%
of observed arrivals in the window. Selected policies satisfying those same headroom and drain
conditions defer reassessment, with three consecutive unhealthy windows exhausting the grace period.
Busy windows consume that grace before the routine deadline as well, so sustained saturated work
retains prompt reassessment. Policies without demonstrated headroom keep the original 250 ms
monitor-tick deadline check, even between complete observation windows. Deferral never resets the
deadline. Native departures include
cancellations, so this remains a capacity policy rather than a successful-response guarantee.

The Bun controller reads `process.threadCpuUsage()` at observation boundaries, not on each request.
Missing, throwing, zero, or unusable counters disable the headroom exception and preserve capacity-based
selection. In the tested Bun 1.4.2 runtime, `performance.eventLoopUtilization()` returns zero during
both idle and busy work, so it cannot establish headroom. Process-wide CPU includes background threads
and is not used as the event-loop thread's utilization. Bun's independent timer includes dispatch
time, so its low-lag threshold differs from Node's native delay monitor.

Bun records two-millisecond timer intervals into an independently owned histogram. In the tested
Bun 1.4.2 runtime, disabling one `monitorEventLoopDelay()` instance also stops unrelated native
observers. Admission cleanup must not disable application monitoring, so the adapter does not use
that shared native observer lifetime.

The controller does not equate handler duration with client latency. Immediate rendering can finish
quickly inside a handler while requests wait in Node's networking queues before that handler runs.
Client p95/p99 and sparse latency therefore remain external validation metrics. A trial can briefly
perform worse before the controller backs off. The policy does not share responses or application
work between requests. Each batch bounds starts per callback, not all callbacks in an event-loop
turn or the duration of synchronous component work. The
[queue-wait trace](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/scheduler-queue-wait-trace-2026-09-11.md) records why a
strict single-pending-callback policy was not adopted.

Progressive document rendering honors `publishRootProps` through the same root-prop schema and
component capture used by string rendering. This includes native head lists and nested resumable
components when the browser adopts the authored document. A keyed map inside an existing reactive
child range publishes its items into that range on both targets; it must not add a client-only list
boundary. This also applies to head content that uses intrinsic receipts rather than render programs.
Native list adoption compares compiler
identities using the same HTML-comment encoding as SSR, including identities containing consecutive
hyphens. The encoded marker is transport syntax, not a different list identity; mismatched identities
still reject adoption. Progressive HTML publishes the rendered
document through its body content before constructing the hydration payload, then emits hydration
inside the reserved framework region and closes the body and HTML elements. Both readable streams
and produced responses honor backpressure between these publications. This permits resource discovery
before hydration delivery. A completed head can commit before pending descendant body work.
After commitment, body writes flow incrementally to the consumer. Tasks owned by the document
component still settle before its output is selected. Document event
streams retain their shell/replacement protocol; fragment HTML retains progressive replacements.
For a direct authored document view, the compiler marks document ownership on the server artifact.
Progressive HTML uses that proof before invoking the view, so it does not read pending task values
merely to discover an HTML root and discard the first result. Conditional or indirect document
views still require runtime discovery. This proof does not yet enable task-independent spans within
one scheduled component to publish early.
Scheduled render retries restore document host claims along with other attempt state, so a discarded
document attempt does not make the settled attempt appear to contain duplicate HTML, head, or body tags.

The shared renderer uses an internal `SsrContext.writerSink` distinct from the output
byte-accounting ledger. The generated program writer can publish spans to that destination, wait for
backpressure, flush a completed head, and flush before awaiting a pending descendant. Enhancement
routing temporarily captures local strings through the same visitor so target markup is ordered
before publication. Marked component boundaries, scheduled components that may retry, and ordinary
intrinsic receipts also capture their local markup. Scalar children publish in sibling order.
Synchronous components whose boundaries are omitted by compiler ownership can write directly to the
enclosing sink, unless standalone resumption publication requires a local capture.
Both program writers and child traversal flush before actual suspension. A compiler-backed fixture verifies
that the completed head reaches the sink while its marked body component is still pending.
Failed drains retain ancestor ownership until pending descendants settle;
the destination owner must cancel request tasks when transport fails. String rendering selects
a request-owned collecting string sink. Writes accumulate with `+=` and use stored UTF-16
length metadata without inspecting accumulated characters. Completion includes late resource hints. If three
times the UTF-16 length fits the byte limit, the UTF-8 upper bound proves acceptance without encoding;
otherwise completion checks the exact UTF-8 size, including cross-write surrogate pairs. Head and await
flush signals are no-ops for this sink because its result is a complete string. Completion, failure,
and cancellation release retained references. Suspense attempts capture their local output before
committing a result. Progressive documents select a streaming destination. Its body flush threshold
is `streamBufferSize` UTF-8 bytes (default 8192, a positive safe integer). A complete accepted span
can exceed the threshold; the sink flushes the buffer plus that span instead of splitting ordinary
writes into many transport calls. The destination retains a small closing-tag lookbehind and never
separates surrogate pairs across encoded chunks. Head and actual-await boundaries flush early.
On Bun, progressive output retains pending fragments in a request-owned array. UTF-16 length supplies a
lower bound and three bytes per uncounted code unit supplies a conservative UTF-8 upper bound.
The destination joins and counts a pending group only when an exact count is needed for the output
limit, body flush threshold, or publication. Every accepted write still respects the exact output
limit before subsequent authored work proceeds. Counting a group accounts for surrogate pairs
across its boundary without rescanning the collected prefix. Completion, failure, and cancellation
release pending fragments along with the collected buffer. Node retains per-span counting, which
performed better there in focused comparisons. Other hosts use the same per-span default.
Captured component output, speculative documents, and whole-output extensions still require their
own local storage until commitment.

The `renderProgramWriter` ownership layer accepts caller-owned output for the native
continuation writer. It shares the existing sink contract, retains local enhancement captures,
holds document ancestry through head pressure, and disposes prepared siblings after writer
settlement, including failure. The compiler now supplies that output as the writer's fourth
argument, and both direct-component and generic-operation entry points use the same contract.
Generated operations write to the sink without returning an intermediate segment array. Components
do not branch on sink type or access its string accumulator. Suspended writers retain their locals
in a compiler-owned continuation frame; synchronous traversal does not allocate that frame.
Package compilation, generated-app typechecking, and the initial unreleased ABI fixture validate
this contract. Completion callbacks are allocated only when work suspends or prepared sibling
cleanup is owned; completed synchronous writers return directly. Prepared programs pass their
invocation explicitly to a shared invoker instead of allocating a wrapper closure per position.

Scalar-prop preparation adds an optional compiler proof to generated server
reference issuance. The runtime carries it on the request-local reference, consumes it before
synchronous component execution, and discards it when props normalization or children handling
replaces the bag. Only the first eligible issuance attempt in a prepared program invocation may
produce a proof; later visits and reused references take ordinary preparation. Compiler emission
is currently limited to empty or one-field data bags. A proof must cover a fresh private
bag's complete field set and actual scalar values, not merely declared TypeScript prop types.
The runtime tests the value only after excluding a repeated invocation attempt. Inherited reserved
key or enhancement metadata disables the proof because reference creation could otherwise invoke
an accessor and expose the bag. Registered symbols share proof consumption and attempted issuance
across separately loaded SSR copies. The guarded implementation passes SSR/compiler and browser
validation and is present in canonical comparison builds. The optimization is retained for
measured large-tree improvements. Small cases are approximately neutral in longer confirmation;
HTTP results are mixed. See the scalar-props reports under `docs/performance-baselines`.

Reference construction also uses the first private-bag proof to skip
reserved key/enhancement normalization. The core plain-props reference helper retains the same
contract, props, empty children, and active domain. Its caller must prove the complete fresh data
bag and exclude inherited reserved metadata. Missing proof fields, repeated attempts, and
potentially exposed props retain ordinary construction. Compiler-emitted calls and hydration
formats are unchanged. The shortcut is retained after core/SSR/browser validation and paired
measurements; see the [historical reference study](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/proven-reference-2026-09-10.md).

The direct server frame's list helper retains already-issued keyed children in a request-local
list carrier instead of constructing and immediately redeeming a generic fragment receipt.
The ordinary fragment renderer still owns its markers, ordered traversal, pressure, and child
lifetimes. Iterable input is fully materialized before callbacks; each item's render callback
precedes its key callback. Generic authored fragments retain their enhancement-capable receipts.

`writeProgramChild` supplies the writer's direct child/component publication: it checks the
program's delimiter budget before starting child work and preserves marked or marker-free output.
It shares `writeProgramBoundary` with current marker rendering, including pressure checks, pending
child flushes, and rejection ordering. References created during the generated preparation prefix
must be handed to the sibling-preparation owner; the outer component's issuer alone cannot capture
references created later inside the writer.

Traversed marker boundaries write their opening, child output, and closing directly to the active
sink. They wait for opening backpressure before starting children, flush before awaiting pending
children, and wait for closing backpressure before completing. Child failure does not publish a
closing marker. Marker rendering can therefore suspend even for a synchronous child. Completed
resumption and refresh strings use the finalized wrapping helper. Client-island and server-slot
wrappers retain local capture so their child output cannot precede the wrapper that owns it.
Hydration insertion locates the final body close from the tail and copies preceding chunk references
without calculating a whole-document character offset. Split closing tags remain supported.
Completed string results retain the renderer's knowledge of document hydration slots. Ordinary
fragment output therefore avoids a whole-HTML marker search that would flatten its string rope
before hydrated output is consumed. Output extensions can replace markup, so their results and
foreign string results still use content-based slot detection. Explicit slots retain their original
placement, and public plain HTML never exposes the hydration marker.

Hydration validation keeps shallow active ancestry in a request-local stack, promoting it to a
native `Set` at 16 active containers. Only the active path participates in cycle detection; shared
sibling references remain valid. Promotion preserves every active ancestor. Initial version-one
generated projectors use only the tracker's `has`, `add`, and `delete` operations, so shallow
graphs do not require promotion just to invoke generated code. Deep graphs still promote at
16 active containers. Error-path validation starts with independent ancestry.
Serialization checks, depth/node limits, and the hydration wire format are unchanged. Unknown
projector versions use the schema interpreter.

## Package ownership

- `@exactjs/ssr` renders strings, documents, event streams, progressive HTML,
  hydratable output, and adapter-neutral response objects.
- `@exactjs/hydrate` adopts server DOM, activates client islands, invokes the
  server endpoint, validates results, and applies patches.
- `@exactjs/hydrate/root` is the statically selectable hydration-only facade for applications
  without compiler-generated server operations, response patches, or client islands. Its root
  owns adoption and disposal but does not retain those optional modules in the browser graph.
  Its `hydrateAfterNavigation()` entry accepts an element or the current `document` and gives
  visible SSR content one rendering opportunity before
  scheduling user-visible adoption outside the DOMContentLoaded critical path. An
  interaction-capture fallback still activates the root synchronously when a user acts first, and
  hidden documents use a task fallback because animation frames may be throttled indefinitely.
  Hydration roots must belong to the executing window's current document. An embedded document runs
  its own eXact runtime instead of transferring DOM ownership to its parent window. Scheduling uses
  that current document's readiness and queues. Activation has one terminal settlement:
  scheduling and hydration failures remove pending hooks and cannot trigger a later retry.
  The ordinary opt-in sink reports aggregate hydration. The framework-comparison diagnostic build
  adds client creation, DOM capture, adoption, and control-restoration phases without shipping those
  timers in a production application. Its nested DOM profile divides adoption into component
  construction and attachment plus render-program claim, structural-child adoption, and binding,
  so maintainers can distinguish scheduling delay from the exact adoption work performed.
- `@exactjs/server` owns allowlisted invocation/refresh dispatch, request
  validation, authorization hooks, limits, and runtime-neutral adapters.
- `@exactjs/compiler` owns placement, artifact generation, operation
  contracts, hydration registration, and final client-bundle isolation.

## Choose the hydration owner

A complete client root uses `hydrate(clientApp, root, options)`. That root adopts its own
component tree, including components that call generated server operations. Pass the generated
registration and transport settings when those operations are present. In paired artifacts, an
extracted intrinsic island, its projected server fallback, and the complete client root share the
same structural child ranges. Whole-host optimization cannot erase an extraction boundary on only
one target, since that would change hydration markers and force DOM replacement:

```tsx
import { hydrate } from '@exactjs/hydrate';
import { app } from './generated/page.exact.client.js';
import { exactHydrationRegistration } from './generated/registration.js';

const client = hydrate(app, document.querySelector('#app')!, {
	...exactHydrationRegistration,
	endpoint: '/__exact'
});
await client.whenSettled();
```

A partitioned server page instead publishes independent client boundaries. Its bootstrap does not
render the page component again. It uses the registration generated from the same artifact graph:

```ts
import { createExactClient } from '@exactjs/hydrate';
import { exactHydrationRegistration } from './generated/registration.js';

const client = createExactClient(document.querySelector('#app')!, {
	...exactHydrationRegistration,
	endpoint: '/__exact'
});
await client.whenSettled();
```

A hydrated owner also owns the interactive controls rendered by its ordinary child components.
SSR emits their compiled fallback markup without publishing nested control islands or serializing
local callback props. A control outside such an owner remains an independent island and must
satisfy the normal serialization contract.

Call `client.dispose()` when retiring either owner. An islands-only bootstrap cannot activate a
complete root that published no independent boundaries. Choose the bootstrap matching the server
artifact's ownership; adding a dummy server task does not establish the missing root owner.

## Server rendering

`renderToString()` and `renderToHydratableString()` return promises. `renderKeyedListSnapshot()`
also returns a promise because item components may depend on pending tasks. String and stream
entry points share one traversal, component executor, and hydration capture. There is no separate
synchronous renderer or `Async` API alias. Internal operations return available output directly
and create continuations only for actual pending work or asynchronous cleanup.

Compiled programs write through caller-owned output, without an intermediate segment array. Their
continuation frames and promise callbacks are allocated only when an operation or sink drain is
pending. Both output modes retain the same enhancement-prefix capture and output bounds. String
results publish completed `html` as a string value. The collecting sink retains the normalized
doctype and compiler-identified closing-body boundary separately. Ordinary writes still use `+=`;
only those document edges split the accumulated text. Recombining the plain `html` uses concatenation
without inspecting its characters. Hydration insertion can inspect the short edge chunks instead
of flattening the rendered body. Programs without a closing-body hint and output extensions retain
the ordinary chunk-search fallback. The combined `htmlWithHydration` string is lazily materialized
and cached. Streaming head publication keeps its existing destination and flush behavior.
Resumption reads remain deferred. Hydration publication uses its fresh options object directly
without copying it again.

Child traversal reuses immutable metadata for empty structural output already written to the sink.
Empty scalar strings remain text results, preserving adjacent-text separation. The shared empty
result retains no component, request or cleanup state.

Nested program writers retain the existing traversal target and use shared forwarding functions
instead of allocating child-rendering and sibling-preparation closures for every program. The
writer's `render()` operation remains callable. Each program output still owns its own preparation
record, so sharing the target does not share cancellation or cleanup state between invocations.

Direct component content uses its existing artifact execution as that target. The selected owner
is bound before traversal; descendants receive separate executions, and scheduled retries await
the preceding output before reusing their execution with the same owner. Shared forwarding methods
replace per-content closures without moving preparation or cleanup ownership onto the target.

Node full-response adaptation materializes buffered chunks once and calls `response.end(html)`.
The body-only writer retains ordered chunk writes and backpressure for handlers that own subsequent
content. Asynchronous producers and Web Streams retain progressive publication and cancellation.

Task execution belongs to the core task system. A component frame exposes pending work and a
completion revision to rendering. The renderer checks that state, waits only when necessary, and
retries if a relevant task completed while descendants were rendered. Hydration treats writers of
compiler-selected shared contexts as publication dependencies, even when their authored task is
nonblocking: the value and its completed continuation identity must be published together to avoid
repeating the task in the browser. Other nonblocking tasks retain their readiness policy.

An internal execution frame created with `trackTaskIdentities` also accepts a compiler-selected set
of transition identities for blocking-work queries and completion-change tokens. Ordinary frames
retain their pending-task `Set` without allocating identity lookup. A selected query excludes unrelated identified
tasks, retains failures for selected tasks, and includes unidentified work conservatively. It returns
no promise when its selected work is already complete. Pending queries cover current activations;
consumers recheck after settlement to include newly issued work. Selection does not start tasks or
change request cancellation and disposal. General traversal retains whole-component readiness.
A compiler-proven static document head can precede the document's own blocking tasks: its body
program carries a deferred value reader, evaluated through the existing task owner only after
readiness. This first proof admits literal intrinsic markup and direct body state reads, excluding
calls, child components, dynamic attributes, enhancements, and nonblocking tasks. Other scheduled
documents settle before evaluating their view. A synchronous document can also commit its head
before awaiting tasks owned by body descendants. Completed tasks require no extra suspension.

Progressive HTML connects that completed-head boundary to the response consumer. The shared
renderer recognizes a root HTML program after issuing the synchronous component, allowing that
document to write directly while retaining local capture for non-document roots and speculative
boundaries. The document destination collects output until a completed head commits. It then
releases body buffers under transport backpressure and retains the closing body/html tags for
hydration insertion. It does not retain a second complete document. Plain string rendering still
accumulates without exposing partial results. Exact UTF-8 limits are checked before publication;
transport and limit failures cancel pending descendants before unwinding their parents. Completion,
failure, and cancellation release retained sink output.

Progressive destinations complete emission directly when reader demand or the environment writer
is ready. They return a promise only for actual pressure. The head destination preserves that
completion mode through the shared renderer, so committing a ready head does not suspend every
ancestor program. Initial reader demand, pending component work, cancellation checks, and output
limits remain enforced.

Document recognition is isolated at the progressive root entry. That entry uses the existing
direct component executor for preparation, state capture, tasks, and disposal, then delegates its
issued content to the existing operation target and writer. Ordinary component and string execution
do not check a head-publication flag. Selected, scheduled, and enhanced roots retain their existing
capture boundary; there is no separate descendant renderer or cloned request context.

Full-document body descendants settle in that traversal instead of producing a draft followed by
a second full render. Fragment streams retain shell/replacement events. Progressive HTML framing
handles internal `head` and `body` publications followed by the reserved document tail, so final
HTML contains each span once. Hydration remains before the closing body/html tags. A committed
document cannot be rerendered. Output extensions retain collected
publication so transformations can inspect the complete output before commitment.

Native SSR emits deterministic markers for components, cells, dynamic
children, fragments, keyed lists, Suspense, Activity, client islands, and
compiler-planned server ranges. Unsafe marker-key characters retain canonical UTF-8 hex encoding;
the encoder shares its stateless UTF-8 encoder and byte-to-hex table and concatenates directly,
avoiding a temporary string array for each key without changing the protocol.
Multiple server descendants beneath one client
boundary retain independent plan-edge identities and adoptable DOM slots rather
than sharing one broad children slot. Active attributed enhancements remain
ordinary component owners in the same partition graph. String rendering waits for required
blocking work. Progressive
rendering emits a shell and can reveal settled Suspense ranges independently;
it falls back to an authoritative root replacement if work outside those
ranges changed.

Root-document mode accepts authored `html`, `head`, and `body` and inserts
framework-owned hydration or progressive-stream nodes into reserved positions.
An authored `html` root receives a doctype, and unambiguous missing `head` and `body`
regions are synthesized. Hydratable string rendering places its state publication before the
closing body tag. Fragment string rendering remains a fragment API.
Document shells remain ordinary components with props, state, tasks, and reactive expressions.
Server compilation retains document host identities while coalescing proven static head and body
children into the same render programs used elsewhere. Dynamic expressions, lists, components, and
independently compiled dynamic child regions retain their existing client adoption boundaries. An explicit ordered head/body pair can use
a compiled HTML program; incomplete or conditional composition retains runtime normalization.
The program's `ssrHost` metadata identifies its root intrinsic. The shared output traversal retains
document-host ancestry across pending descendants and cleanup, and ordinary roots invalidate the
root-document probe. This prevents compiled intrinsic regions from concealing nested documents.

`documentShell(application)` explicitly separates server document ownership from hydration ownership.
The requested root must be a compiler-issued component. The callback returns an ordinary document
component tree containing that exact application child once. Only the requested application's props
and ordered resumption records are published. Hydrate that component in its corresponding body
container, and pass it to `readPublishedRootProps`. Shell contexts remain available to descendants
during SSR; shell tasks and resources retain normal cleanup. Client-required contexts still need
their normal client providers. Rendering an authored document directly, without this option, retains
document hydration and its reactive state.

The request-local shell scope suppresses shell resumption publication while preserving rollback
checkpoints across the application boundary. Traversal switches to the application's capture and
markerless-root metadata at that reference. Duplicate or missing application positions and shells
without a root HTML document are rejected. The shell and application use the same rendering engine.
Awaiting progressive HTML reader cancellation also waits for the rendering owner to finish
descendant cleanup after signalling abort.
Progressive Web Streams allow four `streamBufferSize` thresholds of queued read-ahead before
applying pressure, plus the complete span that crosses that budget. This avoids repeatedly
unwinding the component continuation stack for individual body chunks while keeping queued
output bounded. The body flush threshold and head/task flush points are unchanged.

Native SSR emission records ordered write sites separately from preparation statements and the
function wrapper. Each write records its operation and whether its settled result updates the
character count. The production emitter lowers this plan into one fallthrough continuation:
synchronous operations continue in the same invocation, pending operations resume with their settled
value, and pending sink drains resume at the next write. Output storage belongs to the caller.
It issues statically selected sibling references after slot validation and gives the caller their
preparation resource before traversal. The same references are subsequently visited, preserving
concurrent scheduled-task startup and disposal when later siblings are not reached. Serialization
primitives with synchronous contracts skip operation-promise checks while retaining sink drains;
a single synchronous terminal write needs no continuation state.
The writer stores a frame only when an operation or drain is pending. Reentry restores
validated locals, character accounting, and the already-issued sibling references without
repeating preparation. One suspension postlude keeps generated frame construction linear in the
number of locals and write sites. Its promise constructor comes from the runtime operations table,
and its empty frame values use `void 0`, so authored `Promise` or `undefined` bindings cannot alter
these continuation decisions. See the [lazy-frame measurements](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/native-lazy-frame-2026-09-09.md).
The production wrapper selects this emitter under the initial prepublication caller-owned writer
ABI. The native-emitted scheduled fixture has document, cancellation, and browser-adoption coverage.
The current integration and rejected experiments are recorded in the
[caller-owned writer report](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/caller-owned-writer-integration-2026-09-10.md).
These checks do not prove task-independent reads within a scheduled component.
Normalization recognizes both generic intrinsic operations and prepared program roots. Client
adoption continues to use the existing document intrinsic identities. A separate server-only shell
changes the hydration root explicitly without a second renderer. Early publication and task settlement follow the rules
above.

Empty external `script` roots with an explicit `src` and explicit attributes can also use a
server render program. Their element IDs and keyed item markers remain aligned with the ordinary
client intrinsic, so document adoption does not replace or recreate the script. Inline content,
spread attributes, refs, and enhancement-owned scripts retain their existing rendering path.
This optimization changes server construction only; it does not introduce script-loading policy
or change client script execution semantics.

Server artifacts fold native literal `href`, `src`, `action`, and `formAction` values with
unambiguous relative, fragment, HTTP, or HTTPS prefixes into escaped static markup. Literal
stylesheet links can therefore join their surrounding static head contents. Expressions, other
URL forms, custom elements, and client artifacts retain their existing property operations and
URL policy. Dynamic target contributions still use the checked runtime attribute path.
Server attributes containing spreads are merged in authored order before serialization, so the
last supplied value wins and URL policy applies to that final value rather than duplicate HTML
attributes.

Internally, resumption capture follows the options passed through component execution, including
task preparation, suspension, publication, and rollback. The shared SSR output context owns the
sink, document state, and scheduling resources, but does not select a component's capture. This
keeps state publication ownership consistent without cloning output contexts. Public entry points
still select the requested root's capture; this internal separation does not automatically exclude
an authored document or select one of its children as a different hydration root.

Empty external scripts with entirely static, safe attributes can also join a document host's
server markup. They retain their compiler-generated element IDs for client adoption. Dynamic
sources, inline script content, spreads, event handlers, refs, and enhancements keep their
existing handling; this does not change script execution or loading policy.

Use `hydrate(operation, document)` to adopt an authored document root. Native lists in its head
retain their compiler-owned fragment identities during adoption. Nested resumable components
captured by the root use ordinary component boundaries or compiler-owned slots, rather than
duplicating props in independent island wrappers.
Rendering applies output-size, task-pass, and task-duration limits.

The native compiler emits branded render programs for compiler-finite intrinsic regions. HTML,
SVG, MathML, scalar text, finite host properties and attributes, classes, styles, URLs, ordinary
form controls, events, and refs reuse focused renderer operations. Closed server artifacts emit a
component-specific SSR function whose generated calls prepare known values and then write static
markup, scalar text, structural children, and attributes in source order. Universal artifacts use
the same generated server lane alongside their client topology. The server runtime
provides escaping, marker, resource-limit, and recursive-child mechanics; it does not interpret a
generic render tape or retain client templates and topology tables. Generated scalar writes include
adjacent serialized static markup, reducing separate append calls while retaining the root opening's
ownership of its markup. Static content is charged once by the program; dynamic escaping, marker
placement, and output limits remain part of each scalar write. Markerless SSR writes escaped
values directly. Compiler-closed roots share the ordinary renderer and its optional output-extension
pipeline; bundle guards exclude generic component and client-reactivity runtimes, not that shared
pipeline. Extensions execute only when supplied. A synchronous compiler-closed component executes on a request-local state frame
without allocating the browser's durable component instance. A resumable component retains its nested interaction callbacks lexically; the compiler does not
publish unused independent element exports for those callbacks.
Restoring overlapping state paths, such as an array and its length, preserves the array
and its entries. Keyed lists also retain this
request-local ownership when setup includes server tasks; generated task operations and the
selected server frame must use the same execution contract. The frame snapshots compiler
expression props, publishes only compiler-selected resumable state after successful output, and
uses a shared non-retaining keyed-child renderer if a generated list callback produces a dynamic
slot shape. That server-only map helper uses prepared keyed-child carriers while retaining the
outer fragment's identity and component domain. It preserves render-before-key evaluation order
and uses the same keyed rendering operation as generic receipts, without allocating a generic
opaque operation and private payload entry for each item. Compiler-closed child ranges, keyed children, and nested component calls are prepared as
request-local server ABI carriers and consumed directly; they are not VNodes or public opaque
operations and are never retained or serialized. A prepared server render program retains a small
nominal wrapper so ordinary child normalization cannot flatten its compiler-created values array.
All server invocations share one immutable empty client-reader table. The compiler may hoist a
server invocation whose values are entirely literal and remain inside HTML serialization.
Those private inputs are reusable; document output, identities, target contributions, and
backpressure remain request-local. Invocations with enhancements, component or structural child
slots, or dynamic values retain request-owned wrappers. Hydratable SSR also omits scalar delimiters when
static markup bounds
the value on both sides; the client claims that text, or creates an owned empty text node, at the
compiled position. Adjacent text retains delimiters where browser parsing could merge independently
updated values. Client mounting clones a cached inert template, and hydration adopts elements and
scalar text through generated claim calls. Nested conditional regions retain the namespace established
by their intrinsic JSX ancestors, and standalone SVG or MathML programs mount through a
namespace-correct template. A finite intrinsic client program may contain compiler-owned structural
child slots: the server renders those children recursively through the ordinary dynamic-marker
protocol, while hydration adopts and subsequently patches only the marked child range. Enhancement-
routed, opaque-spread, raw-content, and otherwise dynamic hosts select explicit focused operations;
native TSX does not retain a region-local VNode fallback.

Compiler-closed render programs encode retained scalar, structural-child, and component ranges as
paired `x:` comments with dense artifact-local base-36 ordinals. Client and server projections
derive those ordinals from the same marker-only sequence even when their complete slot tables
differ. The program root scopes the identities; they are not durable application or transport
identifiers.

A keyed item whose value is a
compiler-prepared single-intrinsic-root
program uses that element as its item boundary. The receiving keyed receipt supplies the key and
owns the item scope; hydration does not need an additional pair of item comments. Generic items,
multi-node ranges, and server keyed-list patch snapshots retain explicit item boundaries. The client
continues to accept the older paired item markers.

A client program places a statically resolved native component in an explicit component lifecycle
slot. Server and complete artifacts retain the component's recursive execution and add the same
stable range marker, so hydration claims the component without rediscovering the surrounding host
tree. Once claimed, the compiler-proven single component mounts and patches through its direct
lifecycle operation rather than general sibling reconciliation. State, interactions, contexts,
split boundaries, transitions, and keyed-list render callbacks
remain owned by the component's durable instance inside that slot.

When structural slots contain compiler-known keyed-list expressions, hydration adopts every slot
inside one component render transaction. Later refreshes use the same grouped lane, preserving
keyed instance identity and disposing removed registrations once after the complete list group has
published. The compiler supplies stable list-site identity, original collection provenance, and key
identity to that lane. Each materialized key owns the reactive expressions created by its item
factory, and removing the key disposes that item scope after its DOM range reconciles away. The
stable server marker ranges remain the ownership boundary for each resulting DOM range.

SSR allocates one request-owned FIFO task scheduler when the first scheduled task needs it.
`maxAsyncSsrConcurrency` defaults to 4, accepts 1 for serial task execution, and is capped at 32.
Ready work starts immediately when a permit is free. Only contention suspends permit acquisition;
task completion and cleanup retain their asynchronous ownership boundaries.
The task system owns execution and dependency settlement. HTML traversal remains ordered, so
components do not concurrently mutate document hosts, marker allocation, or enhancement state.

Components with compiler-attached execution subgraphs wire reachable child components before
waiting for their own setup continuations. Ready task generations enter that same request
scheduler; rendering itself holds no task permit. This removes the recursive async
discovery waterfall without building or flattening a request-wide plan. Explicit compatibility
boundaries keep the ordinary drain-before-render path, and structural render reachability still prevents inactive
branches or unselected dynamic components from starting work.

A direct scheduled component executes on a request-local state frame, settles pending
props that ordinary construction or rendering consumes, and preserves dependency provenance only
for compiler-proven task-exclusive inputs. The generated `deferredTaskProps` list is the complete
authority for that distinction; SSR does not reconstruct it from the generic execution graph.
The component consumes generated input/output slices directly. It allocates neither a generic component
instance nor a reactive component scope. Its generated setup and task bodies mutate that plain state
directly; request cancellation wraps only the awaits and owned timers that need it. A wait that
finds an already-aborted request or an expired deadline still observes its supplied work, so a
later disposal rejection cannot become an unhandled rejection. Compiler-proven scheduled child slots emit direct issue
calls in the server artifact, so their setup tasks can enter the bounded scheduler while the parent
prepares their child invocations and before the first sibling settles. Independent native siblings
use the same component-boundary ownership on both targets. The client must not add dynamic child
ranges whose markers the server omits; component receipts retain parent-prop updates directly.
Each request owns and disposes its frames, task generations, cancellation, and buffered
resumption snapshots; immutable component contracts, cached resumption schemas, and prepared
indexes are the only cross-request state. Cached schemas contain no request values: they retain
only compiler-selected path segments, context order, and allowed continuation identities. Direct artifacts also omit the generic reactive error context. A direct construction
failure propagates through the request unless the reachable artifact graph explicitly installs the
generic component/error-boundary capability.

Sibling preparation consumes ordered program values directly. It checks each component's compiler
execution contract before materializing task-construction props and creates an ownership list only
when it prepares scheduled work. Synchronous components evaluate their props during their own
rendering, so the scheduling pass does not introduce an extra evaluation of those props.
Programs that prepare no scheduled siblings return through the ordinary ordered renderer without
attaching an empty cleanup scope. Descendants retain their own ownership and cleanup, and programs
that prepare siblings retain disposal through success, suspension, and failure.

Component traversal invokes shared child-forwarding methods on the request-owned artifact
execution. Those methods read its context and options instead of creating forwarding closures
for every component. Descendants still receive separate executions and render owners; a suspended
component keeps its own execution until its output and cleanup settle.

Compiler task-effect analysis retains property path segments internally through callable propagation
and dependency deduplication. A literal dotted key and a nested property remain distinct, even when
their display labels match. Effects without structured provenance cannot prove that another read is
redundant. This is groundwork for selective SSR task waiting; the renderer still waits at component
scope, and wildcard uncertainty and effect completeness require further analysis before early output.

Context providers and consumers do not require that generic component capability. Their direct
frames form a request-local logical parent chain and store only contexts actually published by the
component. This preserves nearest-provider and ambient-request lookup while allowing forwarded
children or explicit foreign compatibility values to retain their owning serializer when their
output topology is not compiler-closed.

Compiler-closed hydration publication reads each compiler-declared positional field once while it
constructs the final getter-free tuple arrays. That pass enforces the schema, cycle, depth, and node
limits without allocating property descriptors; a getter on a declared authored field therefore
uses ordinary JavaScript semantics and runs once. Structurally open values and output-extension
results retain descriptor-safe prototype and accessor validation. Serialization encodes validated
reactive collections through the JSON replacer instead of first constructing a second encoded
object graph. The byte limit is computed over the exact escaped UTF-8 payload without allocating an
intermediate byte array. String and progressive rendering select native byte counting when the
host provides it, with a portable counter otherwise. Stream encoding uses the host's native UTF-8
encoder when available and `TextEncoder` otherwise, without importing Node modules into the neutral
runtime. Each emitted byte range remains independently owned. Byte-limit semantics, split-surrogate
accounting, and serialized values are identical on both paths.

All native rendering uses direct resumption capture. Only compiler-owned root state and prop
storage use direct reads; published input
comparisons and nested values retain accessor-safe reads. Hydration JSON escapes script-breaking
characters without changing its wire representation. Static literal `charSet`, `charset`, and
`content` attributes on `meta` elements are compiled into markup on both targets, while server root
attribute bags remain available for enhancement overrides.

Dynamic text of at least 32 UTF-16 code units first uses a native search for HTML escaping
characters. If none are present, it retains the original string and charges it through the output
sink, using the adapter's UTF-8 counter when available. Short text and text requiring escaping keep
the combined escaping/accounting loop. The sink retains exact byte limits and surrogate pairing
across adjacent publications; no encoded buffer or hydration protocol change is introduced.

After output extensions choose the rendered root, SSR reuses a root-keyed immutable contract
blueprint for components reached beneath that root, including dynamic components on first use. It
does not build a second execution-plan index. Weak keys avoid retaining replaced dynamic components,
and an attachment or compiler-identity change forces contract validation again.
The cache contains no props, contexts, state, task generations, cancellation, or other request data.
Request-domain capabilities use a fixed private record shape instead of temporary spread objects.
The public domain remains an immutable execution identity; optional capability defaults, shared
logging state, and request-owned wall-clock samples retain their existing behavior.
Per request, components allocate only their compact value slots and the watchers required by actual
transitions; components without transitions skip continuation-frame allocation entirely.

## Hydration

Hydration adopts matching server nodes rather than recreating them. It
preserves element identity, form state, refs, handlers, retained Activity
ranges, and component ownership.

Compiler-cell roots adopt their existing cell range directly; they do not pass through static-tree
repair or clear the root container. Compiler-proven native component calls use the component's own
identity marker without an additional cell marker pair. Intrinsic cells and structural expression
ranges retain their markers because those ranges still own independent reactive updates.
Compiler-direct structural ranges are claimed by their component-local operation and ordered
hydration cursor, so their explicit marker pair uses one shared anonymous identity instead of
serializing the operation's unrelated stable id. Closing claims pair nested anonymous ranges by
depth. Dynamic-component, keyed, refreshable, and otherwise externally addressable ranges retain
their stable marker identities.
Closed client render programs adopt their intrinsic nodes, scalar slots, and structural child
ranges through component-local claim tuples. Shared focused operations walk the known static topology in DOM
order. A structural call advances directly to its matching close marker, so a variable number of
SSR nodes cannot perturb later static siblings. The successful path therefore creates neither a
region-local identity map nor a second interpreted node/slot plan. The same generated executor
selects the template-sentinel representation for client-created regions, marker-free bounded SSR
text, or the identity-sentinel fallback for ambiguous SSR text. Programs retain the SSR DOM without
rebuilding an equivalent generic host tree. Initial adopted prop binding is covered by the
root-level focus/form snapshot, so it does not repeat focus inspection for every intrinsic.
Completed component mounts cache their first target and host candidates; parent publication reuses
those structural results instead of recursively rediscovering roots through nested components.

Finite render-program roots do not receive a generic cell envelope in compiler-generated SSR. The
program's root element and generated dense claims provide its fixed ownership and hydration
identity. Authored or protocol-facing
`data-exact-id` attributes are not consulted as a fallback render-program identity map.
Variable-width component, cell, fragment, list, and structural ranges keep their markers when no
compiler-known boundary is available. A compiler-proven final structural or component child uses
its parent and the end of the child list as its complete retained boundary. A native child followed
by a plain compiler-known intrinsic can instead use that intrinsic as its exclusive end boundary
when the child belongs to the program root or to a direct intrinsic parent with a stable forward
path, and all later siblings have fixed width. Both forms omit an otherwise redundant comment pair
while preserving the child's explicit range ownership; the parent still does not inspect whether
the child produced multiple nodes or no nodes.

When scalar expressions and static text fill an intrinsic, SSR emits a continuous text span
without scalar comments. Initial bindings collect each value once under normal dependency
tracking. Adoption validates all such runs before splitting text at UTF-16 offsets with
`Text.splitText()`, retaining independent nodes even for empty values. A mismatch uses normal
owning-root recovery. Temporary run plans are released after attachment or disposal; mixed
structural content retains its existing boundary strategy.

Compiler-closed hydratable component roots likewise omit the outer component boundary. Their
direct hydration envelope carries a markerless-root presence bit, which is a compiler proof for
markerless root attachment rather than a request to ignore marker validation. Nested range comments
keep their ordinary ownership.
When the hydration JSON script is emitted beside the root markup, attachment keeps the script in the
DOM but excludes it from the component's adopted output range.

The ordinary compiler-direct document path publishes that envelope as a versioned tuple. A bitmask
identifies which canonical fields follow, and the values appear once in fixed protocol order. This
keeps optional metadata compact without turning authored values into a new encoding: root props,
state, contexts, endpoint tables, and other authored containers still cross the descriptor-safe
validation boundary in their existing representation. The validator rejects unknown mask bits,
missing values, and trailing values. The hydration-only client entry also rejects complete-runtime
fields such as endpoints and continuations. Output extensions retain the keyed envelope because
they are an explicit generic transformation boundary rather than a compiler-direct document.

Schema-defined empty hydration metadata is omitted from compiler registrations and document
payloads. Hydration restores omitted continuation arrays and resumption arrays or objects with
shared immutable empty values. This compaction never applies recursively to authored state, props,
or public-context values, where an empty collection remains meaningful application data.
The Vite, Webpack, and Bun adapters also accept `renderMode: 'hydrate'` for browser artifacts that
adopt SSR HTML and `renderMode: 'client'` for fresh-mount-only artifacts. Both modes retain the
same executable component semantics while leaving analysis-only state, task, and reactive
inventories in the compiler's build result instead of emitted JavaScript. Client-only projection
also omits component resumption records. The default `universal` mode preserves the complete
contract when a build cannot commit to one browser rendering mode.
An SSR-only server entry can use `target: 'server'` with `renderMode: 'server-render'`. That facet
retains compiled setup, dependency-ready tasks, rendering, and resumption publication while omitting
the executors used only by later continuation requests. A server that also composes an executor
contract must keep the default complete server mode or build a separate executor entry.
Applications whose client entry imports a generated hydration registration should set
`includeContinuations: false` in `createExactHydrationConfig()` so the HTML does not duplicate the
same continuation contracts.
Artifact generation may also emit a named client bootstrap from that registration. The build graph
selects the server-operation and lazy-island client surface before bundling, while the emitted
module contains only executable registrations and request-independent tables, not the graph's
descriptive component or partition inventory.
When a lazy island later exposes the same compiler contract, hydration canonicalizes omitted empty
client fields before comparison. Equivalent repeat registration is idempotent; a materially
different contract with the same continuation identity remains an error.

Compiler-finite client boundaries are grouped once per response by component name and canonical
prop schema. Each boundary carries a compact table coordinate instead of repeating its component
name and serialized props; opaque spreads retain the self-describing representation. Hydration
validates the table, row arity, coordinate, and boundary identity before constructing props.
Malformed rows are isolated from valid siblings. Interaction-only compact boundaries retain the
shared table without per-boundary props objects until activation, and the table is released after
the final dormant coordinate is claimed.

Progressive inline streams install one root-confined replacement helper on the first reveal and
emit small ordered calls afterward. `progressiveMode: 'inert'` continues to emit non-executable
template payloads. Root hydration derives and removes the response helper before publishing
hydrated ownership, while any late reveal observes the hydrated root and refuses to mutate it.

Component resumption records authorize state restoration only when the DOM
renderer has matched an SSR component marker and is constructing that exact
component for adoption. Compiled markers use the same contract identity as
resumption records. Mismatched route or conditional ranges mount as fresh client
instances, even while compatible ancestors continue adopting.
Records follow the committed component-tree traversal rather than speculative preparation order.
Each adopted component claims the next compact activation from a request-owned cursor before its
descendants claim theirs. Scheduled server frames reserve their activation only when their writer
enters that traversal, so preparation cannot reorder the hydration stream. Adoption checkpoints
restore the cursor when a candidate range fails.

Root hydration parses and validates its embedded bootstrap configuration once, then passes the
resolved immutable inputs into client construction. Static scalar DOM props bypass reactive watcher
construction; compiler expressions and supported composite class or `srcdoc` values retain observed
bindings.

An application whose root component receives its initial request data as props can opt into one
authoritative bootstrap copy:

```tsx
// server
const result = await renderToHydratableString(<App initialData={data} path={url.pathname} />, {
	publishRootProps: true
});

// client
hydrateAfterNavigation(() => {
	const props = readPublishedRootProps<AppProps>(App, container);
	return <App {...props} />;
}, container);
```

`publishRootProps` requires a component root and cannot be combined with a separate hydration
`state`. The compiler records direct setup assignments such as
`this.state.items = props.initialData.items`. SSR omits that resumable state value only when the
published prop path and final state value are identical. Derived, mutated, ambiguous, or nested
component state remains in its ordinary component resumption record. Reading the props and later
resolving hydration options reuse the same bounded decode. For finite nested prop types, the
compiler places an immutable positional schema on both target artifacts. The server publishes
matching plain values as component-bound nested arrays during the combined validation and
projection traversal, and the client reconstructs the authored objects only after verifying the
component identity. Structurally open values, runtime shape
mismatches, output extensions, and unsupported types retain the named-object format. Descriptor-safe
validation applies to structurally open values; declared positional fields use the single-read
rules described above. Hydration limits apply in either form. The generated tuple arrays do not
undergo a second validation traversal before JSON serialization.

Compiler-finite client boundaries group their props in the response hydration table by component
and canonical prop order. Within one immutable server build, the boundary's compiler-generated ID
also reuses that schema across requests, so publication does not repeatedly discover, sort, and
hash the same prop names. A conditional server child range has separate present and absent schema
variants. The shared cache contains only component names and prop-name arrays; boundary values,
component state, request tables, and coordinates remain request-owned.

The `@exactjs/hydrate/root` entry uses a bounded hydration-only field projection. Operation
endpoints, continuations, islands, and transports belong to the complete runtime; their presence in
a root-only document configuration fails closed. Build identity, component authorization,
resumptions, public contexts, state, wall-clock activation, and the compact hydration table retain
the same validation and resource ceilings.

Finite component-registry selections retain the registry binding, selected
key, and opaque compiled entry identity in their component marker. A matching
selection adopts normally. A nested mismatch remounts only that owned
component range and preserves compatible sibling DOM; a root mismatch follows
the configured root recovery policy.

Generated intrinsic islands with statically inspectable props preserve their server-renderable
markup as fallback for both eager and interaction activation. Eager activation does not require an
empty initial boundary. Opaque spread props cannot safely use this fallback projection.

The compiler classifies safe interaction-only islands. Their SSR fallback
contains the real intrinsic markup and binding values but no active handlers.
The generated hydration registration uses dynamic imports, so the island code
loads on first supported interaction. While it loads:

- activation events retain their order;
- repeated input/change events coalesce to the latest value per target;
- replay is generation-fenced and discarded if the boundary was replaced; and
- load failure restores the native browser fallback where possible.

Refs, initial client work, opaque prop spreads, unsupported events, and
server-only child graphs remain eager.

## Server exchanges and patches

The endpoint supports individual invocation/refresh operations and same-tick
batches. Independent operations may run concurrently; `dependsOn` expresses an
explicit prerequisite. NDJSON responses can publish independently settled
operation chunks.

The client sends only compiler-approved state, dependency, capture, and
boundary snapshots. Successful responses are shape-validated before
application. Available patches include:

- text, attributes/properties, and styles;
- keyed-list changes;
- component state;
- compiler-stable dynamic range replacement;
- independent nested element replacement; and
- authoritative boundary replacement.

Property patches are limited to non-executable, non-structural DOM properties. Inline event
handlers, `srcdoc`, prototype controls, and setters such as `innerHTML`, `outerHTML`, and
`textContent` are rejected by both the server response validator and the hydration commit planner.
Text and structural changes must use their dedicated operations so ownership cleanup and unsafe
HTML policy cannot be bypassed.

Stable dynamic markers let a server refresh replace one structural expression
without recreating unaffected siblings or component instances. Partition refresh
contracts authorize only their declared range and descendant ranges; a response
targeting an ancestor or independent sibling is rejected before publication.
Hosts that retain dynamic branch or keyed instances provide `resolvePartitionAuthority`
to the server runtime. The resolver returns the current build, edge, owner,
discriminator, and generation tuple; stale or released instances are rejected before
the refresh handler runs.
Boundary replacement remains the correctness fallback.

Runtime inspection exposes the same retained ranges through `partitions.tree`.
The Chromium DevTools component view shows their host, opaque plan identity,
component owner, activation mode and fallback reason, discriminator kind, generation, and nested range ancestry without
turning inspection identities into dispatch authority.

Compiler-proven interaction islands install only the delegated listeners named by their generated
registry policy. `click` and `submit` resume through native `click()` and `requestSubmit()`;
`input` and `change` preserve the browser's already-applied control mutation and coalesce to the
latest value; focus events replay notification only. Queues retain identities and policy fields,
never native `Event` objects, and are generation-fenced and bounded. Refs, unsupported events or
event data, observable initial work, and non-finite spreads produce source-located eager reasons.
Finite immutable object spreads are expanded in source overwrite order, leaving handlers in the
client artifact and sending only fallback values through SSR. Independently planned server ranges
remain inert inside a dormant client island and retain their own refresh generation.
The generated policy belongs to the lazy registry entry. An eager component entry cannot inherit
interaction authority from boundary markup, and hydration does not install a general event family
for such an entry.

Passive hydration does not manufacture a focus transition when the document body owns focus. When
an authored control already owns focus, DOM adoption and later reactive patches preserve that
connected element and its input or editable selection if browser DOM work temporarily drops focus.

When an interaction island loads, hydration prepares its immutable component execution slice from
the compiled definition and caches it by component artifact. Adoption installs only the root's
authorized setup-transition watchers; already-resumed continuations suppress their initial
generation, while unresolved live-ins use the declared predecessor slots. Dependency cycles fail
the activation instead of leaving it indefinitely loading. The slice exists only while the island
region is constructed, so it cannot suppress or activate unrelated dormant components. Boundary
generation replacement, abort, or unmount continues to fence loader completion, queued events, and
task publications.
Pending activation also retains its original hydration container. Moving an unhydrated boundary
outside that container discards the old activation before contract registration or mounting.
Movement within the container is supported. A new owner may activate the moved boundary using the
shared loaded module, without repeating its import.

## Data boundary

Hydration bootstrap data and protocol values use validated JSON-safe data.
Server requests bound and validate the complete encoded JSON graph before reactive protocol
decoding. Decoding reconstructs only plain data and validated collection envelopes, so dispatch
does not repeat the same graph traversal after reconstruction; operation contracts and security
hooks remain independent authoritative checks.
Compiler-approved `Map` and `Set` state uses tagged entries and is restored as
real collections; continuation changes travel as ordered entry or membership
deltas. Functions, DOM nodes, unsupported class instances, `Date`, cycles,
server contexts, and secret-qualified values are rejected.

## Remaining work

- Measured [structural refresh optimizations](proposals/future-work.md#structural-refresh-optimizations)
  may add proven patch fast paths, but current range and boundary replacement is already the
  correctness contract and does not block later SSR work.
- Webpack, Bun, and Vite/Rollup now share the production microfrontend artifact and recovery contract.
- Persisting postponed renderer state across requests is intentionally not planned: ordinary
  Suspense and progressive SSR provide the useful behavior without checkpoint reconstruction and
  distributed replay coordination.

See [server-components.md](server-components.md) for authoring and
[component-registries.md](component-registries.md) for finite dynamic
component selection,
[actions-and-forms.md](actions-and-forms.md) for task interactions and forms, and
[native-ssr-production-guide.md](native-ssr-production-guide.md) for production
operation.

## Decoded collection validation limits

Decoded Map string keys count toward the configured byte budget on both server and hydration
validation paths. Map and Set traversal checks the remaining node budget before queueing entries,
so an oversized collection is rejected without first expanding the entire collection into work.

### Compiler-owned SSR preparation

Generated root attribute bags are read directly from their invocation slots because the compiler
constructs those objects. Dynamic attribute values still use the normal escaping, URL policy,
reactive unwrapping, and target contribution rules. Other dynamic slots retain their preparation
checks before the program mutates rendering context.

A closed server root with one dynamic attribute and otherwise literal string properties captures
that attribute directly instead of allocating a property object. Shared compiler metadata retains
the raw static properties and reconstructs the object only when an unconsumed semantic-target
contribution requires composition. The captured value keeps its eager evaluation position and uses
the same attribute serialization, escaping, reactive unwrapping, and output accounting. Roots with
spreads, duplicate property names, or additional dynamic values retain their property object.

String augmentation and progressive publication locate canonical `</body></html>` tails directly,
avoiding a lowercase copy of the entire document. Other closing-tag casing or trailing content uses
the existing case-insensitive search. Hydration insertion and shell-before-hydration ordering are
unchanged.

Stateless server artifacts without lifecycle or observation callbacks skip unused attempt and
publication bookkeeping. They use the same renderer and retain descendant task issuance and
cleanup. Installing attempt or component observation callbacks retains the complete observable
lifetime, including rollback on failure.

Synchronous component publication creates enhancement callbacks only for enhanced operations and
promise continuations only for pending child output. Completed plain output uses the same renderer
and publisher directly. Render failures retain rejected-promise delivery so request-owned cleanup
and primary-error precedence remain unchanged.

Compiler-proven server list items whose output is a prepared intrinsic-root program reuse that
program as their item boundary. Key expressions still run after the item expression, and missing
keys or failed key conversions still fail rendering. Other keyed values retain their separate
boundary representation. Client keyed identity and hydration adoption are unchanged.

Component marker identities reserve their numeric positions before rendering descendants. The
original component or registry facade name and key are captured at that point, but marker strings
are formatted only when publication emits a boundary. Omitting a compiler-owned boundary therefore
avoids string construction and escaping without shifting later IDs or replacing a lazy registry's
identity with its selected implementation.

Compiler-created root class expressions composed entirely of safe ASCII literals, concatenations,
and conditional branches can use a proven class attribute operation. The compiler establishes this
proof after constructing the root prop slot. Unknown strings, unsafe characters, and composed target
props retain normal escaping. This removes repeated escape scans without caching request data.

## Independent island resumption ownership

A server-only page cannot adopt its client descendants. Each independently activated resumable
island therefore retains a discoverable DOM boundary and a bounded inline payload containing its
resolved public props and its own ordered component resumptions. Its records are not also published
in the page capture. Nested components owned by a compiled client root retain the markerless path.
This ownership rule is the same for string and progressive rendering.

Lazy siblings may finish loading in either order. Hydration scopes the ordered activation cursor to
one synchronous island mount, restores the enclosing cursor in `finally`, and preserves the same
scope during adoption fallback. The existing component domain still owns transport, inspection,
and cleanup. Malformed or oversized inline island payloads fail before activation instead of
mounting with empty props and potentially replaying work without captured state.

### Synchronous computations during resumption

Compiler-owned neutral synchronous computations initialize before captured SSR state is applied,
including when the browser artifact retains the complete component contract. This reconstructs
values omitted from sparse capture without overwriting server task results after hydration.
Computation dependency subscriptions arm after restoration; subsequent prop and state changes
remain reactive. Indexed prop dependencies observe retained parent expressions as well as replacement
of the prop slot and release those observations with the component. Explicit tasks retain their
ordinary deferred activation and settled-continuation policy.

Compact input plans attach observation only when a prop retains a parent reactive expression;
finalized primitive props still use direct receiver updates. Hydration-only artifacts carry an
optional `resumption.continuations` identity allowlist so compact SSR completion records remain
validated even when the verbose client continuation catalog is omitted. This is compiler metadata,
not application-authored protocol identity.

Synchronous computation callbacks do not carry task-continuation branding: they have no remote
task generation, and their signal context is typed by the synchronous activation helper.

A synchronous factory passed to `hydrateAfterNavigation()` defers published-props decoding and
root creation until activation. The factory runs once, including when an early interaction wins,
and a thrown error rejects the hydration promise. Existing root values remain supported. This
does not defer static module evaluation or guarantee that first contentful paint precedes activation.

### Client settlement and lazy islands

`createExactClient().whenSettled()` waits for owned requests and asynchronous island loading/adoption
that has started, including eager lazy islands discovered during bootstrap and their descendants.
It does not activate dormant interaction islands. Island load/adoption failures reject settlement;
aborting or disposing the root releases adoption waiters and prevents late loads from mounting.
`pendingRequests` remains a count of transport operations, not island imports.
The client/server test harness awaits this settlement before returning its mounted view.

Public `hydrate()` from `@exactjs/hydrate` retains continuation dispatch and island registration,
including for compiler-issued roots. The smaller `@exactjs/hydrate/root` entry is an explicit
hydration-only choice. Both recognize the server's markerless-root proof when reading document-shell
bootstrap data. Bootstrap discovery includes siblings of the application root, including detached
containers; `readExactHydrationConfig(root)` itself still reads only the supplied subtree.

## Streaming deployment requirements

Incremental delivery depends on the complete HTTP path. The operation transport uses
`application/x-ndjson`; it is not SSE (`text/event-stream`). Both formats require the server,
middleware, reverse proxy, gateway, and hosting platform to forward response chunks before the
operation finishes. A buffered response can still return a valid final result without providing
live delivery. Operation streaming delivers optional [task progress](tasks.md#server-task-progress)
snapshots before settlement, in addition to ordinary final results. Notifications, acknowledgements,
and durable replay are not provided. Set server context
`progress: { supported: false, reason: "deployment buffers responses" }` to disable progress on a
known buffering deployment. A warning names affected components and receivers; tasks still run
once and return their ordinary results. The generic serverless adapter selects this fallback
automatically. SSR itself has no browser receiver and does not warn or retain progress for replay.

Task scheduling and response delivery are separate. `TaskContext.server().deferred()` changes
server scheduling priority; `blocking()` and `nonblocking()` control readiness. None of these
policies guarantees live delivery or durable background execution. If progressive SSR runs through
a buffering intermediary, the initial shell and later content may arrive together even though the
server performed the work progressively. Buffering does not extend the request lifetime or bypass
cancellation, render deadlines, or platform limits.

Node HTTP, Express, Fastify, Koa, Hapi, and Bun adapters have response-streaming paths. Fastify
response work is cancelled by an aborted upload or a closed response, not by normal completion of
the request body. The Fetch,
Deno, and Cloudflare adapters preserve Web streams, subject to the host's response contract.
Native Deno and local Cloudflare workerd have scripted task-progress acceptance. Workers require
`enable_request_signal` to observe incoming cancellation; detection may wait for a subsequent write.
Generated continuations link that cancellation to the task signal and owned cleanup. Local tests
do not establish deployed CDN, proxy, or timeout behavior. The generic serverless adapter
collects the stream into a string-body response and cannot provide incremental delivery. A cloud
provider offering a separate streaming integration does not make that buffered adapter suitable.

Disable buffering on the applicable response route and configure compression to flush incremental
output or bypass it. nginx documents response buffering and the `X-Accel-Buffering` header in its
[proxy module reference](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).
Express documents the compression flushing requirement for
[SSE responses](https://expressjs.com/en/resources/middleware/compression/#server-sent-events).
Check idle timeouts, maximum request/function duration, and concurrent connection limits for the
actual deployment. Heartbeats do not extend a host's hard execution-duration limit. Streaming
capability at the adapter boundary does not establish end-to-end delivery; validate that an early
chunk reaches the client while the operation is still pending.

### Scripted deployment probe

Use a dedicated, side-effect-free probe task which reports a snapshot, waits at least two seconds,
and returns normally. Capture that task's generated invocation request from the application's
network tooling; operation IDs are compiler-owned and must not be authored or persisted across
builds. Run against the actual deployed route:

```sh
npm run probe:task-progress -- --url https://example.test/__exact --request operation.json --headers headers.json
```

The optional headers file is a JSON object for deployment authentication. Keep credentials out of
Git. The script performs one POST without retrying or following redirects, enforces a 15-second
timeout and a 1 MiB response limit, and requires a successful result at least 500 ms after the
first progress event. Customize `--minimum-gap-ms` and `--timeout-ms` for the paced probe.
It checks observable early delivery, not the reliability of individual snapshots. A failed probe
may mean disabled progress, buffering, authentication failure, or an incorrectly paced probe task;
inspect the response and deployment before enabling progress. The script does not restart work.
