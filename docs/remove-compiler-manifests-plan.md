# Remove Compiler Manifest Files

## Status

Decision-complete implementation plan for removing generated
`*.exact.manifest.json` files and the cross-package manifest protocol.

This is a clean break. eXact is unreleased, so the work will not retain
deprecated APIs, compatibility readers, legacy registry generators, or package
metadata for previously built components.

## Decision

Remove the manifest file and do not replace it with another JSON file, a
package-level metadata file, or an ESM module containing the same monolithic
data.

Use these ownership rules instead:

- Compiler analysis is ephemeral project-session state.
- Facts needed at runtime are attached to the executable component functions
  they describe.
- Package targeting is expressed by conditional exports and target-specific
  executable artifacts.
- A consuming compiler treats a compiled dependency as opaque instead of
  trusting dependency-authored analysis claims.
- Server security contracts are composed from application-imported server
  components and explicit application handlers.
- Type-level qualifications, including `Secret<T>`, cross package boundaries
  through declarations rather than compiler manifests.
- Diagnostics and audit reports are optional outputs and are never build
  inputs.
- Every eXact application is both a potential host and a potential producer of
  externally consumable eXact components.
- An application explicitly exposes selected component roots; its standalone
  shell, development providers, fixtures, and unrelated features are not part
  of those exposure graphs.
- Local installation, remote execution, and remote bundle loading consume the
  same component contract. Location and version are deployment bindings rather
  than different authoring models.

The common eXact component contract is the uniform edge shared by every puzzle
piece. Client mounting, render integration, executor dispatch, host
capabilities, lifecycle, failure isolation, and protocol versioning have the
same shape whether the piece is a local component, an installed package, or an
independently deployed application.

## Why no cross-package manifest is needed

A package dependency may currently advertise placement, effects, policies,
capabilities, plugin configuration, and generated symbols in a compiler
manifest. That arrangement is neither a proof nor a security boundary: a
dependency can publish incorrect metadata, and trusted server-side dependency
code can already use process capabilities outside eXact.

The replacement model is based on enforceable boundaries:

- A library is validated when its own source is compiled.
- Its public client, render, and executor entrypoints resolve to target-safe
  artifacts.
- A client-only component's render export is an executable boundary stub, not
  a declaration asking the consumer compiler to synthesize a boundary.
- An executor-only component's client export is either absent or an explicit
  client-side placeholder required by the supported composition model.
- Isomorphic components contain their generated target-local pieces in their
  respective artifacts.
- Public secret qualification survives in `.d.ts` signatures.
- Runtime plugin requirements are ordinary imports of versioned plugin runtime
  APIs.

The consumer compiler therefore does not need to reconstruct or trust the
dependency's internal call graph, placement analysis, policy flows, or plugin
configuration.

## Target architecture

### Project compilation

`compileProjectArtifacts()` owns one compiler session and analyzes all project
source inputs in memory. It may retain module analysis objects for:

- sibling component placement;
- cross-file callable effects;
- state and context effects;
- policy propagation;
- dependency invalidation;
- generated symbol and boundary planning.

These objects are implementation details of the session. They are not written
to disk and are not accepted from installed packages.

`ExactCompilerManifest` should be renamed to `ExactModuleAnalysis` while it
remains useful internally. Public transform results should expose only the
generated code, diagnostics, source maps, and any explicitly supported
inspection result.

### Application exposure model

An eXact application is independently runnable and may also expose selected
component roots for other eXact applications to consume. Exposure is a
first-class application build mode, not a separate component-library project
and not an implicit scan of exported source files.

The application declares its public surface in `exact.config.ts`:

```ts
export default defineConfig({
	app: {
		entry: './src/app.tsx'
	},
	exposes: {
		'./BillingWorkspace': exposeComponent({
			component: './src/billing/BillingWorkspace.tsx',
			consumption: ['component', 'route'],
			rendering: ['local', 'remote', 'client'],
			execution: ['local', 'remote'],
			hostCapabilities: {
				navigation: '@exactjs/navigation@1',
				theme: '@company/design-system@2',
				identity: '@company/identity-claims@1'
			}
		})
	}
});
```

The producer declares:

- which component roots are externally consumable;
- whether each exposure mounts as an inline component, route subtree, or
  application boundary;
- supported local, remote, and client-only rendering modes;
- supported local and remote execution modes;
- public props, slots, events, and navigation behavior;
- required versioned host capabilities;
- loading, unavailable, and failure-boundary expectations.

The compiler derives implementation IDs, action contracts, boundaries, and
target artifacts. Authors do not maintain action or boundary registries.

The consumer owns:

- local versus remote role binding;
- trusted bundle or module location;
- executor and render endpoints;
- authentication transport;
- timeout, fallback, and resource policy;
- deployment version, rollout ring, preview access, and experiment assignment.

Producer configuration describes supported consumption; it does not choose
deployment policy for every host.

### Separate application and exposure graphs

