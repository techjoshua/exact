# Trusted Microfrontend Architecture Plan

## Status

Implementation-backed architectural agreement for allowing an eXact application to expose
selected component roots to other eXact applications in the same organization
and product trust domain.

This revision supersedes the broader third-party remote-component model that
previously occupied this document. The intended use case is a trusted
microfrontend system:

- one public page host owns the browser-facing application;
- private component hosts execute independently deployed eXact applications;
- a trusted plugin provides exposure, loading, routing, proxying, and lifecycle
  integration;
- the browser uses the page host's existing `/__exact` endpoint;
- remote areas are loaded client-side and rendered as ordinary children beneath
  a host-owned component boundary;
- the page bundle publishes configured package instances before hydration; and
- remote builds omit those packages and resolve them from the page at runtime.

The architectural statement is:

> Every eXact app may explicitly expose component roots and may consume roots
> from other trusted eXact apps, while one page host remains the public routing,
> security, and observability boundary.

Remote serving is disabled by default. A JavaScript or package export does not
become remotely callable merely because it exists.

The initial implementation lives in the official `plugins/microfrontends`
framework plugin and extends the existing core, DOM, hydration, server, compiler,
and Vite/Rollup adapter packages. Webpack and Bun currently have focused
native-hook feasibility mappings only; they are not advertised adapters.

## Glossary

The terms below have specific meanings in this plan. In particular, `execution
root`, `binding`, `client root`, and `remote instance` describe different
layers and should not be used interchangeably.

| Term                             | Meaning                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page host**                    | The public eXact application that owns the page shell, browser session, top-level router, `/__exact` endpoint, remote binding configuration, and gateway logging.                                                                                                                         |
| **Component host**               | A private eXact server that executes server components, actions, and boundary refreshes for one or more exposures. It receives ordinary eXact requests forwarded by the page host.                                                                                                        |
| **Remote application**           | An independently runnable, trusted eXact application that also publishes selected component roots for another eXact application to consume.                                                                                                                                               |
| **Exposure**                     | One component root deliberately published by a remote application for external consumption. Source-language and package exports are not exposures by themselves.                                                                                                                          |
| **Exposure root**                | The authored component selected as the entry of an exposure. Its reachable client, executor, loader, island, action, boundary, and asset artifacts form the exposure graph.                                                                                                               |
| **Exposure graph**               | The code and assets reachable from one exposure root after target-specific compilation. Standalone shells, fixtures, test providers, and unrelated exposures are excluded.                                                                                                                |
| **Execution root**               | A stable compiler-generated protocol namespace such as `page` or `@company/billing#./BillingArea`. Action, boundary, island, and patch IDs are interpreted relative to it. It identifies ownership but does not authorize a request.                                                      |
| **Build key**                    | The full Git commit SHA from which the remote client and executor artifacts were built. Remote requests carry it in `X-Exact-Build` so the component host can select compatible executor artifacts. It is neither a version range nor authorization.                                      |
| **Preferred-build hint**         | An optional `X-Exact-Preferred-Build` response header containing a different full Git commit SHA that the component host recommends for a future root replacement. It is advisory, has no ordering semantics, and does not interrupt active work.                                         |
| **Component domain**             | The immutable runtime association carried by a VNode and component instance. It identifies the execution root and the concrete client root that owns requests and patches.                                                                                                                |
| **Client root**                  | A concrete `ExactClient` and renderer/hydration container. It owns DOM application, request promises, cancellation, stale suppression, and disposal. Several instances may share one execution root while retaining separate client roots.                                                |
| **Binding**                      | A page-application name such as `billing` or `acmeBrand`. It selects a browser-safe client entry and, on the page server, a private component-host endpoint.                                                                                                                              |
| **Binding target**               | The two page-owned locations associated with a binding: a browser-safe client entry and a server-only component-host endpoint.                                                                                                                                                            |
| **Remote area**                  | A client-loaded remote subtree rendered beneath a page-host-owned eXact boundary. It is separately bundled and server-routed, but participates in the ordinary logical component tree and inherits visible contexts.                                                                      |
| **Remote bundle**                | The independently built browser artifact set for an exposure, including its generated entry, root component, islands, local component exports, lazy chunks, and styles. Configured provided packages are omitted.                                                                         |
| **Client entry / loader**        | The public module loaded by the browser. It resolves build-time externalized packages and exports the build key, execution root, root component, and hydration registration.                                                                                                              |
| **Remote artifact plan**         | The bundler-neutral description generated by the microfrontends plugin: exposure entries, canonical wrapper modules, provided-package bridges, page bootstrap imports, output requirements, and diagnostics.                                                                              |
| **Bundler adapter**              | A thin plugin-owned integration that maps the remote artifact plan to one bundler's module-resolution, entry, output, development, chunk, and asset hooks.                                                                                                                                |
| **Remote instance**              | One live use of a remote exposure on a page. It establishes the remote component domain and owns a client root, loaded entry, state, requests, patches, cancellation, and disposal.                                                                                                       |
| **Root replacement transaction** | The bounded prepare-and-commit operation owned by `RemoteComponent` for proactive or unsupported-build replacement. It replaces one complete remote entry generation; it is not general-purpose HMR or browser module-cache eviction.                                                     |
| **Local ID**                     | An action, boundary, island, or patch-target ID interpreted inside one execution root. Local IDs need not be globally unique across the page and remote roots.                                                                                                                            |
| **Binding-routed request**       | An ordinary browser eXact request carrying the page-configured binding in `X-Exact-Binding` and the loaded remote build's key in `X-Exact-Build`. The page host removes the binding header, preserves the build key, and forwards the request to the binding's private endpoint.          |
| **Gateway**                      | The page-host behavior that validates a configured binding, applies public policy, forwards the ordinary request to its private component host, and returns the trusted final response while reconstructing only transport framing and enforcing generic eXact limits.                    |
| **Forwarding transform**         | The only new request-policy hook required by the gateway. After the page app's ordinary `/__exact` request hooks succeed, it converts that validated request into the request sent to the component host, for example by exchanging browser credentials for internal service credentials. |
| **Remote component**             | An embedded exposure mounted by the plugin's `RemoteComponent` eXact component inside a page-host-owned view.                                                                                                                                                                             |
| **Provided package**             | A package selected at build time to be supplied by the page bundle and omitted from remote bundles. The page publishes its actual module instance under the configured import key before hydration.                                                                                       |
| **Provided-package registry**    | A page-owned mapping from configured import keys to the actual module instances already loaded by the page bundle. It performs lookup, not version discovery or negotiation.                                                                                                              |
| **Shared runtime**               | The eXact framework package instances published by the page bundle and used by every remote bundle. Sharing preserves dependency tracking, contexts, ownership, rendering, and hydration across bundle boundaries.                                                                        |
| **Typed local component**        | A component implementation supplied by a loaded remote bundle but executed locally in the page runtime, such as a branded button, dialog, or field. It is not a separate remote request.                                                                                                  |
| **Host-owned fallback**          | Page-host content shown when binding resolution, remote loading, rendering, transport, or hydration fails. The failed remote mount cannot patch the fallback.                                                                                                                             |

## Goals

- Let an independently runnable eXact application expose selected route or
  component roots without becoming a separate component-library project.
- Keep the remote bundle's component graph, islands, actions, boundaries, and
  patch IDs opaque to the page shell.
- Preserve one browser-facing eXact endpoint and one public application origin.
- Allow remote applications to publish, scale, and roll back independently.
- Preserve eXact reactivity, contexts, hydration, task cancellation, and
  component lifecycle when a client bundle is loaded dynamically.
- Allow ordinary components from one execution root to be passed through and
  rendered by components from another root.
- Support branding applications that provide a client-loaded remote shell plus
  a locally executing family of styled controls.
- Keep topology and organizational policy in a plugin while moving only
  generally reusable component/runtime primitives into core.

## Non-goals

- Anonymous public component execution.
- Cross-organization or untrusted third-party federation.
- Sandboxing a malicious component producer.
- Allowing browsers or remote bundles to select arbitrary server URLs.
- Treating every source export as a remote endpoint.
- Sharing live reactive objects across server processes.
- Exactly-once mutation guarantees.
- Atomic batches across different remote component hosts.
- A second browser protocol or a second public eXact endpoint.
- Initial page-host SSR of remote areas. The page host SSRs a host-owned
  placeholder; the remote subtree mounts in the browser.

## Trust model

Participating applications and client bundles are trusted code operated under
one administrative authority. This permits:

- remote eXact HTML and patches from an approved binding target;
- dynamically loaded client code in the page's JavaScript realm;
- shared framework runtime packages;
- application-specific internal authentication and authorization;
- ordinary organizational service discovery and binding policy.

This trust does not make browser input trustworthy. The page host and component
host still validate sessions, CSRF where applicable, request limits, action
authorization, and runtime allowlists. A compromised or buggy component host is
an operational risk within the shared trust domain, not a sandboxed party.

## Topology

```text
Browser
  -> public page host
       - renders the shell
       - resolves remote bindings
       - receives every browser /__exact request
       - logs gateway rejections
       - forwards binding-routed remote work
  -> private component host A
       - executes server work for component A
  -> private component host B
       - executes server work for component B
```

Only the page host must be publicly reachable. Component hosts may use the same
eXact request handler on private addresses.

## Plugin model

The feature should be delivered as an official trusted microfrontend plugin,
named `@exactjs/microfrontends`.

The same plugin operates in producer and consumer modes.

### Producer configuration

```ts
export default defineConfig({
	plugins: {
		microfrontends(config) {
			config.exposes['./BillingApp'] = {
				component: './src/BillingApp.tsx'
			};
		}
	}
});
```

The implemented configuration syntax is shown above. Exposures are explicit
build roots.

### Provided-package configuration

The plugin has one build-time concept: provided packages. It automatically
marks the identity-sensitive eXact browser packages as provided. Applications
may add organization context packages, state containers, component libraries,
or other packages whose page instance a remote should use:

```ts
microfrontends(config) {
	config.providedPackages = [
		'@company/app-contexts',
		'@company/design-system'
	];
}
```

When building the ordinary page bundle, the plugin imports and publishes the
actual module instances for the mandatory and configured packages at the same
bottom-of-body bootstrap point already emitted before hydration. Opting in a
package makes that import a build root if the page does not otherwise use it.

When building a remote exposure, the plugin sees the same configured list,
excludes those imports from the remote bundle, and binds them to lookup by
import key in the page's provided-package registry. Other dependencies remain
ordinary private contents of the remote bundle.

There is no runtime package-version discovery, compatibility negotiation,
provider selection, or fallback copy. Provided-package compatibility is an
application build and release responsibility. The remote build key separately
selects compatible client/executor artifacts; it does not negotiate package
compatibility. At runtime a lookup either returns the page's actual module
instance or fails the remote load because the configured provider is missing.

The build contract must define whether a configured package root also covers
all subpath imports or whether each subpath is an explicit key. That choice is
resolved statically; it does not introduce runtime version policy.

### Consumer configuration

```ts
export default defineConfig({
	plugins: {
		microfrontends(config) {
			config.remotes.billing = {
				endpoint: 'http://billing.internal/__exact',
				clientEntry: 'https://cdn.example.com/billing/loader.js',
				clientEntryResolver: './src/billing-client-entry.ts'
			};
		}
	}
});
```

`clientEntryResolver` identifies browser code rather than a configuration
closure. Its default export receives a build key and returns a browser-safe
public entry:

```ts
export default function resolveBillingEntry(buildKey: string) {
	return `https://cdn.example.com/billing/${buildKey}/loader.js`;
}
```

The page build statically imports that module into its generated client binding
projection as `resolveClientEntry`. `endpoint` remains server-only, and the
component response never supplies a script URL. A future declarative URL-template
form may be added without changing the runtime projection. Arbitrary build-time
configuration closures are not serialized into browser code.

## Core and plugin ownership

Core owns mechanisms that are useful for local packages, dynamically loaded
components, and remote microfrontends regardless of hosting topology.

The plugin owns organizational binding, service, routing, and gateway policy.

### Core responsibilities

- A minimal generated client loader and root-relative server manifest.
- Explicit exposure-root compilation.
- Generated client loader and component-host manifest entries.
- Stable compiler-generated execution-root identity.
- The full Git commit SHA embedded in the generated client entry and compatible
  component-host executor artifacts.
- Immutable component-domain propagation through VNodes and component
  instances.
- Root-relative protocol dispatch, batching, hydration, and patch ownership.
- Per-client-root registration and disposal.
- A small provided-package registry populated before hydration.
- Ordinary cross-root component composition with normal context, lifecycle, and
  reconciliation behavior.
- Dynamic component mounting under an existing eXact component.
- Generation fencing plus the detach, reconcile, reattach, and disposal
  primitives needed for atomic child-root replacement.

### Plugin responsibilities

- The `RemoteComponent` eXact component.
- Producer `exposes` and consumer `remotes` configuration.
- Automatic externalization of mandatory eXact packages from remote builds.
- Configurable build-time provided-package declarations.
- Page-bootstrap publication and remote import-key binding for those packages.
- Canonical remote-entry, provided-package bridge, and page-bootstrap module
  generation.
- A small internal bundler-adapter contract for module resolution, entry
  injection, emitted-output discovery, and development URLs.
- Uniform remote-artifact validation across supported bundlers.
- Logical binding resolution for client loading and gateway routing.
- Framework-owned `ExactClient` configuration using the page `/__exact` endpoint
  and immutable `X-Exact-Binding` plus `X-Exact-Build` headers.
- Page-host `/__exact` gateway forwarding.
- Build-key client headers, unsupported-build recovery, and coordination across
  remote instances using the same loaded build.
- Optional preferred-build response hints and settled proactive replacement.
- Whole-entry replacement orchestration at the `RemoteComponent` boundary,
  including prepare, commit, fallback, and retry limits.
- A server-only forwarded-request transformation hook between the page app's
  ordinary `/__exact` security hooks and the component host request.
- Central blocked-request logging.
- One build-adapter implementation proving the required entry and externalized
  package behavior.

Authentication, service discovery, retries, circuit breaking, CDN policy, and
experimentation remain application or infrastructure concerns. Both page and
component applications configure the existing `/__exact` request-context,
authorization, and CSRF hooks normally. The gateway adds no parallel
authentication API. It may receive an application-configured `fetch` and one
forwarding transform, but the plugin does not define the credential system used
by that transform.

The plugin owns the remote artifact plan and its observable output contract. It
does not own parsing, optimization, chunking, minification, or general-purpose
asset processing. Vite, Webpack, Bun, and future bundlers continue performing
those jobs through thin adapters.

## Minimal remote module and execution roots

Every compiled application has an execution root. The page application has its
page root, and each explicitly exposed remote root receives a stable generated
root identity.

```ts
type ExactRemoteModule = {
	buildKey: string;
	root: string;
	component: ExactComponentImplementation;
	registration: ExactHydrationRegistration;
};
```

The compiler emits this ordinary module shape for the selected exposure. Both
client and executor builds embed the full Git commit SHA supplied by their build
environment or read from the checked-out repository. Production deployments
guarantee that both targets build the same commit. The component host uses
build key and root together as the namespace for local IDs.

```text
build key: 4eb6d53c...
  -> execution root: @company/billing#./BillingApp
       -> BillingApp root
       -> internal client islands
       -> local action IDs
       -> local boundary IDs
