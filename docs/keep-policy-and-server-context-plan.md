# Keep Policies And Server Context Plan

## Status

This document is a design and implementation plan. It records the intended direction for:

- Preventing server-only state from entering client artifacts or payloads.
- Supporting client-only state.
- Preventing secret values and secret-derived information from being disclosed.
- Providing reusable application-scoped and request-scoped server capabilities.
- Keeping authenticated service calls ergonomic without treating every result as secret.

The newer consolidated direction is recorded in
[native-ssr-adoption-and-data-policy.md](native-ssr-adoption-and-data-policy.md).
That document confirms that generic residency, consumption, projection, package
permission, and audit behavior belongs in the main semantic compiler/runtime
architecture. `@exact/secrets` remains an optional provider, resolver, runtime
brand, and integration package rather than owning an independent policy engine.
Where the documents differ, the consolidated document takes precedence.

The proposal builds on the existing compiler placement analysis, state/context effect tracking, generated client islands, server slots, hydration state contracts, and secure server endpoint.

`@exact/secrets` is intended to be an opt-in framework plugin. Its discovery,
configuration, compiler hooks, runtime hooks, and host integration must use the
general protocol defined in
[framework-plugin-architecture-plan.md](framework-plugin-architecture-plan.md).
This document defines the secrets and keep-policy behavior; the framework-plugin
plan defines how that behavior is installed and coordinated.

## Design Goals

- Make data residency explicit when inference is insufficient.
- Identify a secret once and preserve that classification through subsequent computation.
- Make accidental disclosure a compile error, not a silent serialization omission.
- Keep ordinary authenticated service calls concise.
- Allow server-owned clients, database pools, caches, and configuration to be reused.
- Avoid putting infrastructure capabilities in component state.
- Keep server, client, and secret policies visible in TypeScript source and portable compiler manifests.
- Produce diagnostics that explain the complete flow from a policy source to the invalid use.
- Retain the current behavior for unannotated state unless a policy-constrained value flows into it.

## Non-Goals

- Hiding values already delivered to a browser. `keep=client` is a placement policy, not a confidentiality guarantee.
- Proving the internal behavior of arbitrary opaque third-party libraries without a trusted declaration or wrapper.
- Treating every value returned by a server operation as secret.
- Using JavaScript process globals as the ownership model for application-scoped resources.
- Silently repairing invalid cross-runtime flows by dropping data or changing application behavior.

## Unified `keep` Annotation

Use one closed annotation with three values:

```ts
interface ProfileState {
  /** @exact keep=server */
  account: Account;

  /** @exact keep=client */
  selectedFile?: File;

  /** @exact keep=secret */
  accessToken: string;

  displayName: string;
}
```

The compiler must reject missing values, unknown values, duplicate contradictory policies, and unsupported annotation locations.

```text
@exact keep=server
@exact keep=client
@exact keep=secret
```

Internally, these values are not three equivalent taints:

- `keep=server` is primarily a server residency and execution-placement constraint.
- `keep=client` is primarily a client residency and execution-placement constraint.
- `keep=secret` implies server residency and adds a strict non-disclosure qualification.

Unannotated values remain placement-inferred and transferable when required by generated client behavior, subject to JSON-safety and secret-flow rules.
`keep=isomorphic` is not part of the supported policy vocabulary. An ordinary
unrestricted value is classified as isomorphic when safe client and server use
requires a validated transfer.

## Policy Semantics

### `keep=server`

A server-kept value:

- May only be initialized, read, or mutated by server-placed code.
- Pulls a dependent indivisible computation to the server.
- May influence server-rendered VNodes.
- Must never be included as raw data in client artifacts, client-island captures, `__exactState`, hydration bootstrap state, browser action state, or client patches.
- May be used to produce ordinary values whose own policy is inferred independently.
- Causes a compile error when the same indivisible computation also requires a browser-only API, import, ref, event, or client-kept value.

A server-rendered expression may use a server-kept value:

```tsx
return () => <h1>{this.state.account.displayName}</h1>;
```

If interactive descendants require client execution, the compiler should keep the server-dependent output in a server-owned boundary or slot rather than serialize `account` into the client island.

### `keep=client`

A client-kept value:

- May only be initialized, read, or mutated by client-placed code.
- Pulls a dependent indivisible computation to the client.
- May be non-JSON-safe and browser-native, such as `File`, `HTMLElement`, `MediaStream`, or `ImageBitmap`.
- Must not be required during SSR, server rendering, server task execution, or server action state reconstruction.
- Is not expected in hydration bootstrap state.
- Causes affected VNodes to become client-owned islands or client components.
- Causes a compile error when used by server-only code or combined with server-kept data in an indivisible computation.

