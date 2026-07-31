# Server-cooperative full-stack DevTools

## Status

Implemented. The compiler catalog, compact runtime correlation, server debug transport,
microfrontend federation, Chromium extension, and CDP agent bridge described here are current
framework behavior. The maintained public contract and operational guidance live in
[`../devtools.md`](../devtools.md).

The following prerequisites are already implemented and are treated as the starting point rather
than future work:

- compiler-owned `ExactSourceInspection` entities, classifications, reasons, and diagnostics;
- the retained no-emit `ExactLanguageService`;
- `@exactjs/language-server` and the eXact VS Code extension;
- optional `TransformOptions.emitInspection`;
- server-owned `TransformResult.inspectionCatalog` output;
- `selectExactExposureInspectionCatalog()` for restricting a catalog to one microfrontend
  exposure;
- compiler-owned component, continuation, boundary, and execution-root identities;
- client component domains carrying an `executionRoot`;
- immutable action inspection snapshots;
- renderer-owned component-tree inspection used by framework testing; and
- explicit instrumentation sinks for reactive, DOM, SSR, hydration, and server profiling.

The implemented source-inspection IDs remain generation-local editor and build correlation values.
They are not dispatch IDs, authorization capabilities, or a cross-build ABI. This proposal adds the
build and runtime identity envelope needed to use them safely in a running application.

## Decision summary

Build one optional inspection system with four coordinated projections:

1. The compiler produces semantic source facts and a server-owned build catalog.
2. Browser and server runtimes publish bounded live observations using compact build-scoped IDs.
3. A Chromium DevTools extension joins those facts into one full-stack, microfrontend-aware view.
4. A transport-neutral, read-only query and event protocol exposes the same model to diagnostic
   agents.

The system follows these rules:

- The compiler remains the only authority for inferred component semantics.
- The runtime remains the authority for live instances, values, status, ownership, and timing.
- Rich source inspection data is packaged only with server output, never in the client bundle.
- Client output may contain compact correlation IDs only when runtime inspection instrumentation is
  enabled.
- Browser-to-server inspection uses the application's existing eXact protocol endpoint, request
  adapter, and microfrontend binding gateway.
- Debugging is a distinct, read-only protocol message family rather than an action or refresh
  invocation.
- Runtime inspection and static catalog emission can be removed from hardened builds.
- `allowDebug` controls whether one request or session may receive server-owned inspection data.
- `allowDebug` accepts a boolean or a synchronous/asynchronous resolver.
- Production defaults server cooperation to disabled, but an application may deliberately authorize
  a production debugging session.
- Secret values are never emitted. Statically known secret names may be shown.
- A page host brokers remote server inspection so DevTools sees one page while every microfrontend
  host retains its own authorization and catalog ownership.
- The Chromium UI and agent bridge use the same versioned, validated, read-only protocol.
- Runtime observation IDs never become invocation IDs, remote module selectors, or server
  authorization tokens.

## Why this belongs in eXact

An eXact component is a durable instance with direct state, owned tasks, contexts, lifecycle,
actions, and compiler-known dependencies. Server and client work are two portions of one
compiler-checked component state machine. A generic JavaScript object inspector cannot reconstruct
those semantics reliably.

The framework therefore owns the semantic and lifecycle observations necessary to answer:

- Which component instance owns this element?
- Which execution root and microfrontend produced the instance?
- Which state, prop, context, or derived read invalidated this expression?
- Was work inferred as initialization, a task, an action, or render-time reactivity?
- Is a task blocking, deferred, client-owned, server-owned, cancelled, stale, or settled?
- Which action generation owns an optimistic overlay?
- Which continuation crossed the client/server boundary?
- Which server request and component instance executed that continuation?
- Why was a value included in hydration or component resumption?
- Which context token was accessed without exposing a server resource?
- Which build supplied the running client and which retained server build handled it?

The visual DevTools extension is optional product tooling. The small observation contracts that
make these questions answerable belong at the compiler and runtime boundaries that already own the
facts.

## Goals

### Present one component model

The component tree should include native page components, independently built microfrontend roots,
client islands, retained Activity content, Suspense candidates, portals, and server observations
without flattening their ownership differences.

### Correlate source and runtime meaning

A task selected in the browser should show the same placement, readiness, dependencies, effects,
signal injection, resources, and reasons shown by the language server, plus its current runtime
generation and status.

### Support production debugging deliberately

An application must be able to enable debugging for a particular authenticated operator, request,
tenant, or incident without enabling it for every visitor. A hardened build may still remove the
required catalog and instrumentation completely.

### Keep microfrontends independent

Producers compile and retain their own catalogs. A page host may federate them for one debugging
session, but must not rewrite producer source identity or merge unrelated sibling exposures.

### Make agents first-class read-only consumers

An agent should query structured state and subscribe to live events rather than scrape rendered
DevTools text. Human and agent answers must be projections of the same inspected page.

### Bound overhead and retained data

No inspection path may retain disposed component instances, request contexts, response bodies,
secret values, unbounded event history, or complete object graphs.

## Non-goals

The first delivery does not:

- mutate component state from DevTools;
- invoke actions, cancel tasks, force revalidation, or edit context values;
- provide a general remote administration channel;
- expose server resources or arbitrary application object graphs;
- send source or runtime data to a hosted eXact service;
- replace browser performance, network, memory, or JavaScript debugging tools;
- make source entity IDs stable across builds;
- use authored action names as protocol identities;
- require a language server connection while inspecting a running page;
- make all client runtime internals public framework APIs;
- federate untrusted third-party code outside eXact's trusted microfrontend model; or
- guarantee source text is available in a production deployment.

Writable debugging operations may be proposed later as separately permissioned commands. They must
not be smuggled into the read-only protocol.

## Product architecture