```

The build key changes when the remote application commit changes. It is an
exact match, not semantic versioning, a compatibility range, a package version,
or `contractVersion`. eXact does not generate or persist a second release ID.
Local dirty or incremental development builds may continue using the current
commit SHA; production deployment consistency is the required invariant.

Use the full commit SHA rather than an abbreviated prefix. One SHA covers all
exposures produced from that remote application commit; the execution root
distinguishes exposures within it. CI may inject the checked-out SHA, while
local tooling may read `git rev-parse HEAD`. Separate client and executor build
processes need no persisted eXact build-plan record as long as both are pinned
to the same production commit.

A reusable source component may participate in several roots. Source package or
bundle identity does not decide its runtime domain. The active component domain
is captured when its VNode is created.

The execution root provides stable protocol ownership and collision isolation.
It is not authorization: a browser can construct arbitrary requests, so the
component host still validates and authorizes every `(root, local ID)`.
Build selection does not weaken that check: the host first resolves a supported
build and then validates every `(root, local ID)` within it.

### Component-domain propagation

Every VNode and component instance carries an immutable component domain:

```ts
type ExactComponentDomain = {
	readonly root: string;
	readonly client: ExactClient;
};
```

The domain is captured when a VNode is created, not inferred later from its DOM
position or attached statically to its component function. A component
definition imported from a shared provided library is locality-neutral: one
`Button` function may produce page-domain and remote-domain instances in the
same document according to the domain active at each VNode's creation. This
produces consistent behavior:

- VNodes created by page components carry the page root.
- VNodes created under a remote exposure carry that remote root and client.
- A page-created child passed into a remote retains the page root.
- A nested `RemoteComponent` establishes another remote domain.
- Portals, dynamic components, deferred rendering, and hydration preserve the
  domain already attached to the VNode or protocol artifact.

Logical component ancestry remains ordinary. Context, reactivity, events,
lifecycle, and reconciliation follow the component tree even when a child has a
different execution root from its parent. The execution root controls protocol
ownership and transport, not context inheritance or whether the parent may
render or remove the child.

## Binding resolution and remote instances

A binding is only a page-owned lookup key. The server and browser receive
different projections:

```ts
type ExactRemoteServerBindings = Readonly<Record<string, { endpoint: string }>>;

type ExactRemoteClientBindings = Readonly<
	Record<
		string,
		{
			clientEntry: string;
			resolveClientEntry?: (
				preferredBuild: string
			) => string | undefined | Promise<string | undefined>;
		}
	>
>;
```

The page build emits the client projection and keeps the server projection
private. The binding name is already the record key and is not repeated in the
value. The execution root comes from the loaded module rather than page binding
configuration.

```text
binding name
  -> resolve client entry
  -> load client entry
  -> construct isolated client root
```

Ordinary module caching controls loader reuse. Two instances may use the same
module and execution root while retaining separate client roots. Results and
patches remain associated with the client root that issued each operation.

The binding name is also the framework transport routing key. The browser never
receives or supplies a raw internal endpoint. The page host resolves the header
only against its own binding configuration.

A binding grants routing to the configured trusted component service; it is not
implicitly an authorization capability for one execution root. The component
host's supported build/root registrations, manifest allowlists, and ordinary
`/__exact` authorization hooks decide which operations the service accepts. An
application that wants page-side per-root policy can enforce it in the existing
page authorization hook without adding `root` to the mandatory binding
contract.

How applications update binding configuration is outside this framework
contract. A preferred-build response can ask the optional browser resolver for a
new public entry, but cannot replace the configured binding or choose an
internal endpoint.

## One public `/__exact` endpoint

Remote operations use the page host's existing `/__exact` endpoint. The
framework-owned client identifies the configured binding in a routing header;
the remote bundle does not choose an endpoint or implement transport.

The representation is a page-host binding header:

```http
POST /__exact
X-Exact-Binding: billing
X-Exact-Build: 4eb6d53c...
Content-Type: application/json

{
  "type": "action",
  "root": "@company/billing#./BillingArea",
  "id": "checkout.submit",
  "payload": {}
}
```

The page host:

1. opens its ordinary `/__exact` request contexts, parses the protocol request,
   and runs its configured authorization and CSRF hooks;
2. validates that the bounded binding name exists in trusted page
   configuration;
3. resolves its private internal endpoint without accepting a browser URL;
4. applies existing page request limits and logs blocked gateway requests;
5. validates the bounded build-key syntax, removes `X-Exact-Binding`, preserves
   `X-Exact-Build`, and applies the configured forwarding transform;
6. forwards the resulting ordinary eXact request to the private remote
   `/__exact` endpoint, where that application runs its own ordinary request
   contexts, authorization, and CSRF hooks; and
7. returns or streams the trusted final status, eXact payload, and end-to-end
   headers while reconstructing transport framing.

A request without `X-Exact-Binding` follows the page application's ordinary
local `/__exact` dispatch after the same request-context and security stages.
The header is routing input, not authorization: both applications still apply
their independently configured ordinary `/__exact` authorization hooks, and
the selected component host still applies its allowlist checks.

```text
ordinary browser request + binding header
  -> page host opens request contexts and runs ordinary /__exact security hooks
  -> page host validates configured binding
  -> binding header removed, build key preserved, forwarding transform applied
  -> ordinary transformed eXact request
  -> private component host opens its request contexts and security hooks
  -> component host selects executor registration by (build key, root)
  -> ordinary eXact response
  -> trusted final response through page host with public transport framing
  -> issuing ExactClient applies within its isolated root
```

The internal component host owns the meaning, allowlisting, and authorization of
every `(build key, root, local ID)`. The page host validates only the build
key's bounded transport syntax; it does not recognize builds or know which
roots or component graphs the selected endpoint serves.

No gateway-specific response envelope, response root, or response routing
header is required. The framework-created client owns each pending operation
and therefore associates its ordinary result with the issuing component domain
and client root.

Browser cancellation propagates through the page-host upstream request to the
component host. The gateway retains request ownership until the upstream
response or stream completes but should not buffer the complete stream.

### Batching

One batch contains operations routed through one binding. The framework batch
key is:

```text
public endpoint + binding + build key + remaining transport/cancellation policy
```

Every operation carries its own `root` in the protocol body. Operations for
different roots may share a batch when their binding and remaining transport
policy match. Each pending item retains its issuing client root for result and
patch application.

```json
{
	"type": "batch",
	"version": 1,
	"operations": [
		{
			"type": "action",
			"root": "@company/billing#./BillingArea",
			"id": "invoice.select",
			"payload": { "id": "inv-1" }
		},
		{
			"type": "refresh",
			"root": "@company/billing#./AccountSummary",
			"id": "invoice-list"
		}
	]
}
```

Different bindings or build keys have different request headers and therefore
cannot enter one batch. The gateway never splits or rejoins a batch. The
component host dispatches every operation independently by
`(build key, root, local ID)`; work across roots is not atomic.

## Opaque remote internals

The shell and gateway do not need to understand:

- the remote component hierarchy;
- client-island names;
- action and boundary ID meanings;
- generated patch target IDs;
- lazy chunk layout;
- internal route definitions.

After resolving its externalized imports from the page registry, the generated
loader exports one ordinary module value:

```ts
export default {
	buildKey: '4eb6d53c9a...',
	root: '@company/billing#./BillingApp',
	component: BillingApp,
	registration: {
		islands: {
			BillingDialog,
			InvoiceEditor,
			PaymentMethodPicker
		}
	}
} satisfies ExactRemoteModule;
```

Application authors do not maintain this object. The compiler emits it as the
exposure loader.

## Component domains and client roots

Each remote instance creates a client root and a component domain. It reuses the
existing `ExactClient` rather than creating a global bundle-ownership runtime:

```ts
const remoteClient = createExactClient(container, {
	endpoint: '/__exact',
	headers: {
		'X-Exact-Binding': binding,
		'X-Exact-Build': remoteModule.buildKey
	}
});

remoteClient.registerManifest(remoteModule.registration);

const domain = createExactComponentDomain({
	root: remoteModule.root,
	client: remoteClient
});

mountExactChildRoot({
	container,
	component: remoteModule.component,
	domain,
	parent: remoteAreaOwner
});
```

The runtime provides:

- immutable domain capture on VNodes and component instances;
- root-relative island, action, boundary, and patch lookup;
- per-client-root state, request association, cancellation, and disposal;
- ordinary logical ancestry and context behavior across roots;
- automatic hydration of returned remote islands;
- coexistence of several client roots using one execution root; and
- module reuse through ordinary browser module caching.

Internal IDs need not be globally unique. Lookups use a structured ownership
path:

```text
component domain
  -> execution root and client root
  -> local island, action, boundary, or patch ID

client root
  -> DOM container and request promise
  -> patch application, cancellation, and disposal