The standalone application entry and each exposure are separate build roots:

```text
src/
├── billing/
│   ├── BillingWorkspace.tsx
│   ├── contexts.ts
│   └── services.ts
├── runtime/
│   └── createBillingRuntime.ts
├── standalone/
│   ├── App.tsx
│   ├── routes.ts
│   └── providers.ts
├── testing/
│   ├── StubIdentityProvider.tsx
│   └── FakeBillingClient.ts
└── app.tsx
```

The standalone shell may import exposed roots. Exposure roots must not import
back into standalone or testing code.

The build fails when an exposure graph reaches:

- development authentication or tenant selectors;
- fixtures, fake service clients, or scenario data;
- standalone routes, layout, or navigation;
- debugging and test tooling;
- stub context providers;
- unrelated application features or exposures.

This is an enforced graph boundary, not a tree-shaking expectation.

### Provider and context ownership

Classify providers used by an exposable application into three groups:

1. Microframework-private providers belong to the executor deployment:
   service clients, credentials, secrets, caches, authorization, rate limits,
   and domain request context.
2. Host capabilities are narrow, versioned integration ports supplied by the
   containing application: navigation, locale, theme, identity claims,
   notifications, and trace correlation.
3. Standalone/test providers make the application runnable in isolation and
   must never enter externally consumable artifacts.

Co-located execution may implement a host capability with a shared context
token. Remote execution carries the same logical capability through the wire
protocol using scoped claims or messages; it does not attempt to share a
JavaScript context object across processes.

The production runtime factory is reusable by standalone and externally
executed modes. Only the outer standalone shell and its stub integrations are
different.

### Exposure build products

One application build may produce:

```text
dist/
├── app/                                  # standalone application
├── exposes/
│   └── BillingWorkspace/
│       ├── loader.js                     # remote registration entry
│       ├── client.[hash].js
│       ├── render.[hash].js
│       └── BillingWorkspace.d.ts
└── executor/                             # application execution deployment
```

The loader exports validated runtime component contracts for only the selected
exposure. It contains neither compiler analysis nor the standalone shell.
Executor implementations remain in the executor deployment and are not
reachable from the client or page-render graphs.

For installed/local consumption, the same exposure may be addressed through
generated conditional package exports. For remote consumption, the selected
deployment serves the loader and target assets. Both paths expose the same
component identity and runtime protocol.

### Standalone and external-consumer validation

Teams validate an exposable application in two modes:

- its authored standalone shell, which exercises the team's complete product;
- an eXact external-consumer harness, which mounts the release exposure through
  the same loader, render transport, executor routing, and host-capability
  bridges used by a real shell.

The framework should support a workflow equivalent to:

```text
exact dev
exact dev --expose ./BillingWorkspace
```

The exposure harness supplies configured stub host capabilities, not
application-private providers. Release validation uses production exposure
artifacts and verifies remote SSR, client loading, actions, streaming,
refreshes, failure handling, and version mismatch behavior.

### Component artifacts

Replace the client/server pair with target-specific deployment roles:

```text
Component.exact.client.js
Component.exact.render.js
Component.exact.executor.js
Component.exact.shared.js  # only when useful
```

Stop emitting:

```text
Component.exact.manifest.json
Component.exact.json
```

Generated paths, conditional package exports, and artifact plans are derived
from the input path and output options. None requires persisted analysis.

The roles are:

- `client`: browser presentation, interaction, request projection, and
  hydration behavior;
- `render`: code safe for the server rendering the containing page, including
  local rendering or a remote-render proxy/boundary stub, but not necessarily
  the component's privileged server implementation;
- `executor`: server actions, authoritative refresh rendering, integrations,
  credentials/context access, and component-owned server runtime setup;
- `shared`: closed target-neutral code used by more than one role.

For a co-located application, the page server may import both render and
executor artifacts. For a remotely executed component, the page application
imports only client and render artifacts while a separate eXact execution host
imports the executor artifact.

### Component-attached contracts

Replace the separate client and server descriptor tuples with versioned,
target-local component contracts attached under a global symbol:

```ts
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

export type ExactComponentContract = {
	version: 1;
	id: string;
	placement: 'client' | 'server' | 'isomorphic';
	role: 'client' | 'render' | 'executor';
	implementations: Array<{
		id: string;
		name: string;
		role: 'root' | 'client-island' | 'server-part';
		implementation: Component;
	}>;
	actions?: ExactActionContract[];
	boundaries?: ExactBoundaryContract[];
};
```

Only fields meaningful to the emitted role are attached. In particular, client
and render contracts do not reference executor implementations. The contract
is created by the compiler, travels with the executable export, participates
in tree shaking, and is present only when that deployment imports the
component.

The exact shape may use compact tuples in emitted code, but the public reader
must return named, validated values. IDs remain stable protocol identities;
JavaScript function names remain debugging details.

### Client composition

`composeExactComponentContracts(components, 'client')` produces the
runtime-name-to-implementation island registry directly from imported
components.