Client-only does not mean confidential. Browser users can inspect client memory.

### `keep=secret`

A secret value:

- Implicitly has `keep=server`.
- May only be used by server-placed code.
- Must never reach a VNode child, VNode prop, HTML attribute, text node, style, key, boundary identity, serialized payload, patch, action response, log field, error message, or other externally observable output.
- Must not influence control flow that changes externally observable output.
- Propagates through ordinary expressions, assignments, destructuring, object construction, interpolation, calls, closures, reactive derivatives, and control dependencies.
- Cannot be declassified by ordinary conversion, projection, copying, serialization, or assignment into an unannotated field.

All of the following remain secret-derived:

```ts
const authorization = `Bearer ${apiKey}`;
const isPrivileged = apiKey.startsWith("admin");
const metadata = { authorization };
```

Both direct and implicit VNode disclosure must fail:

```tsx
return () => <p>{apiKey}</p>;
```

```tsx
return () => isPrivileged ? <AdminBadge /> : null;
```

The second example is prohibited because the secret changes observable output even though the raw value is not rendered.

## Path-Sensitive And Field-Sensitive Analysis

Policies apply to values and state paths, not automatically to entire containing objects.

```ts
interface User {
  name: string;

  /** @exact keep=secret */
  token: string;
}
```

`user.name` remains ordinary, while `user.token` is secret. An object may contain a secret field without every unrelated field or method result becoming secret.

The compiler must conservatively reject operations that lose field precision when a protected descendant may be included:

- Spreading the whole object.
- Serializing the whole object.
- Passing it to an unanalyzed or uncontracted opaque function.
- Reading it through a dynamic key.
- Capturing the whole object for a client island.
- Broad state reads represented as `*` or low-confidence paths.

Reading an exact safe sibling remains allowed.

Policy matching must account for ancestors and descendants:

- A policy on `session` covers `session.token`.
- A policy on `session.token` makes a broad read of `session` unsafe.
- Dynamic reads of `session[key]` are unsafe unless the compiler can prove the selected field policy.

## Reactive Derivatives

Reactive values inherit placement and secrecy from their dependencies.

```ts
const greeting = this.reactive(
  () => `Welcome, ${this.state.account.displayName}`
);
```

Because `account` is server-kept, `greeting` is server-executed. It may be rendered by the server but must not be captured as client data.

```ts
const authorization = this.reactive(
  () => `Bearer ${this.state.accessToken}`
);
```

Because `accessToken` is secret, `authorization` is secret and cannot influence a VNode or serialized output.

Combining server-kept and client-kept inputs in one indivisible derivative is a compile error. The diagnostic should recommend splitting the computation at an explicit server/client boundary.

## Server Context Scopes

Infrastructure capabilities should normally be provided through server contexts instead of component state.

Examples include:

- HTTP and API clients.
- Database and message-broker pools.
- Server caches.
- Application configuration.
- Cryptographic services.
- Current-request session data, authorization, tracing, and request metadata.

The context API should support policy and lifetime metadata:

```ts
export const WeatherClientContext = createContext<WeatherClient>(
  "weather.client",
  {
    global: true,
    keep: "server",
    scope: "application"
  }
);
```

The implemented `createContext()` options overload carries lifetime metadata
that the server runtime validates. Phase 3 extends the same metadata path with
compiler residency policy.

### Application scope

Application-scoped providers:

- Are instantiated once per eXact server runtime or warm isolate.
- Are reusable across requests handled by that runtime.
- Are isolated between separate server runtime instances and tests.
- May be lazy.
- May own synchronous or asynchronous disposal.
- Must not capture request-scoped values.

```ts
const server = createExactServerRuntime({
  applicationContexts: [
    [WeatherClientContext, {
      create: ({ signal }) =>
        new WeatherClient(secrets.require("WEATHER_API_KEY"), { signal }),
      dispose: client => client.close()
    }]
  ]
});
```

This supports one reusable HTTP client without reconstructing it for each component or request.

### Request scope

Request-scoped providers:

- Are instantiated at most once per incoming request.
- May depend on application-scoped providers.
- May contain current-request session data, authorization, tracing, locale, and
  request-specific clients.
- Must never leak into a later request.
- Are disposed at the end of the request.

