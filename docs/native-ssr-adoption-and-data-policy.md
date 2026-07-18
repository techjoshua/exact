# Native SSR Adoption, Server Context, And Data Policy

## Status

This document consolidates the current direction for making native eXact SSR and
server components adoptable, without depending on the React compatibility
layer. It also records the intended relationship between:

- Server and client execution placement.
- Server, client, isomorphic, and secret data residency.
- Application, request, and component lifetimes.
- Ordinary provider components and context propagation.
- Paired component-package artifacts.
- Raw HTML, scripts, URLs, CSP, and server patch safety.
- Core compiler policy and the optional `@exact/secrets` package.
- Application and dependency permissions for secret consumption.
- Compiler manifests and application-level policy audit reports.

The architectural direction in this document is agreed. Exact API names,
annotation spelling, manifest schema names, and configuration shapes remain
subject to implementation review.

Where this document conflicts with earlier exploratory language in
[keep-policy-and-server-context-plan.md](keep-policy-and-server-context-plan.md),
this document is the newer direction. The detailed flow-analysis and lifetime
material in that plan remains useful.

## Goals

- Make native SSR and server components correct and predictable enough that
  their remaining limitations are not adoption blockers.
- Preserve the existing eXact model in which a provider is an ordinary
  component that calls `this.setContext()`.
- Make trusted request and application data available to component setup during
  initial SSR, actions, boundary refreshes, and streaming.
- Allow server work to populate safe isomorphic component state that is
  transferred through hydration.
- Prevent server-kept, client-kept, and secret values from crossing prohibited
  artifact or serialization boundaries.
- Keep ordinary authenticated service calls ergonomic without treating every
  useful result as secret or server-kept.
- Publish one component package that works in client-only, SSR, and
  server-component applications.
- Give applications an auditable answer to which packages and operations use
  which secrets.
- Keep native eXact safer by default than compatibility surfaces that must
  reproduce React behavior.

## Non-Goals

- Recreating React Fiber, the React Server Components wire protocol, selective
  hydration, or React's progressive Suspense protocol.
- Requiring every fine-grained server patch optimization before native server
  components can be adopted.
- Treating client-visible authorization data as an enforcement boundary.
- Sandboxing arbitrary in-process JavaScript dependencies. A dependency that
  can execute on a Node server may independently access process capabilities
  outside the eXact secret resolver.
- Hiding values that have already been intentionally delivered to the browser.
- Automatically proving the behavior of opaque third-party code without a
  declaration, manifest contract, or trusted wrapper.

## Current Foundation

The repository already contains most of the lower-level pieces needed for this
direction.

### Native rendering and server protocol

- `@exact/ssr` renders strings, HTML streams, document event streams, progressive
  HTML streams, hydration bootstraps, client boundaries, and server slots.
- `@exact/server` provides manifest-allowlisted action and boundary dispatch,
  authorization and CSRF hooks, state/context contract validation, batching,
  streaming, cancellation, and resource ceilings.
- `@exact/hydrate` adopts server DOM, hydrates client islands, applies atomic
  patches, rejects invalid patch topology, and falls back to boundary
  replacement when a refresh includes authoritative HTML.
- Compiler manifests record component placement, call effects, action state and
  context contracts, boundaries, render edges, generated symbols, and artifact
  metadata.

### Request context

`@exact/request` provides:

- `RequestContext`.
- A normalized URL, method, headers, abort signal, locale/trace hints, and
  response controls.
- `runWithRequestContext()`.
- Pluggable request storage.
- A Node `AsyncLocalStorage` implementation.
- `RequestProvider`, which is an ordinary component.
- Router integration that prefers explicitly propagated server context and
  retains ambient storage as a convenience.

`@exact/server` now owns the runtime-neutral application/request scope. It
normalizes every adapter request, initializes configured contexts before root
setup or endpoint security, propagates one scope through actions, refreshes, and
streams, and disposes request resources on completion, cancellation, or runtime
shutdown. `@exact/ssr` exposes request-aware authoritative and streaming
response entrypoints that seed the same scope into component roots.

### Placement controls

The compiler already supports:

```ts
/** @exact client */
export function ClientOnlyCallable() {}

/** @exact server */
export function ServerOnlyCallable() {}
```

These annotations are valid on function declarations, methods, method
signatures, and function types. They describe where code may execute.

Tasks can use explicit placement escape hatches:

```ts
this.task.server(async () => {});
this.task.client(() => {});
```

Imports can declare an explicit evaluation boundary:

```ts
import "./browser-registration.js" with { exact: "client" };
import { readPrivateConfig } from "./private-config.js" with { exact: "server" };
```

The compiler rejects known contradictions, such as a server task using browser
globals or a client task retaining a server-only import.

### Paired artifacts

Artifact compilation emits:

```text
Component.exact.shared.ts
Component.exact.client.ts
Component.exact.server.ts
Component.exact.manifest.json
```

Closed target-neutral modules are emitted once as shared source with client and
server re-export facades. Other exports are classified as client, server, or
dual in artifact metadata. The compiler provides conditional-export helpers,
target assertions, component edges, descriptor composition, portable package
manifest discovery, and compatibility lookup-module helpers. Component
libraries use attached descriptors rather than publishing standalone
registries. An installed `npm pack` fixture validates one tarball in
client-only, SSR, and server-component resolution modes.

### Implemented secret policy foundation

Generic secret flow now belongs to the semantic compiler policy graph.
`@exact secrets.source`, `@exact secrets.sink`, and the plugin-local compiler
extension have been removed. The core compiler prevents secret-qualified values
from entering client artifacts or framework-controlled server-to-client
transfer paths. A caller uses `consume=secret` either on an argument for one
call edge or on a variable declaration for broader lexical consumption.
Application code may use its own secrets; dependencies must appear in the
application's simple package allowlist.

`@exact/secrets` provides runtime branding, providers, resolver lifecycle,
direct application-owned `require()`/`optional()` access, and output
validation. The package allowlist is a framework policy guard against
accidental delivery, not a sandbox for arbitrary in-process JavaScript.

## Adoption Standard For Native SSR And Server Components

The adoption target is correctness with explicit production contracts, not
maximum patch granularity.

The governing rule is:

> Every valid server-component tree must render and refresh correctly.
> Fine-grained patches are an optimization; deterministic replacement of the
> nearest compiler-owned server boundary is the correctness fallback.

### Adoption blockers

The following are blockers:

1. Cross-package placement that can silently retain an opposite-platform
   dependency.
2. A structural refresh that can leave stale UI rather than falling back to an
   authoritative boundary replacement.
3. Initial SSR, actions, and refreshes observing different request or
   authorization scopes.
4. Component packages without a standard artifact and manifest contract, which
   forces consuming applications to hand-wire package-specific integration or
   retain source access.
5. Undefined native behavior for raw HTML, executable scripts, unsafe URLs,
   root-document augmentation, and strict CSP.
6. Missing build-time diagnostics for manifest conflicts, unsupported
   placement, prohibited data transfer, and package policy.
7. Undefined production behavior for cancellation, status, headers, redirects,
   cache policy, errors after streaming begins, and resource cleanup.

### Important but not initial blockers

These may follow after the adoption milestone if the correctness fallback is
complete:

- Maximally fine-grained structural diff generation.
- Progressive Suspense boundary reveal.
- Selective hydration and event replay.
- Every advanced micro-frontend deployment topology.
- Cross-realm context identity.
- Every possible host optimization.

### Required hardening

#### Complete package-aware placement

- Automatically consume manifests from component packages.
- Resolve aliases, re-exports, namespace imports, cycles, and package
  boundaries.
- Treat unresolved placement as an actionable build error when it affects
  artifact safety.
- Prove that client artifacts retain no server-only execution or dependencies.
- Prove that server artifacts retain no browser-only execution or dependencies.
- Preserve deterministic client boundary and server slot identities across
  package builds.

#### Authoritative refresh fallback

- Retain text, prop, style, list, state, and element patches when safe.
- Replace the nearest stable server boundary when a diff exceeds supported
  structural operations.
- Preserve unaffected client islands and server slots.
- Preserve focus, dirty form state, and client ownership wherever a stable
  identity allows it.
- Never turn a missed optimization into stale UI.

#### Artifact descriptors and application composition

- Merge application and package manifests automatically.
- Attach client-island metadata to the exported component function in the
  matching client artifact and server-part metadata to that same public
  component identity in the matching server artifact.
- Compose the artifact descriptors required by an application into its
  hydration and server entrypoints.