```

## Patch confinement

A result is applied only by the isolated client that issued its request:

```ts
const result = await remoteClient.request(operation);
remoteClient.apply(result);
```

The binding header routes the request at the page host. The request closure and
stream reader retain client-root association in the browser; the response does
not need to carry a mount identifier.

Patch lookup begins at the issuing client container and matches only DOM targets
owned by the operation's execution root. A different-root child may be
physically inside that container without becoming a valid patch target.

A structural patch may nevertheless replace an owned ancestor whose DOM
currently contains a different-root child. DOM containment does not transfer
logical ownership: removing those nodes does not unmount or dispose the foreign
component instance. Before applying the replacement, the renderer records any
nested foreign-root instances as detached. After applying it, the issuing root
is reconciled; the remote parent's still-live `children` or named VNode props
place those same component instances back into the resulting DOM. Their state,
contexts, effects, and protocol domains survive the temporary detachment.

Structural patching and stale-build replacement reuse the same renderer
primitives: enumerate foreign-domain descendants, mark host output detached,
invalidate DOM references, reconcile, reattach, and perform idempotent cleanup.
They remain different transactions. A structural patch replaces owned DOM
inside one live generation; a root replacement transaction disposes the old
remote generation and mounts a new one. Nested foreign roots are detached and
reattached as units, and temporary detachment does not emit a false
unmount/mount lifecycle pair.

The runtime rejects:

- an unknown or disposed client root;
- a result applied through a different isolated client root;
- a patch target outside the client root's container;
- a protocol patch that directly targets the interior of a different execution
  root;
- stale results superseded by a newer operation for the same owned boundary.

Ordinary renderer reconciliation is intentionally different from protocol
patching. A parent component may render, reorder, or remove its ordinary child
even when the child belongs to another execution root. If the logical render
omits the child, normal component unmount and cleanup occur. A protocol patch
that merely removes its current DOM does not make that logical decision and
therefore cannot dispose it.

Pending work that needs detached DOM may wait only through the bounded
reconciliation turn that owns the replacement. If its target is not reattached,
the result is stale. The framework preserves component identity and state for a
still-rendered foreign child, but does not promise DOM node identity, focus,
selection, or scroll position across structural or build replacement beyond the
renderer guarantees that already exist.

The remote service remains authoritative for validating its own action and
boundary IDs. The client runtime is authoritative for DOM ownership.

## Client bundle delivery

The framework reads the browser-safe binding projection to obtain a public
client entry:

```text
https://cdn.example.com/billing/loader.js
```

The URL may point at the page host or a CDN. Normal module-relative URLs handle
lazy chunks, styles, fonts, and images; the plugin does not define an asset
proxy.

The browser-safe binding projection selects the client artifact:

```ts
type ExactRemoteClientBinding = {
	clientEntry: string;
};
```

Asset caching and publication follow ordinary JavaScript module and service
deployment rules. Client/executor selection uses the Git-SHA build-key mechanism
defined below rather than version negotiation.

## Uniform cross-bundler artifacts

The page server runtime, component-server runtime, page bundler, and remote
bundler may all differ. Only the browser realm is shared. Remote artifacts must
therefore use a standards-based browser contract and must not depend on the
page's bundler runtime.

The microfrontends plugin core generates one remote artifact plan containing:

- the full Git commit SHA shared by the plan's client and executor outputs;
- an ordinary ESM exposure wrapper with the minimal `ExactRemoteModule` shape;
- one virtual provided-package bridge per configured import key;
- the page bootstrap that publishes provided packages before hydration;
- exposure entry names and output requirements; and
- diagnostics and conformance assertions.

Bundler adapters consume that plan through a deliberately small internal
interface conceptually equivalent to:

```ts
type ExactRemoteBundlerAdapter = {
	addEntry(name: string, moduleId: string): void;
	resolveVirtualModule(id: string): string | undefined;
	resolveProvidedPackage(key: string, usage: ExactImportUsage): string;
	reportEmittedEntry(name: string): string;
};
```

This is an internal microfrontends build interface, not a new application API or
general plugin-host contribution system. A concrete adapter may use callbacks
rather than these exact methods.

Every production adapter must emit a browser-importable ESM entry that:

- default-exports `{ buildKey, root, component, registration }`;
- bootstraps any private bundler runtime it requires;
- resolves its own lazy chunks relative to the remote entry or configured
  public base;
- loads its extracted styles without help from the page bundler;
- uses normal module-relative URLs for fonts, images, and other assets;
- contains no page-bundler, Node, Bun, Deno, or component-server runtime
  assumption; and
- reports its emitted entry path to deployment tooling.

Uniformity means this observable behavior and module shape, not byte-identical
bundles. Module Federation may implement Webpack's internal loading, for
example, but a Webpack remote must still load from a Vite or Bun page through
ordinary browser `import()`.

### Tree-shaking and provided-package bridges

Authored ESM imports remain statically analyzable. The compiler must not replace
them wholesale with opaque registry calls. Instead, the adapter intercepts only
configured provided-package resolutions and supplies a plugin-generated virtual
module that preserves the imported default, named, namespace, and side-effect
shape for the bundler's module graph.

The common generator owns the bridge semantics; adapters only connect it to
their module-resolution hooks. Non-provided dependencies follow the bundler's
ordinary tree-shaking without microfrontend transforms.

Publishing a complete package namespace from the page can force retention of
that namespace's public exports. This is an explicit cost of providing that
key. Applications should prefer narrow export-map subpaths where practical.
The first implementation supports static imports and rejects dynamic imports or
re-exports of provided keys unless an adapter can preserve their semantics.

### Supported adapter mappings

- Vite/Rollup maps the plan to additional inputs, `resolveId`/`load` virtual
  modules, output discovery, and development module URLs.
- Webpack maps it to additional entries, module-factory or external hooks, ESM
  entry output, automatic chunk-base behavior, and optionally Module
  Federation internally.
- Bun maps it to build entrypoints, `onResolve`/`onLoad` virtual modules, and
  output discovery.

These mappings establish a viable integration plan for every intended bundler;
they are not a requirement to implement every adapter in the first release.
Vite/Rollup is the reference implementation. Webpack and Bun are added in later
adapter milestones, and an adapter is advertised only after it passes the same
plain-ESM producer and consumer conformance suite.

Before freezing the internal artifact-plan boundary, perform a lightweight
feasibility check for Vite/Rollup, Webpack, and Bun. Each check must demonstrate
that the bundler's documented native hooks can add an exposure entry, resolve a
generated provider bridge, emit a browser-importable ESM wrapper, discover its
output URL, and keep lazy chunks and assets remote-relative. These may be
focused spikes rather than production adapters. Passing them is an architecture
approval gate; full conformance, diagnostics, development behavior, and product
support remain staged adapter deliverables.

### Server-runtime mapping

The component-host server bundle is never loaded by the page host. The plugin
generates the same build-keyed, root-relative executor registration for every server target,
and the component application's existing build adapter compiles it for Node,
Bun, Deno, an edge runtime, or another supported target. Their only cross-host
contract is the ordinary HTTP `/__exact` protocol.

Every server runtime advertised as supported must run the same component-host
protocol suite. Cross-runtime smoke tests should include at least one page host
and component host running on different server runtimes; no JavaScript module,
manifest object, or runtime-specific request type crosses between them.

The implementation should not introduce an internal general-purpose bundler.
That decision may be revisited only if multiple native adapters cannot satisfy
the same conformance suite without materially different runtime semantics.

### Provided-package publication and lookup

The page bundle already executes at the bottom of the server-rendered body
before hydration. Its generated bootstrap publishes the mandatory eXact package
instances and configured application package instances at that point:

```ts
providedPackages.register('@exactjs/reactive', exactReactive);
providedPackages.register('@exactjs/core', exactCore);
providedPackages.register('@company/app-contexts', appContexts);
```

The registry is a mapping from configured import key to module instance. It
does not store or compare package versions and does not choose among providers.

The remote build knows its provided-package keys at build time. Its bundler
adapter resolves those keys to the common virtual bridge modules, so the package
implementation is omitted while the static import shape remains visible to the
bundler. A missing key fails the remote boundary and shows the host-owned
fallback. All other compatibility is owned by the applications' build and
release process.

```text
page bundle executes
  -> publish configured package instances
  -> hydrate page
  -> load remote entry when RemoteArea mounts
  -> resolve externalized imports by exact configured key
  -> read the generated remote module and its execution root
  -> render remote component as a child of the waiting RemoteArea owner
```

Every adapter must preserve the same observable rule: imported values resolve
from the actual module instance published by the page.

## Reactive behavior

### Browser realm

The remote area is separately bundled and establishes a distinct execution
root, but remains an ordinary logical child. `RemoteComponent` creates a
host-owned boundary and waits for the remote bundle. After loading,
the remote entry renders beneath that boundary with its remote component domain.

Reactive props passed directly in the browser retain identity because they are
not serialized. The remote component participates in the same component tree,
effect graph, context lookup, lifecycle, task cancellation, and DOM renderer.
Effects and tasks created by the remote subtree are disposed with the boundary.

### Required provided runtime

Remote bundles must not embed independent copies of:

- `@exactjs/reactive`;
- `@exactjs/core`;
- `@exactjs/dom`;
- `@exactjs/hydrate`.

Reactive markers and several framework symbols use `Symbol.for`, but dependency
tracking, effect scopes, proxy caches, renderer ownership, and hydration roots
also use module-local state and `WeakMap`s. Global markers alone do not make two
runtime copies interoperable.

The plugin excludes these framework packages from remote builds, and the page
bootstrap publishes its instances. A missing registry key renders the
host-owned fallback rather than attempting partial initialization.

The same identity rule applies beyond framework packages. A context-definition
package, identity-sensitive state container, or component library with
module-local registration must be configured as a provided package if host and
remote code are intended to interoperate through it.

`@exactjs/router` is not mandatory. Applications that do not use the router
should neither publish nor download it. When both the page shell and a remote
use router APIs, providing it is normally sensible and avoids duplicate code,
but it remains an application choice. The primary eXact route and controller
contexts use global context tokens, so their identity alone does not require one
shared router module instance.

### Server boundary

Live reactive objects do not cross from a private component host to the page
host or browser. Remote server execution produces serialized HTML, state,
patches, or stream events. The browser reconciles those results into the
mount's client-side reactive graph.

```text
remote server reactive graph
  -> serialized eXact result
  -> issuing client root
  -> browser reactive graph updates
```

Cancellation propagates across the network, but reactive dependency graphs do
not.

### Contexts

Context, reactivity, and lifecycle follow ordinary logical component ancestry;
they are not determined by execution root. A page-root child rendered by a
remote parent can therefore consume contexts provided above or by that remote
parent while retaining page-root protocol routing.

The runtime captures the active component domain whenever it creates a VNode.
Returned islands inherit the root and client association of the operation that
created them while receiving their logical parent normally. Context packages
provided by the host to the remote resolve to the same module instance so
provider and consumer use the same context keys.

The runtime therefore records two independent relationships:

```text
logical component parent
  -> context, reactivity, lifecycle, events, and reconciliation

component domain
  -> execution root, client root, protocol IDs, batching, and transport
```

Disposal removes the client root and prevents late responses from recreating
islands under a dead component instance.

## Ordinary cross-root children

There is no microfrontend-specific placement primitive. Page and remote
components exchange ordinary VNodes through `children` or named props:

```tsx
export function BrandedApplicationRoute(this: Component<{}>) {
	return () => (
		<RemoteComponent
			binding="acmeBrand"
			props={{
				navigation: <ApplicationNavigation />,
				content: <ApplicationOutlet />,
				account: <CurrentAccountMenu />
			}}
		/>
	);
}
```

The remote component renders those values normally:

```tsx
export function BrandedShell(
	this: Component<{}>,
	props: {
		navigation: Child;
		content: Child;
		account: Child;
	}
) {
	return () => (
		<main>
			<BrandHeader>
				{props.navigation}
				{props.account}
			</BrandHeader>
			{props.content}
		</main>
	);
}
```

The page-created VNodes retain their page component domain. They nevertheless
become ordinary logical children at the positions where the remote renders
them. Consequently:

- they inherit contexts through the resulting logical tree, including contexts
  provided by the remote parent;
- their actions and refreshes use the page execution root and page transport;
- remote children around them use the remote execution root and client;
- the remote parent may reorder, stop rendering, or unmount them normally;
- a protocol replacement of ancestor DOM detaches but does not dispose their
  component instances; the remote parent's next reconciliation renders the
  still-present prop and reattaches the existing instance;
- omitting them from an ordinary logical render performs normal unmount and
  cleanup; and
- protocol patches match execution-root ownership and cannot target another
  root's interior merely because it is physically nested.

Nested remote components follow the same rule by establishing another component
domain. No microfrontend-specific context, hydration, event, request, patch, or
disposal path is required.

## Branding and controls

A branding application is a primary reference use case. It may expose:

```text
./Shell
  -> route-level client-rendered remote layout
  -> ordinary children or named VNode props
  -> theme styles and assets
```

The shell may establish CSS custom properties on its root. Cross-root children
inherit those variables through normal DOM styling and receive contexts through
ordinary logical ancestry.

```css
.brand-shell {
	--color-primary: #6d3af2;
	--control-radius: 0.5rem;
	--font-body: 'Acme Sans', sans-serif;
}
```

Shared control libraries remain ordinary provided packages or page
dependencies. The microfrontend runtime does not define a component registry.

## Build compatibility and recovery

Every remote request carries the loaded module's Git-SHA build key in the
framework-owned `X-Exact-Build` header. Remote application code does not set or
change it. A remote `ExactClient` is fixed to one binding and build key, and the
build key participates in its batching key.

The component host maintains a server-owned mapping from supported build keys
to compatible root-relative executor registrations. The mapping may retain
several builds in one process, route keys to retained deployments, or alias
several known-compatible keys to one executor. This policy belongs to the
remote application and its deployment system. Resolving a build key must never
perform filesystem lookup, dynamic module import from browser input, or URL
selection.

An absent, malformed, unknown, or retired build key fails before action,
boundary, batch, or stream dispatch. A well-formed key that is no longer
supported returns one reserved top-level response:

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{"error":"exact_build_unsupported"}
```

The page gateway does not interpret or replace that response. The issuing
remote client recognizes the status and machine-readable error. The component
host resolves availability when each request begins. An already accepted request
or NDJSON stream may finish if its process can complete it, or may fail if the
deployment disappears; eXact does not pin deployments, guarantee completion,
resume remote work on another build, or roll back work already performed. Later
requests using the unavailable build are expected to fail and enter recovery.

### Proactive preferred-build replacement

A component host may advertise a recommended build on any final eXact response:

```http
X-Exact-Preferred-Build: 8a1fbc2d...
```

The value is a different full Git commit SHA. It means "preferred," not
"newer": Git SHAs have identity but no ordering semantics. The header is an
optional hint rather than an upgrade command. The page gateway forwards it as an
ordinary trusted end-to-end header without interpreting it, and it never accepts
a client-entry URL from the component response.

The component host advertises only a build that its deployment currently
accepts. Choosing that preferred build is component-host deployment policy; the
framework never compares or orders SHAs. An application may omit the header when
it cannot identify a safe candidate. The hint may also accompany
`410 exact_build_unsupported` to direct the bounded recovery attempt.

The issuing remote client validates and records the hint, then asks the
page-owned binding's optional `resolveClientEntry(preferredBuild)` for a
browser-safe entry. Without a resolver or resolvable entry, the client ignores
the hint and continues using its current build. Repeated hints for the same
`{ binding, currentBuild, preferredBuild }` join or reuse one coordinator;
advertising the current build is a no-op.

When an entry is resolvable, the coordinator prepares it in the background while
the current build remains active. Preparation uses the same module-shape,
provided-package, root, and build-key validation as unsupported-build recovery
and requires the loaded module to report the advertised key. A preparation
failure leaves the current roots untouched.

The proactive commit waits until every affected instance using the current
`{ binding, buildKey }` is settled: it has no outstanding requests, batches, or
streams. Once the group is settled, the coordinator atomically closes its old
generation to new work and runs the ordinary root replacement transaction. A
response header received at the start of an NDJSON stream may begin preparation,
but the stream must finish before commit. Continuous work may postpone the
upgrade indefinitely; the framework does not interrupt it merely to follow a
hint. If the old build becomes unavailable first, `410` recovery takes over and
may use the already prepared preferred entry.

Unsupported-build recovery is coordinated by `{ binding, buildKey }` and treats
`RemoteComponent` as an HMR-like acceptance boundary for one whole remote entry.
It does not patch arbitrary modules or preserve remote-local state. Concurrent
instances using the stale pair join one replacement coordinator.

```text
receive exact_build_unsupported
  -> mark the loaded build stale and stop new work
  -> prepare: resolve or refetch clientEntry at a new module URL
  -> prepare: require a different build key and validate the complete module
  -> commit: fence late results and abort owned pending work
  -> commit: detach still-supplied page-domain descendants
  -> commit: dispose stale remote roots, clients, effects, and registrations
  -> commit: mount new roots from current props and captured logical parents
  -> commit: reattach page-domain descendants that the new roots render
```