```text
Compiler and build
├─ ExactSourceInspection
├─ build-scoped server inspection catalog
├─ optional compact runtime correlation IDs
└─ exposure-scoped catalog partitioning

Running browser page
├─ page component domain
├─ microfrontend component domains
├─ renderer ownership tree
├─ client state/context/task/action observations
└─ injected DevTools bridge

Page server
├─ allowDebug decision
├─ page build catalog
├─ bounded server event history
├─ debug message dispatcher at the eXact protocol endpoint
└─ shared microfrontend binding gateway

Remote component hosts
├─ independent allowDebug decision
├─ build-keyed exposure catalogs
├─ request/task/action observations
└─ debug messages at their existing eXact protocol endpoint

Chromium DevTools extension
├─ component and ownership tree
├─ source semantics and dependency explanations
├─ state/context/task/action panels
├─ full-stack timeline
├─ microfrontend topology
└─ protocol adapter for agents

Agent adapter
├─ attaches through Chromium/CDP
├─ uses the same read-only query service
├─ subscribes to bounded live events
└─ returns stable structured responses
```

The extension does not connect directly to arbitrary remote component hosts. It sends debug
messages to the same eXact protocol endpoint already known by the inspected client. The page host
remains the browser-visible trust and routing boundary and uses the same binding/build routing
configured for ordinary microfrontend operations.

## Identity model

No single existing ID is sufficient. Runtime references use a structured identity:

```ts
export type ExactInspectionRuntimeId = Readonly<{
	sessionId: string;
	side: 'client' | 'server';
	binding?: string;
	buildKey: string;
	executionRoot: string;
	componentTypeId: string;
	instanceId?: string;
	sourceEntityId?: string;
	operationId?: string;
	generation?: number;
}>;
```

Each field has one owner:

| Field             | Owner                        | Meaning                                                        |
| ----------------- | ---------------------------- | -------------------------------------------------------------- |
| `sessionId`       | debug runtime                | One authorized, expiring inspection session.                   |
| `side`            | runtime                      | Browser or server observation.                                 |
| `binding`         | page microfrontend host      | Remote producer binding, absent for the page host.             |
| `buildKey`        | build/deployment integration | Immutable client/server build selection.                       |
| `executionRoot`   | component domain             | Page or exposed microfrontend root namespace.                  |
| `componentTypeId` | compiler component contract  | Component type within the selected build and root.             |
| `instanceId`      | component runtime            | One durable client instance or request-owned server instance.  |
| `sourceEntityId`  | compiler inspection catalog  | Task, action, render expression, lifecycle, or binding source. |
| `operationId`     | continuation/action runtime  | One observed operation; never accepted as authority.           |
| `generation`      | task/action/runtime owner    | One cancellable or supersedable generation.                    |

Every query receives the complete identity needed by its scope. The server never accepts a bare
`sourceEntityId`, component name, filename, or action label as an executable selector.

Component instance IDs may remain runtime-local strings. They become globally meaningful only
inside the full envelope.

## Compiler and compiled-server-output changes

### Preserve the implemented source model

`ExactSourceInspection` remains the editor-facing compiler contract. The runtime system derives a
separate versioned build catalog rather than treating language-service responses as a permanent wire
format.

```ts
export type ExactBuildInspectionCatalog = Readonly<{
	protocol: 1;
	buildKey: string;
	producer: Readonly<{
		packageName?: string;
		version?: string;
	}>;
	roots: Readonly<Record<string, ExactInspectionRootCatalog>>;
}>;

export type ExactInspectionRootCatalog = Readonly<{
	executionRoot: string;
	rootComponentId: string;
	files: readonly ExactRuntimeSourceFile[];
	redactions: ExactInspectionRedactionCatalog;
}>;
```

The current `selectExactExposureInspectionCatalog()` supplies the reachable component selection for
one `ExactInspectionRootCatalog`. The new wrapper adds build identity, server wire-versioning, source
normalization, and redaction metadata.

### Make source locations usable without source text

Current source inspection uses half-open UTF-16 offsets. A server build catalog adds line and column
locations so Chromium does not need the original source merely to identify a range:

```ts
export type ExactRuntimeSourceLocation = Readonly<{
	path: string;
	sourceHash: string;
	start: Readonly<{ offset: number; line: number; column: number }>;
	end: Readonly<{ offset: number; line: number; column: number }>;
}>;
```

Paths are project- or package-relative. Absolute build-machine paths are not emitted. A source hash
lets the extension determine whether a loaded client source map, local workspace file, or server
source provider matches the catalog.

Source content is not included by default. A build adapter may retain private source maps or source
content as a separately protected server asset. A debug query at the eXact endpoint may return a
bounded source excerpt only when:

- the build retained source content;
- `allowDebug` approves the request; and
- the requested hash matches the catalog.

### Collect inspection once per authored module

Paired client/server compilation must not produce competing source catalogs. Artifact compilation
collects one target-neutral inspection result from the shared semantic analysis, then writes the
client and server executable artifacts normally.

Compilation results gain optional server-output fields:

```ts
export type ExactCompiledArtifactInspection = Readonly<{
	inspectionFile?: string;
	inspection: ExactSourceInspection;
}>;
```

Direct `transformSource()` callers continue receiving `inspectionCatalog` in memory when
`emitInspection` enables it. Project artifact compilation additionally aggregates those results.

### Package rich metadata only with server output

Build integrations emit one server-only inspection module or protected data asset per immutable
build:

```text
dist/
├─ public/
│  ├─ app.js
│  └─ remote-entry.js
└─ server/
   ├─ app.js
   └─ .exact-inspection/
      └─ <build-key>.json
```

The exact physical representation remains adapter-owned. The required invariants are:

- the inspection asset is not reachable from a client entry;
- it is not copied to a public static directory;
- ordinary component modules do not embed rich descriptions;
- the server registration validates the catalog protocol and build key;
- bundlers may embed the catalog in a server-only module instead of writing JSON;
- disabling inspection prevents creation and import of the asset; and
- published libraries do not ship application inspection catalogs.

The generated server entry registers the catalog explicitly:

```ts
import inspection from './.exact-inspection/0123456789abcdef.json' with { type: 'json' };

const exact = createExactServerContext({
	contract,
	inspectionCatalogs: [inspection],
	allowDebug
});
```

This is conceptual generated output. Existing adapters may compose an `ExactServerContext` directly
rather than introduce the illustrated factory.

### Keep client correlation compact

The client bundle needs only enough identity to connect live records to the server catalog:

- component type ID, already present in compiled component contracts;
- execution root, already present in the component domain;
- instance ID, already created by the runtime; and
- optional source entity IDs or compact source slots for tasks, actions, bindings, lifecycle
  registrations, and render expressions.

Rich summaries, reasons, paths, filenames, and source excerpts remain server-owned.

The implemented source inspection currently derives some entity IDs in the JavaScript projection.
Before runtime correlation, task/action/binding entity identity must become one canonical compiler
fact used by:

1. language-service inspection;
2. build catalog emission; and
3. optional runtime correlation lowering.

The native compiler may emit a stable-in-build `sourceEntityId`, or it may emit a component-local
numeric slot that the catalog maps to an entity ID. Do not independently recreate ordering in the
runtime or Chromium extension.

### Build-time controls

Retain the implemented static-catalog control:

```ts
emitInspection?: boolean | 'auto';
```

Add an independent control for compact runtime observation hooks:

```ts
instrumentInspection?: boolean | 'auto';
```

`auto` follows the development build default and is disabled when
`process.env.NODE_ENV === 'production'`. Framework adapters should expose one higher-level debug
configuration and derive both compiler controls:

```ts
export default defineExactConfig({
	debug: {
		catalog: 'auto',
		runtime: 'auto'
	}
});
```

Applications that may debug production deliberately enable both:

```ts
export default defineExactConfig({
	debug: {
		catalog: true,
		runtime: true
	}
});
```

`allowDebug` is a runtime authorization decision. It cannot recreate metadata or instrumentation
removed at build time. When a server declares `allowDebug` as a resolver, adapters should warn if
the build disables the catalog or runtime hooks, but explicit hardened settings win.

### Hardened output

With both compiler controls disabled:

- no inspection catalog is written;
- no source entity correlation slots are lowered;
- no client root registry or event bridge is installed;
- no server observation collector is created;
- the debug protocol dispatcher reports unavailable or is omitted; and
- ordinary compiler contracts required for execution remain unchanged.

This mode must be tested by scanning client and server output for inspection-only symbols and source
descriptions.

## Runtime observation model

### Transport-neutral records

Create a small package such as `@exactjs/devtools-protocol` containing only immutable DTOs,
validators, protocol constants, pagination helpers, and redaction-safe value previews. It must not
depend on Chromium, Node, the DOM renderer, or a server adapter.

The top-level snapshot is:

```ts
export type ExactInspectionSnapshot = Readonly<{
	protocol: 1;
	session: ExactInspectionSessionDescription;
	roots: readonly ExactInspectionExecutionRoot[];
	components: readonly ExactInspectedRuntimeComponent[];
	timelineCursor: string;
}>;
```

### Client component records

```ts
export type ExactInspectedRuntimeComponent = Readonly<{
	id: ExactInspectionRuntimeId;
	parent?: ExactInspectionRuntimeId;
	name: string;
	status: 'constructing' | 'mounted' | 'inactive' | 'unmounting';
	props: ExactValuePreview;
	state: ExactValuePreview;
	contexts: readonly ExactContextPreview[];
	tasks: readonly ExactTaskRuntimeSnapshot[];
	actions: readonly ExactActionRuntimeSnapshot[];
	activity?: ExactActivityInspection;
	suspense?: ExactSuspenseInspection;
	ownedElements: number;
}>;
```

The first implementation may project the existing renderer inspection tree and
`inspectComponentActions()`, but must move production tooling access behind an internal inspection
host rather than importing `@exactjs/dom/testing`.

### Task records

Task registration snapshots expose state, not callbacks:

```ts
export type ExactTaskRuntimeSnapshot = Readonly<{
	id: ExactInspectionRuntimeId;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	readiness: 'blocking' | 'nonblocking';
	priority: 'normal' | 'deferred';
	status: 'idle' | 'queued' | 'running' | 'settled' | 'failed' | 'cancelled' | 'stale';
	generation: number;
	completedGeneration?: number;
	failedGeneration?: number;
	cancellationReason?: string;
	startedAt?: number;
	settledAt?: number;
}>;
```

No task `work`, cleanup callback, controller, service, or captured lexical value enters the
snapshot.

### Context records

Contexts are identified by compiler/authored token names where available:

```ts
export type ExactContextPreview = Readonly<{
	name: string;
	scope: 'component' | 'request' | 'application';
	availability: 'value' | 'resource' | 'secret' | 'unavailable';
	value?: ExactValuePreview;
	secretName?: string;
}>;
```

Client-visible, non-secret data contexts may show bounded values. Server resource contexts show
their token, scope, and a type summary but are not recursively serialized. Secret contexts show
only a statically known selector or configured key name.

### Safe value previews

The protocol never performs unrestricted serialization. A value preview:

- has configurable maximum depth, entries, string length, and byte size;
- tracks cycles;
- does not invoke getters;
- does not call `toJSON()`, custom inspection hooks, or user formatters;
- does not enumerate proxy targets after an exception;
- represents functions by type/name only;
- represents DOM nodes by bounded tag/id/class summaries;
- represents `Map` and `Set` with bounded entries;
- marks truncation explicitly; and
- applies compiler/runtime redaction before traversal.

```ts
export type ExactValuePreview =
	| Readonly<{ kind: 'scalar'; value: string | number | boolean | null }>
	| Readonly<{
			kind: 'object';
			type: string;
			entries: readonly ExactPreviewEntry[];
			truncated: boolean;
	  }>
	| Readonly<{ kind: 'redacted'; reason: 'secret' | 'server-resource' | 'policy' }>
	| Readonly<{ kind: 'unavailable'; reason: string }>;
```