Keep the behavior already proven by `composeExactComponentDescriptors()`, but:

- preserve stable implementation IDs in the composed result;
- reject duplicate IDs as well as conflicting runtime names;
- remove `createClientIslandRegistryEntries()`;
- remove `createClientIslandRegistryModule()`;
- remove `createExactArtifactRegistryModules()`;
- remove all JSON-backed island registration paths.

Lazy client bundles register their imported component contracts through a
small client registration API. Rename `registerManifest()` to
`registerComponents()` or `registerBundle()`; its argument is executable
component registration, not a manifest.

### Executor composition

The executor artifact contract carries:

- component and generated server-part IDs;
- server action IDs, executable handlers, placement, state contracts, and
  context contracts;
- client-island and server-slot boundary IDs, ownership, and executable refresh
  renderers;
- non-client root fallback boundary IDs.

`composeExactExecutorContract(components, options)` replaces
`createExactServerManifest()`. It receives server components explicitly
imported by the execution host and combines their attached contracts with:

- package-owned action and boundary implementations attached to those
  components;
- application action implementations and explicit boundary renderer
  overrides;
- endpoint routes;
- authorization, CSRF, and resource-limit configuration.

Composition fails on duplicate or conflicting IDs. The executor runtime retains
an immutable allowlist derived from this composition, but the type and APIs use
`contract`, `allowlist`, or `registry` terminology rather than `manifest`.

Client-provided IDs never select modules or functions. They can only address
entries already present in the composed allowlist.

Explicit executor composition is also the package activation boundary. Merely
installing a package in the page application does not register its handlers or
grant it credentials. Importing an executor component and passing it to
`composeExactExecutorContract()` on the selected execution host registers only
the executable contracts reachable from that component root.

`createExactHydrationConfig()` replaces
`createExactHydrationManifestConfig()` and serializes only browser-required
data:

- endpoint routes;
- action state contracts;
- action-to-boundary mappings;
- initial state;
- any runtime protocol versions actually required by the browser.

### Render-host composition

The server rendering the containing page may or may not execute the component's
privileged server code.

`composeExactRenderContract(components, options)` combines render-role
artifacts. A render contract may provide:

- a local initial-render implementation;
- a client-boundary stub with safe serialized props;
- a remote initial-render transport;
- ownership metadata for the component's outer boundary;
- logical operation IDs that hydration will route to an executor.

It does not contain action implementations, credentials, internal service
clients, or authoritative refresh renderers unless the application explicitly
chooses a co-located build that imports the executor role too.

This separation ensures that a framework, static page renderer, or unrelated
application server can host the page without bundling every embedded
component's privileged implementation.

## Exposable eXact applications

An eXact application may expose components that own meaningful server behavior
rather than merely rendering host-supplied data. The artifact and contract
design must support that behavior without returning to discovered package
manifests or requiring a separate component-library project.

Such a package may act as a small framework with its own execution host,
providers, contexts, integrations, release cadence, and server policy. The
eXact host serving the containing page is not necessarily the eXact host
executing the component.

### Deployment topologies

Support three topologies with the same authored component package:

#### Co-located

The page host imports client, render, and executor roles. Initial SSR, actions,
and refreshes all run in the page application's eXact server runtime.

#### Split page and executor

The page host imports client and render roles. A separate execution host imports
the executor role. The page host can render a boundary stub or request initial
HTML from the executor. Browser actions and refreshes route directly or through
an application proxy to the executor.

#### Client embed

The page emits a client boundary without remote SSR. The browser loads the
client artifact and obtains its reactive data and patches from the execution
host.

The package must not assume that installation location, page origin, render
origin, and execution origin are the same.

### Vendor integration component

Consider a UPS-provided shipping control:

1. The application installs the UPS component package.
2. The page application imports the control's client and render roles.
3. A selected execution host imports and composes the UPS executor role. This
   may be the page host, an application-owned service, or a UPS-owned service.
4. The execution host configures a UPS integration using credentials or
   supplies an application/request-scoped UPS client through context.
5. Initial SSR is local, remote through the render transport, or omitted,
   depending on the deployment topology.
6. The package's client island collects shipping parameters and invokes a
   package-owned server action ID.
7. Hydration routing sends the operation to the configured executor endpoint.
8. The executor runtime dispatches to the executable handler attached to the
   imported executor component contract.
9. That handler accesses the server-only UPS integration, calls the vendor
   service, updates permitted state, and refreshes the component's owned
   boundaries.

Neither the page application nor the browser should contain the package's
action implementations or authoritative boundary renderers. Those
implementations are part of the executor artifact. The executor owner controls
activation, configuration, authorization policy, and credential provision.

Credentials must not be client-boundary props, hydration state, submitted
action state, error payloads, or logs. A package may accept a
`Secret<Credential>` through a server-only construction/configuration API, but
the preferred component interface is an opaque server-only integration client
provided through application or request context. That keeps credential
lifecycle, rotation, tracing, retry policy, and tenancy outside render props.