Native browser ESM modules cannot actually be removed from the module cache.
"Eject" means that eXact stops using the module, disposes its roots and
registrations, and fences its results. Refetch requires either a different
immutable `clientEntry`, a page-owned binding resolver that returns one, or a
framework cache-busting import of a deployment-declared stable entry. If the
page cannot discover a different entry in place, it may perform a full document
reload so fresh bootstrap configuration selects the current artifact. A new URL
is required because re-importing an already evaluated native ESM URL does not
reload it.

Recovery is bounded. Only one automatic replacement attempt runs for a stale
`{ binding, buildKey }`; concurrent instances join it. The replacement module
must report a different build key. A repeated unsupported response, load
failure, or unchanged key leaves the affected remote areas on their host-owned
fallback rather than entering a reload loop. A full-document reload is an
explicit page-application policy, not a second automatic framework attempt.
If the unsupported response advertises a valid preferred build, recovery tries
that page-resolved entry first; the hint does not increase the attempt limit.

Preparation does not mutate the active roots. The coordinator loads the new
entry, resolves provided packages, validates its
`{ buildKey, root, component, registration }` shape, and prepares registrations
before commit. Old UI may remain visible while preparation runs, but its stale
client cannot issue new server work. Commit is generation-fenced and atomic from
the renderer's perspective: no new-generation patch or event may run against
old-generation ownership, and late old-generation results are ignored.

Build replacement follows the same logical-versus-DOM ownership rule as
structural patches. Host-domain VNodes supplied through current props remain
owned by the page, may be temporarily detached while stale remote-domain
instances are disposed, and reattach beneath the replacement remote root if it
renders them again. Their component identity, state, effects, execution domain,
and page-owned external state survive. Their internal logical-parent link changes
at commit. Explicit context lookups made after commit and descendants created
after commit use the new ancestry. Context handles captured before replacement
are ordinary values and are not retroactively rebound to a new provider.

All remote-owned component instances, reactive state, effects, requests,
registrations, and DOM are disposed and recreated. The replacement does not
promise to preserve remote-local state, DOM identity, refs, focus, selection, or
scroll. DOM refs into replaced output are invalidated before removal and rebound
only if ordinary mounting creates a corresponding new target. Accepted server
work that completed before the unsupported-build signal is not rolled back.

## Security and gateway logging

The page host is the authoritative public audit point. Its gateway needs only a
small set of bounded rejection reasons:

- `binding_unknown`;
- `request_malformed`;
- `request_oversized`;
- `build_key_malformed`;
- `upstream_invalid_response`;
- `upstream_failure`.

If the component host rejects an internal root, action, or boundary ID, the
page host may log the binding, remote status, and coarse outcome. The component
host records the detailed rejection.

Logs and metric labels exclude request payloads, cookies, tokens, arbitrary
URLs, rendered data, and unbounded user-controlled strings.

Both hosts use the same existing `/__exact` configuration surface for request
contexts, authorization, and CSRF validation. They may configure those hooks
differently; the page app validates the public request, while the component app
validates the request it receives from the gateway. The remote-component
protocol adds no authentication hook of its own.

The gateway's one additional policy hook transforms the validated page request
before it is forwarded. It may preserve explicitly approved credentials,
selectively forward cookies, exchange a browser session for an internal token,
or add workload identity. With no transform, the default gateway removes
browser cookies and authorization rather than forwarding them blindly. The
transform cannot change the server-resolved destination, restore
`X-Exact-Binding`, detach cancellation, or bypass gateway limits.

The build key is not a credential. Browser input can forge it, so the component
host still authenticates and authorizes every request and allowlists every
resolved operation. Both gateway and component host enforce a bounded key
syntax, avoid raw keys in unbounded log or metric labels, and fail closed. The
forwarding transform cannot change, remove, or synthesize `X-Exact-Build` for a
remote request.

### Trusted upstream responses

The component host is a trusted part of the application, so the gateway does
not impose a response-header allowlist. It uses the configured standards-
conforming `fetch` with `redirect: "follow"` and accepts Fetch's ordinary
redirect behavior and built-in redirect limit. eXact defines no manual redirect
loop, per-binding redirect count, per-hop destination policy, or per-hop
forwarding transform. A configured custom `fetch` may implement additional
infrastructure policy outside this contract.

The forwarding transform runs once on the initial server-resolved request.
Remote applications should use redirect statuses appropriate for a POST exact
request; `307` and `308` preserve its method and body. Only the final response
is visible to the gateway. Intermediate headers and cookies are not guaranteed
to reach the browser or a later redirect hop, so cookies intended for the page
must be present on the final response.

The gateway returns the final upstream headers through the runtime's native
response facilities, including `X-Exact-Preferred-Build`, `Set-Cookie`,
`WWW-Authenticate`, `Retry-After`, and application-defined headers. It removes
only hop-by-hop or stale framing metadata such as `Connection` and headers it
names, `Keep-Alive`,
`Proxy-Connection`, `Transfer-Encoding`, `TE`, `Trailer`, `Upgrade`, and the
upstream `Content-Length`. It also removes upstream `Content-Encoding` when the
configured fetch has already decoded the body. The public adapter reconstructs
correct framing and encoding, and the final cache policy must include
`Cache-Control: no-store`.

Before exposing the final response, the gateway validates only generic eXact
semantics: expected JSON or requested NDJSON content, parseable bounded payloads
or events, and configured response and stream limits. It does not inspect
remote IDs or application data. A final response that cannot truthfully be
handled as an eXact result becomes a bounded `502 upstream_invalid_response`;
Fetch failures, including excessive redirects, use the ordinary bounded
`upstream_failure` path.

## Reliability

- A remote generation retains its loaded client entry and exposure registration.
- A remote generation fixes its Git-SHA build key for its lifetime; batches
  never mix build keys.
- The gateway resolves `X-Exact-Binding` only from trusted page configuration.
- The client suppresses stale responses within the owning isolated root.
- A batch may contain several execution roots but only one transport binding.
- Each batch item retains its issuing client root through result application.
- Browser cancellation propagates through the gateway.
- Redirects use the configured Fetch implementation's standard behavior; the
  gateway owns no separate redirect state machine.
- Gateway and component hosts enforce request, response, stream, concurrency,
  and execution limits.
- Timeout or cancellation does not imply rollback.
- Deployment retirement may fail already accepted work; eXact does not pin or
  resume it on another build.
- Work across roots or bindings is not atomic.
- Failure is contained by the affected remote area or component boundary.
- An unsupported build response is forwarded unchanged and triggers one
  coordinated, generation-fenced reload attempt for all affected instances.
- A valid preferred-build hint may prepare a replacement in the background, but
  commits only after the affected old-build instances are settled.
- A missing or invalid client loader renders the configured boundary
  fallback rather than partially hydrating.

## Current foundations

The repository already provides important lower-level pieces:

- compiler client/server artifact generation and package conditions;
- compiler-attached client and server component descriptors;
- SSR strings, progressive streams, and hydratable boundaries;
- the runtime-neutral `/__exact` action and refresh handler;
- manifest-based dispatch allowlisting;
- optional application authorization and CSRF hooks;
- request, response, batch, patch, stream, and graph limits;
- abort propagation and request-scope cleanup;
- client island hydration and late registration;
- per-operation endpoint routing;
- stale-response suppression;
- patch target validation within a hydration root;
- trusted plugin discovery, configuration projections, lifecycle, and output
  extensions.

These are foundations rather than the complete microfrontend feature.

## Existing-model evolution is part of the feature

This is an evolutionary framework feature, not an adapter constrained to the
current protocol and runtime shapes. The implementation is expected and
authorized to extend existing models where the new ownership pattern requires
it. Finding that a current type or lifecycle lacks one of these concepts is
confirmation of planned work, not an architectural objection by itself.

Specifically, the implementation will:

- add build and execution-root identity to invocation, batching, manifest,
  dispatch, pending-operation, and patch-ownership models;
- separate the component application's one request/security lifecycle from the
  selected build's root-relative manifest and handler tables, so a mixed-root
  batch still has one request context, authorization pass, CSRF pass, limit set,
  response state, and cleanup lifecycle;
- add immutable component domains plus an internal reparentable logical-owner
  link;
- add renderer parking and reactive effect-scope transfer so a foreign-domain
  instance can survive temporary ancestor replacement without being stopped by
  the old parent's teardown;
- add response metadata, client activity accounting, generation admission, and
  stale-generation fencing for preferred-build and unsupported-build recovery;
- generate browser-loadable remote entries and browser-safe binding resolver
  imports through bundler adapters; and
- adapt existing response plumbing as necessary to return native upstream
  headers while reconstructing only transport framing.

These changes should extend the existing request handler, renderer, reactive
scope tree, context lookup, hydration client, compiler output, and plugin
adapters. They do not justify parallel protocols, a second endpoint, a new
deployment system, or a separate microfrontend renderer.

## Implemented core evolution

### Minimal exposure loader

The plugin now generates the single
`{ buildKey, root, component, registration }` module required by
`RemoteComponent` and a component-host executor registration keyed by build and
root. Executor handler supply is root-relative so colliding local IDs remain
unambiguous while registrations are constructed.

### Component-domain propagation

VNodes and component instances carry an immutable execution-root and concrete
client-root domain. Core, DOM, hydration, portals, dynamic VNodes, and deferred
island construction preserve it without deriving ownership from bundle or DOM
position.

### Root-relative protocol

`ExactInvocationRequest`, batch validation, retained-build dispatch, and client
batching carry an execution root per operation. Results remain unchanged and
inherit ownership from their pending operation. Compatible operations from
several roots can share one batch without sharing root-relative ID namespaces.

### Exposure compilation

The compiler selects the graph reachable from each explicit exposure root while
the microfrontends plugin emits independently loadable canonical ESM entries.
Selection stays at module granularity so the native bundler retains
tree-shaking authority.

### Client-root registration

Each remote instance creates its own `ExactClient`, root-relative registration,
request association, stale-response state, cancellation lifetime, and disposal
boundary. Several instances of one execution root still share ordinary module
cache results.

### Patch ownership

Patch indexing checks the execution-root owner of every target, so a remote
response cannot directly patch a different-root child. When a structural patch
replaces an ancestor containing a foreign-root component, hydration signals the
remote wrapper to rotate its component-domain descriptor. The DOM renderer then
uses its domain-aware parking transaction and effect-scope transfer to remount
the remote descriptor while reattaching still-supplied foreign VNodes without a
false lifecycle pair.

### Uniform remote-artifact build integration

The common artifact pipeline and Vite/Rollup reference adapter now:

- externalize mandatory eXact packages from remote exposure graphs;
- accept additional configured provided-package import keys;
- publish those package instances from the page bootstrap before hydration;
- bind externalized remote imports to exact-key registry lookup while retaining
  static import information;
- inject exposure entries and discover emitted client-entry paths;
- normalize lazy-chunk bases and extracted-style loading;
- define exact-key matching consistently; and
- validate Vite/Rollup output against the canonical artifact contract.

Focused Webpack entry/module-factory and Bun `onResolve`/`onLoad` mappings prove
that the same frozen artifact plan maps to their native hooks. Complete Webpack
and Bun adapters, producer/consumer conformance, and heterogeneous smoke pairs
remain the planned follow-on milestones and are not prerequisites for the
initial Vite/Rollup feature.

### Asynchronous logical-child construction

`RemoteComponent` captures the page-authored VNodes before loading, then creates
the loaded component beneath an explicit immutable component domain rather than
holding ambient owner state across an `await`. Later islands receive the domain
of their pending operation and their ordinary logical parent.

## Plugin-host integration

The implementation uses existing plugin discovery, typed configuration,
compiler/server/client projections, lifecycle, and output processing directly.
The Vite plugin discovers `@exactjs/microfrontends`, prepares the artifact graph,
injects page package publication before the normal page entry, and emits remote
entries without adding a generalized plugin-host contribution API.

## Implementation phases

### Phase 1: add root-relative requests and dispatch

Add tests and protocol types for:

- compiler-generated page and exposure execution-root identity;
- an execution root on each action or refresh operation;
- batches containing operations from several roots under one binding;
- component-host dispatch by `(build key, root, local ID)`;
- framework-owned `X-Exact-Binding` and `X-Exact-Build` routing metadata;
- one public `/__exact` endpoint with binding-header removal and transparent
  protocol-payload forwarding;
- per-client-root state and root-aware patch application;
- opaque internal action, boundary, island, and patch IDs;
- ordinary cross-root children and nested remote domains.

Use a fake page host and two fake private component hosts. Prove that both may
use identical local IDs without interference.

### Phase 2: add exposure builds and provided packages

- Implement explicit exposure configuration and graph isolation.
- Generate the minimal client loader and build-keyed, root-relative
  component-host manifest.
- Embed the full Git commit SHA into both the client loader and its compatible
  component-host executor registration.
- Automatically externalize mandatory eXact packages.
- Externalize additional configured provided packages by import key.
- Generate page-bootstrap registration of actual provided module instances.
- Reject standalone, fixture, development-provider, and unrelated exposure
  dependencies from the exposure graph.

### Phase 3: add component-domain runtime support

- Propagate immutable domains through VNode creation, components, portals,
  dynamic VNodes, and hydration.
- Reuse `ExactClient` for per-client-root requests, state, cancellation, stale
  suppression, and disposal.
- Implement exact-key provided-package registration and lookup.
- Fail a remote boundary cleanly when a configured provider is missing.
- Capture the host component owner while loading and render the remote entry as
  its ordinary logical child.
- Associate the remote entry with its execution root and client root.
- Constrain protocol patch resolution to the operation's execution root while
  retaining ordinary parent reconciliation across roots.
- Preserve foreign-root component instances when a protocol patch replaces
  ancestor DOM by transferring their effect scopes to a parking scope, then
  reconcile the issuing root so still-present VNode props reparent and reattach
  those instances without retroactively rebinding captured context handles.