- Reject duplicate IDs, incompatible versions, and conflicting plugin
  fingerprints.
- Load descriptors with lazy package chunks when required.
- Generate endpoint, action boundary, and state contract configuration without
  handwritten maps.

#### Production request and response behavior

- Carry one request cancellation signal through render tasks, actions,
  refreshes, streams, and provider disposal.
- Define status, header, redirect, and error behavior before and after bytes are
  committed.
- Document cache headers, `Vary`, authentication/session integration, and
  deployment topology.
- Surface source component, boundary, package, and policy paths in diagnostics.

The implemented response state has an explicit commit boundary. Status, header,
and redirect changes are accepted while authoritative rendering settles and
are frozen when the response is returned to an adapter. Later mutations fail;
post-commit stream failures terminate the body transport without pretending the
status can still change. Deployment, caching, authentication, observability,
limits, CSP, and package-release requirements are specified in
[native-ssr-production-guide.md](native-ssr-production-guide.md).

## Context Model

### Providers remain components

eXact does not need a separate provider abstraction. A provider is an ordinary
component that computes or stores a value and publishes it with
`this.setContext()`.

```tsx
function AuthorizationProvider(
  this: Component<{ roles: string[] }>,
  props: { children?: Child }
) {
  this.state.roles ??= [];

  this.task.server(async () => {
    const request = this.getContext(RequestContext);
    this.state.roles = await loadAuthorizedRoles(request);
  });

  this.setContext(AuthorizationContext, {
    hasRole: role => this.state.roles.includes(role)
  });

  return () => props.children;
}
```

The intended behavior is:

- The provider component is isomorphic.
- Its server task reads trusted server request data.
- Safe public roles are written to component state.
- Required state paths are transferred through hydration.
- Client component setup reconstructs the context object and `hasRole()`
  closure.
- Functions are not serialized; they are recreated by executing component
  setup in the selected artifact.
- Both server and client context objects read the same logical reactive state.

Server rendering requires a task-stabilization contract. Component setup may
publish a context object whose methods close over state before an asynchronous
server task settles, but output that depends on a task-written state path is not
authoritative until the task completes and the affected tree rerenders from the
stable state snapshot.

The same rule applies to initial SSR, actions, boundary refreshes, and final
stream output. A progressive shell may contain provisional public UI only when
the renderer has a deterministic replacement boundary. It must never reveal
content based on optimistic or unresolved authorization. Any task that affects
`html`, `head`, response status, headers, redirects, or other pre-commit document
state must settle before those bytes or controls are committed. The compiler and
renderer should use task-write and descendant-read contracts to establish these
barriers rather than relying on timing.

Client-side `hasRole()` is a presentation convenience, never an authorization
boundary. Every action and refresh must re-read trusted server authorization
and enforce it independently.

### Brand context follows the same pattern

Brand context is an application-level example, not a context required by eXact
or by native SSR adoption.

A brand provider may derive public branding from request-only server data:

```tsx
function BrandProvider(
  this: Component<{ brand?: PublicBrand }>,
  props: { children?: Child }
) {
  this.task.server(async () => {
    const request = this.getContext(RequestContext);
    this.state.brand = await resolvePublicBrand(request.url);
  });

  this.setContext(BrandContext, {
    getBrand: () => this.state.brand
  });

  return () => props.children;
}
```

Private tenant configuration may remain in a separate server-kept context,
while `PublicBrand` is intentionally isomorphic.

### Three independent dimensions

Context and state policy must keep three concerns separate:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Execution | `client`, `server`, inferred | Where code may execute |
| Residency | `client`, `server`, `isomorphic`, `secret` | Where a value may reside or travel |
| Lifetime | `application`, `request`, `component` | How long a provided value lives |

A database pool or session-store client is application-scoped and server-kept.
Session data loaded for the current request is request-scoped and normally
server-kept. Public branding may be derived by server code but stored
isomorphically. Component-tree contexts remain component-scoped.

A component provider may read visible application- and request-scoped contexts
and derive a value from them, subject to placement and residency policy. A value
published by that component with `this.setContext()` nevertheless has component
lifetime: it follows the component subtree and cannot promote itself into
application or request scope. Application- and request-scoped values must be
established by the server runtime before root component setup.

eXact does not define a session lifetime or retain a user context across
requests. Correlating requests, persisting session state, invalidating sessions,
and coordinating concurrent or distributed access belong to the application's
authentication/session system. Each request may load a session snapshot or
request-specific session API into a normal request-scoped context and explicitly
commit any updates to its external store or response cookie.

### Server/request scope injection

The server runtime needs a trusted scope that exists before root component setup
and is shared by:

```text
HTTP request
  -> authorization and CSRF
  -> initial SSR
  -> server component tasks
  -> action dispatch
  -> boundary refresh
  -> response streaming
  -> request-scoped disposal
```

`AsyncLocalStorage` remains a Node convenience. Explicit scope propagation is
the runtime-neutral source of truth.

eXact provides the standardized `RequestContext`.
Each server adapter maps its host request type, such as Fetch `Request`, Node
HTTP, Express, or Fastify, into the same portable request information and
response controls before root component setup:

```ts
type RequestInfo = {
  url: URL;
  method: string;
  headers: Headers;
  signal: AbortSignal;
  locale?: string;
  traceId?: string;

  redirect(location: string | URL, status?: number): void;
  setStatus(status: number): void;
  setHeader(name: string, value: string): void;
};
```

Cookies, current-request session data, route params, authorization, database
access, and framework-specific request objects should normally use separate
contexts.
Brand, authorization, current-session, tenant, and application configuration
contexts are examples an application may provide; none is required by the
framework.

The server API accepts developer-defined application- and request-scoped
context values or factories before root component setup. A value registration
uses `{ value }`; an owned factory registration uses `{ create, dispose? }`, so
callable context values are never confused with factories:

```ts
createExactServerRuntime({
  applicationContexts: [
    [ApplicationConfigContext, { value: applicationConfig }],
    [DatabaseContext, {
      create: ({ signal }) => connectDatabase({ signal }),
      dispose: database => database.close()
    }]
  ],
  requestContexts: async ({ request, platformRequest, get }) => [
    [RouteContext, { value: await matchRoute(request!.url) }],
    [AuthorizationContext, {
      create: async () => authorize(
        request!,
        await get(ApplicationConfigContext)
      )
    }],
    [PlatformRequestContext, { value: platformRequest }]
  ]
});
```

Application contexts are prepared once for a server runtime. Request contexts
are prepared for each request, may depend on `RequestContext` and application
contexts, and are disposed with the request scope. All configured pre-render
context factories must settle before root component setup begins. The adapter's
original request object may be exposed through an explicit developer- or
adapter-defined server-kept context; it is not part of the portable
`RequestInfo` contract.

Factories resolve dependencies with asynchronous `get(token)`. The runtime
rejects lifetime violations, duplicate registrations, and dependency cycles;
initializes shared application values once per runtime; isolates concurrent
requests; disposes owned values in reverse dependency order; and supports
trusted application/request overrides for tests. Overrides are server
configuration and are never read from invocation payloads.

Trusted server context must never be populated from
`ExactInvocationRequest.context`. That field is client-provided transfer data
and remains subject to compiler-generated contracts and validation.

### Lifetime rules

Application providers may depend only on application providers. Request
providers may depend on application or request providers. Component providers
may read any visible context subject to placement and residency.

```text
application -> application          allowed
request     -> application/request  allowed
component   -> visible scopes       allowed subject to policy
application -> request              error
```

Server request scope ends with the response and provider disposal. A hydrated
isomorphic state value is a snapshot derived from that request; on the client it
lives with the component root rather than retaining a live server request
scope.

## Placement And Residency Annotations

### Existing execution annotations

`@exact server`, `@exact client`, `this.task.server()`,
`this.task.client()`, and exact import attributes continue to describe
execution placement.

A context token does not itself execute. Provider components, task callbacks,
factories, methods, and functions execute.

### Proposed `keep` policy

The compiler policy vocabulary should include:

```ts
/** @exact keep=server */
/** @exact keep=client */
/** @exact keep=secret */
```

Isomorphic availability is the ordinary inferred case, not a `keep` annotation.
There is no `keep=isomorphic` policy and none is needed: `keep` restricts where
data may reside, while isomorphic availability is inferred from safe client and
server reachability. An unrestricted, transferable state or context value used
by both targets is classified as isomorphic when the compiler selects it for
hydration or another validated transfer boundary.

