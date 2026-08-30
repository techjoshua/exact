# @exactjs/microfrontends

Federated microfrontend support for eXact hosts and remotes.

## Overview

The package defines remote exposure and consumption configuration, shared-package policy,
development discovery, build artifacts, client loading, SSR coordination, and root lifecycle. It
integrates with the eXact build and server runtimes rather than replacing them.

## Usage model

Keep host names, remote exposures, shared versions, and server gateways explicit. Load remote
components from their compiler-produced artifacts, and keep page-authored child content owned by
the page root. Configure each remote's `integrity` when its entry bytes must be verified before
execution. The browser enforces that SRI pin through the generated module-entry loader; an unpinned
entry is explicitly trusted executable authority. Replacement resolvers should return
`{ clientEntry, integrity }` for pinned build rotation.
Remote entry waits stop with their owning component. Shared loads have a 30-second timeout and a
64-entry cache ceiling so stalled deployments cannot accumulate indefinitely.
On SSR, `RemoteComponent` is emitted as a compiler-owned client boundary; its browser loader does
not execute on the server. Page-authored children retain their page instances and lifecycle when a
remote build or cross-root patch replaces the remote ancestor around them.

Server-executing remote builds may carry the compact component-library authorization identity
created by `@exactjs/component-library-policy`. The remote entry, hydration client, gateway, and
retained component host preserve that identity and reject a mismatched build before operation
dispatch; full authorization and audit manifests remain server-private.
For paired Vite builds, read the completed server manifest with
`readExactComponentAuthorizationIdentity()` and pass the result as the eXact Vite plugin's
`componentAuthorization` option while producing the remote artifact.

Vite/Rollup, Webpack 5, and Bun 1.3+ consume the same exposure plan. Webpack integration is owned
by `ExactWebpackPlugin`; Bun remote producers call `exactBuild()` from `@exactjs/bun-plugin` so
asynchronous plan preparation happens before `Bun.build`. Both adapters preserve actual emitted
CSS, asset, and lazy-chunk locations, provided-package bootstrap order, and last-valid generation
publication.

For architecture and deployment examples, see
[microfrontends](../../docs/microfrontends.md).