Installing the vendor package is already a server-code trust decision. Its
attached contract does not prove the package is safe; it limits which of its
handlers untrusted client input may address. Applications that require outbound
network restrictions need a separate host capability or egress policy, not a
dependency-authored manifest assertion.

### Organization-internal component

Consider an organization-wide profile component:

1. An organization integration package exports a shared context token and a
   typed `ProfileClient` interface.
2. The execution host provides the context from an ordinary provider component
   or request-context initializer.
3. The profile component reads the client during SSR, actions, and boundary
   refreshes.
4. The client may incorporate request-scoped authentication, tenancy, tracing,
   locale, or service routing without exposing those values to the browser.
5. The component package owns its UI, server actions, and refresh renderers;
   the host owns the client implementation and request/application lifetime.

The context token is a real imported runtime value with stable module identity,
not a string declaration copied from a manifest. Its public TypeScript
interface is the cross-package contract. The provider and executor component
must resolve the same shared/executor module instance. The page host does not
need the context token or client when execution is remote.

Use application scope for reusable service clients and connection pools. Use
request scope for user credentials, tenant selection, trace information, and
request-specific clients. Action and refresh handlers must execute inside the
same normalized request context machinery as initial SSR.

### Executable executor contract shape

The executor-side attached contract needs executable entries, not only
declarations:

```ts
type ExactExecutorComponentContract = {
	component: {
		id: string;
		implementation: Component;
	};
	actions: Array<{
		id: string;
		ownerComponentId: string;
		run: ExactActionHandler;
		stateContract: ExactStateContract;
		contextContract: ExactContextContract;
	}>;
	boundaries: Array<{
		id: string;
		ownerComponentId: string;
		render: ExactBoundaryRenderer;
	}>;
};
```

The compiler may implement this with generated exported functions referenced by
the property attached to the public executor root. A page consumer never
imports this contract in split deployments. An executor never loads handler
names from client input and never dynamically imports a module selected by an
action ID.

Application handlers remain useful for application-owned actions. Overrides of
package handlers must be explicit and must name the exact contract entry being
replaced; composition must never silently let import or configuration order
choose a winner.

### Component instances and endpoint work

Package-owned endpoint handlers need a defined instance model. The
implementation must specify how an action or refresh reconstructs the
component's server execution:

- which submitted state is accepted under the action state contract;
- which props are reconstructed from trusted server data versus submitted
  browser data;
- how request and application contexts are restored;
- how component-owned tasks and resources are scoped and disposed;
- how cancellation reaches vendor or internal service calls;
- how the correct component instance/boundary identity is selected when
  several instances of the same packaged component appear on a page.

Do not solve this by serializing arbitrary server component props into the
browser. Values required only by the server must come from server context,
server-kept state, or a server-owned instance/session mechanism. Any
client-round-tripped value remains untrusted input even if it originated in
SSR.

### Remote execution protocol

Remote execution requires a public, versioned wire protocol rather than a
shared compiler manifest. Client/render artifacts declare logical component,
action, and boundary IDs. Deployment configuration binds those IDs to an
executor endpoint and transport.

The existing per-action and per-boundary endpoint routing is the beginning of
this model. Generalize it around an executor registration:

```ts
registerExactExecutor({
	namespace: '@ups/shipping-control',
	endpoint: 'https://components.ups.example/exact',
	transport: upsTransport
});
```

The URL is deployment configuration, not hard-coded package metadata. A
co-located host binds the same namespace to a local endpoint.

The protocol must define:

- client/render/executor protocol-version negotiation;
- component namespace and stable ID ownership;
- action request, cancellation, streaming result, and refresh messages;
- state submission and server validation;
- context that is local to the executor versus explicitly forwarded request
  metadata;
- cross-origin authentication, CORS, CSRF, cookie, and token behavior;
- timeout, retry, idempotency, and partial-failure behavior;
- limits on request, response, patch, and streamed event sizes;
- tracing across page, browser, proxy, and executor hosts;
- executor health/version mismatch behavior.

Remote patches are confined to boundaries owned by the remote component
instance. An executor response must not address arbitrary DOM or another
component's boundary. The client validates topology and ownership before
applying a patch.

Remote initial SSR needs an explicit trust mode:

- structured eXact render/patch events with normal validation;
- trusted remote HTML from the component provider; or
- no remote SSR, using the client-embed topology.

The page host must not silently inject arbitrary third-party HTML under the
assumption that a component contract makes it safe.

### Trusted deployment bindings

A runtime deployment binding is necessary even though compiler manifests are
not. It contains environment-specific locations, trust policy, and role
selection; it contains no compiler call graph, placement analysis, or policy
assertions.