Structured context options should carry the same metadata and should be
authoritative when available:

```ts
export const RequestContext = createContext<RequestInfo>(
  "exact.request",
  { scope: "request", keep: "server" }
);
```

Annotations remain important for fields, parameters, return contracts, state
paths, external declarations, and APIs that cannot use eXact constructors.

If structured metadata and annotations disagree, compilation fails.

### Meaning of policies

`keep=server`:

- Contributes a server execution effect when read.
- Prevents the value itself from entering client artifacts, hydration,
  isomorphic state, island props, patches, or action responses.
- May influence server-rendered public output.
- Is a residency rule, not a confidentiality rule.

`keep=client`:

- Prevents the value from being required by server execution.
- Does not provide confidentiality after delivery to the browser.

`keep=secret`:

- Implies server residency.
- Propagates through direct and indirect data flow.
- Cannot influence VNodes, serialized output, logs, client artifacts, or
  ordinary state.
- Cannot be cleared by ordinary assignment, conversion, copying, or projection.

### Server capability result policy

A server-kept service may contain protected state without every method result
becoming server-kept or secret:

```ts
interface ServerAuthorization {
  publicRoles(): string[];

  /** @exact keep=server */
  internalPolicy(): InternalPolicy;

  /** @exact keep=secret */
  sessionCredential(): string;
}
```

The receiver and invocation require server execution. Each declared result has
its own residency and secrecy contract.

This permits:

```ts
this.task.server(async () => {
  const authorization = this.getContext(ServerAuthorizationContext);
  this.state.roles = authorization.publicRoles();
});
```

It rejects:

```ts
this.state.authorization = authorization;
this.state.credential = authorization.sessionCredential();
```

## Generic Data-Policy Flow

The prototype's secret tracking should become part of a generic semantic policy
engine. Internally, a value carries at least:

```ts
type DataPolicy = {
  residency: "server" | "client" | "isomorphic";
  secret: boolean;
};
```

Secret is not merely another residency. It adds non-disclosure constraints.

### Propagation

Propagation is the default. Derived output inherits the relevant policy of its
inputs unless a more specific declaration contract applies.

### Secret arguments and callable results

The caller owns the decision to pass a secret. A receiving function uses an
ordinary signature and does not need to declare that a parameter is secret:

```ts
/** @exact server */
declare function requestWeather(
  city: string,
  apiKey: string
): Promise<Weather>;

const apiKey = secrets.require("WEATHER_API_KEY");
const weather = await requestWeather(
  "Seattle",
  /** @exact consume=secret */ apiKey
);
```

`secrets.require()` and `secrets.optional()` return secret-qualified values, so
an additional `keep=secret` annotation is redundant. Custom loaders and
declaration contracts still use `keep=secret` when the compiler cannot infer
the source policy.

`consume=secret` is an explicit caller-side acknowledgement. On an argument
expression it applies only to that call edge: the caller's binding remains
secret-qualified, while the callee receives the raw value through its ordinary
parameter and may use it within that function. It is not placed on the
receiving function's parameter declaration.

The directive may instead be placed on a variable declaration to consume the
secret for that resulting local binding. That broader binding may then be used
throughout its lexical scope without repeating the directive:

```ts
/** @exact consume=secret */
const apiKey = secrets.require("WEATHER_API_KEY");

const weather = await requestWeather("Seattle", apiKey);
const forecast = await requestForecast("Seattle", apiKey);
```

Passing a consumed value to application-owned code is implicitly permitted.
Passing it across a dependency boundary additionally requires the directly
receiving package name in `secrets.allowPackages`; the receiving package cannot
authorize itself through an annotation.

The compiler rejects an unconsumed secret argument. Call-argument consumption
does not authorize another use of the caller's binding, nor does either form
authorize Exact to retain a secret source or consumption site in a client
artifact or framework-controlled server-to-client transfer.

The package permission describes only the package directly receiving the
value. Exact does not claim that this statically proves the behavior of opaque
or arbitrary in-process JavaScript.

### Projection

Projection intentionally changes residency while allowing input to influence
output. Server-derived brand data and public authorization roles are
projections, not sinks.

Projection may be represented on a destination state/context path:

```ts
interface AuthorizationState {
  roles: string[];
}
```

Here `roles` is ordinary transferable state, so its isomorphic classification is
inferred when both targets require it. An explicit projection contract is needed
only when policy must intentionally change across a restricted source boundary;
exact syntax remains open.

Server-to-isomorphic projection can be allowed for non-secret data. Generic
projection must never make a secret transferable.

### Secret transfer to framework output

Caller-side `consume=secret` is the explicit release of a raw secret to trusted
server code. It does not authorize release to framework-owned output or client
data. Such output transfer is distinct from ordinary server projection and is
unsupported initially; any future mechanism would require a separately named,
narrowly granted, manifest-visible trusted boundary.

An ordinary sink, projection, state assignment, or unannotated result must not
make a secret transferable.

### Framework-owned sinks

The compiler and runtime must understand these observable sinks:

- VNode text, props, styles, children, list keys, and control flow.
- Client island captures and props.
- Hydration state and context transfer.
- Action responses and state patches.
- Boundary replacement and list insertion HTML.
- JSON and framework serializers.
- Logs, error metadata, and diagnostics.
- Cross-package secret argument boundaries.
- Explicit projection boundaries.

## Component Package Contract

### One distributable package

One published package should contain the client, server, shared, and manifest
material needed by all consuming modes.

It is one distributable package, not necessarily one physical JavaScript file.
Each export selects a target-specific artifact:

```json
{
  "exact": {
    "manifests": [
      "./dist/components/page.exact.manifest.json"
    ]
  },
  "exports": {
    "./components/page": {
      "types": "./dist/components/page.d.ts",
      "exact-client": "./dist/components/page.exact.client.js",
      "exact-server": "./dist/components/page.exact.server.js",
      "default": "./dist/components/page.exact.client.js"
    }
  }
}
```

The `exact.manifests` package metadata contains package-relative portable
manifest paths. Application artifact compilation discovers these declarations
from the nearest installed dependency tree by default; callers may disable
discovery for isolated tooling operations.

Server-only and browser-only dependencies are removed or replaced with
compiler-owned stubs or boundaries as appropriate. Code available in both
environments is divided into truly shared declarations and dual-target
declarations as described below.

Conditional `package.json` exports select the public target artifact. The
standard does not require client, server, shared, or type artifacts to live in
separate directories. A library may co-locate files, separate them, or bundle
several source artifacts together as long as its export conditions and
manifests preserve the required target relationships. The package `imports`
field may provide internal `#` aliases, but public consumer selection uses
`exports`.

Condition order is part of the contract: `types` precedes runtime targets, and
the eXact target conditions precede `default`. Client-only consumers may use the
client default, but SSR and server-component adapters must resolve with
`exact-server`. An eXact adapter activates exactly one of `exact-client` and
`exact-server` for a build. Application compilation verifies that every selected
artifact and imported manifest declares the expected target and fails instead of
silently retaining a client default in a server graph. The corresponding client
build performs the inverse assertion.

### Shared versus dual-target code

The user-facing term *isomorphic* means that an API or value is available in
both environments. It does not necessarily mean that the client and server use
one byte-identical implementation.

The compiler should distinguish:

| Classification | Meaning |
| --- | --- |
| `shared` | Target-neutral output with a dependency closure made entirely of other shared declarations |
| `client` | Browser-only output |
| `server` | Server-only output |
| `dual` | Emitted for both targets, but transformed or specialized differently for each |

`shared` and `dual` are compiler emission classifications, not requirements to
add declarations to a package's public root barrel. A declaration referenced
across generated module boundaries must be exported from its generated shared
or target-specific dual module so generated client and server modules can
import it directly. This internal module export is required even when the
declaration is absent from the public barrel. It becomes public package API
only when the authored package exports it through a public entrypoint.

For example, a pure formatter may be genuinely shared:

```ts
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}
```

A component with target-specific tasks is dual-target:

```tsx
export function AccountProvider(this: Component<AccountState>) {
  this.task.server(loadAccount);
  this.task.client(connectBrowserEvents);

  return () => <AccountPage />;
}
```

The client artifact removes the server task and retains browser behavior. The
server artifact removes the client task and may emit client boundaries or
server slots. Both artifacts export the component's public identity, but their
implementations are not identical.

A declaration may enter a shared artifact only when:

- It has no server or browser effects.
- Its complete dependency closure is shared.
- Its imports resolve identically in both targets.
- Its JSX and other transforms produce target-neutral output.
- It owns no target-specific tasks, assets, boundaries, context reads, or
  module initialization.
- Extraction preserves module initialization order and does not create an
  invalid cross-partition cycle.

The compiler may therefore emit:

```text
Component.exact.shared.ts
Component.exact.client.ts
Component.exact.server.ts
Component.exact.manifest.json
```

The client and server entry artifacts import the generated exports they require
from shared and matching target-specific dual artifacts. They re-export a
declaration from the public target entry only when the authored package exposes
that declaration publicly. A shared physical module reduces published package
duplication and repeated transpilation, but it does not remove shared code from
either final deployed bundle when both runtimes use it.

### Library repository responsibilities

A conforming library repository should produce the following logical artifacts;
the paths shown are illustrative and do not prescribe a directory layout:

```text
dist/components/Component.exact.shared.js
dist/components/Component.exact.client.js
dist/components/Component.exact.server.js
dist/components/Component.d.ts
dist/components/Component.exact.manifest.json
package.json exports
```

The eXact compiler remains responsible for generating shared, client, and
server asset sources plus portable manifests. The library repository's existing
TypeScript, bundler, or release pipeline remains responsible for:

- Transpiling generated shared, client, and server asset sources to
  distributable JavaScript.
- Emitting declarations and source maps according to the library's own policy.
- Choosing the published directory or bundle layout.
- Writing or generating conditional package exports.
- Including portable manifests and policy requirements.
- Preserving source provenance for package policy.
- Verifying that published files contain no tests, temporary source, or missing
  referenced artifacts.

eXact should document the required inputs, logical outputs, resolver conditions,
manifest references, and invariants without requiring fixed filesystem
locations. It may keep repository fixtures and helper APIs that demonstrate the
standard, but it does not need to publish a package builder, transpiler, or
conformance-enforcement tool. Libraries may implement the standard with their
existing build systems.

### Component-attached artifact descriptors

The current compiler can generate standalone ESM lookup modules, historically
called client-island and server-part registries. The preferred package contract
instead attaches each descriptor to its exported component function in the
matching generated artifact.

The client artifact can attach its local island descriptor:

```ts
const exactClientDescriptor: unique symbol =
  /* @__PURE__ */ Symbol.for("@exact/client-component-descriptor");

function ProjectCardImplementation() {
  // Client implementation.
}

function ProjectCard_ExactClient_1() {
  // Generated island implementation.
}

export const ProjectCard: typeof ProjectCardImplementation =
/* @__PURE__ */ (() => Object.assign(
  ProjectCardImplementation, {
    [exactClientDescriptor]: [
      1,
      [["stable-boundary-id", ProjectCard_ExactClient_1]]
    ]
  }
))();
```

The matching server artifact exports the same public name with its server
descriptor:

```ts
const exactServerDescriptor: unique symbol =
  /* @__PURE__ */ Symbol.for("@exact/server-component-descriptor");

function ProjectCardImplementation() {
  // Server implementation.
}

function ProjectCard_ExactServer_1() {
  // Generated server-part implementation.
}

export const ProjectCard: typeof ProjectCardImplementation =
/* @__PURE__ */ (() => Object.assign(
  ProjectCardImplementation, {
    [exactServerDescriptor]: [
      1,
      [["stable-server-part-id", ProjectCard_ExactServer_1]]
    ]
  }
))();
```

The zero-argument pure initializer prevents argument evaluation from retaining
an otherwise unused component in bundlers that correctly preserve the
`@__PURE__` convention. The generated symbol binding is shared by descriptors
within the artifact, so `Symbol.for()` is not repeated per component.

For an import strongly connected component, rewriting an exported function
declaration to a lexical binding would change ESM instantiation semantics. The
project compiler detects that case, retains the function declaration and its
live binding, and performs descriptor attachment in place. This cycle-safe
fallback is intentionally not marked pure because the attachment is observable;
acyclic component modules use the fully tree-shakeable initializer above.

The symbol binding is local generated implementation detail and does not create
an import from the component package to an eXact protocol module. Global symbol
identity still allows independently built packages, duplicated package
installations, lazy chunks, and the application runtime to agree on the
attachment point without sharing a JavaScript binding or relying on a
minifiable string property.

The public declaration remains the component's ordinary authored function type;
the descriptor property does not need to appear in its public TypeScript
surface. Compiler-generated application integration reads it through an eXact
runtime helper that accepts a component function and uses the same
`Symbol.for(...)` key internally. An optional diagnostic or tooling API may
return a typed descriptor without exposing the symbol property on every
component type.

An ESM barrel re-export preserves the same function object. A library can
therefore continue to expose:

```ts
export { ProjectCard } from "./ProjectCard.js";
export { ProjectList } from "./ProjectList.js";
```

and consumers can continue to write:

```ts
import { ProjectCard, ProjectList } from "project-components";
```

No package-wide descriptor object, metadata barrel, or manual aggregation is
required. The consuming application's generated client or server entrypoint
imports the components it uses and composes their attached descriptors into the
runtime lookup required for hydration, refresh, actions, and patches. A lazy
chunk carries the descriptors attached to the components in that chunk.

Descriptors use a positional, versioned tuple. Stable manifest IDs are string
values paired with implementation functions, not object keys or JavaScript
function names. Property mangling therefore cannot alter `parts`, `islands`, or
an ID because those protocol properties do not exist. Ordinary string
compression may deduplicate or encode an ID but must preserve its runtime value.
The package manifest maps public component exports to their target and stable
entries so the application compiler can discover them through root or subpath
re-exports.

The attachment must be emitted as a recognized pure call. This allows an unused
component and its descriptor to be removed even when a source module contains
multiple component exports. A plain top-level property assignment is acceptable
semantically but is not the portable compiler output because conservative
bundlers may retain it as a module side effect.

Artifact generation must also preserve the authored module contract. It may not
change function hoisting, ESM live bindings, initialization order, default or
aliased re-exports, or observable behavior in cyclic graphs merely to attach a
descriptor. If the generated implementation uses an exported `const` wrapper,
the compiler must prove that the source export did not require declaration
hoisting or emit a cycle-safe equivalent. Installed-package conformance fixtures
must cover these cases.

Metadata attached to a component that remains in a target bundle is observably
part of that function and is not expected to be pruned independently. Conditional
package exports prevent server descriptors from entering client artifacts and
client descriptors from entering server artifacts.

The local protocol symbol initializers and component attachment calls must carry
pure annotations in their emitted JavaScript where required. Creating a global
symbol and attaching a descriptor has no required observable effect when the
associated component is unused. If several components share one generated
module, they share its local symbol binding; separate modules may each perform
the small idempotent `Symbol.for(...)` lookup without adding a package
dependency.

The current standalone lookup helpers may remain useful for application
integration or compatibility while component-attached descriptors are adopted.
They are not part of the required library publication layout.

### JavaScript and style side effects

Generated component JavaScript must be side-effect-free apart from its exported
values. Component packages that contain styles should not use a blanket
`"sideEffects": false`, because CSS imports produce or inject assets even when
the import uses CSS Module naming.

CSS Modules otherwise work normally. A package can declare only its style files
as side-effectful:

```json
{
  "sideEffects": [
    "**/*.css",
    "**/*.less",
    "**/*.scss"
  ]
}
```

JavaScript modules not matched by that list remain skippable. Importing a used
component retains its CSS Module mapping and emitted styles; eliminating an
unused component module also eliminates traversal into its style dependencies.
Libraries with other initialization effects must list those files as well.

The pure attachment annotation provides statement-level removal when several
components share one module. Package side-effect metadata provides module-level
removal through root barrels. Certification must exercise both cases.

### Installed-package certification

The eXact repository should retain representative `npm pack` fixtures that
install a conforming tarball into clean applications with no access to the
producing source tree:

1. Browser/client-only application.
2. SSR application.
3. Server-component application with actions and refreshes.

Certification must verify resolver conditions, tree shaking, package manifest
discovery, descriptor composition, shared versus dual-target partitioning,
hydration, boundary refresh, and target dependency purity.

## Native HTML And Script Safety

### Current protections

- Native SSR escapes ordinary text and attribute values.
- Event handler props are not serialized as HTML attributes.
- Attribute names are validated.
- Hydration JSON escapes script-breaking characters.
- Client island data is checked for JSON safety, unsafe keys, depth, node
  count, and byte limits.