### Observation hooks and ownership

Runtime packages accept an optional internal inspection sink. They do not publish process-global
event streams:

```ts
export interface ExactRuntimeInspectionSink {
	publish(event: ExactRuntimeInspectionEvent): void;
}
```

The component domain, renderer root, hydration runtime, SSR request, and server request inherit the
appropriate sink from their explicit owner. This preserves isolation between concurrent
applications and requests.

The sink observes:

- component construct, mount, activate, deactivate, and unmount;
- state and props version changes, represented by paths rather than unrestricted values;
- task queue, start, settlement, failure, cancellation, and supersession;
- action queue, start, optimistic publication, rollback/discard, settlement, and cancellation;
- render and binding invalidation;
- Activity and Suspense generation changes;
- continuation dispatch, server receipt, execution, response, and client application;
- context token access, using the existing server context-access observation as a foundation;
- hydration/resumption activation; and
- framework errors and bounded profiling events.

Observers must not change scheduling, error propagation, cancellation, or readiness.

### Late DevTools attachment

A Chromium panel is commonly opened after the page has mounted. Instrumented client builds
therefore maintain a weak, enumerable registry of active roots and domains:

- roots register after successful creation;
- disposal removes the registration;
- entries hold weak references where the platform supports them;
- a snapshot materializes current state only after DevTools attaches; and
- no event history is retained before attachment unless explicitly configured.

The registry contains live runtime references, not rich source metadata. Hardened builds omit it.

### Browser hook

The Chromium extension injects a page-world hook before or after application startup:

```ts
globalThis[Symbol.for('@exactjs/devtools-hook')];
```

An instrumented runtime registers roots with the hook when present and supports a late-attachment
snapshot from its weak registry. The hook offers a versioned message boundary; it does not expose
raw component instances to extension code.

The bridge is activated only by a DevTools connection. Ordinary application code does not consume
server catalogs or runtime events.

## Server cooperation

### `allowDebug`

Extend server configuration with:

```ts
export type ExactAllowDebug =
	| boolean
	| ((context: ExactDebugAuthorizationContext) => boolean | Promise<boolean>);

export type ExactDebugAuthorizationContext = Readonly<{
	request: ExactRequestLike;
	platformRequest?: unknown;
	capability: 'catalog' | 'snapshot' | 'events' | 'source';
	binding?: string;
	buildKey?: string;
	executionRoots: readonly string[];
}>;

export type ExactServerContextConfiguration = {
	// Existing fields...
	allowDebug?: ExactAllowDebug;
};
```

Default behavior:

- development: `true` when debug output is present, unless explicitly disabled;
- production: `false` when `allowDebug` is omitted;
- explicit `true`: enable every otherwise valid debug request;
- explicit `false`: make debug messages unavailable at the endpoint;
- resolver: evaluate against each session handshake and capability escalation.

`allowDebug: true` is intentionally uncomplicated. In production it is a deliberate broad
authorization decision. Applications needing restricted production debugging use the resolver:

```ts
const serverContext: ExactServerContext = {
	contract,
	inspectionCatalogs,
	allowDebug: async ({ platformRequest, capability }) => {
		const request = platformRequest as Request;
		const operator = await authenticateOperator(request);
		return (
			operator.roles.includes('incident-debugger') &&
			(capability !== 'source' || operator.roles.includes('source-debugger'))
		);
	}
};
```

When authorization fails, the eXact endpoint returns `404` for that debug message and does not
reveal whether a catalog exists.

### One eXact protocol endpoint

Extend the transport-neutral eXact request union rather than adding routes or adapters:

```ts
export type ExactProtocolRequest = ExactInvocationRequest | ExactBatchRequest | ExactDebugRequest;

export type ExactDebugRequest =
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'open';
			capabilities?: readonly ExactDebugCapability[];
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'query';
			sessionId: string;
			query: ExactInspectionQuery;
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'subscribe';
			sessionId: string;
			cursor?: string;
			filter?: ExactInspectionEventFilter;
	  }>
	| Readonly<{
			type: 'debug';
			version: 1;
			request: 'close';
			sessionId: string;
	  }>;
```

All messages use the configured eXact endpoint, normally `POST /__exact`. `handleExactRequest()`
parses and bounds the common envelope, then dispatches by top-level type:

```text
POST /__exact
├─ action / refresh / batch → existing invocation dispatcher
└─ debug
   ├─ open                → allowDebug + session creation
   ├─ query               → session + capability + query validation
   ├─ subscribe           → bounded NDJSON event response
   └─ close               → session disposal
```

This shares endpoint matching, platform-request adaptation, request cancellation, payload limits,
logging, origin/CSRF enforcement, and microfrontend routing without treating debug IDs as executable
manifest IDs. `ExactDebugRequest` never enters `dispatchExactOperation()` and cannot be included in
an invocation batch. A future protocol batch may define read-only debug query batching explicitly,
but ordinary `ExactBatchRequest.operations` remains invocation-only.

The existing Fetch, Express, Hapi, Node, serverless, and platform adapters require no additional
route. They continue exposing their one eXact handler. `ExactServerContext` gains the debug
configuration and internal query service consumed by `handleExactRequest()`.

`debug.open` performs capability discovery and authorized session creation in one round trip.
Catalogs, snapshots, source excerpts, and pagination are `debug.query` methods. `debug.subscribe`
uses the existing streaming response path with `Accept: application/x-ndjson`; each line is a
validated protocol event. This avoids a second SSE or WebSocket URL while retaining cancellation
and backpressure. Later transports may optimize the same message model, but cannot be required for
microfrontend reachability.

Every debug response uses `Cache-Control: no-store`. Cross-origin browser requests are rejected.
All debug messages are POST requests and apply ordinary origin and CSRF protection.
Extension-specific headers are not treated as security credentials because page code can reproduce
them.