```ts
defineExactDeployment({
	component: '@company/billing/BillingWorkspace',
	deployment: {
		id: 'billing-2026-07-19.4',
		protocol: 1
	},
	client: remoteModule({
		url: 'https://billing.example/assets/2026-07-19.4/client.js',
		integrity: 'sha384-...',
		expectedNamespace: '@company/billing'
	}),
	render: remoteRenderer({
		endpoint: 'https://billing.example/deployments/2026-07-19.4/render'
	}),
	executor: remoteExecutor({
		endpoint: 'https://billing.example/deployments/2026-07-19.4/exact',
		transport: companyServiceTransport
	})
});
```

A co-located binding supplies local component, render, and executor contracts
instead. Mixed bindings are valid.

Remote locations may come only from host-owned configuration, a trusted
organizational catalog, or a signed deployment registry. Never accept module
or executor URLs from query parameters, user data, component props, hydration
payloads, remote HTML, or action results.

A remote module reference constrains:

- allowed HTTPS origin and redirect behavior;
- expected namespace, exposure, protocol, and deployment identity;
- integrity hash or trusted publisher signature;
- CSP and module-graph policy;
- download and resource limits;
- cache, revocation, and rollback policy.

Remote JavaScript loaded into the page is deliberately trusted with the
authority of that JavaScript realm. Components outside that trust domain
require an isolated iframe/process protocol, not only URL validation.

Loading an executor into the current server is an equivalent server-code trust
decision. In-process executor modules are activated only by administrative
deployment configuration. A browser request must never choose a module URL or
cause arbitrary server code to be imported. Remotely obtained executor code
requires immutable identity, signature verification, controlled activation,
atomic registry replacement, draining, and rollback. Separate processes or
containers are required for strong isolation.

### Per-instance and per-island execution

Execution routing resolves through component ownership rather than a global
action ID:

```text
component instance
  -> pinned deployment
  -> owning executor
  -> operation ID
```

Hydration retains an opaque binding equivalent to:

```ts
type ExactIslandExecutionBinding = {
	instanceId: string;
	componentId: string;
	deploymentId: string;
	executorKey: string;
};
```

The runtime resolves `executorKey` through trusted deployment configuration.
Generated islands inherit the deployment and executor of their owning
component. A nested independently exposed component establishes its own
binding, so different islands on one page may execute on different hosts.

Operations may be batched only within one executor/transport. Cross-executor
work is not atomic. Each executor may patch only boundaries owned by its
component instances, and duplicate namespace, implementation, operation, or
boundary identities fail during registration.

### Deployment resolution, previews, and experiments

Deployment selection occurs per component instance using trusted request,
user, tenant, rollout, preview, and experiment context:

```text
component identity
  + subject and tenant
  + host rollout policy
  + producer deployment catalog
  -> pinned deployment lease
```

Resolution precedence is:

1. emergency host override;
2. explicit authorized preview;
3. tenant deployment pin;
4. experiment assignment;
5. gradual rollout ring;
6. producer default.

Assignments are authoritative and sticky. Use deterministic cohort assignment
or a signed assignment record; the browser does not choose its variant.

The resolved lease atomically binds client, render, and executor roles:

```ts
type ExactDeploymentLease = {
	component: string;
	deploymentId: string;
	assignmentId?: string;
	protocol: number;
	client: ExactClientRoleBinding;
	render: ExactRenderRoleBinding;
	executor: ExactExecutorRoleBinding;
	expiresAt: number;
	signature: string;
};
```

One mounted instance remains on that deployment for SSR, client loading,
actions, streams, and refreshes. Mutable channels are used only to resolve a
new instance; active instances use immutable deployment addresses. Executors
retain and drain old deployments until their leases and active work expire.

Logs, traces, metrics, and exposure events include component namespace,
exposure, deployment ID, assignment/variant, instance ID, page deployment, and
executor host. Render and asset caches include the resolved deployment and all
other relevant tenant, locale, and authorization dimensions.

### Microframework ownership

An independently operated eXact application may initialize its own:

- eXact plugins and runtime extensions;
- application and request contexts;
- secret providers;
- authorization and tenancy policy;
- service clients and resource pools;
- logging, tracing, caching, and rate limits.

Compatibility between page/client and executor is based on the public eXact
wire protocol plus the component's versioned operation IDs. It is not based on
matching compiler plugin-registry fingerprints. Executor-only plugins and
configuration remain invisible to the page host.

### Exposure acceptance tests

Add two independently runnable eXact application fixtures that also expose
selected components:

- a vendor shipping application exposing a control backed by a fake remote
  service and an opaque credential-bearing client;
- an organization profile application exposing a control backed by a
  host-provided request-scoped context client.

For each fixture, verify:

- direct standalone application execution;
- generated external-consumer harness execution;
- initial SSR and subsequent reactive action/refresh behavior;
- keyboard/client interaction through the packaged client island;
- application-owned handler discovery solely through the exposed component
  contract on the executor host;
- credential/auth context absence from client bundles, HTML, hydration data,
  action payloads, errors, and logs;