- Progressive replacement scripts encode IDs and HTML as script-safe JSON
  strings.

### Raw HTML

Native eXact should reject React's `dangerouslySetInnerHTML` rather than silently
ignore it or treat it as an ordinary DOM property.

JSX remains eXact's structured template language; a second general-purpose
`html` template helper is unnecessary. Raw HTML instead uses a narrowly scoped
`unsafeHtml(value)` helper for markup obtained from a CMS, database, integration,
or other external source:

```tsx
return () => <div>{unsafeHtml(article.body)}</div>;
```

The helper returns a branded opaque fragment rather than a string or ordinary
VNode. It performs no sanitization: the developer is explicitly taking
responsibility for the supplied markup. A platform `TrustedHTML` value may be
accepted by the same API without changing its rendering model.

An unsafe fragment owns one replaceable DOM range. It may itself be the result of
a reactive expression, in which case eXact replaces the complete range when the
value changes. It does not contain eXact component, event, attribute, or
fine-grained reactive slots. Those structures remain JSX:

```tsx
return () => <div>{unsafeHtml(this.state.articleBody)}</div>;
```

Hydration adopts the range as opaque content; refresh and client updates replace
it as a unit. eXact does not reconcile descendants that it does not own.

Raw HTML is an audited capability:

- The root application must explicitly enable it in application policy. It does
  not grant itself package permission, but every call site remains in the audit.
- Dependency packages are denied by default and must declare the capability in
  their manifest.
- The application must grant it explicitly to each dependency package. Grants
  are package-scoped and non-transitive.
- The audit records package provenance, source location, render target, and
  whether the value can reach SSR output, hydration, client insertion, or a
  server refresh patch. It records no runtime HTML values.

Illustrative package requirements:

```json
{
  "requiredCapabilities": {
    "rawHtml": [
      {
        "location": "dist/article.js#ArticleBody",
        "targets": ["server", "client"]
      }
    ]
  }
}
```

Illustrative application policy:

```ts
defineExactConfig({
  unsafeHtml: {
    enabled: true,
    grants: [
      { package: "@acme/article-components" }
    ]
  }
});
```

The exact schema remains subject to implementation review, but source packages
must emit enough portable metadata for an application to enforce and aggregate
the decision without retaining dependency source. A grant authorizes only the
eXact `unsafeHtml` capability; it is not a JavaScript sandbox and does not imply
secret access.

Because unrestricted raw markup can carry executable attributes, embedded
documents, unsafe URLs, and other active content, an `unsafeHtml` grant is a
high-risk capability. Policy reporting must not present it as less powerful than
script execution. eXact does not parse the fragment to discover or separately
audit nested active content. Initial document parsing and client `innerHTML`
insertion execute nested scripts differently; this is part of the platform
behavior for which the caller accepts responsibility. The raw-HTML audit must
make that broad trust consequence explicit.

SSR, client mount, update, hydration, and refresh must preserve the fragment's
opaque markup and ownership model. Active-content execution follows documented
browser and React-compatible insertion behavior rather than an eXact lifecycle
guarantee.

React compatibility mode may retain React behavior as a documented
compatibility exception.

### Scripts

Native eXact should support the intrinsic JSX `<script>` element rather than
invent a separate `Script` component. React 19 is the compatibility reference
for observable behavior:

- Inline script children and external `src` scripts use the standard element.
- Standard `type`, `async`, `noModule`, `nonce`, `integrity`, `crossOrigin`,
  `referrerPolicy`, and fetch-priority props pass through with React-compatible
  naming and serialization.
- Generic scripts created during client mounting follow React's inert creation
  behavior rather than unexpectedly executing merely because a component
  mounted.
- Server-rendered scripts follow document-parser behavior.

Automatic resource hoisting, preinitialization, deduplication, and navigation
re-execution semantics are not required for the initial native SSR milestone.
Scripts remain where the application authors them. eXact should not introduce a
competing lifecycle contract while those features are deferred.

This supports analytics, consent management, structured-data loaders, and
integrations that use configured application or user values. As in React, inline
script children are source code, not ordinary reactive text. Authors remain
responsible for safe JavaScript/JSON serialization and script-closing sequences;
an ergonomic structured serialization helper may be considered separately
without replacing the `<script>` element.

Intrinsic script use is not a separate security capability. A component that
already ships client JavaScript can execute code, load resources, or create DOM
nodes without using JSX `<script>`, so package grants or mandatory security
audits for the element would provide little additional protection.

The compiler may still record script resource metadata when it is operationally
required for CSP generation, preload planning, or optional resource-inventory
reports. A package that claims to emit no client execution cannot make that claim
while producing an executable server-rendered script; this is an artifact
placement/effect rule rather than script permission.

Existing residency and secret-flow rules continue to apply to values serialized
into inline scripts or data scripts. Removing a special script audit must not
create a path for server-only or secret data to enter client-visible source.

### Document and head ownership

An SSR application may render the complete document explicitly from its root:

```tsx
return () => (
  <html lang="en">
    <head>
      <title>{this.state.title}</title>
      <meta name="description" content={this.state.description} />
      <script nonce={request.cspNonce}>
        {trackingInitialization}
      </script>
    </head>
    <body>
      <Application />
    </body>
  </html>
);
```

`html`, `head`, and `body` receive document semantics only in this root-document
position. The document normalizer should:

- Accept one root `html` element with at most one direct `head` and one direct
  `body`.
- Emit the document doctype.
- Synthesize a missing empty `head` or `body` when doing so is unambiguous.
- Reject nested or duplicate document elements with an actionable diagnostic.
- Preserve authored attributes, child order, and component ownership.

The root application owns its document structure, metadata ordering, CSP
attributes, and application resources. eXact may augment the normalized
children of `head` and `body` with framework-owned nodes required by the selected
SSR, streaming, hydration, and client features. It does not mutate the authored
VNode or require the root component to render these implementation details.

Framework augmentation uses deterministic reserved insertion regions:

- Head augmentation contains only framework resources that must be available
  before body processing.
- Body augmentation immediately before the closing body contains inert hydration
  state, client bootstrap references, manifests, or completion payloads that do
  not need earlier placement.
- Progressive replacement payloads may be emitted at their required streaming
  points inside the body.
- Nothing is injected when the selected render mode does not require it.

Internal nodes use reserved eXact markers and stable identities. User content
cannot claim those markers accidentally. Hydration recognizes and adopts or
ignores framework-owned nodes separately from the authored child sequence, so
the client root renders the same application document without manually
reproducing injected scripts and data.

The root application still controls CSP policy. Render options or request
context provide any nonce required by eXact's injected executable nodes.
Hydration and manifest payloads use inert, script-safe serialization, and all
residency, secret-flow, size, and JSON-safety rules apply before insertion. A
strict no-inline mode places inert payloads in the document for an approved
external runtime instead.

`RequestContext` and any developer-configured contexts required by the root
must be available before root document rendering. Brand is only one possible
application-defined context and is not required. Any asynchronous work that
affects the authored or augmented head must settle before the renderer commits
head bytes; body streaming may proceed afterward.

Nested components do not implicitly move `<title>`, `<meta>`, `<link>`,
`<style>`, or `<script>` nodes into the head. Invalid placement should receive a
development diagnostic. Applications can pass document metadata upward through
ordinary state, props, or context and render it at the root.

Client-only applications may continue mounting into an existing host-owned HTML
document instead of rendering `<html>`, `<head>`, and `<body>`. Automatic nested
head contributions, route metadata collection, resource hoisting, and
navigation-time head reconciliation may be considered later as one explicit
feature rather than being implicit in the base renderer.

### URLs and embedded content

The initial native behavior should follow React 19 rather than introduce a broad
URL-policy system:

- Apply one centralized sanitizer in both SSR and DOM property handling.
- Apply it to `href`, `src`, `action`, `formAction`, `xlinkHref`, and the
  equivalent known URL-bearing props.
- Detect `javascript:` despite leading C0 controls or spaces and embedded ASCII
  tabs or newlines.
- Replace the supplied executable URL with a deterministic blocked value rather
  than execute it.
- Reapply the check on every reactive URL update.
- Otherwise preserve browser URL semantics. Do not initially add origin
  allowlists, custom-protocol configuration, or broad `data:` and `blob:`
  classification.

This renderer-level check covers ordinary VNodes returned by imported
precompiled component packages because their props still pass through the
consuming application's SSR or DOM renderer. It does not require package source,
compiler manifests, or per-update plugin dispatch.