- Hydrate newly returned remote islands with the root of their pending operation
  and their ordinary logical parent.
- Prove that disposal prevents late work from recreating remote islands.

### Phase 4: implement the plugin and gateway

- Add only the build, server-handler, and client-bootstrap hooks required by the
  first implementation.
- Add producer `exposes` and consumer `remotes` configuration.
- Add mandatory eXact provided-package defaults and a configurable list of
  additional provided-package import keys.
- Publish page module instances before hydration and diagnose missing runtime
  keys during remote loading.
- Project `clientEntry` plus any statically imported browser resolver module to
  the browser and retain `endpoint` on the server.
- Resolve binding names only against trusted page configuration.
- Implement `RemoteComponent`.
- Implement page-host binding resolution as an alternate dispatch branch after
  the existing `/__exact` request-context, authorization, and CSRF hooks.
- Preserve the validated framework-owned build header through the gateway and
  add component-host build-key selection before root-relative dispatch.
- Add only the forwarded-request transform for credential translation and
  other application-specific upstream request policy.
- Use standard Fetch redirect following, preserve trusted final end-to-end
  headers, and reconstruct only transport framing after generic exact response
  validation.
- Preserve cancellation and emit bounded blocked-request logs.

### Phase 5: implement the uniform artifact pipeline

- Implement the plugin-owned remote artifact plan, canonical module generators,
  and conformance validator.
- Retain concrete native-hook mappings for Vite/Rollup, Webpack, and Bun so the
  common contract is known to be implementable across supported bundlers.
- Complete focused feasibility spikes for all three mappings before freezing
  the internal adapter boundary; these are not production adapter
  implementations.
- Implement Vite/Rollup as the reference adapter and use it to prove the small
  internal adapter boundary.
- Treat Webpack and Bun as follow-on adapter milestones against the same frozen
  artifact plan rather than initial feature dependencies.
- Prove provided imports resolve to the page's actual exported values without
  disabling tree-shaking for non-provided modules.
- Prove normal module-relative lazy chunks, extracted styles, and other assets
  load from each remote entry.

### Phase 6: prove composition end to end

- Build page, billing, and branding fixture applications.
- Pass page-host navigation, content, and account controls as ordinary VNode
  props rendered by the branding shell.
- Verify CSS-variable inheritance and reactive theme changes.
- Verify mixed-root batching, context propagation, patch confinement,
  cancellation, fallback, and disposal.
- Verify retained and retired build keys, unchanged `410` forwarding, bounded
  client recovery, preferred-build hints, settled proactive replacement, and
  coordinated remounting of simultaneous instances.
- Prove the initial vertical slice with Vite/Rollup page and remote builds plus
  the bundler-neutral plain-ESM harness. Add heterogeneous page/remote pairs as
  each follow-on adapter becomes implemented.

## Acceptance criteria

- One public page host composes at least two independently running private
  eXact component hosts.
- The browser sends all local and remote actions through the page host's single
  `/__exact` endpoint.
- The page host forwards a remote request without knowing the remote bundle's
  internal IDs or component graph.
- The framework-created remote client sends `X-Exact-Binding` and its generated
  `X-Exact-Build` to the page host's `/__exact`; remote bundle code never
  selects or contacts the component host directly.
- The page host rejects unknown bindings, removes the binding header before
  forwarding, and preserves the trusted final status, eXact payload, and
  end-to-end headers while reconstructing transport framing.
- Every remote request carries its Git-SHA build key; the page gateway
  preserves it, and the component host dispatches only through a supported
  build registration.
- Page and component hosts independently apply their existing `/__exact`
  request-context, authorization, and CSRF configuration to the requests they
  receive.
- Browser credentials are not forwarded by default; an application forwarding
  transform can explicitly retain or replace them without changing routing or
  bypassing limits.
- Standard Fetch redirect behavior is used without an eXact redirect policy;
  the trusted final response preserves end-to-end headers such as `Set-Cookie`
  while hop-by-hop and stale framing headers are reconstructed.
- A retired build produces `410 exact_build_unsupported`; the page forwards it
  unchanged and the client performs at most one coordinated replacement
  attempt with a different key.
- A component host may advertise a preferred build key without supplying a
  script URL; the page-owned binding resolves its public entry, prepares it in
  the background, and replaces affected roots only after they are settled.
- One binding-routed batch may contain operations for several execution roots;
  the component host dispatches each `(build key, root, local ID)` independently.
- Page and remote execution roots may use identical local action, island,
  boundary, and patch IDs without collision.
- Every client component instance has one immutable component domain.
- A page-created child rendered by a remote retains page-root protocol routing
  while participating normally in the remote logical tree.
- Protocol patches cannot leave the issuing client root or enter a
  different-root child's interior.
- Replacing ancestor DOM does not dispose a nested different-root component;
  if its VNode remains in the parent's logical output, the existing instance
  reattaches during reconciliation.
- Initial page SSR contains only the host-owned remote placeholder; the remote
  subtree is loaded and mounted client-side.
- Remote bundles omit mandatory eXact packages and configured provided packages.
- The page bootstrap publishes each configured provider before hydration.
- A remote import resolves by exact configured key to the actual page module
  instance.
- The artifact plan and documented native-hook mappings cover Vite/Rollup,
  Webpack, and Bun without requiring their runtimes in the browser contract.
- Focused feasibility checks prove all three can implement entry injection,
  provider resolution, ESM output discovery, chunks, and assets before the
  adapter boundary is frozen.
- Vite/Rollup proves the initial production adapter and ordinary ESM module
  shape. Each later adapter must pass the same producer and consumer conformance
  suite before it is advertised as supported.
- Once two adapters are implemented, a page built by either can load a remote
  produced by the other through ordinary browser ESM.
- A page host and component host running on different supported server runtimes
  interoperate through the unchanged HTTP protocol.
- Non-provided remote dependencies retain ordinary tree-shaking, and narrow
  provided subpaths do not retain unrelated package subpaths.
- Each remote entry resolves its own chunks, extracted styles, fonts, and images
  from its entry URL or configured public base.
- A missing configured provider fails only the affected remote boundary and
  renders the host-owned fallback.
- Reactive props update across the shell/remote component boundary, and page
  contexts remain visible in the remote root and subsequently created remote
  islands.
- No live reactive object is assumed to cross a server boundary.
- Cross-root children render, hydrate, react, reroute operations, and dispose
  through ordinary component behavior without a special placement runtime.
- A branding bundle supplies a shell while ordinary provided packages or page
  dependencies supply shared controls.
- Gateway rejection logs contain bounded reason codes without secrets or
  request payloads.
- Cancellation, streaming, limits, failure fallback, and cleanup pass
  integration tests.

## Final agreement

The trusted microfrontend feature is an official plugin built on a small set of
new core primitives.

The core identity model is:

```text
compiler-generated execution root
  + full Git commit SHA for client/executor compatibility
  + concrete client root for DOM and request lifetime
  + immutable VNode/component association with both
```

The request model is:

```text
one public /__exact endpoint
  -> each operation carries its execution root
  -> ExactClient carries its loaded X-Exact-Build
  -> validate X-Exact-Binding and bounded build-key syntax
  -> strip the binding header and preserve the build header
  -> forward root-relative ordinary eXact protocol
  -> component host dispatches each (build key, root, local ID)
  -> return the ordinary result or stream unchanged
  -> issuing ExactClient applies only within its isolated root
  -> preferred build may prepare in the background and commit when settled
  -> unsupported build triggers one bounded client replacement attempt
```

The client model is:

```text
page VNodes begin in the page component domain
  -> page bootstrap has already published provided packages
  -> generated remote loader resolves externalized imports by key
  -> RemoteComponent establishes the remote component domain
  -> every new VNode captures its active domain
  -> ordinary cross-root children retain their originating domains
  -> context and lifecycle follow the logical tree
  -> protocol IDs and batching follow the component domain
  -> a preferred build replaces the whole root only after old work settles
  -> an unsupported build prepares and atomically commits a whole-root replacement
```

The dependency model is:

```text
mandatory eXact packages: provided by the page
configured application packages: provided by the page
all other packages: bundled normally with the remote
runtime package version negotiation: none
```

This keeps the page host independent of remote bundle internals while retaining
central routing, security, observability, binding control, live browser
reactivity, inherited contexts, and reliable DOM ownership. Remote areas remain
client-loaded; this plan does not introduce cross-application initial SSR.

The normal-composition rule is:

> A parent may render, reorder, or remove an ordinary child from another
> execution root. The child retains its own protocol domain, but receives no
> special preservation or DOM immunity from ordinary reconciliation.

## Detailed implementation plan

This section turns the architecture into an execution plan against the current
repository. It deliberately establishes the smallest complete vertical slice
before adding broader bundler support. It refines the earlier high-level
implementation phases; when
sequencing differs, this detailed delivery order controls.

The first usable milestone is:

```text
explicit exposure root
  + generated client loader and build-keyed executor manifest
  + page-bootstrap provided packages
  + immutable execution domains on VNodes and component instances
  + RemoteComponent with a concrete ExactClient root
  + X-Exact-Binding routing and X-Exact-Build compatibility selection
```

### Current foundations to reuse

The implementation should extend these existing facilities rather than create
parallel systems:

| Existing facility                                             | How the implementation uses it                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createExactClient(container, options)` in `@exactjs/hydrate` | Creates the concrete remote client root. Its existing `endpoint`, `headers`, batching, cancellation, patching, stale-response handling, registration, and disposal behavior cover most remote-instance lifecycle requirements. |
| Header-aware batching in `packages/hydrate/src/batching.ts`   | `X-Exact-Binding` already separates component hosts. Add `X-Exact-Build` to prevent different builds from sharing a queue while compatible roots continue to batch.                                                            |
| `ExactClient.registerManifest()`                              | Registers the generated remote island registry, state contracts, and action boundaries after the loader arrives.                                                                                                               |
| Container-relative `applyPatches()`                           | Confines remote patches to the remote area's DOM container.                                                                                                                                                                    |
| Existing compiler artifact graph and registry generation      | Produces the remote root's client islands and executor allowlists from an explicit exposure root.                                                                                                                              |
| Existing `/__exact` request handler                           | Remains the endpoint on both hosts. Its existing request-context, authorization, CSRF, parsing, and limit stages run before either local dispatch or page-host forwarding.                                                     |
| Existing server adapters                                      | Continue adapting the same handler to Fetch, Express, Hapi, and other platforms; they do not acquire separate microfrontend authentication hooks.                                                                              |
| Existing component tasks and abort ownership                  | Load a remote entry on the client and cancel loading and requests when `RemoteComponent` unmounts.                                                                                                                             |
| Existing global context tokens and component parent links     | Preserve ordinary context lookup even when parent and child carry different execution roots.                                                                                                                                   |

### Expected package and file changes

The names below describe the expected ownership. Exact filenames may be
adjusted while implementing, but responsibility should not drift between
packages.

| Area                                              | Expected changes                                                                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/descriptors.ts`                | Add the minimal exposure descriptor types and reader needed to identify a generated execution root. Do not replace the existing client/server descriptor tuple format merely to support microfrontends.                                                   |
| `packages/core/src/vnode.ts` and component types  | Add immutable component-domain metadata to VNodes and component instances. Capture the active domain during VNode creation and preserve an explicit domain on passed children.                                                                            |
| `packages/core/src/component/*`                   | Add concurrency-safe helpers for running VNode creation under a domain, capturing the logical parent after asynchronous loading, and updating the internal logical-parent link during an identity-preserving reparent.                                    |
| `packages/reactive/src/internal/scopes.ts`        | Add an internal checked effect-scope transfer operation used to park a retained foreign root before old-parent teardown and attach it to the reconciled parent without stopping its effects.                                                              |
| `packages/dom/src/renderer/*`                     | Preserve domains through components, dynamic values, portals, reconciliation, and teardown. Add child-root mount, generation-fenced replacement, parking-scope transfer, ref invalidation, reconcile, reattach, and idempotent cleanup.                   |
| `packages/dom/src/ownership.ts`                   | Make execution-root ownership queryable for direct patch validation and enumerate foreign-root instances under an ancestor replacement without treating DOM removal as logical unmount.                                                                   |
| `packages/hydrate/src/types.ts`                   | Add execution-root and issuing-client metadata to invocation and pending-operation types. Existing `headers` support carries both binding and build-key transport metadata.                                                                               |
| `packages/hydrate/src/runtime/client.ts`          | Associate operations with the invoking component domain, add the immutable build header, recognize unsupported-build responses and preferred-build hints, track settled state, retain per-client-root result application, and fence replaced generations. |
| `packages/hydrate/src/islands.ts`                 | Construct returned islands with the execution root retained by their pending operation and their ordinary logical parent.                                                                                                                                 |
| `packages/hydrate/src/batching.ts`                | Put the invoking root on each operation, include build key in queue compatibility, allow several roots in one compatible binding/build queue, and retain the issuing client root on every pending item.                                                   |
| `packages/hydrate/src/provided-packages.ts`       | Add the small exact-key registry used by page bootstrap publication and remote import resolution.                                                                                                                                                         |
| `packages/compiler/src/registry.ts`               | Generate an exposure-specific hydration registration and client loader containing the build key. Reuse descriptor composition and island registry generation.                                                                                             |
| `packages/compiler/src/compilation/*`             | Accept an explicit exposure build root and retain only artifacts reachable from that root.                                                                                                                                                                |
| `packages/server/src/types.ts` and `protocol.ts`  | Add required execution roots and allow mixed-root batches. Leave result bodies and streams unchanged; adapt response plumbing only as needed to return native upstream header values without a microfrontend-specific response schema.                    |
| `packages/server/src/manifest.ts` and dispatch    | Register supported build keys with root-relative manifest and handler tables, then interpret local IDs relative to `(build key, execution root)`. Resolve availability per request without deployment pinning or cross-build resumption.                  |
| `packages/server/src/gateway.ts`                  | Add binding lookup, build-header preservation, the request transform, standard Fetch redirects, trusted final-header forwarding including preferred-build hints, framing reconstruction, generic validation, and existing limits/abort behavior.          |
| `packages/server/src/runtime/request-handler.ts`  | Keep one component-application request/security lifecycle, select local or binding-routed dispatch, resolve one build before operation dispatch, select root tables per item, advertise a preferred build when configured, and return `410` when absent.  |
| `packages/server/src/index.ts` or runtime exports | Export the gateway configuration and transform types. Ordinary applications without gateway configuration retain current `handleExactRequest()` behavior.                                                                                                 |
| Server framework adapters                         | Return final upstream headers through native response facilities, remove only hop-by-hop and stale framing fields, reconstruct body framing correctly, and retain streaming cancellation.                                                                 |
| `packages/plugin-api` and `packages/plugin-host`  | Change only if the first direct adapter proves a specific missing hook. Do not design a generalized contribution system in advance.                                                                                                                       |
| New `plugins/microfrontends` plugin               | Implement the plugin, artifact planner, Git-SHA embedding, wrappers and bridges, adapter contract, `RemoteComponent`, preferred-build and stale-build replacement coordination, binding projections, gateway, and diagnostics.                            |
| `framework-adapters/vite-plugin`                  | Map artifact plans to Rollup inputs, statically import configured client resolver modules into the generated binding projection, provide virtual modules and output discovery, and normalize development URLs, chunks, styles, and assets.                |
| `framework-adapters/webpack-plugin`               | Follow-on: map the frozen plan to entries, module-factory or external hooks, ESM output, chunk bases, and emitted assets. Module Federation may remain an internal implementation detail.                                                                 |
| `framework-adapters/bun-plugin`                   | Follow-on: map the same plan to build entrypoints, `onResolve`/`onLoad` virtual modules, and output discovery.                                                                                                                                            |
| `packages/testing` and integration fixtures       | Add the canonical plain-ESM harness and Vite fixtures initially; add each later adapter's conformance fixtures and selected cross-bundler pairs when that adapter is promoted.                                                                            |