This establishes a general architectural pattern: compiler- and framework-owned protocol
capabilities can communicate with the backend of any registered microfrontend without exposing that
host to the browser. The page already has the binding, build, root, forwarding transformation,
cancellation, and response-validation machinery needed to address it.

It is not a generic RPC tunnel. Each added top-level message family requires:

- a versioned discriminated request and response contract;
- bounded parsing and serialization;
- an explicit page-host and component-host authorization policy;
- gateway validation appropriate to that message family;
- defined cancellation, streaming, and retained-build behavior; and
- tests proving it cannot be interpreted as an invocation or cross execution-root boundaries.

### Session lifetime

An authorized session:

- receives an opaque random `sessionId`;
- binds to the authenticated browser/request identity chosen by the application;
- records allowed capabilities;
- expires after inactivity and at a configurable maximum lifetime;
- closes when `allowDebug` later rejects refresh;
- owns bounded event cursors and subscriptions; and
- never becomes authorization for an ordinary eXact action or refresh.

Default limits should be conservative:

```ts
export type ExactDebugLimits = Readonly<{
	maxSessions?: number;
	maxSessionMinutes?: number;
	maxEvents?: number;
	maxEventBytes?: number;
	maxSnapshotBytes?: number;
	maxQueryDepth?: number;
	maxQueryResults?: number;
	maxSourceExcerptBytes?: number;
}>;
```

### Server observations

Server instances are often request-owned and no longer live when a developer opens the panel.
Server inspection therefore uses two forms:

1. Live snapshots for currently executing requests and continuations.
2. Bounded immutable event records for recently completed work.

The server never retains component instances, request scopes, platform requests, context values, or
response bodies merely for debugging. Events capture safe previews at observation time and then
release runtime references.

Each request receives a correlation ID. Client continuation requests propagate an existing
interaction/operation correlation value as observational metadata, while the server continues to
authorize dispatch solely through compiler-generated contracts.

### Catalog registry

The server keeps catalogs keyed by immutable build and execution root:

```ts
export interface ExactInspectionCatalogRegistry {
	register(catalog: ExactBuildInspectionCatalog): ExactPluginResource;
	find(buildKey: string, executionRoot: string): ExactInspectionRootCatalog | undefined;
}
```

Retired remote builds may retain matching inspection catalogs for the same period as their executor
contracts. Catalog disposal follows build disposal. A running client whose build is no longer
retained receives a structured `catalog-unavailable` result rather than metadata from a newer build.

## Secret and sensitive-value rules

Secret values are excluded at multiple boundaries:

1. The compiler catalog records policy identity and known selectors, never values.
2. Runtime previews apply a redaction table before traversing state or context paths.
3. Server resource contexts are opaque by default.
4. The secrets plugin may contribute configured key names and presence only.
5. Query and event validators reject a secret-marked value payload even if an observer is defective.
6. Logs and profiling attributes continue to use bounded scalar metadata.

For example:

```json
{
	"name": "STRIPE_SECRET_KEY",
	"scope": "application",
	"availability": "secret",
	"secretName": "STRIPE_SECRET_KEY"
}
```

There is deliberately no `value`, masked suffix, hash, length, or equality token.

Compiler-qualified secret state paths are always redacted. For unqualified application data,
enabling debugging means the application has authorized inspection. Applications may supply an
additional redactor for business-sensitive values:

```ts
debug: {
	redact({ path, context }) {
		return context === 'Customer' && path.endsWith('.ssn');
	}
}
```

Custom redaction may remove more data but cannot unredact compiler-qualified secrets.

## Microfrontend federation

### Client tree

Client microfrontends already carry distinct component domains and execution roots. The renderer
inspection projection retains that domain on every component instance, so one DOM tree can show:

```text
PageRoot [page]
├─ Header [page]
├─ BrandShell [binding=branding, root=@company/branding#./Shell]
│  └─ AccountMenu [binding=branding, root=@company/branding#./Shell]
└─ BillingArea [binding=billing, root=@company/billing#./Area]
   └─ InvoiceList [binding=billing, root=@company/billing#./Area]
```

Slots preserve their logical owner. A page-owned slot rendered physically inside a remote range
continues to appear under its page owner, with a secondary physical-placement relationship visible
in the details panel.

### Exposure catalogs

Each producer build creates a catalog for each exposed root using the implemented reachable-exposure
selection. Sibling exposures may share source files internally, but their served catalogs contain
only components reachable from the selected root.

Catalog identity is:

```text
binding + buildKey + executionRoot
```

The page host does not rename producer component IDs or source paths.

### Federated server path

The page host extends the existing `createExactBindingGateway()` to accept the full
`ExactProtocolRequest` union. It uses the same binding endpoints and
`transformForwardedRequest` integration already configured for actions and refreshes:

```ts
createExactBindingGateway({
	bindings: {
		branding: { endpoint: 'https://branding.internal/__exact' },
		billing: { endpoint: 'https://billing.internal/__exact' }
	},
	transformForwardedRequest: serviceAuthentication
});
```

The sequence is:

1. Chromium sends `debug.open` to the page's existing eXact endpoint.
2. The page host evaluates its own `allowDebug`.
3. A query identifies a binding, build key, and execution root already registered by the inspected
   page and uses the existing `x-exact-binding` and `x-exact-build` routing envelope.
4. The binding gateway validates the page session and creates or reuses a bounded child session for
   the configured component host.
5. Deployment-owned transformation adds service authentication without forwarding browser cookies
   or authorization headers.
6. The remote host receives `debug.open`, `debug.query`, `debug.subscribe`, or `debug.close` at its
   ordinary eXact endpoint and independently evaluates its `allowDebug`.
7. The remote host validates that the requested build and root belong to the binding.
8. The page host validates and relays the bounded response.

Both hosts must approve. A page host cannot force a remote host to expose diagnostics, and a remote
host cannot bypass the page's browser-visible authorization boundary.

