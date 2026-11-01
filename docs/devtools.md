# Server-cooperative full-stack DevTools

eXact DevTools inspects the framework's durable component model across the browser, SSR,
continuations, and independently deployed microfrontends. It is an optional, read-only projection:
disconnecting it does not change component scheduling, ownership, cancellation, rendering, or
server dispatch.

## Build and authorization boundaries

Debug output has two independent build controls:

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	debug: {
		catalog: 'auto',
		runtime: 'auto'
	}
});
```

`catalog` retains compiler explanations in a server-only `.exact-inspection/<buildKey>.json`
asset. `runtime` adds compact source identities and installs the browser bridge. Development
defaults both controls on; production builds require explicit `true`. Set both to `false` for a
hardened build. The Vite, Webpack, and Bun integrations derive both compiler controls; Webpack
emits its catalog in `processAssets`, Bun writes it beneath `outdir`, and all three keep the asset
outside the client graph. Files in a serialized source catalog must remain inside the configured
project root. Explicitly admitting an outside helper for compilation does not assign it a
project-relative inspection identity.

Catalog registration validates complete source records and rejects missing array entries,
duplicate source identities, and cyclic source trees. Source traversal uses a root-wide
100,000-entity budget and handles deep trees without consuming the JavaScript call stack.
Classification metadata retains its separate depth and size limits.
Entity lookup also traverses deep trees without native recursion. Returned snapshots must
fit the reactive transport's depth limit and the configured snapshot byte budget. An entity
whose returned subtree cannot be encoded reports `limit-exceeded`. Its smaller descendants
can still be selected independently.
Snapshot limits apply to the encoded UTF-8 response body that is delivered. That body is
encoded once and reused for delivery and audit accounting. Audit `resultBytes` counts the
actual delivered body, including encoded collections and structured failure responses.

An instrumented client-only page opens a local browser inspection session without probing a
server URL. Server cooperation activates only from an explicit runtime endpoint or the bounded
endpoint in compiler-owned hydration metadata; absence does not imply `/__exact`.

Vite instrumented modules depend on the virtual browser runtime directly, so inspection ownership
is installed before native module evaluation and the first client root render. The injected HTML
bootstrap remains a fallback for pages without transformed native roots. Compiler-generated
reactive cells are transparent at that boundary: a root inspection domain continues into the
authored component tree when the renderer unwraps the compiled root.

Constructing the first inspection owner also activates task-frame event projection. Production
artifacts that omit runtime inspection retain only a small optional dispatch point; task snapshot,
history, value-preview, and event-publication machinery remains outside their execution graph.
This does not make component state opaque, and an instrumented build still installs the capability
before its first root is evaluated.

Reactive graph inspection uses bounded, value-free computed projections. A computed reports
whether it is `clean`, `checked`, `dirty`, `computing`, `failed`, `paused`, or `stopped`, together
with its effective priority, initialization and observation state, and bounded source and sink
counts. Runtime cycle failures use the stable
`eXact reactive computation cycle detected` diagnostic instead of including source text, values,
or an unbounded graph dump. Framework tooling obtains the same projection through
`inspectComputed()`. Inspection returns an ordinary diagnostic snapshot with readonly TypeScript
fields. Editing that snapshot does not change graph ownership. Inspecting does not attach a watcher
or change graph liveness.

Vite development mode enables those defaults through `@exactjs/vite-plugin`, not through Vite
itself. Custom middleware servers must include `exact()` in the Vite configuration they load;
calling `createServer()` or `transformIndexHtml()` without the plugin cannot install runtime
inspection. In that case the Chromium panel remains in `Waiting for eXact runtime
instrumentation…` and continues discovery until an instrumented document is loaded.

Enabling inspection or renderer enhancements preserves render and hydration work limits and
callbacks, including inherited option accessors. Derived configuration keeps inherited accessors
on their original receiver and writable overrides local to their root or request. Component ownership still takes precedence over an inspection fallback domain.

Session descriptions, DOM snapshots, and element lists are independent observations. Their
readonly restrictions are TypeScript checks. DOM testing inspection records and their metadata
use the same ordinary-value contract, with fresh child and element lists for each inspection.
Concurrent pending connections share one opening result. Calls made after connection return fresh
descriptions, and editing one does not change
session routing, capabilities, or cleanup.

Client inspection exposes bounded previews of state, props, contexts, and task values already
present in the page. It does not redact them based on secret names or compiler selectors.
The inspector reads identities carried by compiled components and task functions directly. Keep private
values on the server instead of sending them to the browser and hiding them in the inspector.

Server catalog registration captures build identity and redaction metadata. Later edits to the
supplied catalog does not change that registration. Retire a
registered build with its disposal handle and register its replacement explicitly. Catalogs must
contain plain data fields without accessors or executable serialization hooks.

Runtime authorization is separate:

```ts
const server = createExactServerRuntime({
	contract,
	inspectionCatalogs: [inspectionCatalog],
	allowDebug: async ({ platformRequest, capability }) => {
		const operator = await authenticateIncidentOperator(platformRequest);
		return operator.debug && (capability !== 'source' || operator.sourceDebug);
	}
});
```

A configured `allowDebug` callback must return or resolve to `true`. Other results and thrown
errors leave inspection unavailable.

Omitted `allowDebug` is unavailable in production. In development, its catalog-based default is
available only to requests with a matching browser `Origin`; origin-less clients require an
explicit `allowDebug` policy or `debugSessionIdentity`.

Browser origins are compared with the configured `publicOrigin`, including a per-request resolver,
or an absolute adapter request URL when no public origin is configured. Relative request URLs
require `publicOrigin`. The caller's `Origin` header cannot supply the server's authority. This
check also applies to existing sessions and observations attached to ordinary requests.

Failed authorization returns the same `404`
used when debug output does not exist. All messages are POSTed to the application's configured
eXact endpoint and inherit its origin, CSRF, request-size, cancellation, and adapter policies.
Sessions are opaque, expiring, and bounded by count. The server uses them to authorize catalog,
snapshot, source, and per-request observation capabilities; it does not retain a cross-request
event timeline or keep an observation stream open.
Capacity is enforced when asynchronous authorization completes. Revocation, expiry, and runtime
shutdown take precedence over pending authorization or identity checks; a late result cannot
renew a closed session or create one after shutdown. Query publication rechecks the same lease.
A query that settles after session revocation, expiry, runtime shutdown, or request cancellation
returns the ordinary unavailable response and publishes no inspection result or result audit.
Forwarded queries retain their request-local authorization and expiry checks without creating a
retained session on the receiving server.
Application audit callbacks receive metadata before publication. If a callback synchronously
revokes the session, stops the runtime, cancels the request, or advances expiry, the result is
unavailable. Callback failures are isolated, including rejected asynchronous notifications.
Asynchronous audit work does not delay the query response.

While browser DevTools is attached, the hydration transport adds the opaque session ID to each
ordinary eXact request. After reauthorization, that request alone creates a bounded observation
collector. JSON responses carry a reserved observation attachment and NDJSON responses carry one
observation frame before completion. Success, failure, cancellation, and stream closure all dispose
the collector with the request. Session revocation, expiry, runtime shutdown, or request cancellation
also retire collection and discard unpublished observations without canceling ordinary application
work. When a response byte cap is explicitly configured, JSON attachments retain the newest complete
events that fit the remaining UTF-8 response budget. Optional observations are selected before the
final response size is validated. Without an explicit cap, crossing the default response threshold
warns and preserves the events.
Requests without the header create no observation owner.

The page runtime validates those events, assigns its own monotonic cursor, and owns the only
cross-request history and subscription set. Disconnect clears that store and stops adding the
session header. Consequently, a server response can never remain subscribed to later work and one
operator's request cannot populate another request's collector.

## What is inspectable

The Chromium panel and automation agent consume the same versioned protocol. They can inspect:

- execution roots and microfrontend bindings;
- durable component parents, children, status, and owned elements;
- bounded previews of props, state, and public contexts;
- task placement, readiness, priority, generation, cancellation, and settlement;
- framework task kinds and optional human-facing labels without treating either as authority;
- invoked-task placement, concurrency, pending work, and optimistic generations;
- lifecycle, render invalidation, Activity, Suspense, hydration, and resumption events;
- server requests, continuations, context access, patches, errors, and profiling observations; and
- compiler-owned task and dependency explanations from the exact running build.

No query returns component instances, callbacks, task controllers, context resources, secret
values, or executable operation handles. Selecting an element resolves its logical component owner;
selecting a component highlights only its currently owned DOM elements. DOM selection and client
component-detail queries require the active session, side, binding, build, execution root, component
type, and instance to match. A retired identity cannot resolve a current owner. Task trees preserve
distinct operation identities, and task-detail queries retain the requested operation and generation.
Federated root selection keeps binding/build/root coordinates distinct even when their names
contain punctuation, while repeated records for the same root are deduplicated.
For a focused query, filter component trees by side, binding, build, execution root, component
type, or instance. Root and microfrontend lists support the side, binding, build, and execution-root
coordinates available on their records. Filtering happens before pagination. Server catalog roots
support side, build, and execution-root filters. Request, interaction, and event-kind filters apply
to timeline records. A retained query service does not list components from a newer session.
Combined collections resume the active source's page after the browser records, then continue
through the selected server roots. Keep each returned cursor with the same collection and filters. Custom pagination maxima and
page-service result limits must be positive safe integers. Invalid maxima are rejected rather
than returning an empty page with a cursor that cannot advance.
Merged pagination captures each source page's values and continuation cursor once, validates the
captured values against the requested page size, and appends them in order without a variadic call.
Query parsers validate configured
result and filter-kind limits even when their optional fields are absent. Filter-kind limits count
the names in an explicit kind filter and may be zero. A zero limit permits an empty kind filter
and does not disable events. Nonfinite, fractional, and unsafe integer budgets are rejected.
Merged reads continue until the requested page fills or their finite sources finish. Empty owners
and retained remote offsets do not impose a fixed source-page cutoff. A stalled source or an
oversized source cursor reports an unavailable result. New cursors avoid rescanning earlier pages, and retained
global offsets remain accepted. Malformed encoded host cursors resume bounded retained event history.

The Chromium **Components** view shows every durable instance in its live parent/child hierarchy.
Selecting a node exposes that instance's bounded state, props, contexts, tasks, and dependency
explanation. The tree and selected-instance details scroll independently. Live updates preserve
both scroll positions and expanded or collapsed detail sections. Selecting another component keeps
the tree position while starting that component's details at the top.

Public component and task snapshots, value previews, and pagination envelopes use ordinary
JavaScript data with TypeScript readonly declarations. Task history retains private copies, and
component observations do not share those records. Display names use own string data without
calling authored function accessors. Public method metadata is independent of the private dispatch
allowlist. Redaction receives a separate path observation, and malformed policy decisions fail
closed with an unavailable marker.

Client event history and request-owned server observations capture accepted data independently
of caller objects. Public event observations remain ordinary JavaScript values under TypeScript
readonly declarations. Client replay and live publication preserve sequence order through reentrant
callbacks. Unsubscription and clearing invalidate queued delivery, and one observer cannot mutate
another observer’s event. Zero client history capacity preserves live delivery. Client retention budgets
must be nonnegative safe integers.

Timeline and error queries read their retained events independently of component snapshot
collection. A component snapshot failure does not prevent those recorded events from being queried.
Incoming failure codes must be supported protocol strings. Array-shaped selectors are rejected.
Queries that need browser records retain one snapshot for both their values and server routing.
Query failure descriptions fit the protocol's 2,048-code-unit limit and use a stable fallback when
conversion, a message getter, or a prototype trap fails. Inspection preserves the original task
failure or cancellation and cannot change settlement or subsequent progress. Event reasons fit
their 1,024-code-unit limit, and inspecting type names does not invoke authored name getters. Returned query
envelopes and collection arrays are ordinary values with TypeScript readonly fields. Editing an
observation does not grant authority to update application state.

The **Profiler** is an explicit bounded capture rather than an always-running trace. Start
recording, interact with the application, and stop recording to inspect causal frames. Explicit
framework frame markers take precedence; otherwise interaction and request identities group
related work. Unlike the instance-level Components tree, each frame summarizes state and props
changes and plots event markers in one aggregated waterfall lane per authored component type.
Instance identities remain attached underneath for exact selection and highlighting. Because
federated hosts retain independent cursor order, the panel does not imply a total wall-clock
ordering that the protocol cannot prove. Live subscription delivery previews the recording;
pressing Stop pages retained history after the recording's merged cursor before presenting the
final capture, so boundary races do not silently lose events.

## Catalog and source identity

Every runtime subject is qualified by session side, optional microfrontend binding, immutable build
key, execution root, component type, and instance or operation identity. Catalog lookup never falls
forward to another build. A retained build registers its catalog with
`registerExactInspectionCatalog()` and disposes the returned handle when that build retires.

Source paths are build-relative. The panel opens a source provider only when its SHA-256 hash
matches the catalog location. It checks loaded source-map resources first, workspace/file
resources second, and an authorized server excerpt last. Protected source excerpts require the
`source` capability and pre-redacted retained source whenever the compiler catalog contains
secret-qualified names.

Instrumented task functions carry their canonical compiler source ID through a WeakMap marker.
Core records that ID when the function is defined; query consumers never recreate source ordering
from runtime arrays.

## Secret handling

For server inspection, compiler-qualified state paths, secret contexts, server resources, and
secret names become redaction selectors without carrying values. Server redaction occurs before
preview traversal and before transport to the browser. Client inspection applies no secret-value
redaction. Preview
construction does not invoke getters, `toJSON`, custom inspectors, callbacks, or a failed Proxy
again. Map and Set previews use native collection traversal, and type labels read data descriptors
rather than application accessors. Depth, entries, UTF-8 bytes, event history, response size, and
exports are bounded. Previews distinguish JSON-safe scalar values from constants. For example,
`{ kind: 'scalar', value: 'NaN' }` is a string, while `{ kind: 'constant', value: 'NaN' }`
represents the number. Constant tokens are `undefined`, `NaN`, `Infinity`, `-Infinity`, and `-0`.
They preserve values JSON cannot represent faithfully. Inspection failures remain `unavailable`
markers. The panel quotes strings and displays constants without quotes. Empty property names remain inspectable. Object previews
stop before keys longer than 512 UTF-16 code units or keys that exceed the remaining UTF-8 budget,
without traversing the corresponding value.

The optional secrets plugin may expose only key names and presence. Debug responses, events,
source excerpts, errors, audit records, and exports must never contain secret values.

## Microfrontend federation

The page host routes remote requests through its existing binding gateway. Its request-level
`authorize` and `validateCsrf` hooks run before body reading. The gateway forwards the original
payload, browser credentials, and debug session correlation header. It consumes the routing
header and supplies the selected binding as correlation metadata for the service.

Each service independently authenticates the request and evaluates `allowDebug`. A forwarded
session ID is correlation data, never proof of authorization. Services authorize that correlation
for the current request without opening retained child sessions or exchanging keys. Applications
may enrich forwarded headers with a JWT or other credentials through `transformForwardedRequest`;
eXact does not coordinate their authentication policies. Configure the service's public origin to
match its browser-facing origin when requests cross an internal endpoint.

Services produce their own response and observation identities using the original session ID and
binding. The gateway relays response bytes unchanged. Closing a page session does not send remote
close requests. The browser assigns a page-owned cursor across responses; arrival order does not
claim a cross-host wall-clock total order. An unavailable service does not hide healthy roots.

## Chromium and agent use

Build the unpacked extension with:

```sh
npm run build -w @exactjs/chromium-devtools
```

Load `packages/chromium-devtools` in Chromium's extension page, open DevTools, and select the
**eXact** panel. Load the package directory, not its `dist` child: the manifest remains at the
package root and references the generated assets. The build bundles both Manifest V3 content
entries as classic scripts for Chromium and makes every extension-page entry self-contained.
The extension's main-world bridge is installed at document start, while the inspection hook
becomes active only when the application runtime loads. The isolated content script repeatedly
greets the main-world bridge until it receives a document- and bridge-generation acknowledgement;
that acknowledgement separately reports whether runtime instrumentation is ready. The background
worker releases inspection requests only after both layers are ready, eliminating the lossy
document-start ordering race.

Panel and content-script ports reconnect after Manifest V3 worker replacement. The background owns
each unresolved read-only request until its correlated response arrives, requeues in-flight work
when a content generation disappears, and rejects responses from superseded ports. A panel request
therefore survives worker restart, target navigation, and page restoration without requiring a
manual reload. Response timeouts run only while the runtime is known to be ready; one silent ready
connection is replaced and replayed before an unresponsive-runtime error is reported. Closing the
panel releases its queued ownership, subscriptions, highlights, and bridge session, and the bounded
per-tab request limit still prevents unbounded recovery queues. The panel exposes `waiting for page
bridge`, `waiting for runtime instrumentation`, and `reconnecting` states while recovery proceeds.
DOM partition snapshots remain independent across updates and handle deep marker trees within
the renderer node budget. Query depth and transport limits still apply when tooling requests
those snapshots.

Component and partition trees provide an independent disclosure control for every branch and retain
collapsed branches across live updates. State, prop, and context sections show nested arrays and
objects as bounded JSON-like own-property summaries by default; expanding one value reveals its
bounded preview without expanding unrelated values. Expanded rows use a bounded
content-sized key column and compact indentation, so each nested level does not reserve another
large fraction of the remaining width. Value disclosure state and panel scroll positions survive
live refreshes for the same selected component.

The Tasks section separates execution history from live scheduler frames. Starting a task records
its placement, generation, timing, and bounded argument preview; settlement updates that record
with its final status and a bounded result or error preview. Each execution remains collapsed until
opened. The runtime never retains the original argument, result, or error objects for inspection.
History exists only while an inspection session is attached, defaults to the 200 most recently
started executions across that runtime owner, and is released on detach. Runtime integrations may
set `maxTaskExecutions` when creating the inspection owner; late completion of an older task cannot
evict a newer execution from the bounded history.

The DevTools entry registers `dist/panel.html` from the extension root; generated document paths
are not resolved relative to `dist/devtools.html`.

`@exactjs/devtools-agent` attaches to an existing Chromium target through CDP. It accepts only
validated read-only methods and uses fixed function declarations; callers cannot provide
JavaScript or invoke application behavior. Disconnect removes its CDP binding, releases its object
group, and closes page subscriptions. Connection, discovery, request, response, and shutdown waits
are bounded; `ExactCdpConnectionOptions` exposes the operational ceilings and cancellation signal
for automation that needs stricter limits. When discovering through `debugUrl`, an explicit `targetId` selects only that target. A missing
ID fails connection establishment. Omitting the ID selects the first available page target.
Connection and request cancellation preserve the signal's exact reason, including null. Requests made after the transport closes reject immediately. Connection setup rejects malformed page sessions and releases partially acquired resources. Disconnect attempts every owned cleanup even when one fails.

Debug request names and capabilities must be supported strings. Debug messages and inspection
queries reject unknown envelope fields, including invocation or executable fields. Debug envelopes are validated
before authorization, and query envelopes are validated before query dispatch.

For an automated investigation, start with `session.describe` and a bounded `roots.list` query.
Select a component through `components.tree`, preserve its returned runtime identity, then query
its state, tasks, dependencies, or errors. An unavailable or unauthorized response does not establish
that the application is healthy. Navigation requires rediscovering identities. The
[agent package README](../packages/devtools-agent/README.md) shows connection and cleanup.
Agent connection and subscription methods can be decorated through ordinary assignment. Their
readonly fields remain TypeScript restrictions, while the live subscription `closed` getter
continues to report its cleanup state.

A pending connection is shared by concurrent callers. Disconnect detaches the current session
before waiting for its server close and prevents an older open from attaching. A disconnected
installation can connect again. Disposal permanently closes the installation. A connection
superseded by disconnect or disposal rejects with `AbortError`, and any late server session is
closed. Browser server cooperation accepts only a valid session description and query responses
that match the query and active session. Malformed responses cannot become inspection records.
Query, subscription, debug and response parsers copy bounded own data fields before schema
validation. They reject accessors, inherited envelopes, sparse arrays, non-finite numeric data
and unsupported objects without invoking getters or custom iterators. Dispatch receives the
validated copy, so later input mutations do not change the selected operation. Error responses
read only a bounded own data request ID and use `invalid-request` otherwise. Catalog and
runtime-identity validation also reject accessor records and array cells. Compiler metadata
uses plain data records and dense native arrays, without custom iteration hooks.
Denied opens and close requests cancel their unused response bodies. Highlight cleanup restores authored styles even after an owned element leaves the document
and leaves other installations' markers unchanged. If an authored outline value or priority
changes while highlighting is active, cleanup preserves the changed value. Only the active
installation session can highlight an element. DOM inspection factory cleanup removes its own
installation and preserves a newer installation that reuses the same factory function.

## Package ownership

- `@exactjs/devtools-protocol`: DTOs, validators, previews, pagination, and the query service.
- `@exactjs/devtools-runtime`: optional page hook, root ownership, server client, and event merge.
- `@exactjs/chromium-devtools`: Manifest V3 panel and inspected-page bridge.
- `@exactjs/devtools-agent`: read-only CDP projection.
- `@exactjs/compiler`: canonical source identities and server catalog construction.
- `@exactjs/server`: authorization, static queries, catalogs, request collectors, and binding
  federation; it owns no cross-request event history.
- `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, and `@exactjs/bun-plugin`: paired client
  runtime and server-only catalog packaging.

See package-local `README.md` and `AGENTS.md` files before integrating any of these boundaries.