### Phase 1: define the minimal public contracts

Add shared types to `@exactjs/microfrontends`:

```ts
export type ExactRemoteExposureConfig = {
	component: string;
};

export type ExactRemoteBindingConfig = {
	endpoint: string;
	clientEntry: string;
	clientEntryResolver?: string;
};

export type ExactMicrofrontendConfig = {
	exposes?: Readonly<Record<string, ExactRemoteExposureConfig>>;
	remotes?: Readonly<Record<string, ExactRemoteBindingConfig>>;
	providedPackages?: readonly string[];
};
```

The first version should use exact import keys. Package roots do not implicitly
cover subpaths:

```ts
providedPackages: [
	'@company/app-contexts',
	'@company/design-system',
	'@company/design-system/Button'
];
```

If a remote imports `@company/design-system/Button`, configuring only
`@company/design-system` does not externalize it. This keeps build behavior
deterministic and avoids package export-map inference.

The plugin adds mandatory eXact client keys internally. Application code does
not repeat them:

```text
@exactjs/core
@exactjs/dom
@exactjs/hydrate
@exactjs/reactive
@exactjs/jsx/jsx-runtime
```

Add or remove a mandatory key only when the emitted remote graph actually uses
that package.

`@exactjs/router` is intentionally absent from this mandatory set. If the page
shell already uses it and a remote imports it, the application will normally
add `@exactjs/router` to `providedPackages` to reuse the loaded module and avoid
duplicate code. Router-free applications have no router-specific requirement.

#### Producer configuration example

An independently runnable billing application exposes one authored eXact
component root:

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	plugins: {
		microfrontends(config) {
			config.exposes = {
				'./BillingArea': {
					component: './src/BillingArea.tsx'
				}
			};

			config.providedPackages = ['@company/app-contexts', '@company/design-system'];
		}
	}
});
```

This does not expose every export from `BillingArea.tsx` or every component in
the billing application. Only the configured root and its reachable artifact
graph participate.

#### Page-host configuration example

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	plugins: {
		microfrontends(config) {
			config.remotes = {
				billing: {
					endpoint: 'http://billing.internal/__exact',
					clientEntry: 'https://cdn.example.com/billing/entry.js',
					clientEntryResolver: './src/billing-client-entry.ts'
				}
			};

			config.providedPackages = ['@company/app-contexts', '@company/design-system'];
		}
	}
});
```

The plugin derives two projections from this configuration:

```ts
// Browser-safe projection emitted into the page bundle.
import resolveBillingEntry from './src/billing-client-entry.ts';

const clientBindings = {
	billing: {
		clientEntry: 'https://cdn.example.com/billing/entry.js',
		resolveClientEntry: resolveBillingEntry
	}
};

// Server-only gateway projection.
const serverBindings = {
	billing: { endpoint: 'http://billing.internal/__exact' }
};
```

The private endpoint must never appear in browser bootstrap data, client logs,
or the generated remote loader.

The public protocol types add the execution root independently of the transport
binding:

```ts
export type ExactInvocationRequest = {
	type: 'action' | 'refresh';
	root: string;
	id: string;
	// Existing operation fields remain unchanged.
};

export type ExactBatchRequest = {
	type: 'batch';
	version?: 1;
	operations: ExactInvocationRequest[];
};
```

Results and stream events remain unchanged. Each pending operation retains its
root and issuing client until result validation and patch application. A batch
may contain several roots; its operations still share one binding because the
binding is an HTTP header and part of the transport queue key.

### Phase 2: implement provided-package publication

Add a page-owned registry with deliberately small behavior:

```ts
export interface ExactProvidedPackageRegistry {
	register(key: string, module: unknown): void;
	require(key: string): unknown;
}
```

Rules:

- keys are exact configured import specifiers;
- registering the same key twice with different module objects fails;
- an idempotent repeat with the same object is allowed;
- `require()` throws a bounded diagnostic when the key is absent;
- the registry stores no package versions and performs no compatibility
  negotiation.

The first implementation may store the registry under a framework global
symbol so independently built loaders can reach the same object:

```ts
const registrySymbol = Symbol.for('@exactjs/provided-packages');
```

The page build adapter generates a bootstrap module similar to:

```ts
import * as exactCore from '@exactjs/core';
import * as exactDom from '@exactjs/dom';
import * as exactHydrate from '@exactjs/hydrate';
import * as exactReactive from '@exactjs/reactive';
import * as appContexts from '@company/app-contexts';
import * as designSystem from '@company/design-system';
import { getExactProvidedPackageRegistry } from '@exactjs/hydrate';

const provided = getExactProvidedPackageRegistry();
provided.register('@exactjs/core', exactCore);
provided.register('@exactjs/dom', exactDom);
provided.register('@exactjs/hydrate', exactHydrate);
provided.register('@exactjs/reactive', exactReactive);
provided.register('@company/app-contexts', appContexts);
provided.register('@company/design-system', designSystem);
```

This generated module executes in the existing page entry at the bottom of the
body before the normal hydration call:

```ts
import './generated/exact-provided-packages.js';
import { hydrate } from './generated/exact-hydration.js';

hydrate();
```

No additional network-time package discovery occurs. A configured package not
otherwise used by the page becomes a build root and is included by the page
build as the explicit cost of providing it.

For remote builds, the adapter intercepts the same exact keys during module
resolution and returns virtual modules produced by the common provider-bridge
generator. The generator preserves the statically requested import shape; the
adapter does not invent its own registry semantics. Authored source and
non-provided imports are not rewritten by the microfrontends compiler.

The common bridge generator must explicitly handle default, named, namespace,
and side-effect imports. Dynamic imports and re-exports of a provided key fail
the first build version with a targeted diagnostic. No general container or
bundler share-scope protocol becomes part of the eXact contract.

#### Required tests

- the page publishes before hydration begins;
- each imported value is strictly identical to the corresponding export from
  the page-published module;
- duplicate conflicting registration fails during page bootstrap;
- a missing key fails only the affected `RemoteComponent`;
- two remotes consume the same provided context and reactive runtime objects;
- exact-key subpath behavior is consistent between development and production
  builds;
- unused non-provided dependencies and unused provider-bridge exports are
  removed from remote output; and
- providing a narrow package subpath does not retain unrelated sibling
  subpaths in the page output.

### Phase 3: generate exposure-specific artifacts

Extend the compiler/build adapter to treat each configured exposure as an
explicit build root.

Given this authored eXact component:

```tsx
import { CurrentAccountContext } from '@company/app-contexts';
import { Button } from '@company/design-system';
import type { Component } from '@exactjs/core';

type BillingProps = { accountId: string };

export function BillingArea(this: Component<{}>, props: BillingProps) {
	const currentAccount = this.getContext(CurrentAccountContext);

	this.task.server(async () => {
		// Existing eXact server-component behavior; no remote transport code.
	});

	return () => (
		<section>
			<h1>Billing for {currentAccount.name}</h1>
			<Button>Pay invoice</Button>
		</section>
	);
}
```

the compiler should continue producing ordinary client and server artifacts.
The microfrontends artifact planner selects the graph reachable from
`BillingArea`, generates a canonical client-entry module, and hands that module
to the active bundler adapter as an additional entry:

```ts
import { BillingArea } from './BillingArea.exact.client.js';
import { exactHydrationRegistration } from './BillingArea.registration.js';

export default {
	buildKey: '4eb6d53c9a...',
	root: '@company/billing#./BillingArea',
	component: BillingArea,
	registration: exactHydrationRegistration
} satisfies ExactRemoteModule;
```

The precise generated names are private. The loader's public shape is:

```ts
export type ExactRemoteModule = {
	buildKey: string;
	root: string;
	component: ComponentFunction<any, any>;
	registration: ExactHydrationRegistration;
};
```

The corresponding component-host build uses the existing server artifact
registry and `createExactServerManifest()` behavior to register that same build
key and allowlist only actions and boundaries reachable from that exposure. It
still serves the ordinary private `/__exact` protocol.

Expected compiler work:

1. Resolve the configured component export.
2. Confirm that it is an authored eXact component root.
3. Compute its reachable client/server artifact graph.
4. Generate its stable execution root.
5. Read the full Git commit SHA and embed it into both client and executor
   artifacts. Production builds fail when no commit SHA can be supplied or
   discovered.
6. Generate the exposure-specific hydration registration using existing island,
   state-contract, and action-boundary helpers.
7. Record configured provided-package import usage for bridge generation.
8. Generate the canonical loader and give it to the bundler adapter as an
   independently loadable entry.
9. Emit or select the build-keyed executor manifest for the private component
   host.
10. Report conflicting execution roots, duplicate local IDs inside one root, and
    imports that cannot be emitted for the requested target.

Do not add a second endpoint, a custom remote request body, or a package-version
manifest.

The remote application's server build registers the generated result with its
ordinary `/__exact` handler conceptually as:

```ts
type ExactRemoteRootDispatch = {
	manifest: ExactServerManifest;
	actions?: ExactServerContext['actions'];
	refreshBoundaries?: ExactServerContext['refreshBoundaries'];
};

type ExactRemoteBuildRegistration = {
	buildKey: string;
	roots: Readonly<Record<string, ExactRemoteRootDispatch>>;
};

registerExactRemoteBuild({
	buildKey: gitCommitSha,
	roots: {
		'@company/billing#./BillingArea': billingDispatch
	}
});
```

The concrete registration may be generated or integrated into existing
manifest construction rather than exposed as this exact application API. A
remote deployment is responsible for retaining, routing, aliasing, and retiring
registrations. Browser-supplied keys can only select registrations the server
has already installed.

The component application's ordinary `ExactServerContext` remains authoritative
for the entire HTTP request: request contexts, parsing, limits, authorization,
CSRF, logging, output processing, response state, and cleanup run once. After
those top-level checks, the component host resolves one supported build before
any operation dispatch. Each operation in a mixed-root batch then selects only
its root-relative manifest and handlers from that immutable registration. A
missing build returns the top-level `410` before any batch item begins; this
lookup does not pin the backing deployment or promise that accepted work will
finish.

### Phase 4: add component domains and cross-root child ownership

The page and remote share a real component ancestry while retaining separate
protocol domains. Add an immutable domain:

```ts
type ExactComponentDomain = {
	readonly root: string;
	readonly client: ExactClient;
};
```

The renderer internally captures the logical parent before an asynchronous
loader begins; this does not require a new application-facing owner API.

Add an optional internal domain field to `VNode` and a required immutable domain
to `ComponentInstance`. `createVNode()` captures the active rendering
component's domain. If it receives an already-created VNode as a child, the
renderer preserves that VNode's existing domain.

The renderer applies these rules:

```text
new VNode during page render       -> page domain
new VNode during remote render     -> remote domain
existing page VNode passed remote  -> retain page domain
VNode with no recorded domain      -> inherit logical parent's domain
nested RemoteComponent entry       -> establish nested remote domain
```

Batching must not become component ownership. A queued operation retains its
execution root and the client root that issued it. A shared transport queue may
coalesce operations with different roots when endpoint, headers, fetch
implementation, stream policy, and cancellation policy are compatible.
Each result resolves back to its issuing client, which alone validates and
applies its patches. The initial implementation may keep queues client-root
local until cross-client cancellation semantics are implemented; that is a
performance choice, not a protocol difference.

`RemoteComponent` captures its logical parent synchronously. The asynchronous
loader retains that handle but does not keep a mutable current owner or domain
installed across an `await`.

Add a DOM operation conceptually equivalent to:

```ts
mountExactChildRoot(container, vnode, {
	parent,
	domain,
	signal,
	onErrorReport
});
```

