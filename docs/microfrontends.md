# Trusted microfrontends

Status: implemented for Vite/Rollup, Webpack 5, and Bun 1.3 or newer.

`@exactjs/microfrontends` lets one eXact application expose selected component
roots to another application in the same organizational trust domain. It is a
framework plugin over the normal compiler, renderer, hydration client, server
handler, and `/__exact` transport—not a second component model.

## Ownership model

- The page host owns the public route, browser session, security checks,
  observability, top-level contexts, and public `/__exact` endpoint.
- Private component hosts execute independently deployed exposed roots.
- Every request operation carries an execution-root identity; local generated
  IDs are interpreted only inside that root.
- Every remote instance owns a client root, endpoint association,
  cancellation lifetime, stale-response state, and disposal boundary.
- Patch application verifies execution-root ownership before touching a
  target.

Remote exposure is disabled by default. Exporting a JavaScript function does
not make it remotely callable.

## Build and loading

The compiler selects the graph reachable from each configured exposure root. Every supported
adapter consumes the same artifact plan and emits independently loadable ESM entries with their
reachable CSS, assets, lazy chunks, hydration registration, build identity, and optional immutable
artifact metadata.

Vite configures this through its existing plugin. Webpack 5 discovers the same eXact configuration
from `ExactWebpackPlugin`, adds exposure entries during compilation, and publishes only a successful
sealed generation. Bun remote producers use the asynchronous coordinator because Bun plugin setup
cannot add entrypoints after configuration:

```ts
import { exactBuild } from '@exactjs/bun-plugin';

await exactBuild({
	entrypoints: ['./src/page.ts'],
	outdir: './dist',
	target: 'browser',
	format: 'esm',
	splitting: true
});
```

Direct `Bun.build({ plugins: [exact()] })` remains the smaller path for an application without
remote exposures. If exposures are configured, it fails with an instruction to use `exactBuild()`.
`exactBuild()` releases its retained compiler resources after success or failure. A build host that
installs `exact()` directly must retain that plugin instance and call its idempotent `dispose()`
after its final build or watch generation.
Webpack and Bun expose optional `onRemoteEntries` and `onRemoteDevelopmentEntries` callbacks for a
deployment or development host that needs the immutable exposure-to-entry map.

Bun virtual entry specifiers use portable generated filenames so Windows writes ordinary files,
not NTFS alternate data streams. Output classification keeps CSS separate from executable entry
metadata, including Bun versions that attach an entry point to CSS output. `exactBuild()` normalizes
nonempty `publicPath` prefixes with a trailing slash so emitted chunk URLs share the published
entry URL base. Generated filenames and virtual IDs remain opaque implementation details.

The page publishes explicitly configured provided-package instances before
hydration. Remote builds externalize those packages and the compiler-selected
eXact runtime capability subpaths used by their generated artifacts, then
resolve those exact package keys from the page realm. This avoids duplicate
framework/context identities without treating arbitrary semver similarity as
runtime compatibility.

The shared provider set includes specialized reactive entry points and component construction,
branding, lifecycle, and rendering helpers. A remote's state and its page-owned observers must use
the same dependency graph. Applications do not need to add these framework import keys to
`providedPackages`. The page provider bootstrap is included only when remote bindings are configured.
Ordinary applications and producer pages without remote bindings do not incur this bootstrap cost.
Deploy a host bootstrap that supplies a new remote's required provider keys
before deploying that remote. An older remote remains loadable by a host with additional providers.

`RemoteComponent` loads the generated registration, establishes an immutable
component domain, and mounts page-authored children beneath that domain.
Contexts and portals continue to follow logical component ownership.
SSR emits `RemoteComponent` as a compiler-owned client boundary with its serializable page props;
the server does not execute the browser loader or manufacture its placeholder DOM. During a remote
build rotation or a cross-root structural patch, the renderer parks page-domain descendants and
reattaches their existing component operations beneath the replacement remote artifact. Their
instances, state, context handles, update routes, and lifecycle ownership remain page-owned.
The domain's application-visible shape is only its `executionRoot` identity;
transport, resumption, inspection, and activation capabilities remain private
to framework render and hydration boundaries.