`iframe`, `object`, `embed`, and similar elements retain normal platform
behavior. `srcDoc` follows React's current model: eXact escapes the outer
attribute correctly, but does not sanitize the nested document string. Audit
tooling may report its use as a high-risk sink without making it a separately
configurable policy system in the initial implementation.

A configurable URL-policy plugin is valid future work, but it is outside the
current SSR/server-component adoption scope. Such a plugin would require
server-and-client runtime enforcement for dynamic values and imported packages,
not compilation alone. Its design must demonstrate acceptable hot-path cost,
target-specific configuration, and behavior for uninstrumented platform access
before adoption.

Direct DOM, network, `eval`, raw HTML, and similar platform APIs remain outside
the URL sanitizer. The baseline is practical output hardening, not a sandbox for
hostile JavaScript dependencies.

### CSP and streaming

Progressive streaming should support:

- Nonce-based inline replacement scripts.
- A no-inline mode using inert payloads consumed by an external
  nonce/hash-approved runtime.

The latter is required for strict environments that prohibit inline JavaScript.

### Patch trust

Parsing replacement HTML through a `<template>` does not by itself define a
complete trust boundary. Patch handling must consider event attributes, unsafe
URLs, embedded content, client ownership, and plugin output.

Renderer-produced HTML may use an internal trusted brand. Arbitrary string HTML
requires validation or an explicit trusted extension contract.

## Core Policy Versus `@exact/secrets`

The generic mechanism is broader than secrets and belongs in the main
compiler/runtime architecture.

### Core compiler/runtime responsibilities

- `keep` policy vocabulary and propagation.
- Cross-package secret-flow authorization and projection contracts.
- Context residency and lifetime metadata.
- State and client-island transfer enforcement.
- Artifact placement and serialization checks.
- Package provenance and permission resolution.
- Policy manifests and audit graph generation.
- Root-application trust rules.

These capabilities must work even when no secret provider plugin is installed.

### `@exact/secrets` responsibilities

- `Secret<T>` runtime branding.
- `secrets.require()` and `secrets.optional()`.
- Environment, file, vault, and cloud secret providers.
- Secret resolver initialization and disposal.
- Runtime access enforcement.
- Secret-specific redaction and output guards.
- Secret provider configuration.
- Integration with generic policy manifests and audit events.

The browser-safe core must not depend on server secret providers. If useful, a
small platform-neutral policy runtime package can carry shared types and guards.

The current plugin-local secret compiler analysis should be migrated to the
main semantic compiler policy engine.

## Secret Package Permissions

### Application-owner exception

The root application package is implicitly permitted to consume configured
secrets. Requiring the application to grant permission to itself adds ceremony
without creating a meaningful boundary.

The exemption applies only to permission. Application code remains subject to
all disclosure, artifact, serialization, logging, and secret-flow rules.

Application secret usage must still be audited.

### Dependency default

Dependency packages are denied secret values unless explicitly granted. The
receiving function does not declare or grant this authority:

```ts
/** @exact server */
async function createStripeClient(
  apiKey: string
) {}
```

The consuming application permits packages by name:

```ts
defineExactConfig({
  secrets: {
    allowPackages: ["@acme/payments"]
  }
});

const apiKey = secrets.require("STRIPE_SECRET_KEY");
const stripe = createStripeClient(
  /** @exact consume=secret */ apiKey
);
```

The compiler derives the directly receiving package, symbol, and parameter
position. Developers annotate either the caller's argument expression for one
call or a caller-owned variable declaration for broader lexical consumption;
they do not annotate the receiving parameter. Package permission does not
authorize client transfer.

### Package permission boundary

Permission is checked where application or analyzed library code directly
passes a secret-qualified variable to an imported package. It is deliberately
not presented as transitive dependency security or opaque-code verification.

The compiler should reject:

- Passing a secret argument without call-specific or declaration-scoped
  `consume=secret`.
- Passing a secret to a dependency absent from `secrets.allowPackages`.
- Secret sources or consumers retained in a client artifact.

### Application ownership

Application code is compilation with `packageType: "application"` and without
an imported package boundary at the call. Imported dependencies, including
workspace and linked packages, are permitted by their package name when they
directly receive a secret.

### Runtime access

The runtime resolver belongs to application code and directly exposes
`require()` and `optional()`. Dependencies receive only values the application
chooses to pass. Exact does not claim to sandbox dependencies that can execute
arbitrary server-side JavaScript.

## Policy And Secret Audit Output

### Package requirements

Published component packages should include a requirements manifest describing
policy-sensitive capabilities without granting them:

```json
{
  "requiredCapabilities": {
    "rawHtml": [
      {
        "location": "dist/article.js#ArticleBody",
        "targets": ["server", "client"]
      }
    ]
  }
}
```

Normal compiler manifests record direct secret receipt sites. Receiving
function parameters remain ordinary declarations.

### Compiler manifest

Compiler output should record, without values:

- Raw-HTML capability use, source location, package, targets, and
  resolved application grant.
- Secret and protected data sources.
- Context and state policies.
- Directly consuming package name.
- Consuming symbol and parameter position.
- Projection IDs.
- Source locations.
- Execution target.
- Required and resolved package permission.
- Serialization and VNode enforcement.
- Trusted extensions involved in output.

Illustrative shape:

```json
{
  "policyUsage": {
    "version": 1,
    "sources": [
      {
        "policy": "secret",
        "name": "STRIPE_SECRET_KEY",
        "location": "src/server.ts:18"
      }
    ],
    "consumers": [
      {
        "name": "STRIPE_SECRET_KEY",
        "package": "@acme/payments",
        "symbol": "createStripeClient",
        "parameter": 0,
        "authorization": "explicit-package-allow"
      }
    ]
  }
}
```

Application-owned use records `authorization: "implicit-application-owner"`.

No manifest or diagnostic may contain a secret value.

### Aggregated application report

The final build should produce a human-readable and machine-readable report:

```text
Secret               Consumer                                      Status
STRIPE_SECRET_KEY     application#createPaymentRuntime              implicit
DATABASE_URL          @acme/database#createDatabaseClient           granted
JWT_PRIVATE_KEY       @unknown/plugin#createSigner                  denied
```

It should also report non-secret audited capabilities separately:

```text
Capability    Consumer                         Target         Status
raw-html      application#ArticlePreview       server/client  enabled
raw-html      @acme/article-components@2.1.0   server/client  granted
```

Denied use fails the build. An unused package permission may produce a warning.

## Implementation Program

The sequence prioritizes native adoption blockers. Work may overlap, but a later
phase must not be treated as a substitute for an earlier correctness contract.
Secret-provider hardening depends on the generic policy IR but is not a
prerequisite for the native SSR adoption milestone unless that deployment uses
the optional secret capability.

### Phase 1: Renderer correctness, document mode, and native safety

- Guarantee authoritative replacement of the nearest stable server boundary
  whenever a fine-grained refresh cannot be expressed or applied safely.
- Reject native `dangerouslySetInnerHTML`.
- Implement the opaque, whole-range `unsafeHtml` helper, root application
  opt-in, dependency requirements/grants, and capability audit metadata.
- Support intrinsic `<script>` with the agreed React-compatible baseline rather
  than a custom component API.
- Apply the React-compatible `javascript:` guard consistently in SSR, mount,
  hydration comparison, patches, and reactive URL updates.
- Implement root `html`/`head`/`body` normalization, doctype emission,
  deterministic framework augmentation, and hydration ownership of injected
  nodes.
- Add nonce and no-inline progressive-streaming modes and enforce patch-output
  trust.

Exit criteria:

- Every valid native tree has an authoritative render or boundary-replacement
  path rather than stale UI.
- Full-document SSR and hydration preserve authored document structure while
  safely injecting only required eXact data and runtime nodes.
- Raw HTML, scripts, URLs, CSP, and patch behavior are deterministic across all
  supported rendering paths.

Implementation status: complete (2026-07-18).

The native renderer now has one URL guard across mount, updates, hydration, and
SSR; explicit audited raw HTML; React-aligned intrinsic scripts; authored
document normalization and hydration ownership; inert progressive payloads;
and authoritative boundary replacement. Phase 1 behavior is covered by the
full package suite and the document/hydration-specific tests.

### Phase 2: Unified request scope and server-task stabilization

- Expand the portable `RequestContext` contract and normalize it in each server
  adapter.
- Seed developer-defined application and request contexts before root component
  setup, including asynchronous factories and deterministic disposal.