The browser knows only the page session. The gateway keeps the mapping from that session to opaque
remote child sessions, translates session IDs while forwarding, closes child sessions with the page
session, and never returns remote service credentials or session IDs to the browser. Therefore
adding inspection does not require public routes to any component host or a second internal routing
table.

### Federated events

Remote event streams carry per-host cursors. The page host merges them into a session timeline while
preserving:

- host monotonic timestamps;
- optional wall-clock timestamps;
- request and operation correlation IDs;
- binding, build, and root;
- per-host ordering; and
- explicit uncertainty when clocks cannot be aligned.

The UI must not claim a total order across hosts based solely on unsynchronized wall clocks.

### Partial availability

The page remains inspectable when:

- one remote host disables debugging;
- a catalog for an old build has been retired;
- a remote event stream disconnects;
- client runtime instrumentation is present but server cooperation is unavailable; or
- server catalog data exists but the corresponding microfrontend is not currently mounted.

Unavailable branches show a reason and retry action. They do not disappear from the topology.

## Chromium DevTools extension

### Panels

The initial extension contains:

#### Components

- logical component-instance tree;
- execution-root and microfrontend badges;
- Activity, Suspense, hydration, and lifecycle status;
- element highlight and `$0` owner lookup;
- logical owner versus physical placement for portals and slots; and
- source location with open-resource support.

#### State and context

- bounded state and prop previews;
- reactive path versions where available;
- component, request, and application context tokens;
- server-resource and secret redaction markers; and
- change history for selected paths within the retained event window.

#### Tasks and actions

- inferred/explicit origin from the compiler catalog;
- placement, readiness, priority, concurrency, dependencies, and effects;
- current and recent generations;
- cancellation and supersession reasons;
- optimistic overlay status;
- server continuation correlation; and
- compiler explanation links.

#### Dependencies

- “why did this update?” queries;
- source dependency and effect graph;
- render expression consumers;
- broad/unknown confidence shown explicitly; and
- links to related source ranges.

#### Timeline

- interactions, router navigation, tasks, actions, renders, commits, server requests, continuation
  execution, patches, errors, and lifecycle events;
- filtering by component, root, binding, request, operation, or interaction;
- client/server correlation; and
- bounded export as protocol JSON for issue reports.

#### Microfrontends

- bindings, build keys, execution roots, and hosts;
- mounted client roots;
- retained server build/catalog availability;
- gateway and authorization status;
- version skew and retired-build warnings; and
- per-host event-stream health.

### Source integration

The extension resolves a source location in this order:

1. loaded client source map whose source hash matches;
2. a workspace mapping supplied by the developer;
3. an authorized server source excerpt;
4. filename, line, column, and semantic explanation without source text.

It must never display source from a mismatched hash as though it belonged to the running build.

### Selection synchronization

- Selecting a DOM element chooses its owning component.
- Selecting a component highlights its owned root elements.
- Selecting a task/action chooses its compiler source entity.
- Selecting a timeline event chooses the relevant component, generation, and server request.
- A source entity copied from VS Code can be resolved only when build identity and source hash match;
  generation-local language-service IDs alone are insufficient.

## Agent protocol

### One query service

The Chromium UI calls a transport-neutral service:

```ts
export interface ExactInspectionQueryService {
	request(request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
	subscribe(
		request: ExactInspectionSubscription,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): ExactInspectionSubscriptionHandle;
}
```

The agent adapter calls this same service. It does not parse panel HTML or evaluate arbitrary
component objects.

### Versioned read-only methods

Initial methods:

```text
session.describe
roots.list
microfrontends.list
components.tree
components.get
components.ownerOfElement
state.get
contexts.list
tasks.list
tasks.get
actions.list
actions.get
dependencies.explain
timeline.query
timeline.subscribe
errors.list
catalog.entity
source.excerpt
```

Every collection method supports pagination and filtering. Every response includes protocol,
session, build, and execution-root identity.

Example:

```json
{
	"protocol": 1,
	"id": "request-42",
	"method": "dependencies.explain",
	"params": {
		"component": {
			"side": "client",
			"buildKey": "0123456789abcdef0123456789abcdef01234567",
			"executionRoot": "page",
			"componentTypeId": "component:OrderEditor",
			"instanceId": "instance-18"
		},
		"sourceEntityId": "component:OrderEditor:render:total"
	}
}
```

Response:

```json
{
	"protocol": 1,
	"id": "request-42",
	"ok": true,
	"result": {
		"classification": "reactive render expression",
		"dependencies": [{ "kind": "state", "path": "state.lines.*.price", "confidence": "broad" }],
		"lastInvalidation": {
			"path": "state.lines.3.price",
			"interactionId": "interaction-91"
		},
		"source": {
			"path": "src/OrderEditor.tsx",
			"line": 48,
			"column": 14
		}
	}
}
```

### Chromium/CDP attachment

Provide an agent adapter package or CLI that:

1. attaches to an existing Chromium target through the Chrome DevTools Protocol;
2. detects the eXact DevTools hook;
3. installs a CDP runtime binding for responses and events;
4. sends validated requests to the in-page query bridge;
5. uses the browser's authenticated server debug session; and
6. removes bindings and subscriptions on disconnect.

This design lets browser-control agents inspect the same signed-in page as the developer without
copying cookies or server credentials into a separate process.

An optional MCP server may project the query methods for agent hosts, but MCP is an adapter, not the
canonical protocol.

### Agent safety

Version 1 is read-only. The adapter:

- accepts only known methods and validated parameters;
- cannot evaluate caller-supplied JavaScript;
- cannot invoke an action or server continuation;
- cannot request an unbounded snapshot;
- cannot override redaction;
- cannot extend an expired session;
- reports unavailable data explicitly; and
- attributes every subscription and query to a debug session for audit logging.

The server may separately audit debug-session creation and query summaries. Audit events contain
method, binding, root, result size, and operator identity chosen by the application, not returned
state values.

## Complete examples

### Development server