A remote entry is executable authority, so validating its exported object after `import()` is not
a security boundary. Configure `integrity` with standard `sha256-`, `sha384-`, or `sha512-` SRI
metadata when the page must verify entry bytes before execution. eXact then loads the canonical
generated entry through a cross-origin-capable module script, lets the browser enforce SRI first,
and accepts only the token-matched module published by that entry. Without `integrity`, the page is
explicitly trusting the configured URL to execute. A build-replacement resolver should return
`{ clientEntry, integrity }` so every new generation receives its own pin; returning only a URL is
an explicit unpinned replacement. SRI covers the canonical entry response, not arbitrary mutable
dependencies it imports, so production entries must reference immutable content-addressed chunks
or keep their complete dependency graph under the same deployment trust boundary.
Remote entry waits are owned by the mounting component: unmounting or replacing that component
stops its wait without disrupting another component sharing the same load. The shared loader
retains only pending work and releases its script or import wait after the last caller cancels.
It imposes no deadline or concurrency ceiling. Direct callers can provide an `AbortSignal` to
choose a deadline or cancel according to application policy. Native JavaScript imports may
continue evaluating after cancellation, but retired components cannot install their results.

## Protocol and recovery

The browser continues to use the page host's `/__exact` endpoint. Request authentication and CSRF
hooks run before body reading. The gateway validates the configured binding, consumes its routing
header, and relays original request and response bytes with bounded buffering and cancellation.
The returned gateway exposes an ordinary `forward()` method, allowing application-owned wrappers.
Rejection observations are separate data, so annotating them leaves the transport error unchanged.
Build headers, cookies, and authorization pass through. Each service owns protocol validation,
operation authorization, and its response. Applications may add credentials with
`transformForwardedRequest`, which can change headers only. Use raw request bodies at gateway
endpoints; parsed middleware objects cannot preserve the original payload. Hop-by-hop headers
are removed, redirects are relayed, and separate `Set-Cookie` fields are preserved.

Different roots can share a batch without sharing their invocation or boundary ID
namespace. Work across roots is not atomic; failure is contained to the
affected remote boundary.

Build replacement is generation-fenced. A supported preferred build may be
prepared in the background and committed only after affected old instances
settle. An unsupported build permits one bounded coordinated recovery attempt.
Invalid loaders, registrations, responses, or ownership metadata render the
configured fallback rather than partially mounting a remote tree.

An application-owned `resolveClientEntry(preferredBuild)` discovers the replacement entry.
This callback receives no `AbortSignal`, so removing the remote does not cancel discovery work.
The resolver must arrange any cancellation or deadline through its own application policy.
Once discovery returns an entry, the framework-owned module wait uses the remote boundary's
abort signal. Retiring the boundary prevents a late result from replacing its component.

Server-executing remote entries also carry the compact component-library
authorization identity produced by their build: protocol, build key, and
fingerprint. The browser forwards only the fingerprint with component
operations. The retained component host compares it with the registered build
before dispatch, and a mismatch uses the same bounded unsupported-build
recovery. Package names, policy rules, integrity values, and audit provenance
remain server-private.

## Operational limits

- Provided packages support named and default ESM imports, named re-exports, and namespace access
  to statically named exports. Dynamic imports of provided packages, dynamic namespace indexing,
  and forwarding an entire namespace are unsupported. These checks apply consistently across
  Vite/Rollup, Webpack, and Bun. Ordinary packages that are not provided retain normal bundler resolution.
- Bun server `--hot` is unsupported because it cannot retain the last authorized generation; use
  watch/rebuild coordination instead.
- Deployment discovery, signing, rollout policy, and service operation remain
  application/platform responsibilities.
- Primary page-bundle replacement remains possible future work, not current
  behavior.

See the plugin package and docs-app microfrontend page for configuration
examples.

Browser imports from the package root select the runtime facade, including the Web API binding
gateway. Node imports additionally expose build adapters and artifact planners. The explicit `/client` entry remains
available for runtime-only imports. Provider bootstrap is emitted only for a host with configured
remote bindings. Ordinary applications and remote producer pages without bindings omit it.

Scoped Bun remote imports use the enclosing build resolver and preserve its browser conditions
and aliases. Relative remote files keep their exposure scope. Package resolution does not load
Node build tools into the browser runtime facade.