- Share one trusted scope across SSR, actions, refreshes, and streams.
- Add application/request provider lifetime, dependency, cycle, cancellation,
  and disposal handling without introducing a separate provider abstraction.
- Stabilize task-written state before authoritative descendant output and
  pre-commit document or response controls.
- Add test overrides, concurrent-request isolation, and provisional-stream
  replacement assertions.

Exit criteria:

- `RequestContext` and every configured developer context observe the same
  trusted scope across all applicable server entrypoints.
- Output depending on unresolved provider state cannot become authoritative.

Implementation status: complete (2026-07-18).

The implemented runtime provides normalized portable request data, adapter
platform forwarding, application/request registrations, asynchronous
dependency resolution, cycle and lifetime errors, trusted test overrides,
concurrent isolation, reverse-dependency disposal, late-factory cleanup, and
runtime/request cancellation. Security hooks, actions, refreshes, request-aware
SSR, and response streams share the request-owned scope. Request-aware SSR
settles providers and component tasks before committing response controls;
lower-level provisional streams retain deterministic replacement behavior.

Verification includes 992 package tests, 2 server-component sample tests, 16
shipping sample tests, static production/test type checks, all supported HTTP
adapter tests, platform-boundary checks, publish-content checks, and
whitespace/error-marker validation.

### Phase 3: Generic policy IR and state-backed isomorphic context

- Add residency and secrecy qualifications to semantic values and declarations.
- Parse and validate `keep` metadata.
- Model propagation, cross-package receipt authorization, and projection
  separately.
- Carry policy through aliases, fields, calls, returns, state paths, contexts,
  task writes, and imported manifests.
- Track server task writes required by client component behavior.
- Transfer only required safe state paths and reconstruct context methods through
  ordinary client component setup.
- Infer isomorphic classification for unrestricted state and context paths
  selected for validated transfer; do not define or accept a
  `keep=isomorphic` policy.
- Preserve server-only context and state paths outside hydration.
- Add authorization and branding reference applications.

Exit criteria:

- Server/client/isomorphic transfer is manifest-visible and prohibited transfers
  fail before artifact emission.
- `hasRole()` and public brand context work consistently in authoritative SSR
  and hydrated client execution.
- Server actions independently enforce trusted authorization.

Implementation status: complete (2026-07-18).

Compiler manifest version 1 carries a generic policy graph with residency
and independent secrecy qualifications, declaration/state/context/return
subjects, and distinct propagation, projection, transfer, and receipt flow
kinds. The compiler rejects `keep=isomorphic`, infers safe isomorphic values,
propagates policy through aliases, typed returns, local calls, component state,
contexts, tasks, and imported context manifests, and removes protected exports
and state from client artifacts before emission. Policy graph sources are
referentially validated when manifests are loaded.

The server-component reference application separates protected
request/application context access into a server projection component and
passes only plain public identity state to an isomorphic component provider.
That provider reconstructs `hasRole()`, brand name, and brand accent methods in
ordinary setup during SSR and hydration. Its server action independently
rechecks the trusted authorization context.

Verification includes 1,007 package tests, static production and test type
checking, generated artifact type checking, four server-component
SSR/hydration/action integration tests, and 16 shipping sample tests.

### Phase 4: Package-aware placement and component-library standard

Status: complete.

The implemented standard emits logical shared/client/server source artifacts,
classifies artifact exports, attaches positional descriptors, preserves
defaults and aliases, uses a cycle-safe hoisting fallback, validates target
resolution, discovers installed package manifests, and verifies a clean packed
package across client-only, SSR, and server-component conditions. Shared
extraction is initially conservative and operates on a complete source module
only when its full analyzed graph is target-neutral; finer declaration-level
partitioning is an optimization rather than a correctness requirement.

Phase verification includes 1,016 package tests, production and test
type-checking, four native server-component integration tests, 16 shipping
sample tests, generated-artifact type-checking, and the clean installed-tarball
fixture.

Final certification additionally covers descriptor availability from lazy
chunks and Vite removal of an unused component's CSS Module through a
side-effect-free root barrel while retaining the used component's styles.

- Complete cross-package placement, alias, re-export, cycle, target-dependency,
  and manifest-conflict analysis.
- Specify shared, client, server, and manifest source artifacts, transpiled
  targets, conditional exports, attached descriptors, manifest references, and
  types without prescribing a directory layout.
- Distinguish truly shared declarations from dual-target declarations and emit a
  shared artifact only for a closed target-neutral dependency graph.
- Export shared and target-specific dual declarations from generated internal
  artifacts when other generated modules import them, without adding
  non-public declarations to the package root barrel.
- Attach positional descriptors with global protocol symbols and pure calls
  while preserving function hoisting, ESM live bindings, initialization order,
  aliases, defaults, and cyclic-module behavior.
- Assert that every resolved artifact matches the consuming client or server
  target instead of silently accepting the wrong default export condition.
- Compose descriptors in application entrypoints rather than publish library
  registries.
- Keep compiler helpers focused on asset-source, manifest, graph, descriptor,
  and application-entry generation; library repositories retain transpilation
  and publication responsibility.
- Add clean `npm pack` client-only, SSR, and server-component fixtures with
  automatic manifest discovery.

Exit criteria:

- One conforming tarball works in every supported consuming mode without source
  access or handwritten registry aggregation.
- Opposite-platform dependencies and wrong-condition resolution fail the build.
- Shared extraction, root re-exports, tree shaking, descriptor attachment, and
  cyclic exports preserve the authored public module contract.

### Phase 5: Production adoption certification

Status: complete.

The production contract now covers pre-commit response controls, 3xx redirect
validation, immutable post-commit state, cancellation and disposal through
streams, adapter failure behavior, cache and `Vary` policy, authentication and
sessions, deployment topology, observability, CSP, resource ceilings, and
package publication. Certification uses the native server-component and
shipping applications plus the installed-package fixture.

Phase verification includes 1,018 package tests, production and test
type-checking, four native server-component integration tests, 16 shipping
sample tests, and client/server production bundle builds.

- Define cancellation, status, headers, redirects, cache policy, errors before
  and after commit, streaming failure, and resource cleanup.
- Certify initial SSR, actions, refreshes, boundary fallback, root-document
  streaming, hydration, and CSP behavior across supported adapters.
- Validate production limits for payload size, graph depth, operation count,
  concurrency, and cancellation.
- Document deployment topology, authentication/session integration,
  observability, cache headers, and package publication.
- Run clean installed-package applications in client-only, SSR, and
  server-component modes.

Exit criteria:

- Remaining native limitations are optimizations or explicit architectural
  non-goals rather than correctness, packaging, or production adoption blockers.

### Phase 6: Secret permissions and audit

Status: complete.

- Move secret flow from the prototype extension into the generic policy engine.
- Support `consume=secret` on a caller argument for one call edge and on a
  caller-owned variable declaration for broader lexical consumption.
- Add a package-name allowlist and the root application-owner exception.
- Prevent secret-qualified values from entering client artifacts or
  framework-controlled server-to-client output.
- Emit direct package receipt information and a small aggregate report without
  secret values.

Exit criteria:

- Application secret use is ergonomic and audited.
- Direct dependency receipt is explicit and denied unless the package is
  allowed.
- The feature is documented as a transfer guard and audit aid, not dependency
  sandboxing.

Compiler manifest version 1 records the directly receiving package, symbol,
parameter, source location, optional secret identifier, and whether receipt was
application-owned, package-allowed, required by a library, or denied.
`createExactPolicyAuditReport()` exposes the same small model and warns only
about unused package permissions.

## Required Test Matrix

### Context and lifetime

- Adapter normalization into the same `RequestContext` across Fetch, Node, and
  supported framework request types.
- Synchronous and asynchronous developer-defined application and request
  contexts available before root component setup.
- Application provider reuse and disposal.
- Request isolation under concurrent async rendering.
- Request-context factory cancellation, failure, and deterministic disposal.
- Session data is loaded or revalidated per request rather than retained in an
  eXact session scope.
- Initial SSR, action, refresh, and stream scope identity.
- Invalid application-to-request dependencies.
- No implicit dependency on brand, authorization, current-session, or other
  application-defined contexts.
- Multiple server runtime instances in one process.
- Serverless warm-isolate reuse.
- Component context reconstruction after hydration.
- Async provider task stabilization before authoritative descendant and head
  output.
- Provisional streaming shells replaced after task settlement without exposing
  authorization-dependent content.

### Data policy