```ts
import { createFetchHandler, type ExactServerContext } from '@exactjs/server';
import { contract, inspectionCatalogs } from './generated/server.js';

const context: ExactServerContext = {
	contract,
	inspectionCatalogs,
	allowDebug: true
};

export const exact = createFetchHandler(context);
```

The one handler accepts invocations and authorized debug messages at the configured eXact endpoint.
The build adapter emits catalogs and runtime instrumentation automatically in a development build.

### Restricted production debugging

```ts
import {
	createFetchHandler,
	type ExactDebugAuthorizationContext,
	type ExactServerContext
} from '@exactjs/server';
import { contract, inspectionCatalogs } from './generated/server.js';

async function allowDebug({
	platformRequest,
	capability
}: ExactDebugAuthorizationContext): Promise<boolean> {
	const request = platformRequest as Request;
	const operator = await incidents.authenticate(request);

	if (!operator) return false;
	if (!operator.permissions.includes('debug:exact')) return false;
	if (capability === 'source' && !operator.permissions.includes('debug:source')) return false;

	return operator.incidentId === process.env.ACTIVE_INCIDENT_ID;
}

const context: ExactServerContext = {
	contract,
	inspectionCatalogs,
	allowDebug,
	debugLimits: {
		maxSessions: 4,
		maxSessionMinutes: 30,
		maxEvents: 20_000,
		maxSnapshotBytes: 2 * 1024 * 1024
	}
};

export const exact = createFetchHandler(context);
```

The corresponding build explicitly retains the otherwise production-disabled assets:

```ts
export default defineExactConfig({
	debug: {
		catalog: true,
		runtime: true
	}
});
```

### Page host with two remote component hosts

```ts
import { createExactBindingGateway, type ExactServerContext } from '@exactjs/server';

const context: ExactServerContext = {
	contract: pageContract,
	inspectionCatalogs: [pageInspection],
	remoteBuilds,
	gateway: createExactBindingGateway({
		bindings: {
			branding: { endpoint: 'https://branding.internal/__exact' },
			billing: { endpoint: 'https://billing.internal/__exact' }
		},
		transformForwardedRequest: serviceAuthentication
	}),
	allowDebug: authorizeIncidentOperator
};
```

The same gateway forwards invocation and debug message families to the same component-host
endpoints. The branding and billing hosts each configure their own `allowDebug`; the page host's
approval alone is insufficient.

## Diagnostics and failure behavior

Build diagnostics:

- runtime instrumentation enabled while catalog emission is disabled;
- `allowDebug` configured by a statically visible adapter config while both debug build outputs are
  disabled;
- duplicate build/root catalogs;
- exposure catalog root not reachable in the artifact graph;
- source entity correlation missing from an instrumented task or action;
- inspection asset reachable from a client entry; and
- secret-marked catalog data containing a value field.

Runtime failures are structured:

```ts
export type ExactInspectionUnavailableReason =
	| 'debug-disabled'
	| 'not-authorized'
	| 'catalog-not-built'
	| 'runtime-not-instrumented'
	| 'build-retired'
	| 'root-unknown'
	| 'remote-unavailable'
	| 'source-unavailable'
	| 'session-expired';
```

DevTools must distinguish these cases instead of reporting a generic disconnected state.

## Package ownership

Expected ownership when implementation begins:

| Package or project                | Responsibility                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `@exactjs/compiler`               | canonical source entity IDs, catalog creation, runtime slots                                  |
| framework build adapters          | server-only catalog packaging and build defaults                                              |
| `@exactjs/core`                   | component/task/action observation records and domain correlation                              |
| `@exactjs/dom`                    | root registry, logical/physical tree, element ownership                                       |
| `@exactjs/ssr`                    | request-owned component and readiness observations                                            |
| `@exactjs/hydrate`                | hydration, resumption, patch, and continuation correlation                                    |
| `@exactjs/server`                 | protocol debug family, `allowDebug`, sessions, queries, event history, shared binding gateway |
| `@exactjs/instrumentation`        | shared bounded timing envelopes where appropriate                                             |
| `@exactjs/secrets`                | optional secret key-name/presence projection, never values                                    |
| `@exactjs/devtools-protocol`      | transport-neutral DTOs, validators, redaction previews, pagination                            |
| Chromium DevTools extension       | inspected-page bridge and human interface                                                     |
| agent adapter / optional MCP host | CDP attachment and projection of the read-only protocol                                       |

Every new package begins with `README.md` and `AGENTS.md`, is covered by package-content checks, and
updates the reusable eXact authoring skill where application configuration changes.

## Testing strategy

### Compiler and build

- Source entity IDs match language-service inspection, server catalog, and instrumented output.
- Client artifacts contain compact IDs but no rich descriptions.
- Server catalogs cover client and server entities exactly once.
- Exposure selection excludes siblings and unrelated page components.
- `emitInspection: false` and `instrumentInspection: false` remove all optional output.
- Source paths are relative and source hashes are deterministic.
- Secret selectors are retained without secret values.
- Client-bundle reachability tests fail if a catalog asset enters a public graph.

### Runtime

- Mount, activation, task, action, optimistic, cancellation, and unmount transitions produce ordered
  immutable observations.
- Inspection does not alter scheduling or cause additional reactive dependencies.
- Disposed roots and instances are collectable and absent from later snapshots.
- Value previews do not invoke getters, `toJSON()`, proxies after failure, or user callbacks.
- Cycles and large collections are bounded.
- Secret and server-resource redaction occurs before traversal.
- Late attachment snapshots existing roots without retaining disposed roots.

### Server and security

- Omitted production `allowDebug` returns `404`.
- Boolean and asynchronous resolver decisions are honored.
- Resolver revocation closes active streams.
- The ordinary adapter and configured eXact endpoint accept both invocation and debug families.
- Debug requests never enter action, refresh, continuation, or invocation-batch dispatch.
- Requests cannot use debug IDs to dispatch actions or continuations.
- Catalog lookup requires exact build and execution root.
- Sessions expire and obey count, time, event, and byte limits.
- Source excerpts require a matching hash and source capability.
- Debug responses are no-store and reject cross-origin use.
- Secret values never appear in snapshots, events, errors, logs, or audit records.