- cancellation and request-scope disposal;
- two component instances remain isolated;
- standalone and test-shell code absence from exposure artifacts;
- local installed and remotely loaded consumption of the same exposure;
- stable, preview, and experiment cohorts pinned to their selected deployments;
- the release artifacts contain target artifacts and declarations but no
  compiler manifest;
- the split deployment's page and client bundles contain no executor
  implementation, integration client, or credential-provider code;
- local and remote executor bindings use the same logical operation IDs;
- cross-origin authentication and boundary ownership rejection.

### Imported client components

The critical cross-package case is a server-rendered parent using an imported
client component. It must work without consumer-side manifest analysis.

The producing package's `exact-render` export for a client-only component will
be a generated render boundary stub. Invoking it during SSR:

- produces the client-boundary marker and serialized props;
- uses the stable component/island identity embedded in the artifact;
- preserves supported server-owned child slots;
- never imports or executes the browser implementation.

The `exact-client` export contains the actual component and its client
contract. An isomorphic component's render artifact contains its page-render
implementation and embedded boundary calls; its client artifact contains its
client implementation and islands. Privileged actions and authoritative
refresh rendering remain in `exact-executor`.

Add an installed-package test that compiles the library, deletes all library
source and analysis state, packages only declarations plus
client/render/executor/shared artifacts, and successfully consumes it from a
separately compiled application.

### Callable effects and placement

Remove imported callable summaries. A package must not expose a callable from a
target artifact when that callable cannot execute on the target.

Library compilation:

- computes effects across the library's own source graph;
- fails target artifact generation for invalid retained exports;
- emits target-specific facades or omits unsupported exports;
- relies on conditional exports to select the correct facade.

Consumer compilation validates the artifact it is building and its own source.
It does not import the dependency's internal effect graph.

### Secrets and policy

Remove imported policy subjects, flows, secret-consumer records, and package
capability assertions from compiler inputs.

Cross-package secret behavior becomes:

- `Secret<T>` remains a compiler-recognized branded type in published
  declarations.
- Public functions accepting or returning secrets retain that qualification in
  `.d.ts`.
- The library compiler validates the library's own client, render, and executor
  artifacts and `consume()` sites.
- The application compiler validates application-owned flows and consumption.
- An application grant authorizes use of a dependency/package capability; it
  does not treat dependency metadata as proof.
- Opaque JavaScript dependencies receive no framework security guarantee.

Audit reports may aggregate compiler-owned analysis during a source build, but
are terminal outputs. They are never consumed by another compilation.

### Plugins

Remove compiler-manifest plugin fingerprints and imported plugin data.

- Required compiler plugins are dependencies and are activated through the
  canonical eXact configuration/plugin discovery process.
- Optional plugins are optional dependencies and activate only when available
  and configured.
- Compiler plugin protocol compatibility is checked when the plugin is loaded.
- If emitted code needs plugin runtime support, it imports a versioned runtime
  entrypoint.
- A plugin that changes a public artifact ABI must version that ABI in the
  generated code or runtime import; it must not rely on a build fingerprint
  from a library manifest.
- Plugin diagnostics remain local compiler output.

## API removals and replacements

Remove without deprecation:

- `ExactCompilerManifest` from the public API;
- `ExactArtifactManifest`;
- `parseExactCompilerManifest()`;
- `readExactArtifactManifestEntries()`;
- `discoverExactPackageManifests()`;
- `manifestPathFor()` and manifest fields from artifact paths;
- `withArtifactMetadata()`;
- `emitManifest`;
- `importedManifests`;
- `manifestFiles`;
- `discoverPackageManifests`;
- `package.json#exact.manifests`;
- CLI `--manifest`;
- `createClientIslandRegistryEntries()` and its module generator;
- `createServerPartRegistryEntries()` and its module generator;
- `createExactArtifactRegistryModules()`;
- `createExactServerManifest()`;
- `createExactHydrationManifestConfig()`;
- hydration `registerManifest()`;
- compiler/server manifest version constants and parsers.

Introduce or retain under accurate names:

- internal `ExactModuleAnalysis`;
- `exactComponentContract`;
- `readExactComponentContract()`;
- `composeExactComponentContracts()`;
- `composeExactRenderContract()`;
- `composeExactExecutorContract()`;
- `exposeComponent()` and typed application `exposes` configuration;
- `readExactExposureContract()` and `registerExactExposure()`;
- `loadExactRemote()` with namespace, protocol, identity, and trust validation;
- `defineExactDeployment()` and a deployment resolver/lease contract;
- local and remote client, render, and executor role bindings;
- `createExactHydrationConfig()`;
- `registerExactExecutor()`;
- `registerComponents()` or `registerBundle()`;
- optional `createExactAnalysisReport()` for human/tool inspection.

`CompileArtifactsResult`, artifact plan entries, graph entries, and dev state
will contain generated target paths and in-memory session handles where needed,
but no `manifestFile` or public `manifest` property.

## Implementation phases