- Server, client, isomorphic, and secret fields.
- Aliases, destructuring, closures, callbacks, generics, and async results.
- Server task writes into safe isomorphic state.
- Prohibited server capability transfer.
- Secret-derived direct and implicit VNode influence.
- Client island captures, props, hydration state, actions, and patches.
- Secret arguments and independently analyzed callable results.
- Marked and unmarked secret arguments in application-owned and dependency
  calls.
- Projection contracts and prohibition of secret client/output transfer.
- Logs, errors, and diagnostic redaction.

### Package permissions

- Root application implicit consumption.
- Allowed and denied direct dependency consumers.
- Call-argument and variable-declaration `consume=secret` placement.
- Unused package permissions.
- Package manifest aggregation.
- Root application raw-HTML opt-in and dependency raw-HTML grants.
- Raw-HTML requirements discovered from installed package manifests without
  dependency source.

### Rendering safety

- Raw HTML in mount, update, SSR, streaming, hydration, and refresh.
- React-compatible inline, external, module, classic, JSON, and data scripts.
- CSP nonce and no-inline modes.
- React-compatible blocking of plain and control-obfuscated `javascript:` URLs
  in every guarded property and reactive update path.
- `srcdoc` outer serialization and documented unsanitized nested-document
  behavior.
- Event attributes, SVG URL props, and patch HTML.
- Trusted output plugin contracts.
- React compatibility exceptions kept separate from native behavior.
- Root `html`/`head`/`body`, doctype, duplicate and nested document-element
  diagnostics, and unambiguous synthesis of missing document children.
- Deterministic head/body augmentation, reserved-marker collision rejection,
  hydration ownership, and no injection when the render mode needs none.
- Head task barriers and body streaming after head commitment.

### Package artifacts

- Client-only, SSR, and server-component installed tarballs.
- Conditional export selection.
- Wrong-target default-condition selection fails application compilation.
- No opposite-platform dependencies.
- Shared code extracted only when its complete dependency graph is
  target-neutral.
- Dual-target components specialized correctly for client and server.
- Shared exports reachable through both target entry artifacts.
- Internal shared and target-specific dual exports remain importable by
  generated client/server modules without becoming root-barrel exports unless
  authored as public API.
- Positional client and server descriptors attached to matching component
  functions with global protocol symbols and stable manifest ID values.
- Client boundary and server slot identity.
- Automatic manifest discovery and application descriptor composition.
- Lazy descriptor availability with lazy artifact chunks.
- Root-barrel tree shaking with one component per file and with multiple
  components in one file.
- Descriptor attachment preserves declaration hoisting, ESM live bindings,
  initialization order, default and aliased re-exports, and cyclic graphs.
- CSS Module retention for used components and style elimination for unused
  components.
- Authoritative replacement when fine-grained diffing is unavailable.

## Settled Direction

- Native SSR/server components are the primary focus.
- Boundary replacement is the correctness fallback; patch granularity is an
  optimization.
- Providers remain ordinary components.
- Component providers may read application/request contexts, but contexts they
  publish remain component-scoped and cannot acquire a longer lifetime.
- eXact provides a portable `RequestContext`, normalized by each server adapter
  before root component setup and shared by all applicable server entrypoints.
- Applications may add arbitrary policy-declared application- and
  request-scoped contexts before root setup; brand, authorization,
  current-session, and tenant contexts are examples, not framework requirements.
- eXact has no cross-request session scope; applications expose current session
  data through request-scoped contexts and own persistence in their session
  system.
- Authoritative output waits for relevant server-task state stabilization;
  progressive provisional output requires a deterministic replacement boundary.
- Component state is the normal server-to-client transfer boundary for safe
  provider data.
- Execution placement, residency, and lifetime are independent dimensions.
- `@exact server` and `@exact client` remain execution annotations.
- `keep` becomes generic compiler policy rather than secret-plugin-only logic.
- Isomorphic transfer is inferred for ordinary safe values selected by both
  targets; `keep=isomorphic` is not a supported policy.
- Secret consumption and server-to-isomorphic projection are different flow
  operations.
- `consume=secret` belongs to the caller: argument placement authorizes one
  call edge, while declaration placement authorizes the resulting binding
  throughout its lexical scope. It never belongs on the receiving parameter.
- Generic projection cannot make secrets transferable.
- The root application may consume secrets without self-grants, but remains
  audited and subject to all disclosure checks.
- Direct dependency receipt requires the package name in
  `secrets.allowPackages`.
- Generic policy belongs in the core compiler/runtime architecture.
- `@exact/secrets` remains the optional provider, resolver, branding, and
  runtime integration package.
- One component package contains shared, client, server, and manifest artifacts
  as required by its declaration graph.
- `shared` and `dual` remain compiler emission classifications. Their generated
  declarations are exported for internal client/server artifact imports, but
  are not added to the public root barrel unless authored as public API.
- Client-island and server-part metadata is attached to the exported component
  function in the matching artifact with a global protocol symbol, emitted as a
  pure call, and encoded as a versioned tuple containing stable manifest ID
  values.
- Application entrypoints compose artifact descriptors; component libraries do
  not need to publish standalone registry modules.
- Client and server builds assert resolved artifact targets; an SSR build cannot
  silently consume the client default condition.
- eXact defines and demonstrates the component-library standard; the library
  repository owns transpilation, package assembly, and publication.
- Native raw HTML uses an explicit audited helper; intrinsic script behavior
  follows React 19 rather than introducing a separate component API.
- JSX remains the structured template language; `unsafeHtml` represents only an
  opaque, whole-range raw fragment.
- Raw HTML requires explicit application policy opt-in, appears in compiler
  audits, and is denied to dependency packages without explicit non-transitive
  grants. Intrinsic `<script>` is not a separate package capability.
- Native URL handling initially follows React 19's centralized
  `javascript:`-blocking baseline; a configurable URL-policy plugin is deferred.
- Root-document mode special-cases root `html`, `head`, and `body`, preserves the
  authored shell, and augments reserved child regions with framework-owned SSR
  and hydration nodes only as required.

## Resolved Design Questions

- Context lifetime metadata uses the `createContext()` options overload.
  A separate `createServerContext()` API is not required.
- `keep=isomorphic` is not part of the policy vocabulary. Isomorphic
  classification is inferred for ordinary transferable values from safe use in
  both targets and validated transfer requirements.
- `shared` and `dual` are compiler emission classifications. Cross-artifact
  declarations are exported from generated internal modules for client/server
  imports, but are not implicitly re-exported from the package root barrel.
- Component-tree providers may derive values from application- and
  request-scoped contexts, but `this.setContext()` publishes only a
  component-scoped value. Components cannot create or promote values into
  application or request lifetime.
- Policy manifest version 1 represents residency/secrecy subjects and
  propagation, receipt, projection, and transfer flows. Conflicting imported
  global context policies fail compilation.
- Initial shared extraction is a complete-source-module decision. Per-
  declaration and strongly connected partition extraction may be added later
  without changing the package contract.
- Installed component packages advertise portable manifests through
  `package.json` `exact.manifests`; artifact compilation discovers them by
  default.
- Secret package permissions are package names only. They do not include
  selector patterns, versions, integrity pins, or transitive dependency claims.
- Callable manifests do not retain parameter-forwarding summaries for secret
  authorization.
- Aggregate reports list direct observed receipts and unused allowed packages.
- Caller-side consumption releases a raw secret to trusted server code, but
  secret-qualified values cannot be projected into isomorphic state or
  framework-owned output; service results must be independently safe.
- The aggregate policy report schema is `ExactPolicyAuditReport` version 1,
  with direct secret usage, warnings for unused package permissions, and errors
  for unresolved requirements or denied use.

## Open Design Questions

The resolved placement, artifact-export, and context-lifetime decisions above
are intentionally excluded from this list. In particular, this plan will not
reconsider `keep=isomorphic`, implicit root-barrel exports for `shared`/`dual`
declarations, or component-created application/request scopes.

- Final annotation spelling for projection contracts.
- How return-value policy is represented in TypeScript declarations.
- How application entrypoints compose descriptors for remote and dynamically
  loaded packages.
- Final `unsafeHtml` overloads for plain strings and platform `TrustedHTML`.
- Whether a later explicit document-metadata feature should support nested head
  contributions, resource deduplication, preinitialization, and navigation
  reconciliation.
- Whether inline script values receive an optional structured serialization
  helper.
- External runtime protocol for no-inline progressive streaming.
- Future URL-policy plugin runtime contract and acceptable reactive-update cost.