```ts
export const CurrentSessionContext = createContext<Session>(
  "request.session",
  {
    global: true,
    keep: "server",
    scope: "request"
  }
);
```

There is no separate session lifetime. A session-store client may be
application-scoped, but a session record or session API is loaded into request
scope for the current request. The application owns cross-request identity,
persistence, invalidation, concurrency, and distribution, and explicitly
commits changes to its store or response cookie.

The existing `@exact/request` ambient storage is the starting point for request lifetime integration. Async-safe storage remains an adapter/runtime responsibility.

### Component scope

The existing component-tree context behavior remains the component scope. It
may continue to support ordinary inferred-isomorphic contexts. A component
provider may read visible application- and request-scoped values, subject to
placement and residency rules, and derive the value it publishes with
`this.setContext()`. That published value still follows the component subtree;
the component cannot create or promote an application- or request-scoped
context. A component provider must not override a server-only application or
request capability from client code.

### Lifetime dependency rules

Longer-lived providers cannot depend on shorter-lived providers:

```text
application -> application          allowed
request     -> application/request  allowed
component   -> any visible scope    allowed subject to placement
application -> request              compile/configuration error
```

## Server Capabilities Containing Secrets

A server capability may contain secret fields without the capability itself becoming a secret value and without every method result becoming secret.

```ts
interface WeatherClient {
  getWeather(city: string): Promise<Weather>;
}

class WeatherClientImpl implements WeatherClient {
  /** @exact keep=secret */
  readonly #apiKey: string;

  constructor(
    /** @exact keep=secret */
    apiKey: string
  ) {
    this.#apiKey = apiKey;
  }

  async getWeather(city: string): Promise<Weather> {
    const response = await fetchWeather({
      city,
      authorization: `Bearer ${this.#apiKey}`
    });
    return response.json();
  }
}
```

The intended result is:

- `#apiKey` is secret.
- The client instance is a server-resident capability containing protected state.
- Calling a method on the server-resident capability executes on the server.
- `getWeather()` returns ordinary `Weather` because its declared and verified result does not carry secret data.
- A method returning `#apiKey`, a secret-derived string, or an object containing either produces a secret-qualified result.

The context should expose a restricted interface rather than an implementation type. JavaScript private fields provide an additional runtime encapsulation boundary, but privacy alone does not replace compiler flow analysis.

## Secret Sources

`keep=secret` remains necessary, but application code should normally identify a secret only once.

The server runtime should provide a typed secrets API:

```ts
const apiKey = secrets.require("WEATHER_API_KEY");
// inferred as Secret<string>
```

Suggested operations:

```ts
secrets.require(name): Secret<string>
secrets.optional(name): Secret<string> | undefined
```

The public source syntax can remain an `@exact keep=secret` annotation, while the compiler and expression model carry an internal secret qualification across module and manifest boundaries. Custom secret loaders, class fields, parameters, and external declarations can use the annotation when the compiler cannot infer the source.

`keep=secret` therefore acts mainly as:

- A source annotation.
- A declaration contract for libraries and cross-module APIs.
- A manifest-visible qualification.

Developers should not have to repeat it on every local derivative.

## Trusted Secret Consumption

Authenticated operations need a controlled way to consume credentials without
automatically classifying their useful response data as secret.

The caller owns the decision to pass a secret. The receiving function uses an
ordinary signature:

```ts
declare function fetchWeather(
  city: string,
  authorization: string
): Promise<Weather>;

const weather = await fetchWeather(
  "Seattle",
  /** @exact consume=secret */
  apiKey
);
```

At the call site, the compiler knows the secret selector and resolved callee
package. The caller must mark the secret argument with `consume=secret`.
Application-owned callees are implicitly permitted. A dependency callee
additionally requires an explicit package-and-selector grant. Receiving
functions do not annotate secret parameters and cannot authorize their own
package. The marker records intentional use but neither grants package trust nor
declassifies the value.

Available source and compiled package flow summaries describe whether ordinary
parameters influence returns or observable output. The application compiler
applies the actual argument policy to those summaries. Opaque code without a
reliable declaration or flow summary fails closed. A package grant authorizes
receipt, not disclosure or declassification.

## Opaque And Third-Party Libraries

The compiler cannot prove the behavior of an implementation it cannot inspect. Supported options are:

1. Analyze first-party or available source.
2. Consume declaration metadata and parametric callable flow summaries.
3. Wrap the library in a small audited server-only adapter.

Example wrapper:

```ts
/** @exact server */
export function createWeatherClient(
  apiKey: string
): WeatherClient {
  return new ThirdPartyWeatherClient({ apiKey });
}
```