It should reuse the existing renderer root, component instance, error context,
effect scope, and teardown machinery. It assigns the captured component owner
as logical parent and the remote domain as protocol owner.

Thread the domain through `HydrateOptions`. Generated actions and refreshes read
the invoking component instance's domain, add `root` to the protocol operation,
and select the domain's framework-owned client transport:

```ts
const client = createExactClient(container, {
	endpoint: '/__exact',
	headers: {
		'X-Exact-Binding': binding,
		'X-Exact-Build': remoteModule.buildKey
	},
	signal
});
```

Hydration associates later islands with the domain retained by their pending
operation while assigning the island's ordinary logical parent from its render
position.

Structural protocol patches and logical reconciliation have different
lifecycle authority. When a replacement target contains component instances
from another domain, patch application must:

1. enumerate the nested foreign-domain instances before removing their nodes;
2. atomically transfer each retained foreign root's effect scope from the old
   parent to a host-owned parking scope;
3. mark its host output detached and invalidate stale DOM references without
   running component disposal;
4. apply the authoritative replacement for the issuing root;
5. schedule reconciliation of that root; and
6. reattach or rerender each still-present VNode using its existing component
   instance and domain.

If the reconciled parent no longer returns that VNode, ordinary reconciliation
then unmounts and disposes it. Pending operations for a temporarily detached
instance remain associated with its client root, but DOM patches wait for
reattachment or fail as stale rather than targeting removed nodes.

Reattachment updates the instance's internal logical-parent link and transfers
its effect scope from the parking scope to the reconciled parent before work is
admitted again. The transfer must reject cycles and inactive destinations. If
ordinary reconciliation omits the instance or the transaction fails, the
parking scope performs ordinary idempotent unmount and cleanup.

Context lookup follows the updated logical-parent link after reattachment, and
new descendants inherit the new ancestry. A context handle captured earlier by
the preserved component is not retroactively rebound; it remains the same value
the component previously obtained. Supporting transparent rebinding of captured
values would require a separate context-indirection design and is not part of
this feature.

#### Required context and concurrency tests

- a remote root reads a page-provided context;
- a reactive context update rerenders the remote root;
- an island introduced by a later server refresh reads the same context;
- a page-created child rendered by the remote retains the page root;
- that cross-root child can consume a context provided by the remote parent;
- the child's action uses the page transport while its remote sibling uses the
  remote binding;
- batching never transfers result validation or application to another client
  root;
- a remote protocol patch cannot target the page child's interior;
- a remote structural patch may replace an ancestor containing the page child,
  after which the same live child instance reattaches with its state and effects
  intact;
- a response targeting the child's temporarily detached DOM waits for
  reattachment or is rejected as stale;
- temporary detachment and reattachment preserve the child's instance and do
  not emit a false unmount/mount lifecycle pair;
- parking and reparenting transfer its live effect scope before the old parent
  is stopped, while omission disposes the parked scope exactly once;
- explicit context lookup and descendants created after reparenting use the new
  ancestry, while a context handle captured before replacement retains its
  existing identity;
- nested foreign roots detach and reattach as ownership units, with stale DOM
  refs invalidated before replacement;
- an ordinary remote rerender may remove and unmount the page child;
- two concurrent remote loads inherit their own correct parent contexts;
- an aborted load never mounts beneath a reused owner;
- an island arriving after disposal is ignored;
- disposing the host component disposes remote effects, tasks, listeners,
  client requests, and DOM exactly once.

### Phase 5: implement `RemoteComponent`

`RemoteComponent` is an eXact component supplied by
`@exactjs/microfrontends/client`. It owns loading, validation, the concrete client
root, remote component domain, and fallback lifecycle. The remote bundle only
exports compiled component artifacts.

Proposed public API:

```ts
export type RemoteComponentProps<Props extends Record<string, unknown>> = {
	binding: string;
	props?: Props;
	fallback?: Child;
	onError?: (error: unknown) => void;
	children?: Child | Child[];
};
```

Page component example:

```tsx
import { RemoteComponent } from '@exactjs/microfrontends/client';
import type { Component } from '@exactjs/core';

export function BillingPage(this: Component<{}>) {
	return () => (
		<main>
			<h1>Account</h1>
			<RemoteComponent
				binding="billing"
				props={{ accountId: 'acct-42' }}
				fallback={<p>Loading billing…</p>}
			/>
		</main>
	);
}
```

The conceptual component state is:

```ts
type RemoteComponentState = {
	status: 'loading' | 'active' | 'updating' | 'failed';
	generation: number;
	error?: unknown;
};
```

The implementation sequence is:

```text
construct RemoteComponent under page owner
  -> capture owner handle
  -> render host-owned container and fallback
  -> start client task
  -> resolve browser-safe binding
  -> import clientEntry
  -> verify the minimal { buildKey, root, component, registration } module shape
  -> validate bounded build-key syntax
  -> verify all externalized provided-package lookups succeeded
  -> create ExactClient(container, /__exact + X-Exact-Binding + X-Exact-Build)
  -> create remote component domain (root + client)
  -> register generated hydration data
  -> create loader.component VNode under the remote domain
  -> mount it beneath the captured logical parent
  -> replace fallback only after successful mount
```

VNode values supplied in `props` or `children` already carry the domain of the
page component that created them. `RemoteComponent` passes them through without
restamping them. New VNodes created by the loaded component receive the remote
domain.

On failure, `RemoteComponent` keeps or restores the host-owned fallback, aborts
the isolated client, removes provisional DOM, and reports through the normal
eXact error context plus optional `onError` callback.

On unmount, it:

1. aborts the loader task;
2. calls `ExactClient.dispose()`;
3. disposes the mounted child root;
4. prevents late imports, registrations, streams, or patches from reactivating
   the container.

The first implementation should remount when `binding` changes deliberately.
Ordinary changes to `props` should update the mounted remote root through normal
component prop reactivity rather than reimporting the bundle.

The plugin coordinates loaded-module state by `{ binding, buildKey }`. When an
owned request receives `410 { error: "exact_build_unsupported" }`, all live
instances using that stale pair stop issuing work and join one bounded recovery
task. `RemoteComponent` is the replacement boundary; the task does not attempt
arbitrary module-level HMR.

On any response, the client also observes an optional validated
`X-Exact-Preferred-Build`. A different SHA starts or joins one proactive
coordinator for `{ binding, currentBuild, preferredBuild }`. The coordinator
uses the page-owned `resolveClientEntry` and prepares the advertised module
without changing the active tree. It commits through the same replacement
boundary only after every affected instance has no pending request, batch, or
stream and the coordinator has closed the old generation to new work. Missing
resolution, failed preparation, repeated hints, or continuous activity leave the
current build running. A later `410` promotes any matching prepared entry into
the ordinary bounded recovery attempt.

The task first prepares a new generation without mutating active roots: resolve
or refetch the binding entry at a new module URL, require a different key,
validate the module and provided packages, and prepare its registration. Once
all preparation succeeds, each affected `RemoteComponent` commits through the
renderer replacement operation. Commit increments the instance generation,
fences old callbacks and results, detaches page-domain VNodes still present in
current props, disposes the old remote client and remote-domain tree, mounts the
new entry from current props and captured logical parent, and reattaches those
page-owned instances wherever the new component renders them.

Remote-owned local and reactive state intentionally resets. Page-owned child
instances and their state survive if current props still supply them; their
effect scopes are parked and transferred, and their internal logical-parent
links switch to the new tree. Later explicit context lookups and new descendants
use that ancestry; previously captured context handles are not rebound. Refs
into disposed remote DOM are invalidated and may bind to new DOM during mounting.
DOM identity, focus, selection, and scroll are not replacement guarantees. If
preparation or commit fails, no partially prepared generation remains active:
the instance cleans up and renders the host-owned fallback. The framework makes
no automatic second attempt or document reload. Evaluated stale ESM may remain
in the native module cache but is never used again by the coordinator.

### Phase 6: implement the page gateway

Add binding-aware alternate dispatch to the existing adapter-neutral
`handleExactRequest()` pipeline. Do not install the gateway as middleware ahead
of that handler: the page application's existing request-context,
authorization, CSRF, parsing, and limit stages must run before the handler
chooses local or forwarded dispatch.

The microfrontends plugin configures the gateway. The only new application
policy hook is the forwarded-request transform:

```ts
export type TransformForwardedExactRequest = (
	request: ExactRequestLike,
	target: {
		binding: string;
		buildKey: string;
		endpoint: string;
	},
	context: ExactServerContext
) => ExactRequestLike | Promise<ExactRequestLike>;

export type ExactBindingGatewayOptions = {
	bindings: Readonly<Record<string, { endpoint: string }>>;
	fetch?: typeof fetch;
	transformForwardedRequest?: TransformForwardedExactRequest;
	maxBindingLength?: number;
	onReject?: (event: ExactGatewayRejectEvent) => void;
};

export function createExactBindingGateway(options: ExactBindingGatewayOptions): ExactBindingGateway;
```

`ExactBindingGateway` is framework dispatch configuration consumed after the
ordinary top-level security hooks succeed, not a second public request handler.
A request without `X-Exact-Binding` continues into the existing local manifest
dispatch. A binding-routed request is transformed and forwarded instead. The
component host receives it through its ordinary `handleExactRequest()` and
therefore runs the same hook surface with its own configuration.

The page handler reads and bounds the request body once. It must retain those
validated bytes or serialize the validated protocol value into a replayable
forwarded request; the transform never rereads a consumed platform request
stream. The same bounded representation is passed to the upstream `fetch`.

Gateway behavior:

```text
POST /__exact without X-Exact-Binding
  -> open page request context, parse, validate, authorize, and validate CSRF
  -> page handles its own ordinary eXact dispatch

POST /__exact with X-Exact-Binding: billing
  -> open page request context, parse, validate, authorize, and validate CSRF
  -> validate bounded header syntax
  -> validate required bounded X-Exact-Build syntax without interpreting it
  -> look up billing in server-only configuration
  -> reject missing or unknown binding
  -> enforce existing request limits
  -> remove X-Exact-Binding
  -> preserve X-Exact-Build
  -> apply transformForwardedRequest when configured
     (default removes browser cookies and authorization)
  -> fetch the ordinary request at billing.endpoint with redirect: "follow"
  -> propagate AbortSignal
  -> billing's ordinary /__exact hooks validate the forwarded request
  -> validate the final response as bounded JSON or requested NDJSON
  -> remove only hop-by-hop and stale body-framing headers
  -> preserve final status, body/stream, Set-Cookie, and other end-to-end headers
```

The gateway uses Fetch's standard redirect behavior rather than implementing a
manual redirect policy. There is no eXact `maxRedirects` option or per-binding
redirect configuration. The forwarding transform runs once before the initial
fetch. Remote endpoints should use `307` or `308` when they need to preserve the
POST body. Only final response headers are forwarded; redirect-hop cookies or
other headers are not guaranteed to survive.

The gateway must not accept:

- a URL in the binding header;
- a client-supplied endpoint override;
- a binding name absent from page configuration;
- an absent or malformed build key on a binding-routed request;
- an unbounded binding or logging label;
- blind forwarding of browser cookies or authorization headers;
- a forwarding transform that changes the server-resolved endpoint or method,
  restores `X-Exact-Binding`, changes or removes `X-Exact-Build`, detaches the
  abort signal, or bypasses limits.

Fetch adapter example:

```ts
const exactRuntime = createExactServerRuntime({
	manifest: pageManifest,
	authorize: authorizePageExactRequest,
	validateCsrf: validatePageExactCsrf,
	gateway: createExactBindingGateway({
		bindings: {
			billing: {
				endpoint: 'http://billing.internal/__exact'
			}
		},
		async transformForwardedRequest(request, target) {
			const headers = new Headers(request.headers);
			headers.delete('cookie');
			headers.delete('authorization');
			headers.set('authorization', `Bearer ${await issueInternalToken(target.binding)}`);
			return { ...request, headers };
		},
		onReject(event) {
			logger.warn('blocked remote exact request', { reason: event.reason });
		}
	})
});

export async function handleRequest(request: Request) {
	return handleExactRequest(request, exactRuntime);
}
```

The exact runtime option name may follow the plugin's existing server
integration conventions. The invariant is more important than the spelling:
the gateway branch occurs after the existing page security hooks and before
local manifest dispatch, and the forwarding transform is the only new
application hook.

#### Required gateway tests

- no header reaches the existing local page handler;
- a known binding forwards to its configured private endpoint;
- the forwarded request does not contain `X-Exact-Binding`;
- the forwarded request retains the validated `X-Exact-Build` unchanged;
- an unknown or malformed binding is rejected and logged with a bounded reason;
- a mixed-root batch is forwarded unchanged to the selected component host;
- browser input cannot inject an internal URL;
- JSON and NDJSON responses pass through without rewrapping;
- the configured fetch receives `redirect: "follow"`, and an ordinary redirect
  chain reaches its final exact response without gateway-managed hop logic;
- the forwarding transform runs once rather than once per redirect;
- excessive redirects surface through the bounded upstream-failure path;
- final end-to-end headers are passed through native response facilities, and
  adapter tests confirm repeated `Set-Cookie` values survive unchanged;
- `X-Exact-Preferred-Build` is forwarded unchanged and is never interpreted as
  a client-entry URL by the gateway;
- hop-by-hop headers and stale content length or encoding are removed while the
  public adapter emits correct framing;
- a malformed or non-exact final response produces a bounded
  `upstream_invalid_response`;
- upstream cancellation occurs when the browser aborts;
- a one-shot browser request body is parsed, authorized, transformed, and
  forwarded without a second read;
- page security rejection prevents the upstream request;
- page and component apps can use different configurations of the same existing
  request-context, authorization, and CSRF hooks;
- default forwarding removes browser cookies and authorization;
- the transform can selectively retain credentials or create internal
  credentials without changing the resolved endpoint;