### Phase 1: Lock the replacement behavior

Add tests before deletion for:

- descriptor-only client hydration;
- stable ID preservation during client composition;
- render and executor contract composition as independent deployment steps;
- package-owned executable action and boundary registration on the executor;
- duplicate action, boundary, implementation ID, and runtime-name rejection;
- executor allowlist enforcement using the composed contract;
- hydration config derived from the composed contract;
- client-only components consumed through their generated render stubs;
- independently packed package consumption with no metadata sidecar;
- vendor-style credential integration and organization-style context
  integration;
- co-located, split-executor, and client-embed topology fixtures;
- one application running standalone and exposing selected roots;
- exposure graph rejection of standalone/test dependencies;
- local and remotely loaded consumption of the same exposure;
- per-island executor routing and boundary ownership;
- deployment pinning across SSR, hydration, actions, streams, and refreshes;
- stable, preview, canary, and experiment cohort assignment.

The existing sample behavior is the reference: initial SSR, island hydration,
actions, boundary refresh, state/context validation, and plugin runtime startup
must continue to work.

### Phase 2: Complete component contracts

Extend compiler-attached properties to include the target-local protocol data
currently read from manifests. Implement the client, render, and executor
composition APIs. Preserve tree shaking by attaching contracts only to exported
component roots and referencing only implementations owned by those roots.

Migrate:

- `apps/shipping-calculator`;
- `apps/server-components`;
- component-library package fixtures;
- SSR and hydration tests.

At the end of this phase, no application source imports generated JSON.
Package-owned server actions and refresh renderers must also work without
application-maintained handler tables, both co-located and on a separate
executor host.

### Phase 3: Add application exposure builds

Add typed `exposes` configuration and make each exposure an explicit build
root. Generate:

- client and render artifacts per exposure;
- executor registration reachable from the application executor deployment;
- public declarations;
- a small remote loader/registration entry;
- local conditional export entries where requested.

Implement graph guards that reject standalone, development, fixture, and
test-only dependencies from exposure artifacts. Add the generic
external-consumer development harness and make release validation consume the
production exposure outputs.

Migrate the vendor shipping and organization profile fixtures into standalone
eXact applications that expose their controls.

### Phase 4: Add deployment binding and remote loading

Implement:

- trusted local and remote role bindings;
- remote loader identity, protocol, origin, and integrity validation;
- local executor activation from administrative configuration;
- per-instance deployment leases;
- per-island executor routing and nested ownership;
- immutable deployment pinning and old-version draining;
- preview, canary, tenant pin, and experiment resolution;
- structured remote rendering and explicitly trusted-HTML modes;
- tracing, fallback, timeout, and rollback behavior.

Prove that a shell can compose multiple exposures from independently deployed
eXact applications, with different users and islands resolving to different
versions and execution hosts.

### Phase 5: Make exposure and package artifacts self-sufficient

Generate render boundary stubs for exported client-only components. Tighten
client/render/executor conditional exports and fail library compilation when a
retained export violates its target.

Change the installed-package fixture so the consuming application has access
only to:

- package declarations;
- client, render, executor, and shared target-specific JavaScript;
- ordinary package metadata and dependencies.

Remove `package.json#exact.manifests` and package scanning. Confirm imported
islands, server slots, and target-specific callables work without consumer-side
dependency analysis.

### Phase 6: Make project compilation entirely in memory

Rename the internal manifest analysis type and stop serializing it.

- Keep sibling analyses in the compiler session.
- Use existing dev-state entries rather than rereading retained files.
- Track dependencies in the session's module graph.
- Rebuild affected modules from that graph.
- Derive package export maps and generated paths directly from artifact
  results.
- Generate any application registration source from explicit application
  entries and in-memory results.

Delete sidecar writes from single-file, project, CLI, and paired-artifact
compilation.

### Phase 7: Remove imported analysis

Delete `importedManifests` from compiler and adapter options. Remove:

- imported-component manifest resolution;
- imported callable/effect indexing;
- imported policy/context propagation;
- imported secret/capability diagnostics;
- imported plugin-registry validation.

Replace remaining same-project uses with compiler-session module analysis.
Make sure no same-project optimization accidentally relied on the public
imported-manifest API.

### Phase 8: Delete obsolete APIs and schemas

Delete manifest contracts, parsing/validation, versions, artifact metadata,
registry compatibility generators, file discovery, adapter file options, and
CLI flags.

Rename runtime server and hydration concepts so "manifest" no longer describes
an in-memory allowlist or registration object.

This phase should be mechanical after the prior migrations; do not leave
deprecated forwarding exports.

### Phase 9: Documentation and hardening

Rewrite the README, server-component guide, SSR guide, plugin architecture,
data/secret policy guide, examples, and CLI documentation around:

- target-specific packages;
- component-attached contracts;
- applications as both standalone products and exposure producers;
- uniform local and remote component consumption;
- deployment resolution, version pinning, and per-island executor routing;
- explicit application composition;
- in-memory project analysis.

