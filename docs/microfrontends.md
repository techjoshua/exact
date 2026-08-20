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

The page publishes explicitly configured provided-package instances before
hydration. Remote builds externalize those packages and resolve exact package
keys from the page realm. This avoids duplicate framework/context identities
without treating arbitrary semver similarity as runtime compatibility.

`RemoteComponent` loads the generated registration, establishes an immutable
component domain, and mounts page-authored children beneath that domain.
Contexts and portals continue to follow logical component ownership.
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
times out stalled entries after 30 seconds and retains at most 64 pending or completed entries.

## Protocol and recovery

The browser continues to use the page host's `/__exact` endpoint. The gateway
selects the private host from trusted binding and build metadata, removes
framework routing headers before forwarding application traffic, and preserves
one request authorization, CSRF, limit, response, and cleanup lifecycle.

Different roots can share a batch without sharing their invocation or boundary ID
namespace. Work across roots is not atomic; failure is contained to the
affected remote boundary.

Build replacement is generation-fenced. A supported preferred build may be
prepared in the background and committed only after affected old instances
settle. An unsupported build permits one bounded coordinated recovery attempt.
Invalid loaders, registrations, responses, or ownership metadata render the
configured fallback rather than partially mounting a remote tree.

Server-executing remote entries also carry the compact component-library
authorization identity produced by their build: protocol, build key, and
fingerprint. The browser forwards only the fingerprint with component
operations. The retained component host compares it with the registered build
before dispatch, and a mismatch uses the same bounded unsupported-build
recovery. Package names, policy rules, integrity values, and audit provenance
remain server-private.

## Operational limits

- Browser remote entry loading has a fixed 30-second timeout and a 64-entry shared cache ceiling.
- Bun server `--hot` is unsupported because it cannot retain the last authorized generation; use
  watch/rebuild coordination instead.
- Deployment discovery, signing, rollout policy, and service operation remain
  application/platform responsibilities.
- Primary page-bundle replacement remains possible future work, not current
  behavior.

See the plugin package and docs-app microfrontend page for configuration
examples.