The wrapper and its returned client remain server-only. If the wrapper belongs
to a dependency package, passing the secret also requires a package-and-selector
grant. The manifest records the actual consumer symbol, parameter, package
provenance, and source-to-consumer path.

## VNode And Observable-Output Enforcement

VNode enforcement must occur before artifact emission. A secret-flow error must identify the exact sink:

- JSX child.
- JSX prop or spread.
- Intrinsic DOM property.
- Component boundary prop.
- Generated client-island capture.
- Server slot or boundary identity.
- Conditional branch that changes the VNode graph.
- Keyed list key or membership.
- Raw HTML.

Example diagnostic:

```text
error: secret state "accessToken" influences VNode output
Profile.accessToken -> isPrivileged -> conditional branch -> <AdminBadge />
```

Server-kept but non-secret values may influence server VNodes. They must remain server-owned and must not be copied into a client boundary payload.

## Serialization And Protocol Enforcement

Compile-time enforcement is primary, but every serialization boundary needs defense in depth.

The following emitters must reject secret-qualified values and server/client policy violations:

- Generated `__exactState`.
- Generated `__exactCapture`.
- Client component boundary props.
- Hydration bootstrap configuration.
- Action and refresh request state.
- Action and refresh responses.
- State, text, prop, style, list, and replacement patches.
- Error and logging serialization owned by eXact.

The runtime should use branded metadata where values originate from eXact secret APIs. This catches manually assembled hydration or endpoint payloads that bypass generated compiler paths. Runtime branding is a defense, not the full guarantee: primitives can be copied or transformed, so compile-time flow analysis remains necessary.

Serialization must fail loudly with a policy path and payload location. It must not silently omit a field.

## Compiler And Type Model

### Directive parsing

Extend `@exact/compiler` annotation validation:

- Add `keep` to the closed directive set.
- Accept only `server`, `client`, or `secret`.
- Define valid locations: state/interface properties, class properties, parameters, return types, variables, and supported type declarations.
- Diagnose contradictory policies and invalid inheritance/override behavior.
- Emit parametric callable flow summaries for cross-package analysis.

### Expression type qualifications

Extend `@exact/expressions` type metadata so policy information survives:

- Binding and property resolution.
- Generic substitution where possible.
- Function parameters and returns.
- Imported declarations and re-exports.
- Union and intersection analysis.
- Awaited promises.
- Object and array construction.

Conceptually, the compiler carries:

```ts
type ExactResidency = "inferred" | "server" | "client";

type ExactValuePolicy = {
  residency: ExactResidency;
  secret: boolean;
};
```

`secret: true` requires `residency: "server"`.

This should be compiler metadata rather than a user-visible TypeScript wrapper everywhere. A public `Secret<T>` type may still be exported for runtime APIs and declaration authors.

### Flow graph

Add policy edges to the existing semantic/callable/state/context analysis:

- Reads and writes.
- Call arguments and returns.
- Property reads.
- Reactive dependencies.
- Closure captures.
- Assignments and aliases.
- Conditional and loop control dependencies.
- JSX/VNode observable sinks.
- Serialization sinks.
- Cross-package secret argument boundaries.

The analysis must be field-sensitive where exact paths are known and conservative where they are not.

### Placement integration

Policy becomes an input to existing placement inference:

- A server-kept or secret read contributes a server effect.
- A client-kept read contributes a browser/client effect.
- Mixed server/client requirements in an indivisible callable are fatal.
- A server-resident receiver places a method call on the server.
- Receiver residency does not determine the return value policy.
- The return policy comes from analyzed implementation flow or the declared return contract.

### Manifest metadata

Extend compiler manifest metadata with:

- State path policies.
- Context token policy and scope.
- Callable parameter and return policies.
- Callable parameter-flow summaries and resolved package provenance.
- Policy-flow diagnostics.
- Client snapshot paths and server-owned render dependencies for audit tooling.

Manifest parsing must remain strict and versioned. Because this changes artifact-analysis semantics, introduce a new compiler manifest version rather than accepting ambiguous v2 records.

## Context Runtime Architecture

Introduce a server context registry owned by an eXact server runtime:

```ts
type ServerContextProvider<T> = {
  token: ContextToken<T>;
  scope: "application" | "request";
  create(scope: ProviderScope): T | Promise<T>;
  dispose?(value: T): void | Promise<void>;
};
```

Responsibilities:

- Lazily create and cache application-scoped values.
- Create and cache request-scoped values inside the active request.
- Resolve dependencies while enforcing lifetime ordering.
- Dispose request values at request completion.
- Dispose application values when the server runtime closes.
- Detect provider cycles.
- Keep separate server runtime instances isolated.
- Supply values to SSR component context lookup without serializing them.

Adapters must establish the request scope before rendering or dispatching actions. The same request scope should cover:

- Initial SSR.
- Server task execution.
- Server action dispatch.
- Boundary refresh rendering.
- Logging and tracing.

## Proposed Developer Experience

### Reusable authenticated API client

```ts
export const WeatherClientContext = createContext<WeatherClient>(
  "weather.client",
  { keep: "server", scope: "application", global: true }
);

const runtime = createExactServer({
  contexts: [
    provide(WeatherClientContext, ({ secrets }) =>
      new WeatherClient(secrets.require("WEATHER_API_KEY"))
    )
  ]
});
```

```ts
export function WeatherPanel(
  this: Component<{ weather?: Weather }>,
  props: { city: string }
) {
  const api = this.getContext(WeatherClientContext);

  this.task.server(async () => {
    this.state.weather = await api.getWeather(props.city);
  });

  return () => <WeatherView weather={this.state.weather} />;
}
```

Expected behavior:

- The client instance is constructed once per server runtime/warm isolate.
- The API key is identified as secret at its source.
- The client and its methods remain server-resident.
- The API key cannot enter state, VNodes, logs, or payloads.
- `Weather` is ordinary data and can be server-rendered or transferred to a client island when required.
- No per-call declassification or `toClient()` operation is required.

### Client-native state

```ts
interface UploadState {
  /** @exact keep=client */
  file?: File;

  progress: number;
}
```

The upload interaction is client-owned. Sending the file to a server is an explicit action/upload boundary, not an inferred hydration state transfer.

### Secret disclosure failure

```ts
const apiKey = secrets.require("WEATHER_API_KEY");
return () => <code>{apiKey}</code>;
```

Compilation fails with a flow path from the secret source to the VNode child.

## Implementation Phases

### Phase 1: Policy vocabulary and manifest model

- Finalize `keep` syntax and valid annotation locations.
- Add compiler types for residency and secrecy.
- Parse and validate `keep=server|client|secret`.
- Record exact state/property/callable policies.
- Design and version the new compiler manifest schema.
- Add annotation, parsing, round-trip, and malformed-manifest tests.

Exit criteria:

- Policy declarations survive cross-file imports and manifest loading.
- Invalid and contradictory policies fail deterministically.

### Phase 2: Placement enforcement for server and client

- Integrate server/client policy reads with callable and task placement.
- Reject client-only reads in server callables and server-only reads in client callables.
- Propagate residency through reactive derivatives.
- Split VNodes at existing island/server-slot boundaries where possible.
- Reject indivisible mixed-placement expressions.
- Exclude server-kept paths from generated client state and captures.
- Exclude client-kept paths from SSR/action state expectations.

Exit criteria:

- Server/client state cannot cross artifacts accidentally.
- Existing unannotated examples preserve current behavior.

### Phase 3: Secret information-flow enforcement

- Implement field-sensitive secret propagation for direct data flow.
- Add alias, assignment, call, return, closure, and reactive propagation.
- Add VNode and serialization sinks.
- Add control-dependency tracking for conditional VNode output.
- Reject broad/dynamic access when protected descendants cannot be excluded.
- Emit complete flow-path diagnostics.

Exit criteria:

- Direct, indirect, spread, capture, reactive, and conditional disclosures fail.
- Safe sibling fields of objects containing secrets remain usable.

### Phase 4: Caller-side package trust

- Parse and enforce `consume=secret` on caller argument expressions.
- Apply secret argument policies to analyzed callables and imported flow
  summaries.
- Enforce package-and-selector grants when secrets cross dependency boundaries.
- Record receiving symbols, parameters, package provenance, and call paths in
  manifests and audit output.
- Add server-only wrappers for initial platform integrations.

Exit criteria:

- Authenticated service calls can consume credentials and return ordinary DTOs.
- Returning or otherwise disclosing the credential remains a compile error.

### Phase 5: Server context registry and scopes

- Extend context token metadata with `keep` and `scope`.
- Implement application and request provider registries.
- Add lazy initialization, dependency resolution, cycle detection, and disposal.
- Integrate `@exact/request` storage.
- Wire SSR and server endpoint dispatch to the same request scope.
- Add testing utilities for scoped provider overrides and disposal assertions.