Delete obsolete manifest plans and examples rather than documenting both
models.

## Verification gates

Each phase must pass its focused tests. Final removal requires:

- the complete unit, conformance, adapter, sample, and package fixture suites;
- production builds of workbench, shipping calculator, and server-components;
- standalone and exposure builds of the vendor shipping and organization
  profile application fixtures;
- a package tarball test proving no `*.exact.json` or
  `*.exact.manifest.json` files are present;
- exposure artifact inspection proving standalone shells, stub providers,
  fixtures, and unrelated features are absent;
- client bundle inspection proving executor contracts and implementations are
  absent;
- co-located executor bundle inspection proving browser implementations are
  absent except where explicitly needed for asset emission;
- page-render bundle inspection proving remote executor implementations and
  integrations are absent;
- executor bundle inspection proving unrelated page and browser code is
  absent;
- action and refresh adversarial tests proving unknown IDs still fail closed;
- remote loader tests for disallowed origins, redirects, namespace mismatch,
  protocol mismatch, integrity/signature failure, oversized assets, revocation,
  and rollback;
- tests proving request, DOM, props, hydration data, and executor responses
  cannot choose module or executor URLs;
- per-island routing tests with nested components owned by different execution
  hosts;
- preview and experiment tests proving deployment selection is sticky and all
  roles remain pinned for the component-instance lifetime;
- rollout tests proving old executors drain while new instances receive the new
  deployment;
- cross-package `Secret<T>` tests using declarations and no dependency
  analysis file;
- required and optional plugin tests driven only by package dependencies and
  active configuration;
- watch-mode tests proving add/change/remove invalidation without filesystem
  analysis sidecars;
- tree-shaking tests proving unused component contracts and implementations are
  removed.

The final repository search must find no active references to:

```text
.exact.manifest.json
.exact.json
manifestFiles
importedManifests
discoverPackageManifests
exact.manifests
emitManifest
createExactServerManifest
createExactHydrationManifestConfig
registerManifest
```

Occurrences in historical release notes are acceptable only if intentionally
retained; active docs, tests, fixtures, scripts, and APIs must contain none.

## Risks

### Exposure graph leakage

An application exposure can accidentally retain its standalone shell, test
identity, fixtures, or unrelated features. Enforce entry-graph ownership before
emission and inspect production bundles; do not rely on naming conventions or
tree shaking alone.

### Remote code authority

Remote client code is intentionally independently deployable and receives the
authority of its JavaScript realm. Origin and signature validation establish
publisher identity but do not sandbox behavior. Hosts need explicit trust
policy and an isolated embedding mode for components outside that trust
domain.

### Deployment skew

Independent rollout can combine incompatible client, render, and executor
versions. Resolve roles atomically, pin each mounted instance, version the wire
protocol, and retain old executor deployments through lease drain.

### Combinatorial experiments

Several independently experimented components can create product combinations
that no single team tested. Keep the interoperability surface narrow, record
every assignment in telemetry, allow shell-level compatibility constraints,
and provide rapid per-component rollback.

### Deployment control-plane availability

Remote resolution must not make every mount depend synchronously on a fragile
central service. Use signed cacheable deployment records, bounded lease
lifetimes, known-good fallback deployments, and explicit stale-resolution
policy.

### Imported client boundary behavior

Moving cross-package boundary creation into server stubs changes where the
boundary is established. Test server-owned children, nested imported islands,
prop serialization, context, action ownership, and boundary refresh before
removing imported component analysis.

### Packaged handler lifecycle

The current samples largely wire action and boundary handlers in application
code. Compiler-generated exposure handlers introduce reconstruction, request
scope, cancellation, resource disposal, remote routing, and multi-instance
requirements. Treat these as protocol correctness work, not merely descriptor
serialization.

### Tree shaking

A contract attached to one root must not retain every component in an
application or package. Generate per-exposure contracts and compose only roots
selected by the consuming application.

### Duplicate identities

Manifests currently provide aggregate collision checks. Move those checks into
component contract composition and project-session analysis.

### Type-only secret propagation

Verify the compiler can read secret branding from published declarations. If
the current expression/type layer cannot, add declaration/type resolution
before deleting imported policy handling.

### Multi-process builds

In-memory state assumes one owning compiler service. Official adapters should
share that service. If process boundaries later require caching, design a cache
as an implementation detail with invalidation and integrity checks; do not
restore a package trust protocol.

## Completion criterion

The work is complete when any eXact application can run directly, explicitly
expose selected component roots, and have those same roots consumed locally or
remotely by another eXact application. The composed application must
SSR-render, hydrate, dispatch actions, and refresh boundaries across
co-located, split-executor, independently loaded, preview, and experiment
deployments using only source inputs, declarations, target-specific artifacts,
ordinary dependencies, trusted deployment routing, and component-attached
contracts, with no generated manifest files or imported compiler analysis.