- transformed credentials are validated by the component host's ordinary
  `/__exact` hooks;
- a failing transform fails closed and is logged without credential values;
- component-host authorization rejection passes back normally;
- `410 exact_build_unsupported` passes back unchanged and is not logged as an
  unknown binding;
- two different binding headers never enter the same client batch.
- two different build keys never enter the same client batch.

### Phase 7: integrate the reference adapter and stage the remaining adapters

Implement the remote artifact planner, common module generators, internal
adapter contract, and conformance validator inside `@exactjs/microfrontends`.
Integrate them directly with the current framework bundler plugins. Add a
general plugin-host hook only if all concrete adapters prove they require the
same missing capability.

Begin with narrow Vite/Rollup, Webpack, and Bun feasibility fixtures that test
the proposed native hook boundary without implementing complete adapters. Use
their results to freeze the artifact-plan interface, then build the Vite/Rollup
production adapter.

The page ordering is:

```text
page build
  -> generated provided-package bootstrap
  -> normal page client entry
  -> hydration

page server
  -> microfrontend binding gateway
  -> ordinary local /__exact handler
  -> remaining application routes
```

Implement Vite/Rollup first as the reference mapping:

- add canonical exposure wrappers as Rollup inputs;
- serve provider bridges and generated wrappers through `resolveId` and `load`;
- discover emitted entry filenames from output hooks;
- provide stable development module URLs; and
- verify extracted CSS and lazy chunks resolve from the remote entry.

The Webpack follow-on milestone maps the frozen plan without changing its
browser contract:

- add canonical wrappers as entries;
- resolve provider bridges through module-factory or external hooks;
- emit a browser-importable ESM wrapper;
- configure automatic remote-relative chunk loading; and
- keep Module Federation, when used, entirely behind the eXact entry contract.

The Bun follow-on milestone maps that same plan:

- add wrappers to the `Bun.build` entrypoint set;
- resolve bridges through `onResolve` and `onLoad`; and
- discover the emitted entry and asset paths from build output.

Vite/Rollup must pass the following producer fixture before the initial feature
is promoted. Webpack and Bun must independently pass the identical fixture
before their adapters are advertised:

- the exposure root becomes an independently loadable entry;
- the client entry and executor registration contain the same full Git commit
  SHA, while artifacts from a different commit receive a different key;
- independently invoked client and executor targets supplied the same commit
  embed identical keys without an eXact-generated release record;
- configured provided keys are absent from the remote output;
- the page output contains and publishes those packages;
- unused non-provided modules and unused provider-bridge exports are removed;
- lazy chunks resolve relative to the remote entry;
- extracted styles, fonts, and images load from the remote artifact location;
- development and production builds behave identically;
- a build fails when it cannot externalize a configured key;
- the private endpoint never enters client output; and
- the artifact loads in a plain ESM harness with no page bundler runtime.

Each implemented consumer adapter must also load one canonical hand-authored
remote entry. When Webpack is added, smoke-test Vite page to Webpack remote and
Webpack page to Vite remote. When Bun is added, first load it from the canonical
page harness and then add one heterogeneous pair with an already supported page
adapter. This producer/consumer sequence avoids a complete Cartesian matrix
while proving interoperability incrementally.

### Phase 8: cross-root children and branding

Treat page-authored content as ordinary component input. Children and named
VNode props require no microfrontend-specific placement primitive:

```tsx
<RemoteComponent binding="brand-shell">
	<ApplicationOutlet />
</RemoteComponent>
```

When the branding component needs several placement locations, express them as
ordinary named props:

```tsx
<RemoteComponent
	binding="brand-shell"
	props={{
		navigation: <ApplicationNavigation />,
		content: <ApplicationOutlet />,
		account: <CurrentAccountMenu />
	}}
/>
```

The VNodes in those props were created under the page execution root, so they
retain the page component domain even when the remote component renders them.
They still participate in the remote component's logical tree and therefore
receive normal context propagation, lifecycle, events, and disposal behavior.
The remote parent may render, reorder, or remove them like any other children.

Required cross-root work is limited to:

- capturing the active component domain when each VNode is created;
- preserving that immutable domain when a VNode crosses a component boundary;
- associating the rendered instance with its concrete client root;
- routing actions and refreshes by the child's domain rather than DOM position;
- preventing a protocol patch from directly targeting a different execution
  root;
- treating ancestor DOM replacement as temporary detachment rather than
  logical unmount, then reattaching still-rendered children through ordinary
  reconciliation;
- allowing ordinary reconciliation to reorder or unmount the child.

Branding controls use ordinary provided packages or page dependencies. No
specialized remote component registry is part of this feature.

### Phase 9: end-to-end fixture and rollout gates

Create three independently built fixture applications:

```text
fixtures/microfrontends/page-host
fixtures/microfrontends/billing-host
fixtures/microfrontends/branding-host
```

The page-host fixture should render two simultaneous remote instances whose
internal action, boundary, island, and patch IDs intentionally collide. It
should also project a page-root child into one remote component. Each protocol
operation must still resolve by execution root and patch only its owning client
root.

The integration suite must cover:

1. page SSR emits only remote placeholders;
2. provided packages publish before hydration;
3. both remote loaders arrive after page hydration begins;
4. every created component instance has an immutable component domain;
5. page context and reactive values remain live inside each remote root;
6. a page-root child rendered by a remote parent receives normal logical-tree
   context updates while its actions still use the page domain;
7. a later server response introduces an island with the same context access;
8. every remote request targets page `/__exact` with `X-Exact-Binding`, the
   loaded module's `X-Exact-Build`, and an execution root in the protocol
   operation;
9. the browser never observes the private endpoint;
10. the gateway forwards a mixed-root batch and its build key unchanged, and
    the component host dispatches each operation through that build and its own
    root while running one component-application request context, authorization,
    CSRF, limits, response state, and cleanup lifecycle for the HTTP request;
11. operations sharing a transport queue may batch when their endpoint,
    binding, build key, headers, and transport policy match even when their
    roots differ;
12. the gateway strips the binding header, preserves the build header, and
    forwards the ordinary protocol;
13. action and refresh responses, including NDJSON streams, pass through
    unchanged;
14. identical local IDs do not collide across execution roots or client roots;
15. a remote protocol patch cannot directly target the projected page-root
    child's interior, but may replace an ancestor; the same child instance then
    reattaches with its state intact if the parent's logical output still
    contains it, while an ordinary render that omits it unmounts it;
16. an unknown binding produces the host fallback and bounded gateway log;
17. unmount cancels the upstream request and disposes the remote client root;
18. a late response cannot patch a disposed or replaced remote area;
19. changing props updates the existing root without reimporting it;
20. changing the binding deliberately tears down the previous root before
    loading the next one;
21. a missing provided-package key fails only the affected remote area;
22. the Vite/Rollup producer artifact loads in the canonical plain-ESM harness;
23. the Vite/Rollup page adapter loads the canonical hand-authored remote
    artifact;
24. Vite/Rollup chunks, styles, fonts, and images load from the remote artifact
    location;
25. unused non-provided modules and unused bridge exports are absent from remote
    output;
26. a page host and component host on different supported server runtimes pass
    the same request, stream, cancellation, and error tests;
27. two retained builds with colliding roots and local IDs select only their own
    executor registrations;
28. one supported client build continues to execute while a different preferred
    build is active;
29. retiring a build rejects later requests before handler or stream dispatch
    with unchanged `410 exact_build_unsupported`; already accepted work may
    finish or fail naturally, without framework pinning or cross-build resume;
30. simultaneous instances of one stale build join one replacement attempt,
    stop new old-generation work, load a distinct module URL and key, and commit
    from current props and logical parents while preserving still-supplied
    page-domain children;
31. an unchanged key, repeated unsupported response, or failed replacement
    stops at the host-owned fallback without an automatic document reload or
    reload loop;
32. the old UI remains internally consistent while the replacement entry is
    prepared, and no partially prepared registration or DOM becomes active;
33. replacement resets remote-owned component and reactive state while
    retaining the identity, state, effects, and execution domain of a
    still-rendered page-owned child;
34. replacement transfers the preserved child's effect scope and logical parent,
    makes later context lookups and new descendants use the new ancestry without
    rebinding previously captured context handles, invalidates refs into removed
    remote DOM, and emits no false lifecycle pair for temporary detachment;
35. late events, streams, imports, and patches from the fenced generation cannot
    affect the new generation;
36. nested foreign roots survive replacement as units when still supplied, while
    omitted roots unmount exactly once through ordinary reconciliation;
37. a valid preferred-build hint is forwarded unchanged, deduplicated across
    instances, and resolved only through the page-owned, statically imported
    browser resolver module;
38. proactive preparation leaves the active build fully usable and a failed or
    unresolved candidate does not alter its roots, registrations, or DOM;
39. a prepared preferred build commits only after every affected instance is
    free of requests, batches, and streams, with new old-generation work closed
    atomically at commit;
40. a hint received on an NDJSON response may prepare during the stream but
    cannot commit before that stream settles;
41. a later unsupported-build response reuses a matching prepared candidate
    without adding another recovery attempt; and
42. an advertised SHA whose resolved module reports another key is rejected
    without changing the active generation.

Each follow-on Webpack or Bun milestone reruns the relevant producer, consumer,
tree-shaking, chunk, style, and asset tests above for that adapter. When a
second adapter exists, add heterogeneous page/remote pairs in both meaningful
directions. The initial feature is not blocked on those later adapter fixtures.

Promote the feature from experimental only when:

- the canonical artifact planner and plain-ESM harness are stable;
- the Vite/Rollup reference adapter passes producer and consumer conformance;
- every additional bundler is advertised only after its own producer and
  consumer conformance plus an appropriate heterogeneous smoke test passes;
- every advertised server runtime passes the component-host protocol suite;
- retained-build dispatch and bounded unsupported-build recovery tests pass;
- preferred-build forwarding, page-owned resolution, preparation, settled
  commit, deduplication, and `410` takeover tests pass;
- root replacement prepare/commit, generation-fencing, preserved-page-child,
  effect-scope-transfer, post-reparent-context, captured-context-identity,
  reset-remote-state, ref-invalidation, and failure-atomicity tests pass;
- the Fetch gateway passes standard-redirect, trusted-header, framing,
  forwarding, streaming, and cancellation tests;
- context and reactivity tests pass for initial roots and later islands;
- disposal tests show no retained effects, listeners, requests, or DOM owners;
- blocked-request logs contain no tokens, payloads, cookies, internal URLs, or
  unbounded labels.

### Delivery checkpoints

The recommended initial pull-request sequence is:

1. **Provided-package registry and canonical bridge generation** — exact-key
   lookup, static import-shape handling, tree-shaking fixtures, and page
   bootstrap generation.
2. **Remote artifact planner and exposure compiler output** — canonical ESM
   wrapper, shared Git-SHA build key, hydration registration, executor
   allowlist, artifact-plan snapshots, and focused Vite/Webpack/Bun feasibility
   fixtures before the adapter boundary is frozen.
3. **Build-key and execution-root dispatch** — framework build header,
   supported-build registry, root-relative request and manifest selection,
   unsupported-build response, preferred-build hint, unchanged forwarding, and
   mixed-root batch tests.
4. **Component-domain propagation and client-root ownership** — VNode, core,
   reactive-scope parking and transfer, DOM, hydrate, cross-root child,
   reparented-context, patch-confinement, and late-island tests.
5. **`RemoteComponent`** — dynamic import, build-key validation, component-domain
   creation, concrete client root, proactive settled replacement, bounded
   unsupported-build prepare/commit replacement, generation fencing, preserved
   page-owned children, fallback, prop updates, and disposal.
6. **Binding gateway** — post-security alternate dispatch, configured binding
   lookup, forwarded-request transformation, standard Fetch redirects, trusted
   final-header forwarding, transport-framing reconstruction, unchanged
   JSON/NDJSON bodies, cancellation, and bounded logs.
7. **Vite/Rollup reference adapter** — entry injection, virtual modules, output
   discovery, development URLs, chunks, styles, assets, and conformance.
8. **Two-host end-to-end fixture** — root and ID collisions, cross-root
   children, contexts, actions, batches, streams, failures, and cleanup.

At checkpoint 8, the core feature and Vite/Rollup integration can be promoted
without waiting for other bundlers. The planned follow-on sequence is:

9. **Webpack adapter** — map the frozen artifact plan to Webpack's native
   resolution, entry, ESM output, chunk, style, and asset hooks; pass canonical
   producer/consumer conformance and Vite/Webpack smoke pairs.
10. **Bun adapter** — map the same plan to `Bun.build` entrypoints and plugin
    resolution hooks; pass canonical conformance and a heterogeneous smoke pair.
11. **Incremental cross-bundler coverage** — add selected pairs as adapters are
    promoted without requiring a full Cartesian matrix.

Each checkpoint should leave the repository buildable and testable. Advanced
composition work must not block delivery of the core remote-component path.

## Deferred future work

### Primary page-bundle refresh

The preferred-build preparation and settled replacement mechanism could later
be generalized to the primary page bundle. That may support coordinated rolling
deployments in which several server revisions continue serving compatible
clients while the page prepares a newer entry. It is deliberately outside this
feature: replacing the page root adds document-level routing, focus, history,
bootstrap, and recovery decisions that remote-area replacement does not need.

### Component-authenticated protocol messages

A future security investigation may add cryptographic channel binding between
a loaded client artifact and its compatible component-host executor. A source
or artifact hash is public identity, not secret key material, so possession of
client-visible component bytes alone cannot authenticate messages. A viable
design would need server-held secret material or an authenticated handshake
that issues an ephemeral session key bound to the build key, execution root,
page session, and replay policy. Any proposal must preserve batching,
streaming, cancellation, key rotation, and the page-host gateway without
pretending that a client-known hash is a signing secret.