Exit criteria:

- Application capabilities are reused.
- Request values are isolated.
- Lifetime dependency violations fail early.
- Server contexts never enter hydration payloads.

### Phase 6: Runtime defense in depth

- Add branded values returned by the secrets API.
- Guard every framework-owned serialization boundary.
- Add policy-aware logging/error redaction.
- Test manually assembled payloads that bypass compiler-generated code.
- Add production-safe error messages that identify paths without printing secret values.

Exit criteria:

- Framework serializers reject branded secrets.
- Diagnostics never include secret contents.

### Phase 7: Tooling, documentation, and migration

- Add manifest audit reporting for policies, secret recipients, package grants,
  and any separately designed declassification boundaries.
- Surface diagnostics through CLI, Vite, Webpack, and Bun integrations.
- Document common API client, database, session, and upload patterns.
- Add migration guidance for service objects currently stored in component state.
- Update the server-components sample with an application-scoped authenticated client.

Exit criteria:

- The common patterns require minimal annotation.
- Security-sensitive exceptions are searchable and auditable.

## Test Matrix

At minimum, cover:

- Exact server, client, and secret property reads.
- Nested paths and safe sibling reads.
- Parent object spreads and serialization.
- Dynamic property access.
- Alias, destructuring, closure, and helper-function propagation.
- Async/`Promise` return propagation.
- Generic client method return contracts.
- Reactive derivative placement and secrecy.
- Secret-dependent VNode branches, list membership, keys, props, and text.
- Client-island state and capture generation.
- Server child slots inside client islands.
- Hydration bootstrap and action state filtering.
- Server action and patch responses.
- Secret values in errors and log metadata.
- Marked and unmarked secret arguments for application-owned, granted
  dependency, and ungranted dependency calls.
- Application provider reuse and disposal.
- Request provider isolation and disposal.
- Invalid application-to-request lifetime dependencies.
- Third-party opaque clients with and without trusted declarations.
- Separate server runtime instances in one process.
- Serverless warm-isolate reuse semantics.

## Security Invariants

The completed design must maintain these invariants:

1. A secret value or secret-derived value cannot reach any framework-owned external output without an explicit reviewed declassification design.
2. A server-kept value cannot be emitted as client data.
3. A client-kept value cannot be required by server execution.
4. A server capability may contain secret fields without making unrelated method results secret.
5. A server capability call executes on the server, but its result policy is determined independently.
6. Longer-lived context providers cannot capture shorter-lived context values.
7. Unknown or broad data flow fails closed when it may include a protected value.
8. Runtime guards supplement but do not replace compiler enforcement.
9. Errors and diagnostics identify policy paths without including protected contents.
10. Dependency package grants are explicit, non-transitive, manifest-visible,
    and auditable; caller-side consumption is explicit and receiving functions
    cannot self-authorize.

## Resolved Design Questions

- Context lifetime metadata uses `createContext()` options; there is no separate
  `createServerContext()` API.
- `keep=isomorphic` is not part of the policy vocabulary. Ordinary safe
  transferable values infer isomorphic classification.
- Component providers may derive their values from visible application/request
  contexts, but contexts published by components always retain component
  lifetime. Only the server runtime establishes application/request scope.

## Open Design Questions

The following policy details remain open:

- The exact user-facing representation of `Secret<T>` in declaration files.
- Whether explicit declassification is supported initially. If added, it must be louder and more restricted than ordinary server-to-client transfer.
- How much implicit-flow analysis is required outside VNode and serialization control flow.
- How generic return policies are expressed when a method can return either ordinary or secret-qualified data.
- Whether server-kept VNode dependencies always create refreshable server boundaries or may remain static SSR-only output.
- How policy metadata composes when multiple imported manifests describe the same global context token.

## Recommended Initial Slice

The first shippable slice should avoid trusted opaque boundaries and focus on enforceable fundamentals:

1. Add `keep=server|client|secret` parsing and manifest metadata.
2. Enforce server/client placement on exact state paths and context tokens.
3. Prevent server-kept and secret paths from generated client snapshots and captures.
4. Reject direct secret flow into VNodes and serializers.
5. Add application/request server context lifetimes.
6. Provide `secrets.require()` and `secrets.optional()` as built-in secret sources.
7. Demonstrate a first-party authenticated client whose credential crosses no
   untrusted package boundary.

After this slice establishes the invariants, expand field-sensitive and control-flow coverage and then introduce audited contracts for third-party libraries.