### Microfrontends

A two-host integration test proves:

- one page tree contains page, branding, and billing roots;
- colliding component-local IDs remain distinct;
- each host serves only its selected build/exposure catalog;
- both page and remote `allowDebug` decisions are required;
- browser credentials are not forwarded to component hosts;
- the existing binding endpoint and forwarding transformation carry debug messages without a
  second route;
- page sessions are translated to remote child sessions and child sessions close with their owner;
- a debug message cannot be forwarded to a binding/build/root not registered by the inspected page;
- disconnecting one remote retains the other branches;
- old and preferred build catalogs never mix; and
- merged timeline records preserve per-host ordering.

### Chromium

Extension end-to-end tests prove:

- element selection resolves the logical component owner;
- component selection highlights owned elements;
- source links require a matching hash;
- tasks and actions correlate with server events;
- unavailable server cooperation degrades to client-only inspection;
- microfrontend status is visible; and
- panel disposal closes subscriptions and releases page bridges.

### Agent

- The agent receives the same query result as the corresponding panel model.
- CDP bindings are removed on disconnect.
- Unknown methods, oversized filters, stale sessions, and invalid IDs are rejected.
- Subscriptions resume from cursors without duplicating events.
- No method evaluates caller-provided JavaScript or changes application state.

## Performance and resource budgets

The implementation must establish measured budgets rather than assume debugging overhead is free.
Initial acceptance targets:

- hardened builds: zero catalog bytes and no inspection-only client runtime;
- catalog-only server builds: no client bundle growth;
- instrumented idle client: no retained event history before attachment;
- attached client: bounded weak root registry and event queue;
- server: fixed maximum sessions and ring-buffer bytes;
- snapshot construction: work proportional to inspected nodes and configured preview bounds;
- event publication: no recursive value serialization on the application hot path; and
- disabled `allowDebug`: no catalog decoding unless required for server registration validation.

Benchmarks should cover a large keyed list, frequent reactive bindings, action churn, Suspense
replacement, SSR, and a three-root microfrontend page.

## Delivery phases

### Phase 1: canonical runtime correlation

- Promote source entity identity into a canonical compiler fact.
- Add build-scoped runtime catalog DTOs.
- Aggregate target-neutral inspection during artifact compilation.
- Add compact optional runtime correlation slots.
- Prove rich inspection metadata cannot enter client bundles.

### Phase 2: client runtime inspector

- Add explicit inspection sinks to core and DOM ownership boundaries.
- Implement weak late-attachment root discovery.
- Project component, state, contexts, tasks, actions, Activity, and Suspense.
- Add safe value previews and redaction.
- Implement the in-page versioned hook.

This phase can support a basic client-only Chromium panel before server cooperation.

### Phase 3: server catalog and events

- Package and register build catalogs with server output.
- Add the debug request family to the existing eXact protocol handler.
- Add `allowDebug`, sessions, limits, and query dispatch.
- Add SSR, continuation, context-access, action, error, and profiling observations.
- Implement bounded query responses and NDJSON subscriptions through the existing streaming path.
- Prove production defaults and hardened output.

### Phase 4: microfrontend federation

- Register exposure catalogs with retained remote builds.
- Extend the existing page-host binding gateway to validate and forward debug messages.
- Add page-session to remote-child-session mapping and deterministic cleanup.
- Correlate client bindings with server builds and roots.
- Merge bounded per-host events without inventing a false total order.
- Complete the two-host conformance suite.

### Phase 5: full Chromium experience

- Build Components, State, Tasks/Actions, Dependencies, Timeline, and Microfrontends panels.
- Add element highlighting, source resolution, filtering, and failure explanations.
- Integrate compiler explanations from the server catalog.
- Add bounded inspection export.

### Phase 6: agent bridge

- Stabilize protocol validators and pagination.
- Add CDP attachment and event bindings.
- Add the optional MCP projection.
- Publish read-only agent usage guidance and security expectations.
- Test human/agent result equivalence.

## Acceptance criteria

The proposal is complete when:

1. A developer can select an element and find its durable component instance, source component, and
   execution root.
2. The panel explains inferred tasks and render dependencies using compiler-owned facts from the
   running build.
3. Client state, props, public contexts, actions, tasks, lifecycle, Activity, and Suspense are
   inspectable without exposing callbacks or raw instances.
4. Authorized server cooperation correlates requests and continuations with the same component
   model.
5. Secret values cannot enter any debug response, event, source excerpt, log, or export.
6. `allowDebug` works as a boolean or asynchronous per-session resolver and defaults off in
   production.
7. Page and remote hosts both authorize federated microfrontend inspection.
8. Browser and federated debug traffic uses the application's existing eXact endpoint and binding
   gateway; no separate component-host debug route is required.
9. Catalogs are selected by exact build and execution root and are disposed with retained builds.
10. Rich metadata is absent from client bundles.
11. Hardened builds remove catalogs, instrumentation, dispatchers, and inspection-only symbols.
12. Chromium and agent consumers use the same validated read-only protocol.
13. Disabling or disconnecting inspection does not alter application scheduling, ownership,
    cancellation, rendering, or server dispatch.

## Open implementation choices

The following choices may be settled experimentally without changing the architecture:

- JSON asset versus server-only JavaScript module for catalog packaging;
- event and heartbeat framing within the existing NDJSON streaming response;
- string source entity IDs versus component-local numeric slots in instrumented client output;
- `WeakRef` registry versus an explicitly maintained iterable root set;
- whether source excerpts are implemented in the first server phase;
- exact Chromium UI framework and bundler; and
- whether the first agent adapter is a CLI, library, MCP server, or more than one projection.

These choices must preserve the identity, authorization, redaction, microfrontend, and client-bundle
boundaries defined above.
